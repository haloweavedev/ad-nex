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
  
  // Return cached token if still valid
  if (tokenCache && tokenCache.expires > now) {
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
        "Accept": "application/vnd.Nexhealth+json;version=2",
        "Authorization": apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`NexHealth authentication failed: ${response.status} ${response.statusText}`);
    }

    const authData = await response.json();
    
    if (!authData.code) {
      throw new Error(`NexHealth authentication failed: ${authData.description || "Unknown error"}`);
    }

    const token = authData.data.token;
    // NexHealth tokens expire in 1 hour (3600 seconds) based on the JWT structure
    const expiresIn = 3600;
    
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
  additionalParams?: Record<string, string | string[]>
): Promise<any> {
  const url = new URL(`https://nexhealth.info${path}`);
  
  // Add required query parameters
  url.searchParams.set("subdomain", subdomain);
  if (locationId) {
    url.searchParams.set("location_id", locationId);
  }
  
  // Add any additional parameters
  if (additionalParams) {
    for (const [key, valueOrValues] of Object.entries(additionalParams)) {
      if (Array.isArray(valueOrValues)) {
        // Handle array parameters (e.g., pids[], operatory_ids[])
        (valueOrValues as string[]).forEach(v => url.searchParams.append(key, v));
      } else {
        url.searchParams.set(key, valueOrValues as string);
      }
    }
  }

  const token = await getNexHealthBearerToken();
  
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${token}`,
    "Accept": "application/vnd.Nexhealth+json;version=2",
  };

  if (method === "POST" || method === "PATCH" || method === "PUT") {
    headers["Content-Type"] = "application/json";
  }

  console.log(`=== NEXHEALTH API REQUEST ===`);
  console.log(`Method: ${method}`);
  console.log(`URL: ${url.toString()}`);
  console.log(`Headers: ${JSON.stringify({ ...headers, Authorization: `Bearer ${token.substring(0, 20)}...` }, null, 2)}`);
  if (data) {
    console.log(`Request Body: ${JSON.stringify(data, null, 2)}`);
  }

  try {
    const response = await fetch(url.toString(), {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined,
    });

    const responseText = await response.text();
    console.log(`=== NEXHEALTH API RESPONSE ===`);
    console.log(`Status: ${response.status} ${response.statusText}`);
    console.log(`Response Headers: ${JSON.stringify(Object.fromEntries(response.headers.entries()), null, 2)}`);
    console.log(`Response Body: ${responseText}`);

    if (!response.ok) {
      const errorDetails = {
        status: response.status,
        statusText: response.statusText,
        url: url.toString(),
        method,
        responseBody: responseText
      };
      console.error(`=== NEXHEALTH API ERROR ===`, errorDetails);
      throw new Error(`NexHealth API error: ${response.status} ${response.statusText} - ${responseText}`);
    }

    let responseJson;
    try {
      responseJson = JSON.parse(responseText);
    } catch (parseError) {
      console.error(`Failed to parse NexHealth response as JSON:`, parseError);
      throw new Error(`Invalid JSON response from NexHealth: ${responseText}`);
    }
    
    if (!responseJson.code) {
      const nexHealthError = {
        message: responseJson.message || responseJson.description || "Unknown NexHealth error",
        errors: responseJson.error || responseJson.errors || [],
        fullResponse: responseJson
      };
      console.error(`=== NEXHEALTH BUSINESS LOGIC ERROR ===`, nexHealthError);
      throw new Error(`NexHealth API returned error: ${nexHealthError.message} - Errors: ${JSON.stringify(nexHealthError.errors)}`);
    }

    console.log(`✅ NexHealth API call successful`);
    return responseJson.data;
  } catch (error) {
    console.error(`=== NEXHEALTH API REQUEST FAILED ===`);
    console.error(`Method: ${method}, Path: ${path}, Subdomain: ${subdomain}`);
    console.error(`Error:`, error);
    throw error;
  }
}

/**
 * Search for patients in NexHealth by various criteria
 */
export async function searchPatients(
  subdomain: string,
  locationId: string,
  searchParams: {
    first_name?: string;
    last_name?: string;
    phone_number?: string;
    date_of_birth?: string;
    email?: string;
  }
): Promise<any[]> {
  console.log("=== SEARCHING PATIENTS ===");
  console.log("Search parameters:", searchParams);

  const queryParams: Record<string, string> = {};
  
  // Add non-empty search parameters
  if (searchParams.first_name?.trim()) {
    queryParams.first_name = searchParams.first_name.trim();
  }
  if (searchParams.last_name?.trim()) {
    queryParams.last_name = searchParams.last_name.trim();
  }
  if (searchParams.phone_number?.trim()) {
    // Clean phone number (remove spaces, dashes, parentheses)
    const cleanPhone = searchParams.phone_number.replace(/[\s\-\(\)]/g, '');
    queryParams.phone_number = cleanPhone;
  }
  if (searchParams.date_of_birth?.trim()) {
    queryParams.date_of_birth = searchParams.date_of_birth.trim();
  }
  if (searchParams.email?.trim()) {
    queryParams.email = searchParams.email.trim();
  }

  if (Object.keys(queryParams).length === 0) {
    console.warn("No valid search parameters provided for patient search");
    return [];
  }

  try {
    const patients = await nexHealthRequest(
      "GET",
      "/patients",
      subdomain,
      locationId,
      undefined,
      queryParams
    );

    console.log(`Patient search returned: ${patients?.length || 0} patients`);
    return patients || [];
  } catch (error) {
    console.error("Patient search failed:", error);
    // Return empty array instead of throwing to allow fallback to patient creation
    return [];
  }
}

/**
 * Create a new patient in NexHealth
 */
export async function createPatient(
  subdomain: string,
  locationId: string,
  providerId: string,
  patientData: {
    first_name: string;
    last_name: string;
    phone_number: string;
    date_of_birth?: string;
    email?: string;
    gender?: string;
  }
): Promise<any> {
  console.log("=== CREATING PATIENT ===");
  console.log("Patient data:", { ...patientData, phone_number: patientData.phone_number.substring(0, 6) + "..." });
  console.log("Provider ID:", providerId);

  // Validate required fields
  if (!patientData.first_name?.trim() || !patientData.last_name?.trim() || !patientData.phone_number?.trim()) {
    throw new Error("Missing required patient information: first_name, last_name, or phone_number");
  }

  if (!providerId?.trim()) {
    throw new Error("Provider ID is required for patient creation");
  }

  // Clean and format phone number
  const cleanPhone = patientData.phone_number.replace(/[\s\-\(\)]/g, '');
  
  // Validate phone number format (should be 10 digits for US)
  if (!/^\d{10}$/.test(cleanPhone)) {
    console.warn("Phone number format may be invalid:", cleanPhone);
  }

  // Format date of birth if provided
  let formattedDob = patientData.date_of_birth;
  if (formattedDob) {
    try {
      // Ensure it's in YYYY-MM-DD format
      const date = new Date(formattedDob);
      if (!isNaN(date.getTime())) {
        formattedDob = date.toISOString().split('T')[0];
      } else {
        console.warn("Invalid date_of_birth format, omitting:", formattedDob);
        formattedDob = undefined;
      }
    } catch (dateError) {
      console.warn("Date parsing error, omitting date_of_birth:", dateError);
      formattedDob = undefined;
    }
  }

  const payload = {
    user: {
      first_name: patientData.first_name.trim(),
      last_name: patientData.last_name.trim(),
      phone_number: cleanPhone,
      ...(patientData.email?.trim() && { email: patientData.email.trim() }),
      ...(formattedDob && { date_of_birth: formattedDob }),
      ...(patientData.gender && { gender: patientData.gender }),
    },
    provider_id: providerId,
  };

  console.log("Final payload for patient creation:", { 
    ...payload, 
    user: { 
      ...payload.user, 
      phone_number: payload.user.phone_number.substring(0, 6) + "..." 
    } 
  });

  try {
    const result = await nexHealthRequest(
      "POST",
      "/patients",
      subdomain,
      locationId,
      payload
    );

    console.log("✅ Patient created successfully:", {
      patient_id: result?.user?.id || result?.id,
      user_id: result?.user?.id
    });

    return result;
  } catch (error) {
    console.error("❌ Patient creation failed:", error);
    
    // Provide more specific error information
    if (error instanceof Error) {
      const errorMessage = error.message.toLowerCase();
      
      if (errorMessage.includes('duplicate') || errorMessage.includes('already exists')) {
        throw new Error("A patient with this information already exists. Please try searching for the existing patient.");
      } else if (errorMessage.includes('invalid') && errorMessage.includes('phone')) {
        throw new Error("The phone number format is invalid. Please provide a valid 10-digit phone number.");
      } else if (errorMessage.includes('invalid') && errorMessage.includes('email')) {
        throw new Error("The email format is invalid. Please provide a valid email address.");
      } else if (errorMessage.includes('provider')) {
        throw new Error("The selected provider is invalid or unavailable. Please check practice configuration.");
      } else if (errorMessage.includes('unauthorized') || errorMessage.includes('authentication')) {
        throw new Error("Authentication failed. Please check API credentials and practice configuration.");
      }
    }
    
    // Re-throw original error with context
    throw new Error(`Patient creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
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
 * Get a specific appointment type by ID
 */
export async function getAppointmentTypeById(
  subdomain: string,
  appointmentTypeId: string,
  locationId?: string
): Promise<any> {
  console.log("=== GETTING APPOINTMENT TYPE BY ID ===");
  console.log("Appointment Type ID:", appointmentTypeId);
  
  const additionalParams: Record<string, string> = {};
  if (locationId) {
    additionalParams.location_id = locationId;
  }

  try {
    const result = await nexHealthRequest(
      "GET", 
      `/appointment_types/${appointmentTypeId}`, 
      subdomain, 
      undefined, 
      undefined, 
      additionalParams
    );
    
    console.log("✅ Appointment type retrieved:", {
      id: result?.id,
      name: result?.name,
      minutes: result?.minutes
    });
    
    return result;
  } catch (error) {
    console.error("❌ Failed to get appointment type by ID:", error);
    throw error;
  }
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
  const additionalParams: Record<string, string | string[]> = {
    appointment_type_id: params.appointment_type_id,
    start_date: params.start_date,
  };

  if (params.days) {
    additionalParams.days = params.days.toString();
  }

  // Add location ID as lids[] parameter
  additionalParams["lids[]"] = locationId;

  if (params.provider_ids && params.provider_ids.length > 0) {
    additionalParams["pids[]"] = params.provider_ids; // Pass array directly
  }

  if (params.operatory_ids && params.operatory_ids.length > 0) {
    additionalParams["operatory_ids[]"] = params.operatory_ids; // Pass array directly
  }

  return nexHealthRequest("GET", "/appointment_slots", subdomain, undefined, undefined, additionalParams);
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
    appt: appointmentDetails,
  };

  return nexHealthRequest("POST", "/appointments", subdomain, locationId, data);
}

