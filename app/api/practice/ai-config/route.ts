import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { createOrUpdateVapiAssistant } from "@/lib/vapi.server";

// Helper function to fetch assistant details from Vapi API
async function getVapiAssistantDetails(assistantId: string) {
  const VAPI_API_KEY = process.env.VAPI_API_KEY;
  if (!VAPI_API_KEY) {
    throw new Error("VAPI_API_KEY not configured");
  }

  const response = await fetch(`https://api.vapi.ai/assistant/${assistantId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${VAPI_API_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch assistant: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const action = url.searchParams.get('action');

    const practice = await prisma.practice.findUnique({
      where: { clerk_user_id: userId },
      select: {
        id: true,
        name: true,
        vapi_voice_id: true,
        vapi_system_prompt_override: true,
        vapi_first_message: true,
        vapi_assistant_id: true,
      },
    });

    // If requesting assistant tools, fetch them from Vapi API
    if (action === 'get-tools' && practice?.vapi_assistant_id) {
      try {
        const assistantDetails = await getVapiAssistantDetails(practice.vapi_assistant_id);
        
        return NextResponse.json({ 
          success: true,
          assistant: {
            id: assistantDetails.id,
            name: assistantDetails.name,
            model: assistantDetails.model,
            tools: assistantDetails.model?.tools || [],
            voice: assistantDetails.voice,
            server: assistantDetails.server
          }
        });
      } catch (error) {
        console.error("Error fetching assistant tools:", error);
        return NextResponse.json({ 
          error: "Failed to fetch assistant tools",
          details: error instanceof Error ? error.message : "Unknown error"
        }, { status: 500 });
      }
    }

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

    let updatedPractice = practice;

    // Create or update Vapi assistant
    try {
      console.log("Attempting to create/update Vapi assistant for practice:", practice.id);
      const assistantId = await createOrUpdateVapiAssistant(practice);
      
      if (assistantId && assistantId !== practice.vapi_assistant_id) {
        // Update the practice with the new assistant ID
        updatedPractice = await prisma.practice.update({
          where: { id: practice.id },
          data: { vapi_assistant_id: assistantId },
        });
        console.log("Practice updated with new assistant ID:", assistantId);
      }
    } catch (vapiError) {
      console.error("Error creating/updating Vapi assistant:", vapiError);
      // Continue with the response even if Vapi assistant creation fails
      // The user will get their settings saved, but assistant won't be updated
    }

    return NextResponse.json({ 
      success: true, 
      practice: {
        id: updatedPractice.id,
        name: updatedPractice.name,
        vapi_voice_id: updatedPractice.vapi_voice_id,
        vapi_system_prompt_override: updatedPractice.vapi_system_prompt_override,
        vapi_first_message: updatedPractice.vapi_first_message,
        vapi_assistant_id: updatedPractice.vapi_assistant_id,
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