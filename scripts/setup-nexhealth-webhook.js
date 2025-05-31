#!/usr/bin/env node

/**
 * Setup NexHealth Webhook
 * 
 * This script registers a webhook endpoint with NexHealth and subscribes to appointment events.
 * It will output the webhook secret that you need to add to your .env file.
 * 
 * Usage: node scripts/setup-nexhealth-webhook.js
 */

require('dotenv').config();

const NEXHEALTH_API_KEY = process.env.NEXHEALTH_API_KEY;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const SUBDOMAIN = 'xyz'; // Replace with your practice subdomain

if (!NEXHEALTH_API_KEY) {
  console.error('❌ NEXHEALTH_API_KEY not found in environment variables');
  process.exit(1);
}

async function getBearerToken() {
  console.log('🔑 Getting NexHealth bearer token...');
  
  const response = await fetch('https://nexhealth.info/authenticates', {
    method: 'POST',
    headers: {
      'Accept': 'application/vnd.Nexhealth+json;version=2',
      'Authorization': NEXHEALTH_API_KEY,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to authenticate: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  
  if (!data.code) {
    throw new Error(`Authentication failed: ${data.description || 'Unknown error'}`);
  }

  console.log('✅ Bearer token obtained');
  return data.data.token;
}

async function registerWebhookEndpoint(bearerToken) {
  console.log('📡 Registering webhook endpoint...');
  
  const webhookUrl = `${APP_URL}/api/nexhealth/webhook`;
  
  const response = await fetch('https://nexhealth.info/webhook_endpoints', {
    method: 'POST',
    headers: {
      'Accept': 'application/vnd.Nexhealth+json;version=2',
      'Authorization': `Bearer ${bearerToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      target_url: webhookUrl,
      active: true,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to register webhook: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const data = await response.json();
  
  if (!data.code) {
    throw new Error(`Webhook registration failed: ${data.message || 'Unknown error'}`);
  }

  console.log('✅ Webhook endpoint registered');
  console.log(`   URL: ${webhookUrl}`);
  console.log(`   ID: ${data.data.id}`);
  console.log(`   🔐 SECRET: ${data.data.secret_key}`);
  
  return {
    id: data.data.id,
    secret_key: data.data.secret_key,
  };
}

async function subscribeToEvents(bearerToken, webhookEndpointId) {
  console.log('📋 Subscribing to appointment events...');
  
  const response = await fetch(
    `https://nexhealth.info/webhook_endpoints/${webhookEndpointId}/webhook_subscriptions?subdomain=${SUBDOMAIN}`,
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

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to subscribe to events: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const data = await response.json();
  
  if (!data.code) {
    throw new Error(`Event subscription failed: ${data.message || 'Unknown error'}`);
  }

  console.log('✅ Subscribed to appointment_insertion events');
  return data.data;
}

async function main() {
  try {
    console.log('🚀 Setting up NexHealth webhook integration...\n');
    
    // Step 1: Get bearer token
    const bearerToken = await getBearerToken();
    
    // Step 2: Register webhook endpoint
    const webhook = await registerWebhookEndpoint(bearerToken);
    
    // Step 3: Subscribe to events
    await subscribeToEvents(bearerToken, webhook.id);
    
    console.log('\n🎉 Setup complete!');
    console.log('\n📝 Next steps:');
    console.log(`1. Add this to your .env file:`);
    console.log(`   NEXHEALTH_WEBHOOK_SECRET="${webhook.secret_key}"`);
    console.log('\n2. Restart your application');
    console.log('\n3. Test a booking to verify webhook delivery');
    
  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    process.exit(1);
  }
}

// Run the setup
main(); 