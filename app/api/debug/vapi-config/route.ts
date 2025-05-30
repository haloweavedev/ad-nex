import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import db from "@/lib/prisma";

export async function GET() {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("=== VAPI DEBUG CONFIG CHECK ===");
    console.log("User ID:", userId);

    // Get all practices and their assistant IDs
    const practices = await db.practice.findMany({
      select: {
        id: true,
        name: true,
        clerk_user_id: true,
        vapi_assistant_id: true,
        vapi_voice_id: true,
        created_at: true,
        updated_at: true
      }
    });

    // Get current user's practice
    const userPractice = await db.practice.findUnique({
      where: { clerk_user_id: userId },
      select: {
        id: true,
        name: true,
        vapi_assistant_id: true,
        vapi_voice_id: true,
        vapi_system_prompt_override: true,
        vapi_first_message: true
      }
    });

    // Environment check
    const envConfig = {
      hasVapiApiKey: !!process.env.VAPI_API_KEY,
      hasVapiPublicKey: !!process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY,
      hasWebhookSecret: !!process.env.VAPI_WEBHOOK_SECRET,
      hasAppUrl: !!process.env.NEXT_PUBLIC_APP_URL,
      appUrl: process.env.NEXT_PUBLIC_APP_URL,
      webhookUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/vapi/tool-handler`
    };

    console.log("Environment config:", envConfig);
    console.log("All practices:", practices);
    console.log("Current user practice:", userPractice);

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      environment: envConfig,
      allPractices: practices,
      currentUserPractice: userPractice,
      debug: {
        totalPracticeCount: practices.length,
        practicesWithAssistantId: practices.filter(p => p.vapi_assistant_id).length,
        currentUserHasPractice: !!userPractice,
        currentUserHasAssistantId: !!userPractice?.vapi_assistant_id
      }
    });

  } catch (error) {
    console.error("Debug config check failed:", error);
    return NextResponse.json(
      { 
        error: "Failed to get debug config",
        message: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
} 