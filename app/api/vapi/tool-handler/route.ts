import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import db from "@/lib/prisma";

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
            const toolResults = await executeTools(message.toolCallList || [], practice);
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
              transcript_text: message.transcript,
              patient_phone_number: message?.call?.customerPhoneNumber || null,
            };
            console.log("Preparing transcript log data:", JSON.stringify(transcriptUpdateData, null, 2));
            
            try {
              const upsertResult = await db.callLog.upsert({
                where: { vapi_call_id: vapiCallId },
                update: {
                  transcript_text: message.transcript,
                },
                create: transcriptUpdateData,
              });
              console.log("✅ Transcript log upserted successfully:", upsertResult.id);
            } catch (dbError) {
              console.error("❌ Database error during transcript log upsert:", dbError);
            }

          } else if (message.type === "end-of-call-report") {
            // Final call update with complete data
            console.log("=== HANDLING END-OF-CALL-REPORT ===");
            console.log("End-of-call report keys:", Object.keys(message));
            console.log("Call data:", JSON.stringify(message?.call, null, 2));
            console.log("Artifact data:", JSON.stringify(message?.artifact, null, 2));
            console.log("Analysis data:", JSON.stringify(message?.analysis, null, 2));
            
            const endOfCallData = {
              vapi_call_id: vapiCallId,
              practice_id: practice.id,
              call_timestamp_start: message.call?.startedAt ? new Date(message.call.startedAt) : new Date(),
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

async function executeTools(toolCallList: any[], practice: any) {
  const results = [];

  for (const toolCall of toolCallList) {
    const { id, function: fn } = toolCall;
    let result;

    try {
      switch (fn.name) {
        case "identify_patient":
          result = await handleIdentifyPatient(JSON.parse(fn.arguments), practice);
          break;
        case "check_availability":
          result = await handleCheckAvailability(JSON.parse(fn.arguments), practice);
          break;
        case "schedule_appointment":
          result = await handleScheduleAppointment(JSON.parse(fn.arguments), practice);
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
      result = { error: `Failed to execute ${fn.name}: ${error}` };
    }

    results.push({
      toolCallId: id,
      name: fn.name,
      result: JSON.stringify(result),
    });
  }

  return results;
}

// Tool implementations (placeholder for now)
async function handleIdentifyPatient(params: any, _practice: any) {
  console.log("Identifying patient:", params);
  // For now, return mock data
  return {
    success: true,
    message: "Patient identification initiated",
    data: {
      patientId: "patient_123",
      name: params.patientName || "Unknown Patient",
      isNewPatient: !params.patientName,
    },
  };
}

async function handleCheckAvailability(params: any, _practice: any) {
  console.log("Checking availability:", params);
  // Mock availability data
  return {
    success: true,
    message: "Availability found",
    data: {
      availableSlots: [
        { date: "2024-02-15", time: "10:00 AM", available: true },
        { date: "2024-02-15", time: "2:00 PM", available: true },
        { date: "2024-02-16", time: "9:00 AM", available: true },
      ],
      serviceName: params.serviceName,
    },
  };
}

async function handleScheduleAppointment(params: any, _practice: any) {
  console.log("Scheduling appointment:", params);
  // Mock appointment scheduling
  return {
    success: true,
    message: "Appointment scheduled successfully",
    data: {
      appointmentId: "apt_" + Date.now(),
      patientName: params.patientName,
      service: params.serviceName,
      date: params.appointmentDate,
      time: params.appointmentTime,
      confirmationNumber: "CONF" + Date.now().toString().slice(-6),
    },
  };
}

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