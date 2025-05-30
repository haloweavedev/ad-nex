import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/prisma";

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

    // Get pagination parameters
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const offset = (page - 1) * limit;

    // Get call logs for this practice
    const [callLogs, totalCount] = await Promise.all([
      db.callLog.findMany({
        where: { practice_id: practice.id },
        orderBy: { call_timestamp_start: "desc" },
        skip: offset,
        take: limit,
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
          created_at: true,
        },
      }),
      db.callLog.count({
        where: { practice_id: practice.id },
      }),
    ]);

    // Mask phone numbers for privacy
    const maskedCallLogs = callLogs.map((log: {
      id: string;
      vapi_call_id: string;
      call_timestamp_start: Date;
      call_timestamp_end: Date | null;
      patient_phone_number: string | null;
      call_status: string | null;
      detected_intent: string | null;
      nexhealth_patient_id: string | null;
      nexhealth_appointment_id: string | null;
      summary: string | null;
      created_at: Date;
    }) => ({
      ...log,
      patient_phone_number: log.patient_phone_number 
        ? `***-***-${log.patient_phone_number.slice(-4)}` 
        : null,
    }));

    return NextResponse.json({
      callLogs: maskedCallLogs,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        hasNext: page * limit < totalCount,
        hasPrev: page > 1,
      },
    });

  } catch (error) {
    console.error("Error fetching call logs:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
} 