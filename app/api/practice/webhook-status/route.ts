import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

/**
 * Get webhook status for the current practice
 */
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
        webhook_status: true,
        webhook_last_attempt: true,
        webhook_last_success: true,
        webhook_error_message: true,
      },
    });

    if (!practice) {
      return NextResponse.json(
        { error: "Practice not found" },
        { status: 404 }
      );
    }

    // Determine user-friendly status display
    const statusDisplay = {
      status: practice.webhook_status || "UNKNOWN",
      message: "",
      canRetry: true,
      lastAttempt: practice.webhook_last_attempt,
      lastSuccess: practice.webhook_last_success,
    };

    switch (practice.webhook_status) {
      case "CONNECTED":
        statusDisplay.message = "✅ Webhook connected - appointment sync active";
        statusDisplay.canRetry = false;
        break;
      case "CONNECTING":
        statusDisplay.message = "⏳ Connecting to webhook...";
        statusDisplay.canRetry = false;
        break;
      case "DISCONNECTED":
        statusDisplay.message = "❌ Webhook disconnected - appointments won't sync to EHR";
        break;
      case "ERROR":
        statusDisplay.message = `❌ Connection failed: ${practice.webhook_error_message || "Unknown error"}`;
        break;
      case "UNKNOWN":
      default:
        if (!practice.nexhealth_subdomain) {
          statusDisplay.message = "⚠️ Please configure your practice subdomain first";
          statusDisplay.canRetry = false;
        } else {
          statusDisplay.message = "❓ Webhook status unknown - click to connect";
        }
        break;
    }

    return NextResponse.json({
      success: true,
      practice: {
        id: practice.id,
        name: practice.name,
        nexhealth_subdomain: practice.nexhealth_subdomain,
      },
      webhook: statusDisplay,
    });

  } catch (error) {
    console.error("Error fetching webhook status:", error);
    return NextResponse.json(
      { 
        error: "Failed to fetch webhook status",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
} 