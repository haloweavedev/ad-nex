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
        vapi_voice_id: true,
        vapi_system_prompt_override: true,
        vapi_first_message: true,
        vapi_assistant_id: true,
      },
    });

    return NextResponse.json({ practice });
  } catch (error) {
    console.error("Error fetching AI config:", error);
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
      vapi_voice_id,
      vapi_system_prompt_override,
      vapi_first_message,
    } = body;

    // Update AI configuration in the practice record
    const practice = await prisma.practice.upsert({
      where: { clerk_user_id: userId },
      create: {
        clerk_user_id: userId,
        vapi_voice_id,
        vapi_system_prompt_override,
        vapi_first_message,
      },
      update: {
        vapi_voice_id,
        vapi_system_prompt_override,
        vapi_first_message,
      },
    });

    // Create or update Vapi assistant
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
      // The user will get their settings saved, but assistant won't be updated
    }

    return NextResponse.json({ 
      success: true, 
      practice: {
        id: practice.id,
        vapi_voice_id: practice.vapi_voice_id,
        vapi_system_prompt_override: practice.vapi_system_prompt_override,
        vapi_first_message: practice.vapi_first_message,
        vapi_assistant_id: practice.vapi_assistant_id,
      }
    });
  } catch (error) {
    console.error("Error saving AI config:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
} 