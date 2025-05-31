import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
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

    const serviceMappings = await prisma.serviceMapping.findMany({
      where: { practice_id: practice.id },
      orderBy: { created_at: "asc" },
    });

    return NextResponse.json({ serviceMappings });
  } catch (error) {
    console.error("Error fetching service mappings:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const {
      spoken_service_name,
      nexhealth_appointment_type_id,
      default_duration_minutes,
    } = body;

    if (!spoken_service_name || !nexhealth_appointment_type_id) {
      return NextResponse.json(
        { error: "spoken_service_name and nexhealth_appointment_type_id are required" },
        { status: 400 }
      );
    }

    const serviceMapping = await prisma.serviceMapping.create({
      data: {
        practice_id: practice.id,
        spoken_service_name,
        nexhealth_appointment_type_id: nexhealth_appointment_type_id.toString(),
        default_duration_minutes,
      },
    });

    return NextResponse.json({ serviceMapping });
  } catch (error: any) {
    console.error("Error creating service mapping:", error);
    
    // Handle unique constraint violation
    if (error?.code === "P2002") {
      return NextResponse.json(
        { error: "A mapping for this service name already exists" },
        { status: 409 }
      );
    }
    
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const mappingId = searchParams.get("id");

    if (!mappingId) {
      return NextResponse.json(
        { error: "Service mapping ID is required" },
        { status: 400 }
      );
    }

    await prisma.serviceMapping.delete({
      where: {
        id: mappingId,
        practice_id: practice.id, // Ensure user can only delete their own mappings
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting service mapping:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
} 