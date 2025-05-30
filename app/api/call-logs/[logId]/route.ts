import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/prisma";

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

    // Get specific call log
    const callLog = await db.callLog.findFirst({
      where: { 
        id: logId,
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

    return NextResponse.json({ callLog: maskedCallLog });

  } catch (error) {
    console.error("Error fetching call log details:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
} 