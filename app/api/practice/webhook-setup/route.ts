import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { subscribePracticeToWebhooks } from "@/lib/nexhealth-webhook.server";

/**
 * Manually subscribe a practice to NexHealth webhook events
 * Called via API when needed
 */
export async function POST() {
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
      },
    });

    if (!practice || !practice.nexhealth_subdomain) {
      return NextResponse.json(
        { error: "Practice not found or subdomain not configured" },
        { status: 400 }
      );
    }

    console.log(`Manual webhook subscription for practice: ${practice.name} (${practice.nexhealth_subdomain})`);

    // Update status to show we're attempting
    await prisma.practice.update({
      where: { id: practice.id },
      data: {
        webhook_status: "CONNECTING",
        webhook_last_attempt: new Date(),
      },
    });

    const result = await subscribePracticeToWebhooks(practice.nexhealth_subdomain);

    // Update practice with final result
    await prisma.practice.update({
      where: { id: practice.id },
      data: {
        webhook_status: result.status,
        webhook_last_success: result.success ? new Date() : undefined,
        webhook_error_message: result.success ? null : result.message,
        webhook_subscription_id: result.subscriptionId ? String(result.subscriptionId) : null,
      },
    });

    return NextResponse.json({
      success: result.success,
      message: result.userMessage || result.message,
      status: result.status,
    });

  } catch (error) {
    console.error("Error setting up webhook subscription:", error);
    
    // Update status to error
    const { userId } = await auth();
    if (userId) {
      const practice = await prisma.practice.findUnique({
        where: { clerk_user_id: userId },
        select: { id: true },
      });
      
      if (practice) {
        await prisma.practice.update({
          where: { id: practice.id },
          data: {
            webhook_status: "ERROR",
            webhook_error_message: error instanceof Error ? error.message : "Unknown error",
          },
        });
      }
    }

    return NextResponse.json(
      { 
        success: false,
        message: "❌ Failed to setup webhook subscription. Please try again.",
        status: "ERROR",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
} 