/**
 * Get patient by ID (for future use)
 */
export async function getPatientById(
  subdomain: string,
  patientId: string,
  locationId?: string, // Location ID might be optional for this specific endpoint
  include?: string[]  // e.g., ['upcoming_appts']
): Promise<any> {
  const additionalParams: Record<string, string | string[]> = {};
  if (include && include.length > 0) {
    additionalParams["include[]"] = include;
  }
  // GET /patients/{id} does not take location_id as a query param in the provided spec,
  // but subdomain is still needed for the nexHealthRequest wrapper.
  return nexHealthRequest("GET", `/patients/${patientId}`, subdomain, undefined, undefined, additionalParams);
}

/**
 * Create manual provider availability
 */
export async function createAvailability(
  subdomain: string,
  locationId: string,
  availabilityData: {
    specific_date: string; // YYYY-MM-DD format
    appointment_type_ids: string[];
    provider_id: string;
    operatory_id?: string;
    begin_time: string; // HH:MM format
    end_time: string; // HH:MM format
    active?: boolean;
  }
): Promise<any> {
  const data = {
    availability: {
      specific_date: availabilityData.specific_date,
      appointment_type_ids: availabilityData.appointment_type_ids,
      active: availabilityData.active !== false, // Default to true
      provider_id: availabilityData.provider_id,
      operatory_id: availabilityData.operatory_id,
      begin_time: availabilityData.begin_time,
      end_time: availabilityData.end_time,
    },
  };

  return nexHealthRequest("POST", "/availabilities", subdomain, locationId, data);
}

