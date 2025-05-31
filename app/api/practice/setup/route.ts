import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createOrUpdateVapiAssistant } from "@/lib/vapi.server";

export async function GET() {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const practice = await prisma.practice.findUnique({
      where: { clerk_user_id: userId },
      select: {
        id: true,
        name: true,
        nexhealth_subdomain: true,
        nexhealth_location_id: true,
        nexhealth_selected_provider_ids: true,
        nexhealth_default_operatory_ids: true,
        timezone: true,
      },
    });

    return NextResponse.json({ practice });
  } catch (error) {
    console.error("Error fetching practice:", error);
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

    const body = await request.json();
    const {
      name,
      nexhealth_subdomain,
      nexhealth_location_id,
      nexhealth_selected_provider_ids,
      nexhealth_default_operatory_ids,
      timezone,
    } = body;

    // Upsert practice record
    const practice = await prisma.practice.upsert({
      where: { clerk_user_id: userId },
      create: {
        clerk_user_id: userId,
        name,
        nexhealth_subdomain,
        nexhealth_location_id,
        nexhealth_selected_provider_ids: nexhealth_selected_provider_ids || [],
        nexhealth_default_operatory_ids: nexhealth_default_operatory_ids || [],
        timezone,
      },
      update: {
        name,
        nexhealth_subdomain,
        nexhealth_location_id,
        nexhealth_selected_provider_ids: nexhealth_selected_provider_ids || [],
        nexhealth_default_operatory_ids: nexhealth_default_operatory_ids || [],
        timezone,
      },
    });

    // Create or update Vapi assistant if practice has AI config
    try {
      const assistantId = await createOrUpdateVapiAssistant(practice);
      
      if (assistantId && assistantId !== practice.vapi_assistant_id) {
        // Update the practice with the new assistant ID
        await prisma.practice.update({
          where: { id: practice.id },
          data: { vapi_assistant_id: assistantId },
        });
      }
    } catch (vapiError) {
      console.error("Error creating/updating Vapi assistant:", vapiError);
      // Continue with the response even if Vapi assistant creation fails
    }

    return NextResponse.json({ 
      success: true, 
      practice: {
        id: practice.id,
        name: practice.name,
        nexhealth_subdomain: practice.nexhealth_subdomain,
        nexhealth_location_id: practice.nexhealth_location_id,
        nexhealth_selected_provider_ids: practice.nexhealth_selected_provider_ids,
        nexhealth_default_operatory_ids: practice.nexhealth_default_operatory_ids,
        timezone: practice.timezone,
      }
    });
  } catch (error) {
    console.error("Error saving practice:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
} 