import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { assistantId, callId, messageType } = body;

    if (!assistantId || !callId) {
      return NextResponse.json({ 
        error: "Missing required fields: assistantId and callId are required" 
      }, { status: 400 });
    }

    // Create a test webhook payload based on message type
    const testPayload = createTestPayload(messageType || 'end-of-call-report', assistantId, callId);
    
    // Sign the payload
    const WEBHOOK_SECRET = process.env.VAPI_WEBHOOK_SECRET || "laine-webhook-secret-change-me";
    const rawBody = JSON.stringify(testPayload);
    const signature = crypto
      .createHmac("sha256", WEBHOOK_SECRET)
      .update(rawBody)
      .digest("hex");
    
    const expectedSignature = `sha256=${signature}`;

    console.log("=== SENDING TEST WEBHOOK ===");
    console.log("Assistant ID:", assistantId);
    console.log("Call ID:", callId);
    console.log("Message Type:", messageType);
    console.log("Payload:", JSON.stringify(testPayload, null, 2));
    console.log("Signature:", expectedSignature);

    // Send the test webhook to our own endpoint
    const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/vapi/tool-handler`;
    
    console.log("Sending to:", webhookUrl);
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Vapi-Signature': expectedSignature,
        'User-Agent': 'Vapi-Webhook-Test/1.0'
      },
      body: rawBody
    });

    const responseText = await response.text();
    
    console.log("Webhook response status:", response.status);
    console.log("Webhook response body:", responseText);

    return NextResponse.json({
      success: true,
      testPayload,
      webhookUrl,
      signature: expectedSignature,
      response: {
        status: response.status,
        body: responseText
      }
    });

  } catch (error) {
    console.error("Test webhook failed:", error);
    return NextResponse.json(
      { 
        error: "Failed to send test webhook",
        message: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}

function createTestPayload(messageType: string, assistantId: string, callId: string) {
  const baseCall = {
    id: callId,
    assistantId: assistantId,
    startedAt: new Date(Date.now() - 120000).toISOString(), // 2 minutes ago
    endedAt: new Date().toISOString(),
    customerPhoneNumber: "+1234567890"
  };

  const baseMessage = {
    type: messageType,
    call: baseCall,
    assistant: {
      id: assistantId,
      name: "LAINE Test Assistant"
    }
  };

  switch (messageType) {
    case 'end-of-call-report':
      return {
        message: {
          ...baseMessage,
          artifact: {
            transcript: "Hello, this is a test call transcript. The patient called to schedule an appointment.",
            recording: {
              stereoUrl: "https://example.com/recording.mp3"
            }
          },
          analysis: {
            summary: "Patient called to schedule an appointment. Test call completed successfully."
          }
        }
      };
    
    case 'status-update':
      return {
        message: {
          ...baseMessage,
          status: "ENDED"
        }
      };
    
    case 'tool-calls':
      return {
        message: {
          ...baseMessage,
          toolCallList: [
            {
              id: "test-tool-call-1",
              function: {
                name: "identify_patient",
                arguments: JSON.stringify({
                  patientName: "John Doe",
                  phoneNumber: "+1234567890"
                })
              }
            }
          ]
        }
      };
    
    default:
      return {
        message: baseMessage
      };
  }
} 