/**
 * Check EHR sync status
 */
export async function getSyncStatus(
  subdomain: string,
  locationId: string
): Promise<any> {
  return nexHealthRequest("GET", "/sync_status", subdomain, locationId);
}

/**
 * Create a new appointment type in NexHealth
 */
export async function createNexHealthAppointmentType(
  subdomain: string,
  locationId: string,
  appointmentTypeDetails: {
    name: string;
    minutes: number;
    bookable_online?: boolean;
    emr_appt_descriptor_ids?: string[];
    parent_type?: "Institution" | "Location";
    parent_id?: string;
  }
): Promise<any> {
  console.log("=== CREATING APPOINTMENT TYPE ===");
  console.log("Appointment type details:", appointmentTypeDetails);

  // First, fetch existing appointment types to understand the practice's structure
  let practiceParentType = "Location";
  let practiceParentId = locationId;
  
  try {
    console.log("Fetching existing appointment types to determine practice structure...");
    const existingTypes = await nexHealthRequest(
      "GET",
      "/appointment_types",
      subdomain,
      locationId
    );
    
    if (existingTypes && existingTypes.length > 0) {
      // Use the same parent_type and parent_id as existing appointment types
      const firstType = existingTypes[0];
      if (firstType.parent_type && firstType.parent_id) {
        practiceParentType = firstType.parent_type;
        practiceParentId = firstType.parent_id.toString();
        console.log(`Detected practice structure: parent_type=${practiceParentType}, parent_id=${practiceParentId}`);
      }
    }
  } catch (fetchError) {
    console.warn("Could not fetch existing appointment types, using defaults:", fetchError);
  }

  // Use provided parent details or detected practice structure
  const finalParentType = appointmentTypeDetails.parent_type || practiceParentType;
  const finalParentId = appointmentTypeDetails.parent_id || practiceParentId;

  const data = {
    appointment_type: {
      name: appointmentTypeDetails.name,
      minutes: appointmentTypeDetails.minutes,
      bookable_online: appointmentTypeDetails.bookable_online ?? true,
      parent_type: finalParentType,
      parent_id: finalParentId,
      ...(appointmentTypeDetails.emr_appt_descriptor_ids && {
        emr_appt_descriptor_ids: appointmentTypeDetails.emr_appt_descriptor_ids
      }),
    },
  };

  console.log("Final appointment type payload:", JSON.stringify(data, null, 2));

  try {
    const result = await nexHealthRequest(
      "POST",
      "/appointment_types",
      subdomain,
      undefined, // No location_id in query params for POST /appointment_types
      data
    );

    console.log("✅ Appointment type created successfully:", {
      id: result?.id,
      name: result?.name,
      parent_type: result?.parent_type,
      parent_id: result?.parent_id
    });

    return result;
  } catch (error) {
    console.error("❌ Appointment type creation failed:", error);
    
    // Provide more specific error information
    if (error instanceof Error) {
      const errorMessage = error.message.toLowerCase();
      
      if (errorMessage.includes('duplicate') || errorMessage.includes('already exists')) {
        throw new Error("An appointment type with this name already exists.");
      } else if (errorMessage.includes('parent_id') || errorMessage.includes('parent_type')) {
        throw new Error("Invalid parent configuration. Please check practice setup in NexHealth.");
      } else if (errorMessage.includes('unauthorized') || errorMessage.includes('authentication')) {
        throw new Error("Authentication failed. Please check API credentials.");
      } else if (errorMessage.includes('minutes') || errorMessage.includes('duration')) {
        throw new Error("Invalid appointment duration. Please provide a valid number of minutes.");
      }
    }
    
    // Re-throw original error with context
    throw new Error(`Appointment type creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get appointments for a specific patient
 */
export async function getAppointmentsForPatient(
  subdomain: string,
  locationId: string,
  patientId: string,
  startDate: string, // e.g., "YYYY-MM-DD"
  endDate: string    // e.g., "YYYY-MM-DD"
): Promise<any> {
  const additionalParams: Record<string, string | string[]> = {
    patient_id: patientId,
    start: startDate, // Ensure correct ISO format if time is needed
    end: endDate,     // Ensure correct ISO format
    "include[]": ["provider", "operatory", "appointment_type"] // Example includes
  };
  return nexHealthRequest("GET", "/appointments", subdomain, locationId, undefined, additionalParams);
} 