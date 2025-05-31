/**
 * Shared NexHealth webhook subscription utilities for SaaS
 */

/**
 * Subscribe a practice to NexHealth webhook events
 */
export async function subscribePracticeToWebhooks(practiceSubdomain: string) {
  try {
    // Get NexHealth bearer token
    const NEXHEALTH_API_KEY = process.env.NEXHEALTH_API_KEY;
    if (!NEXHEALTH_API_KEY) {
      throw new Error("NexHealth API key not configured");
    }

    console.log(`Setting up webhook subscription for practice subdomain: ${practiceSubdomain}`);

    // Get bearer token
    const authResponse = await fetch('https://nexhealth.info/authenticates', {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.Nexhealth+json;version=2',
        'Authorization': NEXHEALTH_API_KEY,
      },
    });

    if (!authResponse.ok) {
      throw new Error(`Failed to authenticate with NexHealth: ${authResponse.status}`);
    }

    const authData = await authResponse.json();
    if (!authData.code) {
      throw new Error(`NexHealth authentication failed: ${authData.description}`);
    }

    const bearerToken = authData.data.token;

    // Get webhook endpoint ID
    let webhookEndpointId = process.env.NEXHEALTH_WEBHOOK_ENDPOINT_ID;

    if (!webhookEndpointId) {
      // Find existing webhook endpoint
      const webhooksResponse = await fetch('https://nexhealth.info/webhook_endpoints', {
        method: 'GET',
        headers: {
          'Accept': 'application/vnd.Nexhealth+json;version=2',
          'Authorization': `Bearer ${bearerToken}`,
        },
      });

      if (!webhooksResponse.ok) {
        throw new Error(`Failed to list webhooks: ${webhooksResponse.status}`);
      }

      const webhooksData = await webhooksResponse.json();
      if (!webhooksData.code) {
        throw new Error(`Failed to list webhooks: ${webhooksData.message}`);
      }

      const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const webhookUrl = `${APP_URL}/api/nexhealth/webhook`;
      const existingWebhook = webhooksData.data?.find((wh: any) => wh.target_url === webhookUrl);

      if (!existingWebhook) {
        throw new Error("Webhook endpoint not found. Please run initial setup first.");
      }

      webhookEndpointId = existingWebhook.id;
    }

    // Subscribe practice to webhook events
    const subscriptionResponse = await fetch(
      `https://nexhealth.info/webhook_endpoints/${webhookEndpointId}/webhook_subscriptions?subdomain=${practiceSubdomain}`,
      {
        method: 'POST',
        headers: {
          'Accept': 'application/vnd.Nexhealth+json;version=2',
          'Authorization': `Bearer ${bearerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          resource_type: 'Appointment',
          event: 'appointment_insertion',
          active: true,
        }),
      }
    );

    if (!subscriptionResponse.ok) {
      const errorText = await subscriptionResponse.text();
      console.error(`Failed to subscribe practice ${practiceSubdomain}:`, errorText);
      
      // Check if already subscribed (this might be expected)
      if (subscriptionResponse.status === 409 || errorText.includes('already exists')) {
        console.log(`Practice ${practiceSubdomain} already subscribed to webhook events`);
        return { 
          success: true, 
          status: "CONNECTED",
          message: "Practice already subscribed to webhook events",
          alreadySubscribed: true,
          userMessage: "✅ Webhook already connected"
        };
      }
      
      // Handle specific error cases for better UX
      if (subscriptionResponse.status === 404) {
        return {
          success: false,
          status: "ERROR",
          message: `Subdomain '${practiceSubdomain}' not found in NexHealth`,
          userMessage: "❌ Practice subdomain not found in NexHealth. Please check your configuration.",
          error: "SUBDOMAIN_NOT_FOUND"
        };
      }

      if (subscriptionResponse.status === 429) {
        return {
          success: false,
          status: "ERROR", 
          message: "Rate limit exceeded",
          userMessage: "⏳ Too many requests. Please try again in a few minutes.",
          error: "RATE_LIMITED"
        };
      }
      
      throw new Error(`Failed to subscribe to webhook events: ${subscriptionResponse.status} - ${errorText}`);
    }

    const subscriptionData = await subscriptionResponse.json();
    if (!subscriptionData.code) {
      throw new Error(`Webhook subscription failed: ${subscriptionData.message}`);
    }

    console.log(`✅ Practice ${practiceSubdomain} subscribed to webhook events`);

    return { 
      success: true, 
      status: "CONNECTED",
      message: "Practice successfully subscribed to webhook events",
      subscriptionId: subscriptionData.data?.id,
      userMessage: "✅ Webhook connected successfully"
    };

  } catch (error) {
    console.error("Error setting up webhook subscription:", error);
    
    // Return user-friendly error response
    return {
      success: false,
      status: "ERROR",
      message: error instanceof Error ? error.message : "Unknown error",
      userMessage: "❌ Failed to connect webhook. Please try again or contact support.",
      error: "SUBSCRIPTION_FAILED"
    };
  }
} 