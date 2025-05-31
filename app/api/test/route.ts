import { NextRequest, NextResponse } from "next/server";
import { 
  getAppointmentTypes,
  getProviders,
  getAppointmentSlots,
  getOperatories,
  getLocationDetails
} from "@/lib/nexhealth.server";

// Tool response type
interface ToolResponse {
  result: string;
}

// Test configuration - hardcoded for simplicity
const TEST_CONFIG = {
  subdomain: "xyz", // Replace with your test subdomain
  locationId: "318534", // Replace with your test location ID
  providerId: "377851144", // Replace with your test provider ID
  appointmentTypeId: "997003", // Replace with your test appointment type ID
  operatoryId: "159815" // Replace with your test operatory ID
};

// GET method for health check
export async function GET() {
  try {
    console.log("=== TEST WEBHOOK HEALTH CHECK ===");
    console.log("Timestamp:", new Date().toISOString());
    console.log("Test configuration:", TEST_CONFIG);
    
    return NextResponse.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      message: "Test webhook endpoint is reachable",
      config: TEST_CONFIG
    });
  } catch (error) {
    console.error("Test health check failed:", error);
    return NextResponse.json({
      status: "unhealthy",
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // === EXTENSIVE DEBUGGING LOGGING ===
    console.log("=== TEST VAPI WEBHOOK RECEIVED ===");
    console.log("Timestamp:", new Date().toISOString());
    console.log("Request URL:", request.url);
    console.log("Request method:", request.method);
    
    // Log all headers for debugging
    const headers: { [key: string]: string } = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });
    console.log("Request headers:", JSON.stringify(headers, null, 2));
    
    // Get the raw body
    const rawBody = await request.text();
    console.log("Raw body length:", rawBody.length);
    console.log("Raw body:", rawBody);
    
    const vapiSignature = request.headers.get("X-Vapi-Signature");
    const vapiSecret = request.headers.get("x-vapi-secret");
    console.log("Vapi signature header:", vapiSignature);
    console.log("Vapi secret header:", vapiSecret);
    
    // For testing, we'll skip signature verification but log it
    console.log("⚠️ SKIPPING SIGNATURE VERIFICATION FOR TESTING");
    
    const payload = JSON.parse(rawBody);
    const { message } = payload;

    console.log("=== PARSED PAYLOAD ===");
    console.log("Full payload structure:", JSON.stringify(payload, null, 2));
    console.log("Message type:", message?.type);
    console.log("Message keys:", Object.keys(message || {}));

    // Extract common data
    const vapiCallId = message?.call?.id;
    const vapiAssistantId = message?.assistant?.id || message?.call?.assistantId;
    
    console.log("=== EXTRACTED DATA ===");
    console.log("Vapi Call ID:", vapiCallId);
    console.log("Vapi Assistant ID:", vapiAssistantId);

    if (message.type === "tool-calls") {
      console.log("=== HANDLING TEST TOOL-CALLS ===");
      console.log("Tool calls received:", JSON.stringify(message.toolCallList || [], null, 2));
      
      // Execute tools and return results
      const toolResults = await executeTestTools(message.toolCallList || [], vapiCallId);
      console.log("=== TOOL RESULTS ===");
      console.log("Returning results:", JSON.stringify(toolResults, null, 2));
      
      return NextResponse.json({ results: toolResults });

    } else if (message.type === "status-update") {
      console.log("=== HANDLING TEST STATUS-UPDATE ===");
      console.log("Status update data:", { status: message?.status, call: message?.call });
      
      return NextResponse.json({ 
        received: true, 
        timestamp: new Date().toISOString(),
        type: "status-update" 
      });

    } else if (message.type === "transcript") {
      console.log("=== HANDLING TEST TRANSCRIPT ===");
      console.log("Transcript data:", {
        text: message?.transcript?.text,
        role: message?.transcript?.role,
        timestamp: message?.transcript?.timestamp
      });
      
      return NextResponse.json({ 
        received: true, 
        timestamp: new Date().toISOString(),
        type: "transcript" 
      });

    } else if (message.type === "hang") {
      console.log("=== HANDLING TEST HANG ===");
      console.log("Call ended:", message?.call);
      
      return NextResponse.json({ 
        received: true, 
        timestamp: new Date().toISOString(),
        type: "hang" 
      });

    } else {
      console.log("=== UNKNOWN MESSAGE TYPE ===");
      console.log("Message type:", message?.type);
      console.log("Full message:", JSON.stringify(message, null, 2));
      
      return NextResponse.json({ 
        received: true, 
        timestamp: new Date().toISOString(),
        type: "unknown",
        messageType: message?.type 
      });
    }

  } catch (error) {
    console.error("=== TEST WEBHOOK ERROR ===");
    console.error("Error processing test webhook:", error);
    console.error("Stack trace:", error instanceof Error ? error.stack : "No stack trace");
    
    return NextResponse.json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

async function executeTestTools(toolCallList: any[], vapiCallId: string) {
  console.log("=== EXECUTING TEST TOOLS ===");
  console.log("Number of tools to execute:", toolCallList.length);
  console.log("Call ID:", vapiCallId);

  const results = [];

  for (const toolCall of toolCallList) {
    console.log("=== PROCESSING TOOL CALL ===");
    console.log("Tool ID:", toolCall.id);
    console.log("Function name:", toolCall.function?.name);
    console.log("Function arguments:", toolCall.function?.arguments);

    try {
      let result: ToolResponse;

      switch (toolCall.function?.name) {
        case "get_appointment_types":
          result = await handleGetAppointmentTypes(
            toolCall.function.arguments, 
            vapiCallId
          );
          break;

        case "get_providers":
          result = await handleGetProviders(
            toolCall.function.arguments, 
            vapiCallId
          );
          break;

        case "get_appointment_slots":
          result = await handleGetAppointmentSlots(
            toolCall.function.arguments, 
            vapiCallId
          );
          break;

        case "get_operatories":
          result = await handleGetOperatories(
            toolCall.function.arguments, 
            vapiCallId
          );
          break;

        case "get_locations":
          result = await handleGetLocations(
            toolCall.function.arguments, 
            vapiCallId
          );
          break;

        default:
          console.log("❌ Unknown function:", toolCall.function?.name);
          result = {
            result: `Error: Unknown function '${toolCall.function?.name}'. Available functions: get_appointment_types, get_providers, get_appointment_slots, get_operatories, get_locations`
          };
      }

      console.log("✅ Tool executed successfully:", toolCall.function?.name);
      console.log("Result:", result.result);

      results.push({
        toolCallId: toolCall.id,
        result: result.result
      });

    } catch (error) {
      console.error("❌ Tool execution failed:", toolCall.function?.name, error);
      
      results.push({
        toolCallId: toolCall.id,
        result: `Error executing ${toolCall.function?.name}: ${error instanceof Error ? error.message : "Unknown error"}`
      });
    }
  }

  console.log("=== ALL TOOLS EXECUTED ===");
  console.log("Total results:", results.length);
  
  return results;
}

async function handleGetAppointmentTypes(params: any, vapiCallId: string): Promise<ToolResponse> {
  console.log("=== GET APPOINTMENT TYPES ===");
  console.log("Call ID:", vapiCallId);
  console.log("Parameters:", params);
  console.log("Using config:", { subdomain: TEST_CONFIG.subdomain, locationId: TEST_CONFIG.locationId });

  try {
    const appointmentTypes = await getAppointmentTypes(
      TEST_CONFIG.subdomain,
      TEST_CONFIG.locationId
    );

    console.log("✅ Appointment types retrieved:", appointmentTypes?.length || 0);
    console.log("Raw data:", JSON.stringify(appointmentTypes, null, 2));

    if (!appointmentTypes || appointmentTypes.length === 0) {
      return {
        result: "No appointment types found for this practice."
      };
    }

    // Format the results for voice response
    const typesList = appointmentTypes.map((type: any) => 
      `${type.name} (${type.minutes} minutes, ID: ${type.id})`
    ).join(", ");

    return {
      result: `I found ${appointmentTypes.length} appointment types: ${typesList}`
    };

  } catch (error) {
    console.error("❌ Error getting appointment types:", error);
    return {
      result: `Error retrieving appointment types: ${error instanceof Error ? error.message : "Unknown error"}`
    };
  }
}

async function handleGetProviders(params: any, vapiCallId: string): Promise<ToolResponse> {
  console.log("=== GET PROVIDERS ===");
  console.log("Call ID:", vapiCallId);
  console.log("Parameters:", params);
  console.log("Using config:", { subdomain: TEST_CONFIG.subdomain, locationId: TEST_CONFIG.locationId });

  try {
    const providers = await getProviders(
      TEST_CONFIG.subdomain,
      TEST_CONFIG.locationId
    );

    console.log("✅ Providers retrieved:", providers?.length || 0);
    console.log("Raw data:", JSON.stringify(providers, null, 2));

    if (!providers || providers.length === 0) {
      return {
        result: "No providers found for this practice."
      };
    }

    // Format the results for voice response
    const providersList = providers.map((provider: any) => 
      `Dr. ${provider.first_name} ${provider.last_name} (ID: ${provider.id})`
    ).join(", ");

    return {
      result: `I found ${providers.length} providers: ${providersList}`
    };

  } catch (error) {
    console.error("❌ Error getting providers:", error);
    return {
      result: `Error retrieving providers: ${error instanceof Error ? error.message : "Unknown error"}`
    };
  }
}

async function handleGetAppointmentSlots(params: any, vapiCallId: string): Promise<ToolResponse> {
  console.log("=== GET APPOINTMENT SLOTS ===");
  console.log("Call ID:", vapiCallId);
  console.log("Parameters:", params);
  console.log("Using config:", TEST_CONFIG);

  try {
    const parsedParams = typeof params === 'string' ? JSON.parse(params) : params;
    const date = parsedParams.date;
    const appointmentTypeId = parsedParams.appointment_type_id || TEST_CONFIG.appointmentTypeId;

    if (!date) {
      return {
        result: "Please provide a date in YYYY-MM-DD format (like 2025-12-23) to check appointment slots."
      };
    }

    console.log("Getting slots for:", { date, appointmentTypeId });

    const slots = await getAppointmentSlots(
      TEST_CONFIG.subdomain,
      TEST_CONFIG.locationId,
      {
        appointment_type_id: appointmentTypeId,
        provider_ids: [TEST_CONFIG.providerId],
        operatory_ids: [TEST_CONFIG.operatoryId],
        start_date: date,
        days: 1
      }
    );

    console.log("✅ Appointment slots retrieved:", slots?.length || 0);
    console.log("Raw data:", JSON.stringify(slots, null, 2));

    if (!slots || slots.length === 0) {
      return {
        result: `No appointment slots available for ${date}. The provider may not have availability set up for this date.`
      };
    }

    // Format the results for voice response
    const slotsList = slots.slice(0, 5).map((slot: any) => {
      const time = new Date(slot.start_time).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
      return time;
    }).join(", ");

    const moreSlots = slots.length > 5 ? ` and ${slots.length - 5} more` : "";

    return {
      result: `I found ${slots.length} available slots for ${date}: ${slotsList}${moreSlots}`
    };

  } catch (error) {
    console.error("❌ Error getting appointment slots:", error);
    return {
      result: `Error retrieving appointment slots: ${error instanceof Error ? error.message : "Unknown error"}`
    };
  }
}

async function handleGetOperatories(params: any, vapiCallId: string): Promise<ToolResponse> {
  console.log("=== GET OPERATORIES ===");
  console.log("Call ID:", vapiCallId);
  console.log("Parameters:", params);
  console.log("Using config:", { subdomain: TEST_CONFIG.subdomain, locationId: TEST_CONFIG.locationId });

  try {
    const operatories = await getOperatories(
      TEST_CONFIG.subdomain,
      TEST_CONFIG.locationId
    );

    console.log("✅ Operatories retrieved:", operatories?.length || 0);
    console.log("Raw data:", JSON.stringify(operatories, null, 2));

    if (!operatories || operatories.length === 0) {
      return {
        result: "No operatories found for this practice."
      };
    }

    // Format the results for voice response
    const operatoriesList = operatories.map((op: any) => 
      `${op.name} (ID: ${op.id})`
    ).join(", ");

    return {
      result: `I found ${operatories.length} operatories: ${operatoriesList}`
    };

  } catch (error) {
    console.error("❌ Error getting operatories:", error);
    return {
      result: `Error retrieving operatories: ${error instanceof Error ? error.message : "Unknown error"}`
    };
  }
}

async function handleGetLocations(params: any, vapiCallId: string): Promise<ToolResponse> {
  console.log("=== GET LOCATIONS ===");
  console.log("Call ID:", vapiCallId);
  console.log("Parameters:", params);
  console.log("Using config:", { subdomain: TEST_CONFIG.subdomain, locationId: TEST_CONFIG.locationId });

  try {
    const location = await getLocationDetails(
      TEST_CONFIG.subdomain,
      TEST_CONFIG.locationId
    );

    console.log("✅ Location details retrieved");
    console.log("Raw data:", JSON.stringify(location, null, 2));

    if (!location) {
      return {
        result: "No location information found."
      };
    }

    // Format the results for voice response
    const locationInfo = `${location.name || "Unnamed location"} located at ${location.address?.street || "address not available"}`;
    const additionalInfo = location.phone ? `, phone: ${location.phone}` : "";

    return {
      result: `Location information: ${locationInfo}${additionalInfo}`
    };

  } catch (error) {
    console.error("❌ Error getting location details:", error);
    return {
      result: `Error retrieving location information: ${error instanceof Error ? error.message : "Unknown error"}`
    };
  }
} 