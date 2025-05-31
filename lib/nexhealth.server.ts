// Token cache to avoid repeated authentication calls
interface TokenCache {
  token: string;
  expires: number; // timestamp
}

let tokenCache: TokenCache | null = null;

/**
 * Get a valid NexHealth Bearer token, using cached token if still valid
 */
async function getNexHealthBearerToken(): Promise<string> {
  const now = Date.now();
  
  // Return cached token if still valid (with 5 minute buffer)
  if (tokenCache && tokenCache.expires > now + 5 * 60 * 1000) {
    console.log("Using cached NexHealth token");
    return tokenCache.token;
  }

  console.log("Fetching new NexHealth token");
  
  const apiKey = process.env.NEXHEALTH_API_KEY;
  if (!apiKey) {
    throw new Error("NEXHEALTH_API_KEY environment variable is not set");
  }

  try {
    const response = await fetch("https://nexhealth.info/authenticates", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/vnd.Nexhealth+json;version=2",
      },
      body: JSON.stringify({
        api_key: apiKey,
      }),
    });

    if (!response.ok) {
      throw new Error(`NexHealth authentication failed: ${response.status} ${response.statusText}`);
    }

    const authData = await response.json();
    
    if (!authData.code) {
      throw new Error(`NexHealth authentication failed: ${authData.message || "Unknown error"}`);
    }

    const token = authData.data.access_token;
    const expiresIn = authData.data.expires_in || 3600; // Default to 1 hour
    
    // Cache the token (expires in seconds, convert to milliseconds and subtract buffer)
    tokenCache = {
      token,
      expires: now + (expiresIn - 300) * 1000, // 5 minute buffer
    };

    console.log("NexHealth token obtained successfully, expires in", expiresIn, "seconds");
    return token;
  } catch (error) {
    console.error("Failed to get NexHealth token:", error);
    throw error;
  }
}

/**
 * Generic NexHealth API request function
 */
async function nexHealthRequest(
  method: string,
  path: string,
  subdomain: string,
  locationId?: string,
  data?: any,
  additionalParams?: Record<string, string>
): Promise<any> {
  const url = new URL(`https://nexhealth.info${path}`);
  
  // Add required query parameters
  url.searchParams.set("subdomain", subdomain);
  if (locationId) {
    url.searchParams.set("location_id", locationId);
  }
  
  // Add any additional parameters
  if (additionalParams) {
    Object.entries(additionalParams).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
  }

  const token = await getNexHealthBearerToken();
  
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${token}`,
    "Accept": "application/vnd.Nexhealth+json;version=2",
  };

  if (method === "POST" || method === "PATCH" || method === "PUT") {
    headers["Content-Type"] = "application/json";
  }

  console.log(`Making NexHealth API call: ${method} ${url.toString()}`);
  if (data) {
    console.log("Request data:", JSON.stringify(data, null, 2));
  }

  try {
    const response = await fetch(url.toString(), {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined,
    });

    const responseText = await response.text();
    console.log(`NexHealth API response status: ${response.status}`);
    console.log("Response body:", responseText);

    if (!response.ok) {
      throw new Error(`NexHealth API error: ${response.status} ${response.statusText} - ${responseText}`);
    }

    const responseJson = JSON.parse(responseText);
    
    if (!responseJson.code) {
      throw new Error(`NexHealth API returned error: ${responseJson.message || "Unknown error"}`);
    }

    return responseJson.data;
  } catch (error) {
    console.error(`NexHealth API request failed: ${method} ${path}`, error);
    throw error;
  }
}

/**
 * Create a new patient in NexHealth
 */
export async function createPatient(
  subdomain: string,
  locationId: string,
  providerId: string,
  patientDetails: {
    first_name: string;
    last_name: string;
    phone_number: string;
    date_of_birth?: string;
    email?: string;
    gender?: string;
  }
): Promise<any> {
  const data = {
    patient: {
      ...patientDetails,
      provider_id: providerId,
    },
  };

  return nexHealthRequest("POST", "/patients", subdomain, locationId, data);
}

/**
 * Get appointment types for a location
 */
export async function getAppointmentTypes(
  subdomain: string,
  locationId: string
): Promise<any> {
  return nexHealthRequest("GET", "/appointment_types", subdomain, locationId);
}

/**
 * Get providers for a location
 */
export async function getProviders(
  subdomain: string,
  locationId: string
): Promise<any> {
  return nexHealthRequest("GET", "/providers", subdomain, locationId);
}

/**
 * Get operatories for a location
 */
export async function getOperatories(
  subdomain: string,
  locationId: string
): Promise<any> {
  return nexHealthRequest("GET", "/operatories", subdomain, locationId);
}

/**
 * Get location details (to check if location maps by operatory)
 */
export async function getLocationDetails(
  subdomain: string,
  locationId: string
): Promise<any> {
  return nexHealthRequest("GET", `/locations/${locationId}`, subdomain);
}

/**
 * Get available appointment slots
 */
export async function getAppointmentSlots(
  subdomain: string,
  locationId: string,
  params: {
    appointment_type_id: string;
    provider_ids?: string[];
    operatory_ids?: string[];
    start_date: string;
    days?: number;
  }
): Promise<any> {
  const additionalParams: Record<string, string> = {
    appointment_type_id: params.appointment_type_id,
    start_date: params.start_date,
  };

  if (params.days) {
    additionalParams.days = params.days.toString();
  }

  if (params.provider_ids && params.provider_ids.length > 0) {
    params.provider_ids.forEach((id, index) => {
      additionalParams[`pids[${index}]`] = id;
    });
  }

  if (params.operatory_ids && params.operatory_ids.length > 0) {
    params.operatory_ids.forEach((id, index) => {
      additionalParams[`operatory_ids[${index}]`] = id;
    });
  }

  return nexHealthRequest("GET", "/appointment_slots", subdomain, locationId, undefined, additionalParams);
}

/**
 * Book an appointment
 */
export async function bookAppointment(
  subdomain: string,
  locationId: string,
  appointmentDetails: {
    patient_id: string;
    provider_id: string;
    operatory_id?: string;
    appointment_type_id: string;
    start_time: string;
    end_time: string;
    note?: string;
  }
): Promise<any> {
  const data = {
    appointment: appointmentDetails,
  };

  return nexHealthRequest("POST", "/appointments", subdomain, locationId, data);
}

/**
 * Search for existing patients (for future use)
 */
export async function searchPatients(
  subdomain: string,
  locationId: string,
  searchParams: {
    phone_number?: string;
    email?: string;
    first_name?: string;
    last_name?: string;
    date_of_birth?: string;
  }
): Promise<any> {
  const additionalParams: Record<string, string> = {};
  
  Object.entries(searchParams).forEach(([key, value]) => {
    if (value) {
      additionalParams[key] = value;
    }
  });

  return nexHealthRequest("GET", "/patients", subdomain, locationId, undefined, additionalParams);
}

/**
 * Get patient by ID (for future use)
 */
export async function getPatientById(
  subdomain: string,
  locationId: string,
  patientId: string
): Promise<any> {
  return nexHealthRequest("GET", `/patients/${patientId}`, subdomain, locationId);
} 