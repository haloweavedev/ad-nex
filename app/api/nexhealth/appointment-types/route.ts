import { auth } from "@clerk/nextjs/server";
import { NextResponse, NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { getAppointmentTypes, createNexHealthAppointmentType } from "@/lib/nexhealth.server";

export async function GET() {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const practice = await prisma.practice.findUnique({
      where: { clerk_user_id: userId },
      select: {
        nexhealth_subdomain: true,
        nexhealth_location_id: true,
      },
    });

    if (!practice || !practice.nexhealth_subdomain || !practice.nexhealth_location_id) {
      return NextResponse.json(
        { error: "Practice NexHealth configuration is incomplete. Please set subdomain and location ID first." },
        { status: 400 }
      );
    }

    const appointmentTypes = await getAppointmentTypes(
      practice.nexhealth_subdomain,
      practice.nexhealth_location_id
    );

    // Convert IDs to strings for consistency
    const normalizedAppointmentTypes = appointmentTypes.map((type: any) => ({
      ...type,
      id: type.id.toString()
    }));

    return NextResponse.json({ appointmentTypes: normalizedAppointmentTypes });
  } catch (error) {
    console.error("Error fetching appointment types:", error);
    return NextResponse.json(
      { error: "Failed to fetch appointment types from NexHealth" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const practice = await prisma.practice.findUnique({
      where: { clerk_user_id: userId },
      select: { nexhealth_subdomain: true, nexhealth_location_id: true },
    });

    if (!practice?.nexhealth_subdomain || !practice?.nexhealth_location_id) {
      return NextResponse.json({ error: "Practice NexHealth config incomplete." }, { status: 400 });
    }

    const body = await request.json();
    const { name, minutes, bookable_online, emr_appt_descriptor_ids } = body;

    if (!name || !minutes) {
      return NextResponse.json({ error: "Name and minutes are required." }, { status: 400 });
    }

    const newApptTypeDetails = {
      name,
      minutes,
      bookable_online: bookable_online !== undefined ? bookable_online : true,
      parent_type: "Location" as const, // Assuming location-scoped by default for LAINE-created types
      parent_id: practice.nexhealth_location_id,
      emr_appt_descriptor_ids,
    };

    const result = await createNexHealthAppointmentType(
      practice.nexhealth_subdomain,
      practice.nexhealth_location_id, // Used for parent_id if location-scoped
      newApptTypeDetails
    );
    
    // The nexHealthRequest already wraps data in a { code, data, ... } structure.
    // If createNexHealthAppointmentType returns the raw `data` part:
    return NextResponse.json({ code: true, data: result });

  } catch (error) {
    console.error("Error creating NexHealth appointment type via API route:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to create appointment type";
    // Check if the error message from nexHealthRequest is already JSON
    try {
        const parsedError = JSON.parse(errorMessage.substring(errorMessage.indexOf('{')));
        return NextResponse.json({ code: false, error: parsedError.error || [errorMessage] }, { status: 500 });
    } catch {
        return NextResponse.json({ code: false, error: [errorMessage] }, { status: 500 });
    }
  }
} 