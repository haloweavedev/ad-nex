import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import prisma from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    console.log("=== NEXHEALTH WEBHOOK RECEIVED ===");
    console.log("Timestamp:", new Date().toISOString());
    
    // Get the raw body for signature verification
    const rawBody = await request.text();
    console.log("Raw body length:", rawBody.length);
    
    const nexHealthSignature = request.headers.get("X-Nexhealth-Signature");
    console.log("NexHealth signature header:", nexHealthSignature);
    
    // Get webhook secret from environment
    const WEBHOOK_SECRET = process.env.NEXHEALTH_WEBHOOK_SECRET;
    console.log("Webhook secret present:", !!WEBHOOK_SECRET);
    
    if (!nexHealthSignature || !WEBHOOK_SECRET) {
      console.warn("NexHealth webhook signature or secret missing.");
      return new Response("Unauthorized: Signature or secret missing", { status: 401 });
    }

    // Verify signature
    const generatedSignature = crypto
      .createHmac("sha256", WEBHOOK_SECRET)
      .update(rawBody)
      .digest("hex");

    const expectedSignature = `sha256=${generatedSignature}`;
    console.log("Generated signature:", expectedSignature);
    console.log("Received signature:", nexHealthSignature);

    if (!crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(nexHealthSignature))) {
      console.warn("Invalid NexHealth webhook signature.");
      return new Response("Forbidden: Invalid signature", { status: 403 });
    }
    
    console.log("✅ NexHealth webhook signature verification passed");

    const payload = JSON.parse(rawBody);
    console.log("Webhook payload:", JSON.stringify(payload, null, 2));

    // Handle appointment insertion events
    if (payload.resource_type === "Appointment" && payload.event === "appointment_insertion") {
      console.log("=== HANDLING APPOINTMENT INSERTION WEBHOOK ===");
      
      const appointmentData = payload.data;
      const status = payload.status; // "success" or "failure"
      const appointmentId = appointmentData?.id;
      const subdomain = payload.subdomain; // This identifies which practice
      
      console.log("Appointment ID:", appointmentId);
      console.log("Status:", status);
      console.log("Practice Subdomain:", subdomain);
      
      if (appointmentId && subdomain) {
        try {
          // Find the practice by subdomain
          const practice = await prisma.practice.findFirst({
            where: {
              nexhealth_subdomain: subdomain
            }
          });

          if (!practice) {
            console.log(`❌ No practice found for subdomain: ${subdomain}`);
            return NextResponse.json({ 
              status: "error", 
              message: `Practice not found for subdomain: ${subdomain}` 
            });
          }

          console.log(`✅ Found practice: ${practice.name} (ID: ${practice.id})`);

          // Find the call log entry for this appointment
          const callLog = await prisma.callLog.findFirst({
            where: {
              booked_appointment_nexhealth_id: appointmentId.toString(),
              practice_id: practice.id // Ensure we're updating the right practice's call log
            }
          });

          if (callLog) {
            console.log("Found matching call log:", callLog.id);
            
            // Update call log with EHR sync status
            const updateData: any = {
              call_status: status === "success" ? "COMPLETED_EHR_SYNCED" : "FAILED_EHR_SYNC"
            };

            // If successful, store any additional data from the webhook
            if (status === "success" && appointmentData.foreign_id) {
              updateData.summary = `Appointment successfully synced to EHR with ID: ${appointmentData.foreign_id}`;
            } else if (status === "failure") {
              updateData.summary = `Appointment failed to sync to EHR: ${payload.message || "Unknown error"}`;
            }

            await prisma.callLog.update({
              where: { id: callLog.id },
              data: updateData
            });

            console.log("✅ Call log updated with EHR sync status");
          } else {
            console.log(`❌ No matching call log found for appointment ID: ${appointmentId} in practice: ${practice.name}`);
          }
        } catch (dbError) {
          console.error("❌ Database error processing webhook:", dbError);
        }
      } else {
        console.log("❌ Missing appointment ID or subdomain in webhook payload");
      }
    } else {
      console.log(`ℹ️ Unhandled webhook event: ${payload.resource_type}/${payload.event}`);
    }

    // Respond with success to acknowledge webhook receipt
    return NextResponse.json({ 
      status: "success", 
      message: "Webhook processed successfully",
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("Error processing NexHealth webhook:", error);
    return NextResponse.json(
      { 
        status: "error", 
        message: "Failed to process webhook",
        error: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}

// Health check endpoint
export async function GET() {
  return NextResponse.json({
    status: "healthy",
    message: "NexHealth SaaS webhook endpoint is operational",
    timestamp: new Date().toISOString()
  });
} 