import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import db from "@/lib/prisma";
import { 
  createPatient, 
  getAppointmentSlots, 
  bookAppointment
} from "@/lib/nexhealth.server";

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
    console.log("Vapi signature header:", vapiSignature);
    
    // --- Webhook Signature Verification ---
    const WEBHOOK_SECRET = process.env.VAPI_WEBHOOK_SECRET || "laine-webhook-secret-change-me";
    console.log("Using webhook secret:", WEBHOOK_SECRET.substring(0, 10) + "...");
    
    if (!vapiSignature || !WEBHOOK_SECRET) {
      console.warn("Webhook signature or secret missing.");
      console.log("Signature present:", !!vapiSignature);
      console.log("Secret present:", !!WEBHOOK_SECRET);
      return new Response("Unauthorized: Signature or secret missing", { status: 401 });
    }

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
    console.log("✅ Signature verification passed");
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
      switch (fn.name) {
        case "identifyOrRegisterPatient":
          result = await handleIdentifyPatient(JSON.parse(fn.arguments), practice);
          break;
        case "findAppointmentSlots":
          result = await handleFindAppointmentSlots(JSON.parse(fn.arguments), practice, vapiCallId);
          break;
        case "bookAppointment":
          result = await handleBookAppointment(JSON.parse(fn.arguments), practice, vapiCallId);
          break;
        case "get_patient_appointments":
          result = await handleGetPatientAppointments(JSON.parse(fn.arguments), practice);
          break;
        case "cancel_appointment":
          result = await handleCancelAppointment(JSON.parse(fn.arguments), practice);
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

// Tool implementations with real NexHealth integration
async function handleIdentifyPatient(params: any, practice: any) {
  console.log("=== IDENTIFYING/REGISTERING PATIENT ===");
  console.log("Parameters:", JSON.stringify(params, null, 2));
  console.log("Practice config:", {
    subdomain: practice.nexhealth_subdomain,
    locationId: practice.nexhealth_location_id,
    selectedProviders: practice.nexhealth_selected_provider_ids
  });

  try {
    // Validate practice configuration
    if (!practice.nexhealth_subdomain || !practice.nexhealth_location_id) {
      return {
        success: false,
        error: "Practice NexHealth configuration is incomplete. Please contact support."
      };
    }

    if (!practice.nexhealth_selected_provider_ids || practice.nexhealth_selected_provider_ids.length === 0) {
      return {
        success: false,
        error: "No providers are configured for booking. Please contact the practice."
      };
    }

    // Extract patient details from params
    const { first_name, last_name, phone_number, date_of_birth, email, gender } = params;

    if (!first_name || !last_name || !phone_number) {
      return {
        success: false,
        error: "Patient name and phone number are required for registration."
      };
    }

    // Use the first selected provider for new patient registration
    const providerId = practice.nexhealth_selected_provider_ids[0];

    // Create patient in NexHealth
    const patientData = await createPatient(
      practice.nexhealth_subdomain,
      practice.nexhealth_location_id,
      providerId,
      {
        first_name,
        last_name,
        phone_number,
        date_of_birth,
        email,
        gender
      }
    );

    console.log("✅ Patient created successfully:", patientData.id);

    return {
      success: true,
      patient_id: patientData.id.toString(),
      message: `Thank you ${first_name}! I've registered you as a new patient in our system.`
    };

  } catch (error) {
    console.error("❌ Error creating patient:", error);
    return {
      success: false,
      error: "I'm sorry, I couldn't register you in our system right now. Please try again or call the office directly."
    };
  }
}

async function handleFindAppointmentSlots(params: any, practice: any, _vapiCallId: string) {
  console.log("=== FINDING APPOINTMENT SLOTS ===");
  console.log("Parameters:", JSON.stringify(params, null, 2));

  try {
    // Validate practice configuration
    if (!practice.nexhealth_subdomain || !practice.nexhealth_location_id) {
      return {
        success: false,
        error: "Practice configuration is incomplete. Please contact support."
      };
    }

    const { service_description, requested_date, search_type } = params;

    // Map service description to NexHealth appointment type
    const serviceMapping = await db.serviceMapping.findFirst({
      where: {
        practice_id: practice.id,
        spoken_service_name: {
          equals: service_description,
          mode: 'insensitive'
        }
      }
    });

    if (!serviceMapping) {
      return {
        success: false,
        error: `I'm sorry, I couldn't find a service called '${service_description}'. Can you describe it differently or choose from common services like cleaning or check-up?`
      };
    }

    // Determine search parameters
    const startDate = requested_date || new Date().toISOString().split('T')[0];
    const searchDays = search_type === "specific_date" ? 1 : 30;

    // Get appointment slots from NexHealth
    const slotsData = await getAppointmentSlots(
      practice.nexhealth_subdomain,
      practice.nexhealth_location_id,
      {
        appointment_type_id: serviceMapping.nexhealth_appointment_type_id,
        provider_ids: practice.nexhealth_selected_provider_ids,
        operatory_ids: practice.nexhealth_default_operatory_ids.length > 0 ? practice.nexhealth_default_operatory_ids : undefined,
        start_date: startDate,
        days: searchDays
      }
    );

    console.log("Slots response:", JSON.stringify(slotsData, null, 2));

    if (!slotsData || !Array.isArray(slotsData) || slotsData.length === 0) {
      return {
        success: true,
        available_slots: [],
        message_to_patient: `I'm sorry, I don't see any openings for ${service_description} ${search_type === "specific_date" ? `on ${requested_date}` : "in the next month"}. Would you like to try another date?`
      };
    }

    // Format slots for response
    const formattedSlots = slotsData.slice(0, 5).map(slot => ({
      time: slot.start_time,
      provider_id: slot.provider_id,
      operatory_id: slot.operatory_id,
      end_time: slot.end_time
    }));

    const dateStr = search_type === "specific_date" ? `on ${requested_date}` : "coming up";
    const slotDescriptions = formattedSlots.map(slot => {
      const date = new Date(slot.time);
      return date.toLocaleDateString() + " at " + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }).join(", ");

    return {
      success: true,
      available_slots: formattedSlots,
      appointment_type_id_used: serviceMapping.nexhealth_appointment_type_id,
      message_to_patient: `Great! For ${service_description} ${dateStr}, I have these times available: ${slotDescriptions}. Which time works best for you?`
    };

  } catch (error) {
    console.error("❌ Error finding appointment slots:", error);
    return {
      success: false,
      error: "I'm having trouble checking availability right now. Please try again or call the office directly."
    };
  }
}

async function handleBookAppointment(params: any, practice: any, _vapiCallId: string) {
  console.log("=== BOOKING APPOINTMENT ===");
  console.log("Parameters:", JSON.stringify(params, null, 2));

  try {
    // Validate practice configuration
    if (!practice.nexhealth_subdomain || !practice.nexhealth_location_id) {
      return {
        success: false,
        error: "Practice configuration is incomplete. Please contact support."
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
      return {
        success: false,
        error: "Missing required information for booking. Please try again."
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

    console.log("✅ Appointment booked successfully:", appointmentData.id);

    // Update call log with booking details
    try {
      await db.callLog.updateMany({
        where: {
          vapi_call_id: _vapiCallId,
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
          detected_intent: `booked_appointment_for_${appointment_type_id}`
        }
      });
      console.log("✅ Call log updated with booking details");
    } catch (dbError) {
      console.error("❌ Error updating call log:", dbError);
      // Continue with success response even if logging fails
    }

    const appointmentDate = new Date(start_time);
    const dateStr = appointmentDate.toLocaleDateString();
    const timeStr = appointmentDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return {
      success: true,
      appointment_id: appointmentData.id.toString(),
      confirmation_message_to_patient: `Perfect! You're all set for ${dateStr} at ${timeStr}. Your appointment confirmation number is ${appointmentData.id}. We'll see you then!`
    };

  } catch (error) {
    console.error("❌ Error booking appointment:", error);
    return {
      success: false,
      error: "I'm sorry, I couldn't complete your booking right now. Please try again or call the office directly."
    };
  }
}

// Placeholder implementations for future tools
async function handleGetPatientAppointments(params: any, _practice: any) {
  console.log("Getting patient appointments:", params);
  // Mock existing appointments
  return {
    success: true,
    message: "Retrieved patient appointments",
    data: {
      appointments: [
        {
          id: "apt_existing_1",
          date: "2024-02-20",
          time: "10:00 AM",
          service: "Dental Cleaning",
          status: "confirmed",
        },
      ],
    },
  };
}

async function handleCancelAppointment(params: any, _practice: any) {
  console.log("Canceling appointment:", params);
  // Mock appointment cancellation
  return {
    success: true,
    message: "Appointment canceled successfully",
    data: {
      canceledAppointmentId: params.appointmentId || "apt_mock",
      cancellationDate: new Date().toISOString(),
    },
  };
} 