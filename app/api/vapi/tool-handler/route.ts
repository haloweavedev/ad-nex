import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import db from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    // Get the raw body for signature verification
    const rawBody = await request.text();
    const vapiSignature = request.headers.get("X-Vapi-Signature");
    
    // --- Webhook Signature Verification ---
    const WEBHOOK_SECRET = process.env.VAPI_WEBHOOK_SECRET || "laine-webhook-secret-change-me";
    
    if (!vapiSignature || !WEBHOOK_SECRET) {
      console.warn("Webhook signature or secret missing.");
      return new Response("Unauthorized: Signature or secret missing", { status: 401 });
    }

    const generatedSignature = crypto
      .createHmac("sha256", WEBHOOK_SECRET)
      .update(rawBody)
      .digest("hex");

    const expectedSignature = `sha256=${generatedSignature}`;

    if (!crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(vapiSignature))) {
      console.warn("Invalid webhook signature.");
      return new Response("Forbidden: Invalid signature", { status: 403 });
    }
    // --- End Signature Verification ---

    const payload = JSON.parse(rawBody);
    const { message } = payload;

    console.log("Received Vapi webhook:", message.type);

    // Extract common data
    const vapiCallId = message?.call?.id;
    const vapiAssistantId = message?.assistant?.id || message?.call?.assistantId;

    if (vapiCallId && vapiAssistantId) {
      try {
        // Find the practice associated with this assistant
        const practice = await db.practice.findFirst({
          where: { vapi_assistant_id: vapiAssistantId },
        });

        if (practice) {
          if (message.type === "tool-calls") {
            // Handle tool calls
            await handleToolCalls(message, practice, vapiCallId);
            
            // Create or update basic call log
            await db.callLog.upsert({
              where: { vapi_call_id: vapiCallId },
              update: {
                call_status: "IN_PROGRESS",
                detected_intent: "tool_call_in_progress",
              },
              create: {
                vapi_call_id: vapiCallId,
                practice_id: practice.id,
                call_timestamp_start: message?.call?.startedAt ? new Date(message.call.startedAt) : new Date(),
                call_status: "IN_PROGRESS",
                detected_intent: "tool_call_initiated",
                patient_phone_number: message?.call?.customerPhoneNumber || null,
              },
            });

            // Return tool results
            const toolResults = await executeTools(message.toolCallList || [], practice);
            return NextResponse.json({ results: toolResults });

          } else if (message.type === "status-update") {
            // Update call status
            await db.callLog.upsert({
              where: { vapi_call_id: vapiCallId },
              update: {
                call_status: message?.status || "UNKNOWN",
              },
              create: {
                vapi_call_id: vapiCallId,
                practice_id: practice.id,
                call_timestamp_start: message?.call?.startedAt ? new Date(message.call.startedAt) : new Date(),
                call_status: message?.status || "INITIATED",
                patient_phone_number: message?.call?.customerPhoneNumber || null,
              },
            });

          } else if (message.type === "transcript" && message.transcriptType === "final") {
            // Update transcript incrementally
            await db.callLog.upsert({
              where: { vapi_call_id: vapiCallId },
              update: {
                transcript_text: message.transcript,
              },
              create: {
                vapi_call_id: vapiCallId,
                practice_id: practice.id,
                call_timestamp_start: message?.call?.startedAt ? new Date(message.call.startedAt) : new Date(),
                call_status: "IN_PROGRESS",
                transcript_text: message.transcript,
                patient_phone_number: message?.call?.customerPhoneNumber || null,
              },
            });

          } else if (message.type === "end-of-call-report") {
            // Final call update with complete data
            await db.callLog.upsert({
              where: { vapi_call_id: vapiCallId },
              update: {
                call_status: "ENDED",
                call_timestamp_end: message.call?.endedAt ? new Date(message.call.endedAt) : new Date(),
                transcript_text: message.artifact?.transcript || null,
                summary: message.analysis?.summary || null,
                vapi_transcript_url: message.artifact?.recording?.stereoUrl || message.artifact?.recordingUrl || null,
              },
              create: {
                vapi_call_id: vapiCallId,
                practice_id: practice.id,
                call_timestamp_start: message.call?.startedAt ? new Date(message.call.startedAt) : new Date(),
                call_timestamp_end: message.call?.endedAt ? new Date(message.call.endedAt) : new Date(),
                call_status: "ENDED",
                transcript_text: message.artifact?.transcript || null,
                summary: message.analysis?.summary || null,
                vapi_transcript_url: message.artifact?.recording?.stereoUrl || message.artifact?.recordingUrl || null,
                patient_phone_number: message.call?.customerPhoneNumber || null,
              },
            });

            console.log(`Call ${vapiCallId} ended and logged for practice ${practice.id}`);
          }
        } else {
          console.warn(`No practice found for assistant ID: ${vapiAssistantId}`);
        }
      } catch (dbError) {
        console.error("Database error in webhook handler:", dbError);
      }
    }

    return NextResponse.json({ status: "webhook_received", type: message.type });

  } catch (error) {
    console.error("Error processing Vapi webhook:", error);
    return NextResponse.json(
      { error: "Internal server error" },
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