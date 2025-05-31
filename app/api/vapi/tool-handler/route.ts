import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import db from "@/lib/prisma";
import { 
  createPatient, 
  getAppointmentSlots, 
  bookAppointment,
  searchPatients,
  getAppointmentTypeById
} from "@/lib/nexhealth.server";

// Tool response type
interface ToolResponse {
  result: string;
}

// GET method for health check and connectivity testing
export async function GET() {
  try {
    console.log("=== WEBHOOK HEALTH CHECK ===");
    console.log("Timestamp:", new Date().toISOString());
    console.log("Environment check:");
    console.log("- NEXT_PUBLIC_APP_URL:", process.env.NEXT_PUBLIC_APP_URL);
    console.log("- VAPI_WEBHOOK_SECRET present:", !!process.env.VAPI_WEBHOOK_SECRET);
    console.log("- Database connection:", "Testing...");
    
    // Test database connection
    const testQuery = await db.practice.count();
    console.log("- Database test result: Practice count =", testQuery);
    
    return NextResponse.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      message: "Vapi webhook endpoint is reachable",
      config: {
        hasWebhookSecret: !!process.env.VAPI_WEBHOOK_SECRET,
        hasAppUrl: !!process.env.NEXT_PUBLIC_APP_URL,
        dbConnected: true,
        practiceCount: testQuery
      }
    });
  } catch (error) {
    console.error("Health check failed:", error);
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
    console.log("=== VAPI WEBHOOK RECEIVED ===");
    console.log("Timestamp:", new Date().toISOString());
    console.log("Request URL:", request.url);
    console.log("Request method:", request.method);
    
    // Log all headers for debugging
    const headers: { [key: string]: string } = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });
    console.log("Request headers:", JSON.stringify(headers, null, 2));
    
    // Get the raw body for signature verification
    const rawBody = await request.text();
    console.log("Raw body length:", rawBody.length);
    console.log("Raw body preview (first 500 chars):", rawBody.substring(0, 500));
    
    const vapiSignature = request.headers.get("X-Vapi-Signature");
    const vapiSecret = request.headers.get("x-vapi-secret");
    console.log("Vapi signature header:", vapiSignature);
    console.log("Vapi secret header:", vapiSecret);
    
    // --- Webhook Signature Verification ---
    const WEBHOOK_SECRET = process.env.VAPI_WEBHOOK_SECRET || "laine-webhook-secret-change-me";
    console.log("Using webhook secret:", WEBHOOK_SECRET.substring(0, 10) + "...");
    
    // Check if Vapi is sending the secret directly in x-vapi-secret header
    if (vapiSecret) {
      console.log("Using direct secret verification");
      if (vapiSecret !== WEBHOOK_SECRET) {
        console.warn("Invalid webhook secret in x-vapi-secret header");
        return new Response("Forbidden: Invalid secret", { status: 403 });
      }
      console.log("✅ Direct secret verification passed");
    } else if (vapiSignature && WEBHOOK_SECRET) {
      // Traditional HMAC signature verification
      console.log("Using HMAC signature verification");
      const generatedSignature = crypto
        .createHmac("sha256", WEBHOOK_SECRET)
        .update(rawBody)
        .digest("hex");

      const expectedSignature = `sha256=${generatedSignature}`;
      console.log("Generated signature:", expectedSignature);
      console.log("Received signature:", vapiSignature);
      console.log("Signatures match:", expectedSignature === vapiSignature);

      if (!crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(vapiSignature))) {
        console.warn("Invalid webhook signature.");
        return new Response("Forbidden: Invalid signature", { status: 403 });
      }
      console.log("✅ HMAC signature verification passed");
    } else {
      console.warn("No valid authentication method found");
      console.log("Signature present:", !!vapiSignature);
      console.log("Secret present:", !!vapiSecret);
      console.log("Webhook secret configured:", !!WEBHOOK_SECRET);
      return new Response("Unauthorized: No valid authentication", { status: 401 });
    }
    // --- End Signature Verification ---

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
    console.log("Call data keys:", Object.keys(message?.call || {}));
    console.log("Assistant data keys:", Object.keys(message?.assistant || {}));

    if (vapiCallId && vapiAssistantId) {
      try {
        // Find the practice associated with this assistant
        console.log("=== PRACTICE LOOKUP ===");
        console.log("Searching for practice with vapi_assistant_id:", vapiAssistantId);
        
        const practice = await db.practice.findFirst({
          where: { vapi_assistant_id: vapiAssistantId },
        });

        console.log("Practice found:", !!practice);
        if (practice) {
          console.log("Practice ID:", practice.id);
          console.log("Practice name:", practice.name);
        } else {
          console.log("❌ No practice found for assistant ID:", vapiAssistantId);
          // Let's also check what assistant IDs exist in the database
          const allPractices = await db.practice.findMany({
            select: { id: true, name: true, vapi_assistant_id: true }
          });
          console.log("All practices in database:", JSON.stringify(allPractices, null, 2));
        }

        if (practice) {
          if (message.type === "tool-calls") {
            // Handle tool calls
            console.log("=== HANDLING TOOL-CALLS ===");
            await handleToolCalls(message, practice, vapiCallId);
            
            // Create or update basic call log
            const toolCallLogData = {
              vapi_call_id: vapiCallId,
              practice_id: practice.id,
              call_timestamp_start: message?.call?.startedAt ? new Date(message.call.startedAt) : new Date(),
              call_status: "IN_PROGRESS",
              detected_intent: "tool_call_initiated",
              patient_phone_number: message?.call?.customerPhoneNumber || null,
            };
            console.log("Preparing tool-call log data:", JSON.stringify(toolCallLogData, null, 2));
            
            try {
              const upsertResult = await db.callLog.upsert({
                where: { vapi_call_id: vapiCallId },
                update: {
                  call_status: "IN_PROGRESS",
                  detected_intent: "tool_call_in_progress",
                },
                create: toolCallLogData,
              });
              console.log("✅ Tool-call log upserted successfully:", upsertResult.id);
            } catch (dbError) {
              console.error("❌ Database error during tool-call log upsert:", dbError);
            }

            // Return tool results
            const toolResults = await executeTools(message.toolCallList || [], practice, vapiCallId);
            return NextResponse.json({ results: toolResults });

          } else if (message.type === "status-update") {
            // Update call status
            console.log("=== HANDLING STATUS-UPDATE ===");
            console.log("Status update data:", { status: message?.status, call: message?.call });
            
            const statusUpdateData = {
              vapi_call_id: vapiCallId,
              practice_id: practice.id,
              call_timestamp_start: message?.call?.startedAt ? new Date(message.call.startedAt) : new Date(),
              call_status: message?.status || "INITIATED",
              patient_phone_number: message?.call?.customerPhoneNumber || null,
            };
            console.log("Preparing status-update log data:", JSON.stringify(statusUpdateData, null, 2));
            
            try {
              const upsertResult = await db.callLog.upsert({
                where: { vapi_call_id: vapiCallId },
                update: {
                  call_status: message?.status || "UNKNOWN",
                },
                create: statusUpdateData,
              });
              console.log("✅ Status-update log upserted successfully:", upsertResult.id);
            } catch (dbError) {
              console.error("❌ Database error during status-update log upsert:", dbError);
            }

          } else if (message.type === "transcript" && message.transcriptType === "final") {
            // Update transcript incrementally
            console.log("=== HANDLING TRANSCRIPT ===");
            console.log("Transcript data:", { transcript: message?.transcript, transcriptType: message?.transcriptType });
            
            const transcriptUpdateData = {
              vapi_call_id: vapiCallId,
              practice_id: practice.id,
              call_timestamp_start: message?.call?.startedAt ? new Date(message.call.startedAt) : new Date(),
              call_status: "IN_PROGRESS",
              transcript_text: message?.transcript || null,
              patient_phone_number: message?.call?.customerPhoneNumber || null,
            };
            console.log("Preparing transcript log data:", JSON.stringify(transcriptUpdateData, null, 2));
            
            try {
              const upsertResult = await db.callLog.upsert({
                where: { vapi_call_id: vapiCallId },
                update: {
                  transcript_text: message?.transcript || null,
                },
                create: transcriptUpdateData,
              });
              console.log("✅ Transcript log upserted successfully:", upsertResult.id);
            } catch (dbError) {
              console.error("❌ Database error during transcript log upsert:", dbError);
            }

          } else if (message.type === "end-of-call-report") {
            // Final call summary and cleanup
            console.log("=== HANDLING END-OF-CALL-REPORT ===");
            console.log("End-of-call data:", { 
              call: message?.call, 
              analysis: message?.analysis, 
              artifact: message?.artifact 
            });
            
            const endOfCallData = {
              vapi_call_id: vapiCallId,
              practice_id: practice.id,
              call_timestamp_start: message?.call?.startedAt ? new Date(message.call.startedAt) : new Date(),
              call_timestamp_end: message.call?.endedAt ? new Date(message.call.endedAt) : new Date(),
              call_status: "ENDED",
              transcript_text: message.artifact?.transcript || null,
              summary: message.analysis?.summary || null,
              vapi_transcript_url: message.artifact?.recording?.stereoUrl || message.artifact?.recordingUrl || null,
              patient_phone_number: message.call?.customerPhoneNumber || null,
            };
            console.log("Preparing end-of-call log data:", JSON.stringify(endOfCallData, null, 2));
            
            try {
              const upsertResult = await db.callLog.upsert({
                where: { vapi_call_id: vapiCallId },
                update: {
                  call_status: "ENDED",
                  call_timestamp_end: message.call?.endedAt ? new Date(message.call.endedAt) : new Date(),
                  transcript_text: message.artifact?.transcript || null,
                  summary: message.analysis?.summary || null,
                  vapi_transcript_url: message.artifact?.recording?.stereoUrl || message.artifact?.recordingUrl || null,
                },
                create: endOfCallData,
              });
              console.log("✅ End-of-call log upserted successfully:", upsertResult.id);
              console.log(`Call ${vapiCallId} ended and logged for practice ${practice.id}`);
            } catch (dbError) {
              console.error("❌ Database error during end-of-call log upsert:", dbError);
            }
          } else {
            console.log("=== UNHANDLED MESSAGE TYPE ===");
            console.log("Message type:", message?.type);
            console.log("Available message types: tool-calls, status-update, transcript, end-of-call-report");
          }
        } else {
          console.warn(`No practice found for assistant ID: ${vapiAssistantId}`);
        }
      } catch (dbError) {
        console.error("Database error in webhook handler:", dbError);
      }
    } else {
      console.log("=== MISSING REQUIRED DATA ===");
      console.log("Call ID present:", !!vapiCallId);
      console.log("Assistant ID present:", !!vapiAssistantId);
      console.log("Skipping database operations due to missing IDs");
    }

    console.log("=== WEBHOOK PROCESSING COMPLETE ===");
    return NextResponse.json({ status: "webhook_received", type: message.type });

  } catch (error) {
    console.error("=== ERROR PROCESSING VAPI WEBHOOK ===");
    console.error("Error details:", error);
    console.error("Error message:", error instanceof Error ? error.message : "Unknown error");
    console.error("Error stack:", error instanceof Error ? error.stack : "No stack trace");
    
    // Log request details for debugging
    try {
      console.error("Failed request URL:", request.url);
      console.error("Failed request method:", request.method);
    } catch (logError) {
      console.error("Could not log request details:", logError);
    }
    
    return NextResponse.json(
      { 
        error: "Internal server error", 
        message: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

async function handleToolCalls(message: any, practice: any, vapiCallId: string) {
  console.log(`Handling tool calls for practice ${practice.id}, call ${vapiCallId}`);
  // Tool call handling logic will be expanded in future phases
}

async function executeTools(toolCallList: any[], practice: any, vapiCallId: string) {
  const results = [];

  for (const toolCall of toolCallList) {
    const { id, function: fn } = toolCall;
    let result;

    try {
      console.log("=== TOOL EXECUTION DEBUG ===");
      console.log("Tool Call ID:", id);
      console.log("Function Name:", fn.name);
      console.log("Arguments type:", typeof fn.arguments);
      console.log("Arguments value:", fn.arguments);
      console.log("Arguments JSON string?:", typeof fn.arguments === 'string');
      
      // Parse arguments only if they are a string, otherwise use as-is
      let parsedArguments;
      if (typeof fn.arguments === 'string') {
        try {
          parsedArguments = JSON.parse(fn.arguments);
          console.log("✅ Successfully parsed arguments from string:", parsedArguments);
        } catch (parseError) {
          console.error("❌ Failed to parse arguments string:", parseError);
          throw new Error(`Invalid JSON in arguments: ${parseError instanceof Error ? parseError.message : 'Unknown parse error'}`);
        }
      } else {
        parsedArguments = fn.arguments;
        console.log("✅ Using arguments as-is (already an object):", parsedArguments);
      }

      switch (fn.name) {
        case "identify_patient":
          result = await handleIdentifyPatient(parsedArguments, practice, vapiCallId);
          break;
        case "check_appointment_type":
          result = await handleCheckAppointmentType(parsedArguments, practice, vapiCallId);
          break;
        case "check_availability":
          result = await handleFindAppointmentSlots(parsedArguments, practice, vapiCallId);
          break;
        case "schedule_appointment":
          result = await handleBookAppointment(parsedArguments, practice, vapiCallId);
          break;
        case "get_patient_appointments":
          result = await handleGetPatientAppointments(parsedArguments, practice);
          break;
        case "cancel_appointment":
          result = await handleCancelAppointment(parsedArguments, practice);
          break;
        // Legacy tool names for backwards compatibility
        case "identifyOrRegisterPatient":
          result = await handleIdentifyPatient(parsedArguments, practice, vapiCallId);
          break;
        case "findAppointmentSlots":
          result = await handleFindAppointmentSlots(parsedArguments, practice, vapiCallId);
          break;
        case "bookAppointment":
          result = await handleBookAppointment(parsedArguments, practice, vapiCallId);
          break;
        default:
          result = { error: `Unknown tool: ${fn.name}` };
      }
    } catch (error) {
      console.error(`Error executing tool ${fn.name}:`, error);
      result = { error: `Failed to execute ${fn.name}: ${error instanceof Error ? error.message : "Unknown error"}` };
    }

    results.push({
      toolCallId: id,
      name: fn.name,
      result: JSON.stringify(result),
    });
  }

  return results;
}

/**
 * Identify and register a patient in NexHealth
 */
async function handleIdentifyPatient(params: any, practice: any, vapiCallId: string): Promise<ToolResponse> {
  try {
    console.log("=== IDENTIFYING/REGISTERING PATIENT ===");
    console.log("Parameters:", JSON.stringify(params, null, 2));
    console.log("Practice config:", {
      subdomain: practice.nexhealth_subdomain,
      locationId: practice.nexhealth_location_id,
      selectedProviders: practice.nexhealth_selected_provider_ids
    });

    // Extract patient information from the call
    const firstName = params.first_name as string;
    const lastName = params.last_name as string;
    const phoneNumber = params.phone_number as string;
    const dateOfBirth = params.date_of_birth as string; // YYYY-MM-DD format
    const email = params.email as string;
    const gender = params.gender as string; // "Male", "Female", or "Other"

    if (!firstName || !lastName || !phoneNumber) {
      console.warn("Missing required patient information:", { firstName, lastName, phoneNumber });
      return {
        result: JSON.stringify({
          success: false,
          error_code: "MISSING_REQUIRED_INFO",
          message_to_patient: "I need at least your first name, last name, and phone number to proceed. Could you please provide those details?"
        })
      };
    }

    // Validate practice configuration
    if (!practice.nexhealth_subdomain || !practice.nexhealth_location_id) {
      console.error("Practice NexHealth configuration incomplete:", {
        subdomain: practice.nexhealth_subdomain,
        locationId: practice.nexhealth_location_id
      });
      return {
        result: JSON.stringify({
          success: false,
          error_code: "PRACTICE_CONFIG_INCOMPLETE",
          message_to_patient: "I'm having trouble accessing our patient system due to a configuration issue. Please call our office directly for assistance."
        })
      };
    }

    if (!practice.nexhealth_selected_provider_ids || practice.nexhealth_selected_provider_ids.length === 0) {
      console.error("No providers selected for practice:", practice.id);
      return {
        result: JSON.stringify({
          success: false,
          error_code: "NO_PROVIDERS_CONFIGURED",
          message_to_patient: "I apologize, but our system isn't properly configured for new patient registration right now. Please call our office directly and a staff member will help you schedule an appointment."
        })
      };
    }

    // Ensure date_of_birth is YYYY-MM-DD if provided
    let formattedDob = dateOfBirth;
    if (dateOfBirth) {
      try {
        formattedDob = new Date(dateOfBirth).toISOString().split('T')[0];
      } catch {
        console.warn("Invalid date_of_birth format, attempting to use as is:", dateOfBirth);
      }
    }

    // Step 1: Search for existing patient first
    let patient = null;
    let patientIdToStore: string | null = null;
    let isNewPatient = true;
    let patientMessage = "";

    try {
      console.log("Searching for existing patient with:", { firstName, lastName, phoneNumber, formattedDob });
      const searchResults = await searchPatients(
        practice.nexhealth_subdomain!,
        practice.nexhealth_location_id!,
        {
          first_name: firstName,
          last_name: lastName,
          phone_number: phoneNumber,
          date_of_birth: formattedDob,
        }
      );

      console.log(`Patient search returned ${searchResults?.length || 0} results`);
      
      // Check if we found a matching patient
      if (searchResults && searchResults.length > 0) {
        // Look for an exact match on name and phone
        patient = searchResults.find((p: any) => 
          p.first_name?.toLowerCase() === firstName.toLowerCase() &&
          p.last_name?.toLowerCase() === lastName.toLowerCase() &&
          (p.phone_number === phoneNumber || p.bio?.phone_number === phoneNumber || 
           p.bio?.cell_phone_number === phoneNumber || p.bio?.home_phone_number === phoneNumber) &&
          (formattedDob ? p.bio?.date_of_birth === formattedDob : true)
        );

        if (patient) {
          console.log("Found existing patient:", patient.id);
          patientIdToStore = patient.id.toString();
          isNewPatient = false;
          patientMessage = `Welcome back, ${firstName}! I found your existing record in our system. How can I help you today?`;
        } else {
          console.log("No exact match found in search results");
        }
      }
    } catch (searchError) {
      console.error("Patient search failed:", searchError);
      // Continue to patient creation - search failure doesn't prevent new patient creation
    }

    // Step 2: Create new patient if not found
    if (!patient) {
      console.log("Creating new patient in NexHealth...");
      
      const providerId = practice.nexhealth_selected_provider_ids[0];
      console.log("Using provider ID:", providerId);

      const patientData = {
        first_name: firstName,
        last_name: lastName,
        phone_number: phoneNumber,
        date_of_birth: formattedDob,
        email: email,
        gender: gender || "Female" // Default to Female as per NexHealth suggestion for some EHRs
      };

      try {
        const newPatient = await createPatient(
          practice.nexhealth_subdomain!,
          practice.nexhealth_location_id!,
          providerId,
          patientData
        );

        console.log("New patient created successfully:", {
          patientId: newPatient.user?.id || newPatient.id,
          patientData: patientData
        });
        
        patientIdToStore = newPatient.user?.id?.toString() || newPatient.id?.toString();
        isNewPatient = true;
        patientMessage = `Perfect! I've created your patient record, ${firstName}. Welcome to our practice! Now, what type of appointment would you like to schedule?`;
      } catch (createError) {
        console.error("Patient creation failed:", createError);
        const errorMessage = createError instanceof Error ? createError.message : "Unknown error";
        
        return {
          result: JSON.stringify({
            success: false,
            error_code: "PATIENT_CREATION_FAILED",
            message_to_patient: "I'm having trouble creating your patient record right now. This might be due to a connectivity issue. Please try calling back in a few minutes, or call our office directly for assistance.",
            technical_details: errorMessage.substring(0, 200) // Truncate for logging
          })
        };
      }
    }

    // Step 3: Update CallLog with patient_id
    if (patientIdToStore) {
      try {
        await db.callLog.updateMany({
          where: {
            vapi_call_id: vapiCallId,
            practice_id: practice.id
          },
          data: {
            nexhealth_patient_id: patientIdToStore,
            detected_intent: isNewPatient ? "new_patient_created" : "existing_patient_identified",
            patient_phone_number: phoneNumber
          }
        });
        console.log(`✅ CallLog ${vapiCallId} updated with nexhealth_patient_id: ${patientIdToStore}`);
      } catch (dbError) {
        console.error("Error updating call log:", dbError);
        // Don't fail the entire operation for logging issues
      }

      return {
        result: JSON.stringify({
          success: true,
          patient_id: patientIdToStore,
          is_new_patient: isNewPatient,
          message_to_patient: patientMessage
        })
      };
    } else {
      console.error("Failed to obtain patient_id after search/create.");
      return {
        result: JSON.stringify({
          success: false,
          error_code: "PATIENT_ID_UNAVAILABLE",
          message_to_patient: "I'm having a bit of trouble accessing patient records right now. Could you try calling back in a few minutes?"
        })
      };
    }

  } catch (error) {
    console.error("=== ERROR IN IDENTIFY_PATIENT ===");
    console.error("Error details:", error);
    console.error("Practice ID:", practice?.id);
    console.error("VAPI Call ID:", vapiCallId);
    
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return {
      result: JSON.stringify({
        success: false,
        error_code: "PATIENT_IDENTIFICATION_FAILED",
        message_to_patient: "I'm having trouble accessing our patient system right now. Let me have someone from our office call you back to help with your appointment.",
        technical_details: errorMessage.substring(0, 200) // Truncate for logging
      })
    };
  }
}

/**
 * Check and determine the appropriate appointment type based on patient's reason for visit
 */
async function handleCheckAppointmentType(params: any, practice: any, vapiCallId: string): Promise<ToolResponse> {
  try {
    console.log("=== CHECKING APPOINTMENT TYPE ===");
    console.log("Parameters:", JSON.stringify(params, null, 2));
    console.log("Practice ID:", practice.id);

    const { patient_reason_for_visit } = params;

    if (!patient_reason_for_visit?.trim()) {
      return {
        result: JSON.stringify({
          success: false,
          error_code: "MISSING_REASON",
          message_to_patient: "I need to know what type of appointment you're looking for. Could you tell me the reason for your visit?"
        })
      };
    }

    // Validate practice configuration
    if (!practice.nexhealth_subdomain || !practice.nexhealth_location_id) {
      console.error("Practice NexHealth configuration incomplete:", {
        subdomain: practice.nexhealth_subdomain,
        locationId: practice.nexhealth_location_id
      });
      return {
        result: JSON.stringify({
          success: false,
          error_code: "PRACTICE_CONFIG_INCOMPLETE",
          message_to_patient: "I'm having trouble accessing our appointment types due to a configuration issue. Please call our office directly."
        })
      };
    }

    console.log("Searching for service mapping for:", patient_reason_for_visit);

    // Search for service mapping with case-insensitive matching
    let serviceMapping = await db.serviceMapping.findFirst({
      where: {
        practice_id: practice.id,
        spoken_service_name: {
          equals: patient_reason_for_visit.trim(),
          mode: 'insensitive'
        }
      }
    });

    // If no exact match, try common variations
    if (!serviceMapping) {
      console.log("No exact match found, trying variations...");
      
      const variations: string[] = [];
      const lowerReason = patient_reason_for_visit.toLowerCase();
      
      // Build variations based on common patterns
      if (lowerReason.includes('clean')) {
        variations.push('cleaning', 'general cleaning', 'prophy', 'prophylaxis', 'hygiene', 'dental cleaning');
      }
      if (lowerReason.includes('check')) {
        variations.push('checkup', 'check-up', 'examination', 'exam', 'routine checkup', 'dental exam');
      }
      if (lowerReason.includes('consult') || lowerReason.includes('new patient')) {
        variations.push('consultation', 'new patient consultation', 'new patient', 'consult', 'initial consultation');
      }
      if (lowerReason.includes('emergen') || lowerReason.includes('urgent') || lowerReason.includes('pain')) {
        variations.push('emergency', 'urgent care', 'pain visit', 'emergency appointment');
      }
      
      // Try each variation
      for (const variation of variations) {
        console.log(`Trying variation: ${variation}`);
        serviceMapping = await db.serviceMapping.findFirst({
          where: {
            practice_id: practice.id,
            spoken_service_name: {
              equals: variation,
              mode: 'insensitive'
            }
          }
        });
        if (serviceMapping) {
          console.log(`Found mapping with variation: ${variation} -> ${serviceMapping.nexhealth_appointment_type_id}`);
          break;
        }
      }
    } else {
      console.log(`Found exact mapping: ${patient_reason_for_visit} -> ${serviceMapping.nexhealth_appointment_type_id}`);
    }

    if (!serviceMapping) {
      console.warn("No service mapping found for:", patient_reason_for_visit);
      
      // Get available service mappings for helpful error message
      const availableMappings = await db.serviceMapping.findMany({
        where: { practice_id: practice.id, is_active: true },
        select: { spoken_service_name: true }
      });
      
      console.log("Available service mappings:", availableMappings.map(m => m.spoken_service_name));
      
      const suggestionText = availableMappings.length > 0 
        ? `I can help with: ${availableMappings.map(m => m.spoken_service_name).slice(0, 5).join(', ')}`
        : "Let me get someone from our office to help you";
      
      return {
        result: JSON.stringify({
          success: false,
          error_code: "NO_SERVICE_MAPPING_FOUND",
          message_to_patient: `I'm not sure about "${patient_reason_for_visit}". ${suggestionText}. Could you try describing it differently?`
        })
      };
    }

    // Fetch appointment type details from NexHealth
    try {
      console.log("Fetching appointment type details from NexHealth...");
      const appointmentType = await getAppointmentTypeById(
        practice.nexhealth_subdomain,
        serviceMapping.nexhealth_appointment_type_id,
        practice.nexhealth_location_id
      );

      console.log("✅ Appointment type details retrieved:", appointmentType);

      // Update call log with detected service type
      try {
        await db.callLog.updateMany({
          where: {
            vapi_call_id: vapiCallId,
            practice_id: practice.id
          },
          data: {
            detected_intent: `service_type_identified_${appointmentType.id}`,
            // Store the matched service mapping for reference
            summary: `Patient requested: "${patient_reason_for_visit}" -> Mapped to: "${appointmentType.name}"`
          }
        });
        console.log(`✅ CallLog ${vapiCallId} updated with appointment type detection`);
      } catch (dbError) {
        console.error("Error updating call log:", dbError);
        // Don't fail the operation for logging issues
      }

      return {
        result: JSON.stringify({
          success: true,
          appointment_type_id: appointmentType.id.toString(),
          appointment_type_name: appointmentType.name,
          duration_minutes: appointmentType.minutes || 30,
          message_to_patient: `Okay, a ${appointmentType.name}. That usually takes about ${appointmentType.minutes || 30} minutes. Is that what you're looking for?`
        })
      };

    } catch (nexhealthError) {
      console.error("Failed to fetch appointment type from NexHealth:", nexhealthError);
      
      return {
        result: JSON.stringify({
          success: false,
          error_code: "NEXHEALTH_API_ERROR",
          message_to_patient: "I'm having trouble looking up appointment types right now. Please try again in a moment or call our office directly."
        })
      };
    }

  } catch (error) {
    console.error("=== ERROR IN CHECK_APPOINTMENT_TYPE ===");
    console.error("Error details:", error);
    console.error("Practice ID:", practice?.id);
    console.error("VAPI Call ID:", vapiCallId);
    
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return {
      result: JSON.stringify({
        success: false,
        error_code: "INTERNAL_ERROR",
        message_to_patient: "I'm having trouble processing your appointment request right now. Please try again or call our office directly.",
        technical_details: errorMessage.substring(0, 200)
      })
    };
  }
}

async function handleFindAppointmentSlots(params: any, practice: any, _vapiCallId: string): Promise<ToolResponse> {
  console.log("=== FINDING APPOINTMENT SLOTS ===");
  console.log("Parameters:", JSON.stringify(params, null, 2));

  try {
    // Validate practice configuration
    if (!practice.nexhealth_subdomain || !practice.nexhealth_location_id) {
      console.error("Practice configuration incomplete:", {
        subdomain: practice.nexhealth_subdomain,
        locationId: practice.nexhealth_location_id
      });
      return {
        result: JSON.stringify({
          success: false,
          error_code: "PRACTICE_CONFIG_INCOMPLETE",
          message_to_patient: "Practice configuration is incomplete. Please contact support."
        })
      };
    }

    const { 
      appointment_type_id, 
      duration_minutes, 
      requested_date, 
      search_type,
      // Legacy support for service_description
      service_description 
    } = params;

    let finalAppointmentTypeId = appointment_type_id;
    const finalDurationMinutes = duration_minutes;

    // If appointment_type_id not provided, fall back to service_description mapping (legacy support)
    if (!finalAppointmentTypeId && service_description) {
      console.log("No appointment_type_id provided, falling back to service_description mapping...");
      
      // Search for service mapping with case-insensitive matching
      let serviceMapping = await db.serviceMapping.findFirst({
        where: {
          practice_id: practice.id,
          spoken_service_name: {
            equals: service_description,
            mode: 'insensitive'
          }
        }
      });

      // If no exact match, try common variations
      if (!serviceMapping) {
        console.log("No exact match found, trying variations...");
        
        const variations: string[] = [];
        const lowerService = service_description.toLowerCase();
        
        // Build variations based on common patterns
        if (lowerService.includes('clean')) {
          variations.push('cleaning', 'general cleaning', 'prophy', 'prophylaxis');
        }
        if (lowerService.includes('check')) {
          variations.push('checkup', 'check-up', 'examination', 'exam');
        }
        if (lowerService.includes('consult')) {
          variations.push('consultation', 'new patient consultation', 'new patient');
        }
        
        // Try each variation
        for (const variation of variations) {
          console.log(`Trying variation: ${variation}`);
          serviceMapping = await db.serviceMapping.findFirst({
            where: {
              practice_id: practice.id,
              spoken_service_name: {
                equals: variation,
                mode: 'insensitive'
              }
            }
          });
          if (serviceMapping) {
            console.log(`Found mapping with variation: ${variation} -> ${serviceMapping.nexhealth_appointment_type_id}`);
            break;
          }
        }
      }

      if (!serviceMapping) {
        console.warn("No service mapping found for:", service_description);
        
        const availableMappings = await db.serviceMapping.findMany({
          where: { practice_id: practice.id },
          select: { spoken_service_name: true }
        });
        
        const suggestionText = availableMappings.length > 0 
          ? `Available services include: ${availableMappings.map(m => m.spoken_service_name).join(', ')}`
          : "Please use the check_appointment_type tool first to determine the appointment type.";
        
        return {
          result: JSON.stringify({
            success: false,
            error_code: "NO_SERVICE_MAPPING_FOUND",
            message_to_patient: `I couldn't find a service called '${service_description}'. ${suggestionText}`
          })
        };
      }

      finalAppointmentTypeId = serviceMapping.nexhealth_appointment_type_id;
    }

    if (!finalAppointmentTypeId) {
      return {
        result: JSON.stringify({
          success: false,
          error_code: "MISSING_APPOINTMENT_TYPE",
          message_to_patient: "I need to know what type of appointment you're looking for. Please specify the appointment type or use the check_appointment_type tool first."
        })
      };
    }

    // Determine search parameters
    const startDate = requested_date || new Date().toISOString().split('T')[0];
    const searchDays = search_type === "specific_date" ? 1 : 30;

    console.log("Search parameters:", {
      appointment_type_id: finalAppointmentTypeId,
      provider_ids: practice.nexhealth_selected_provider_ids,
      operatory_ids: practice.nexhealth_default_operatory_ids,
      start_date: startDate,
      days: searchDays,
      duration_minutes: finalDurationMinutes
    });

    // Get appointment slots from NexHealth
    const slotsResponse = await getAppointmentSlots(
      practice.nexhealth_subdomain,
      practice.nexhealth_location_id,
      {
        appointment_type_id: finalAppointmentTypeId,
        provider_ids: practice.nexhealth_selected_provider_ids,
        operatory_ids: practice.nexhealth_default_operatory_ids.length > 0 ? practice.nexhealth_default_operatory_ids : undefined,
        start_date: startDate,
        days: searchDays
      }
    );

    console.log("Raw slots response:", JSON.stringify(slotsResponse, null, 2));

    // Process the NexHealth response structure: data[].slots[]
    const allSlots: any[] = [];
    if (slotsResponse && Array.isArray(slotsResponse)) {
      // Extract all slots from all providers/locations
      slotsResponse.forEach((providerData: any) => {
        if (providerData.slots && Array.isArray(providerData.slots)) {
          providerData.slots.forEach((slot: any) => {
            allSlots.push({
              start_time: slot.time,
              end_time: slot.end_time,
              provider_id: providerData.pid?.toString(),
              operatory_id: slot.operatory_id?.toString(),
              location_id: providerData.lid?.toString()
            });
          });
        }
      });
    }

    console.log("Processed slots:", JSON.stringify(allSlots, null, 2));

    if (allSlots.length === 0) {
      const dateDisplay = search_type === "specific_date" ? `on ${requested_date}` : "in the next month";
      return {
        result: JSON.stringify({
          success: false,
          error_code: "NO_SLOTS_FOUND",
          available_slots: [],
          message_to_patient: `I'm sorry, I don't see any openings ${dateDisplay}. Would you like to try another date or should I check for the next available appointment?`
        })
      };
    }

    // Format slots for response (limit to 5 most relevant)
    const limitedSlots = allSlots.slice(0, 5);
    const slotDescriptions = limitedSlots.map(slot => {
      try {
        const date = new Date(slot.start_time);
        const dateStr = date.toLocaleDateString('en-US', { 
          weekday: 'long', 
          month: 'long', 
          day: 'numeric' 
        });
        const timeStr = date.toLocaleTimeString('en-US', { 
          hour: 'numeric', 
          minute: '2-digit',
          hour12: true 
        });
        return `${dateStr} at ${timeStr}`;
      } catch (dateError) {
        console.error("Date formatting error:", dateError, "for slot:", slot);
        return `${slot.start_time}`;
      }
    }).join(", ");

    const dateContext = search_type === "specific_date" ? `on ${requested_date}` : "coming up";
    
    return {
      result: JSON.stringify({
        success: true,
        available_slots: limitedSlots,
        appointment_type_id: finalAppointmentTypeId,
        message_to_patient: `Great! I have these times available ${dateContext}: ${slotDescriptions}. Which time works best for you?`
      })
    };

  } catch (error) {
    console.error("❌ Error finding appointment slots:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return {
      result: JSON.stringify({
        success: false,
        error_code: "SLOT_SEARCH_FAILED",
        message_to_patient: "I'm having trouble checking availability right now. Please try again or call the office directly.",
        technical_details: errorMessage.substring(0, 200)
      })
    };
  }
}

async function handleBookAppointment(params: any, practice: any, vapiCallId: string): Promise<ToolResponse> {
  console.log("=== BOOKING APPOINTMENT ===");
  console.log("Parameters:", JSON.stringify(params, null, 2));

  try {
    // Validate practice configuration
    if (!practice.nexhealth_subdomain || !practice.nexhealth_location_id) {
      return {
        result: JSON.stringify({
          success: false,
          error_code: "PRACTICE_CONFIG_INCOMPLETE",
          message_to_patient: "Practice configuration is incomplete. Please contact support."
        })
      };
    }

    const {
      patient_id,
      provider_id,
      operatory_id,
      appointment_type_id,
      start_time,
      end_time,
      note
    } = params;

    if (!patient_id || !provider_id || !appointment_type_id || !start_time || !end_time) {
      console.warn("Missing required booking parameters:", {
        patient_id: !!patient_id,
        provider_id: !!provider_id,
        appointment_type_id: !!appointment_type_id,
        start_time: !!start_time,
        end_time: !!end_time
      });
      
      return {
        result: JSON.stringify({
          success: false,
          error_code: "MISSING_BOOKING_INFO",
          message_to_patient: "I'm missing some information needed to book your appointment. Please try selecting a time slot again."
        })
      };
    }

    // Book appointment in NexHealth
    const appointmentData = await bookAppointment(
      practice.nexhealth_subdomain,
      practice.nexhealth_location_id,
      {
        patient_id,
        provider_id,
        operatory_id,
        appointment_type_id,
        start_time,
        end_time,
        note
      }
    );

    console.log("✅ Appointment booked successfully:", {
      appointmentId: appointmentData.id,
      patientId: patient_id,
      startTime: start_time
    });

    // Update call log with booking details
    try {
      await db.callLog.updateMany({
        where: {
          vapi_call_id: vapiCallId,
          practice_id: practice.id
        },
        data: {
          booked_appointment_nexhealth_id: appointmentData.id.toString(),
          booked_appointment_patient_id: patient_id,
          booked_appointment_provider_id: provider_id,
          booked_appointment_operatory_id: operatory_id,
          booked_appointment_type_id: appointment_type_id,
          booked_appointment_start_time: new Date(start_time),
          booked_appointment_end_time: new Date(end_time),
          booked_appointment_note: note,
          call_status: "COMPLETED_BOOKING",
          detected_intent: `booked_appointment_for_type_${appointment_type_id}`
        }
      });
      console.log("✅ Call log updated with booking details");
    } catch (dbError) {
      console.error("❌ Error updating call log:", dbError);
      // Continue with success response even if logging fails
    }

    const appointmentDate = new Date(start_time);
    const dateStr = appointmentDate.toLocaleDateString('en-US', { 
      weekday: 'long', 
      month: 'long', 
      day: 'numeric' 
    });
    const timeStr = appointmentDate.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });

    return {
      result: JSON.stringify({
        success: true,
        nexhealth_appointment_id: appointmentData.id.toString(),
        ehr_foreign_id: appointmentData.foreign_id?.toString() || null, // May not be available immediately
        message_to_patient: `Perfect! You're all set for ${dateStr} at ${timeStr}. Your appointment confirmation number is ${appointmentData.id}. We'll see you then!`
      })
    };

  } catch (error) {
    console.error("❌ Error booking appointment:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    // Provide specific error messages based on the error type
    let userMessage = "I'm sorry, I couldn't complete your booking right now. Please try again or call the office directly.";
    let errorCode = "BOOKING_FAILED";
    
    if (errorMessage.toLowerCase().includes('patient')) {
      userMessage = "There was an issue with the patient information. Please try again or call our office.";
      errorCode = "PATIENT_ERROR";
    } else if (errorMessage.toLowerCase().includes('provider')) {
      userMessage = "The selected provider is not available. Please try a different time or call our office.";
      errorCode = "PROVIDER_ERROR";
    } else if (errorMessage.toLowerCase().includes('time') || errorMessage.toLowerCase().includes('slot')) {
      userMessage = "That time slot is no longer available. Please select a different time.";
      errorCode = "TIME_SLOT_ERROR";
    } else if (errorMessage.toLowerCase().includes('duplicate') || errorMessage.toLowerCase().includes('conflict')) {
      userMessage = "There's a scheduling conflict. Please select a different time or call our office.";
      errorCode = "SCHEDULING_CONFLICT";
    }
    
    return {
      result: JSON.stringify({
        success: false,
        error_code: errorCode,
        message_to_patient: userMessage,
        technical_details: errorMessage.substring(0, 200)
      })
    };
  }
}

// Updated placeholder implementations for future tools
async function handleGetPatientAppointments(params: any, _practice: any): Promise<ToolResponse> {
  console.log("Getting patient appointments:", params);
  // Mock existing appointments
  return {
    result: "I found your existing appointments. You have a dental cleaning scheduled for February 20th at 10:00 AM. Would you like to schedule another appointment?"
  };
}

async function handleCancelAppointment(params: any, _practice: any): Promise<ToolResponse> {
  console.log("Canceling appointment:", params);
  // Mock appointment cancellation
  return {
    result: "Your appointment has been successfully canceled. We'll send you a confirmation via text message. Is there anything else I can help you with?"
  };
} 