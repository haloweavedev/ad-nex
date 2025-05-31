import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const practice = await prisma.practice.findUnique({
      where: { clerk_user_id: userId },
      select: { id: true },
    });

    if (!practice) {
      return NextResponse.json({ error: "Practice not found" }, { status: 404 });
    }

    // Fetch call logs that have booked appointments
    const laineAppointments = await prisma.callLog.findMany({
      where: {
        practice_id: practice.id,
        booked_appointment_nexhealth_id: {
          not: null
        }
      },
      select: {
        id: true,
        vapi_call_id: true,
        call_timestamp_start: true,
        patient_phone_number: true,
        booked_appointment_nexhealth_id: true,
        booked_appointment_patient_id: true,
        booked_appointment_provider_id: true,
        booked_appointment_operatory_id: true,
        booked_appointment_type_id: true,
        booked_appointment_start_time: true,
        booked_appointment_end_time: true,
        booked_appointment_note: true,
        call_status: true,
        detected_intent: true,
      },
      orderBy: {
        booked_appointment_start_time: "desc"
      }
    });

    return NextResponse.json({ appointments: laineAppointments });
  } catch (error) {
    console.error("Error fetching LAINE appointments:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
} 