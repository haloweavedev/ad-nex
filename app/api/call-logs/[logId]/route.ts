import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/prisma";
import { getVapiService } from "@/lib/vapi.client";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ logId: string }> }
) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get practice for authenticated user
    const practice = await db.practice.findUnique({
      where: { clerk_user_id: userId },
    });

    if (!practice) {
      return NextResponse.json({ error: "Practice not found" }, { status: 404 });
    }

    // Await the params
    const { logId } = await params;

    console.log(`Fetching call log details for: ${logId}`);

    // First, try to get from local database
    let callLog = await db.callLog.findFirst({
      where: { 
        OR: [
          { id: logId },
          { vapi_call_id: logId } // Allow lookup by Vapi call ID as well
        ],
        practice_id: practice.id 
      },
      select: {
        id: true,
        vapi_call_id: true,
        call_timestamp_start: true,
        call_timestamp_end: true,
        patient_phone_number: true,
        call_status: true,
        detected_intent: true,
        nexhealth_patient_id: true,
        nexhealth_appointment_id: true,
        transcript_text: true,
        summary: true,
        vapi_transcript_url: true,
        created_at: true,
      },
    });

    // If not found in database, try to fetch from Vapi API
    if (!callLog && practice.vapi_assistant_id && process.env.VAPI_API_KEY) {
      console.log(`Call log ${logId} not found in database, trying Vapi API...`);
      try {
        const vapiService = getVapiService();
        const vapiCall = await vapiService.getCallById(logId);
        
        // Verify this call belongs to the practice's assistant
        if (vapiCall.assistantId === practice.vapi_assistant_id) {
          console.log(`Found call ${logId} in Vapi API, syncing to database...`);
          
          // Sync to database
          const syncedCallLog = await db.callLog.upsert({
            where: { vapi_call_id: vapiCall.id },
            update: {
              call_timestamp_end: vapiCall.endedAt ? new Date(vapiCall.endedAt) : null,
              call_status: vapiCall.status,
              transcript_text: vapiCall.artifact?.transcript || vapiCall.transcript || null,
              summary: vapiCall.analysis?.summary || vapiCall.summary || null,
              vapi_transcript_url: vapiCall.artifact?.recordingUrl || vapiCall.recordingUrl || null,
            },
            create: {
              vapi_call_id: vapiCall.id,
              practice_id: practice.id,
              call_timestamp_start: new Date(vapiCall.startedAt),
              call_timestamp_end: vapiCall.endedAt ? new Date(vapiCall.endedAt) : null,
              call_status: vapiCall.status,
              patient_phone_number: vapiCall.customer?.number || null,
              transcript_text: vapiCall.artifact?.transcript || vapiCall.transcript || null,
              summary: vapiCall.analysis?.summary || vapiCall.summary || null,
              vapi_transcript_url: vapiCall.artifact?.recordingUrl || vapiCall.recordingUrl || null,
            },
            select: {
              id: true,
              vapi_call_id: true,
              call_timestamp_start: true,
              call_timestamp_end: true,
              patient_phone_number: true,
              call_status: true,
              detected_intent: true,
              nexhealth_patient_id: true,
              nexhealth_appointment_id: true,
              transcript_text: true,
              summary: true,
              vapi_transcript_url: true,
              created_at: true,
            },
          });

          callLog = syncedCallLog;
        } else {
          console.log(`Call ${logId} belongs to different assistant (${vapiCall.assistantId}), access denied`);
        }
      } catch (vapiError) {
        console.error(`Failed to fetch call ${logId} from Vapi API:`, vapiError);
      }
    }

    if (!callLog) {
      return NextResponse.json({ error: "Call log not found" }, { status: 404 });
    }

    // Mask phone number for privacy but keep full number in server logs
    const maskedCallLog = {
      ...callLog,
      patient_phone_number: callLog.patient_phone_number 
        ? `***-***-${callLog.patient_phone_number.slice(-4)}` 
        : null,
    };

    console.log(`Returning call log details for: ${callLog.vapi_call_id}`);
    return NextResponse.json({ callLog: maskedCallLog });

  } catch (error) {
    console.error("Error fetching call log details:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
} 