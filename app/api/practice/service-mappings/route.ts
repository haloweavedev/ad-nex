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
      orderBy: { spoken_service_name: 'asc' },
    });

    return NextResponse.json({ serviceMappings });
  } catch (error) {
    console.error("Error fetching service mappings:", error);
    return NextResponse.json(
      { error: "Failed to fetch service mappings" },
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
    
    // Handle bulk creation of common service mappings
    if (body.action === "populate_common_mappings" && body.appointment_type_id) {
      const appointmentTypeId = body.appointment_type_id;
      const serviceType = body.service_type || "cleaning"; // "cleaning", "checkup", "consultation"
      
      let commonMappings: string[] = [];
      
      switch (serviceType) {
        case "cleaning":
          commonMappings = [
            "cleaning",
            "general cleaning", 
            "prophy",
            "prophylaxis",
            "hygiene",
            "dental cleaning"
          ];
          break;
        case "checkup":
          commonMappings = [
            "checkup",
            "check-up",
            "examination",
            "exam",
            "routine checkup",
            "dental exam"
          ];
          break;
        case "consultation":
          commonMappings = [
            "consultation",
            "new patient consultation",
            "new patient",
            "consult",
            "initial consultation"
          ];
          break;
        default:
          return NextResponse.json({ error: "Invalid service_type" }, { status: 400 });
      }

      const createdMappings = [];
      
      for (const spokenName of commonMappings) {
        try {
          // Check if mapping already exists
          const existing = await prisma.serviceMapping.findFirst({
            where: {
              practice_id: practice.id,
              spoken_service_name: {
                equals: spokenName,
                mode: 'insensitive'
              }
            }
          });

          if (!existing) {
            const mapping = await prisma.serviceMapping.create({
              data: {
                practice_id: practice.id,
                spoken_service_name: spokenName,
                nexhealth_appointment_type_id: appointmentTypeId,
                is_active: true,
              },
            });
            createdMappings.push(mapping);
          }
        } catch (mappingError) {
          console.warn(`Failed to create mapping for "${spokenName}":`, mappingError);
          // Continue with other mappings
        }
      }

      return NextResponse.json({ 
        message: `Created ${createdMappings.length} service mappings for ${serviceType}`,
        createdMappings 
      });
    }

    // Handle individual service mapping creation
    const { spoken_service_name, nexhealth_appointment_type_id, default_duration_minutes } = body;

    if (!spoken_service_name || !nexhealth_appointment_type_id) {
      return NextResponse.json(
        { error: "spoken_service_name and nexhealth_appointment_type_id are required" },
        { status: 400 }
      );
    }

    // Check for duplicate
    const existingMapping = await prisma.serviceMapping.findFirst({
      where: {
        practice_id: practice.id,
        spoken_service_name: {
          equals: spoken_service_name,
          mode: 'insensitive'
        }
      }
    });

    if (existingMapping) {
      return NextResponse.json(
        { error: "A service mapping with this name already exists" },
        { status: 409 }
      );
    }

    const serviceMapping = await prisma.serviceMapping.create({
      data: {
        practice_id: practice.id,
        spoken_service_name,
        nexhealth_appointment_type_id,
        default_duration_minutes,
        is_active: true,
      },
    });

    return NextResponse.json({ serviceMapping });
  } catch (error) {
    console.error("Error creating service mapping:", error);
    return NextResponse.json(
      { error: "Failed to create service mapping" },
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

    const url = new URL(request.url);
    const mappingId = url.searchParams.get("id");

    if (!mappingId) {
      return NextResponse.json({ error: "Mapping ID is required" }, { status: 400 });
    }

    await prisma.serviceMapping.deleteMany({
      where: {
        id: mappingId,
        practice_id: practice.id, // Ensure user can only delete their own mappings
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting service mapping:", error);
    return NextResponse.json(
      { error: "Failed to delete service mapping" },
      { status: 500 }
    );
  }
} 