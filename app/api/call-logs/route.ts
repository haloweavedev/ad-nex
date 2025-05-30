import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/prisma";
import { getVapiService, VapiCall } from "@/lib/vapi.client";

interface CallLogWithSource {
  id: string;
  vapi_call_id: string;
  call_timestamp_start: string;
  call_timestamp_end: string | null;
  patient_phone_number: string | null;
  call_status: string | null;
  detected_intent: string | null;
  nexhealth_patient_id: string | null;
  nexhealth_appointment_id: string | null;
  summary: string | null;
  transcript_text?: string | null;
  vapi_transcript_url?: string | null;
  created_at: string;
  source: 'database' | 'vapi' | 'merged';
}

function mapVapiCallToCallLog(vapiCall: VapiCall, _practiceId: string): CallLogWithSource {
  return {
    id: vapiCall.id, // Use Vapi call ID as ID for Vapi-sourced calls
    vapi_call_id: vapiCall.id,
    call_timestamp_start: vapiCall.startedAt,
    call_timestamp_end: vapiCall.endedAt || null,
    patient_phone_number: vapiCall.customer?.number || null,
    call_status: vapiCall.status,
    detected_intent: null, // This would need to be derived from analysis if available
    nexhealth_patient_id: null,
    nexhealth_appointment_id: null,
    summary: vapiCall.analysis?.summary || vapiCall.summary || null,
    transcript_text: vapiCall.artifact?.transcript || vapiCall.transcript || null,
    vapi_transcript_url: vapiCall.artifact?.recordingUrl || vapiCall.recordingUrl || null,
    created_at: vapiCall.startedAt,
    source: 'vapi'
  };
}

async function syncCallLogToDatabase(vapiCall: VapiCall, practiceId: string) {
  try {
    // Try to upsert the call log to our database
    await db.callLog.upsert({
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
        practice_id: practiceId,
        call_timestamp_start: new Date(vapiCall.startedAt),
        call_timestamp_end: vapiCall.endedAt ? new Date(vapiCall.endedAt) : null,
        call_status: vapiCall.status,
        patient_phone_number: vapiCall.customer?.number || null,
        transcript_text: vapiCall.artifact?.transcript || vapiCall.transcript || null,
        summary: vapiCall.analysis?.summary || vapiCall.summary || null,
        vapi_transcript_url: vapiCall.artifact?.recordingUrl || vapiCall.recordingUrl || null,
      },
    });
  } catch (error) {
    console.error(`Failed to sync call ${vapiCall.id} to database:`, error);
  }
}

export async function GET(request: NextRequest) {
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

    if (!practice.vapi_assistant_id) {
      return NextResponse.json({ error: "No Vapi assistant configured for this practice" }, { status: 404 });
    }

    // Get pagination parameters
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const offset = (page - 1) * limit;

    console.log(`Fetching call logs for practice ${practice.id}, assistant ${practice.vapi_assistant_id}`);

    let allCallLogs: CallLogWithSource[] = [];
    let vapiError: string | null = null;

    // First, try to fetch from Vapi API
    try {
      if (process.env.VAPI_API_KEY) {
        console.log("Fetching call logs from Vapi API...");
        const vapiService = getVapiService();
        const vapiCalls = await vapiService.getCallLogsForAssistant(practice.vapi_assistant_id, 100);
        
        console.log(`Retrieved ${vapiCalls.length} calls from Vapi`);

        // Convert Vapi calls to our CallLog format
        const vapiCallLogs = vapiCalls.map(call => mapVapiCallToCallLog(call, practice.id));
        
        // Sync new calls to database in background (don't await to avoid blocking response)
        vapiCalls.forEach(call => {
          syncCallLogToDatabase(call, practice.id).catch(error => {
            console.error(`Background sync failed for call ${call.id}:`, error);
          });
        });

        allCallLogs = vapiCallLogs;
      } else {
        vapiError = "VAPI_API_KEY not configured";
        console.warn("VAPI_API_KEY not configured, falling back to database only");
      }
    } catch (error) {
      vapiError = error instanceof Error ? error.message : "Unknown Vapi API error";
      console.error("Error fetching from Vapi API:", error);
    }

    // If Vapi failed or returned no results, fall back to database
    if (allCallLogs.length === 0) {
      console.log("Fetching call logs from local database...");
      const dbCallLogs = await db.callLog.findMany({
        where: { practice_id: practice.id },
        orderBy: { call_timestamp_start: "desc" },
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
          summary: true,
          transcript_text: true,
          vapi_transcript_url: true,
          created_at: true,
        },
      });

      allCallLogs = dbCallLogs.map(log => ({
        ...log,
        call_timestamp_start: log.call_timestamp_start.toISOString(),
        call_timestamp_end: log.call_timestamp_end?.toISOString() || null,
        created_at: log.created_at.toISOString(),
        source: 'database' as const
      }));

      console.log(`Retrieved ${allCallLogs.length} calls from database`);
    }

    // Sort by timestamp (most recent first)
    allCallLogs.sort((a, b) => new Date(b.call_timestamp_start).getTime() - new Date(a.call_timestamp_start).getTime());

    // Apply pagination
    const totalCount = allCallLogs.length;
    const paginatedLogs = allCallLogs.slice(offset, offset + limit);

    // Mask phone numbers for privacy
    const maskedCallLogs = paginatedLogs.map(log => ({
      ...log,
      patient_phone_number: log.patient_phone_number 
        ? `***-***-${log.patient_phone_number.slice(-4)}` 
        : null,
    }));

    const response = {
      callLogs: maskedCallLogs,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        hasNext: page * limit < totalCount,
        hasPrev: page > 1,
      },
      meta: {
        source: allCallLogs.length > 0 ? allCallLogs[0].source : 'none',
        vapiError: vapiError,
        assistantId: practice.vapi_assistant_id,
        hasVapiKey: !!process.env.VAPI_API_KEY
      }
    };

    console.log(`Returning ${maskedCallLogs.length} call logs (page ${page}/${response.pagination.totalPages})`);
    return NextResponse.json(response);

  } catch (error) {
    console.error("Error fetching call logs:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
} 