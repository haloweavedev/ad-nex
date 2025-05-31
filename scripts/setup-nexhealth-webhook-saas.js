#!/usr/bin/env node

/**
 * SaaS NexHealth Webhook Setup
 * 
 * This script sets up webhook integration for a SaaS platform with multiple practices.
 * It creates ONE webhook endpoint that handles events from ALL practices.
 * 
 * Usage:
 *   node scripts/setup-nexhealth-webhook-saas.js setup    # Initial setup - creates webhook endpoint
 *   node scripts/setup-nexhealth-webhook-saas.js add-practice SUBDOMAIN  # Subscribe new practice
 */

require('dotenv').config();

const NEXHEALTH_API_KEY = process.env.NEXHEALTH_API_KEY;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

const args = process.argv.slice(2);
const command = args[0];
const subdomain = args[1];

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
  console.log('📡 Registering SaaS webhook endpoint...');
  
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

  console.log('✅ SaaS webhook endpoint registered');
  console.log(`   URL: ${webhookUrl}`);
  console.log(`   ID: ${data.data.id}`);
  console.log(`   🔐 SECRET: ${data.data.secret_key}`);
  
  return {
    id: data.data.id,
    secret_key: data.data.secret_key,
  };
}

async function subscribePracticeToEvents(bearerToken, webhookEndpointId, practiceSubdomain) {
  console.log(`📋 Subscribing practice "${practiceSubdomain}" to appointment events...`);
  
  const response = await fetch(
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

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to subscribe practice ${practiceSubdomain}: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const data = await response.json();
  
  if (!data.code) {
    throw new Error(`Event subscription failed for ${practiceSubdomain}: ${data.message || 'Unknown error'}`);
  }

  console.log(`✅ Practice "${practiceSubdomain}" subscribed to appointment_insertion events`);
  return data.data;
}

async function listWebhookEndpoints(bearerToken) {
  console.log('📋 Listing existing webhook endpoints...');
  
  const response = await fetch('https://nexhealth.info/webhook_endpoints', {
    method: 'GET',
    headers: {
      'Accept': 'application/vnd.Nexhealth+json;version=2',
      'Authorization': `Bearer ${bearerToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to list webhooks: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  
  if (!data.code) {
    throw new Error(`Failed to list webhooks: ${data.message || 'Unknown error'}`);
  }

  return data.data || [];
}

async function setupSaaSWebhook() {
  try {
    console.log('🚀 Setting up SaaS NexHealth webhook integration...\n');
    
    const bearerToken = await getBearerToken();
    
    // Check if webhook endpoint already exists
    const existingWebhooks = await listWebhookEndpoints(bearerToken);
    const webhookUrl = `${APP_URL}/api/nexhealth/webhook`;
    const existingWebhook = existingWebhooks.find(wh => wh.target_url === webhookUrl);
    
    let webhook;
    if (existingWebhook) {
      console.log('✅ Webhook endpoint already exists');
      console.log(`   URL: ${existingWebhook.target_url}`);
      console.log(`   ID: ${existingWebhook.id}`);
      console.log(`   🔐 SECRET: ${existingWebhook.secret_key}`);
      webhook = existingWebhook;
    } else {
      webhook = await registerWebhookEndpoint(bearerToken);
    }
    
    console.log('\n🎉 SaaS webhook setup complete!');
    console.log('\n📝 Configuration:');
    console.log(`   NEXHEALTH_WEBHOOK_SECRET="${webhook.secret_key}"`);
    console.log(`   NEXHEALTH_WEBHOOK_ENDPOINT_ID="${webhook.id}"`);
    console.log('\n📋 Next steps:');
    console.log('1. Add the above environment variables to your .env file');
    console.log('2. For each practice, run:');
    console.log('   node scripts/setup-nexhealth-webhook-saas.js add-practice SUBDOMAIN');
    console.log('\nExample:');
    console.log('   node scripts/setup-nexhealth-webhook-saas.js add-practice xyz');
    
  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    process.exit(1);
  }
}

async function addPractice(practiceSubdomain) {
  try {
    console.log(`🏥 Adding practice "${practiceSubdomain}" to webhook events...\n`);
    
    const bearerToken = await getBearerToken();
    
    // Get webhook endpoint ID from environment or list endpoints
    let webhookEndpointId = process.env.NEXHEALTH_WEBHOOK_ENDPOINT_ID;
    
    if (!webhookEndpointId) {
      console.log('🔍 Finding webhook endpoint...');
      const existingWebhooks = await listWebhookEndpoints(bearerToken);
      const webhookUrl = `${APP_URL}/api/nexhealth/webhook`;
      const existingWebhook = existingWebhooks.find(wh => wh.target_url === webhookUrl);
      
      if (!existingWebhook) {
        throw new Error('No webhook endpoint found. Run setup first: node scripts/setup-nexhealth-webhook-saas.js setup');
      }
      
      webhookEndpointId = existingWebhook.id;
      console.log(`✅ Found webhook endpoint: ${webhookEndpointId}`);
    }
    
    await subscribePracticeToEvents(bearerToken, webhookEndpointId, practiceSubdomain);
    
    console.log(`\n🎉 Practice "${practiceSubdomain}" successfully added!`);
    console.log('   Appointment booking events will now be sent to your webhook endpoint.');
    
  } catch (error) {
    console.error(`\n❌ Failed to add practice "${practiceSubdomain}":`, error.message);
    process.exit(1);
  }
}

function showUsage() {
  console.log('📚 SaaS NexHealth Webhook Setup');
  console.log('\nUsage:');
  console.log('  node scripts/setup-nexhealth-webhook-saas.js setup');
  console.log('    ↳ Initial setup - creates the main webhook endpoint');
  console.log('');
  console.log('  node scripts/setup-nexhealth-webhook-saas.js add-practice SUBDOMAIN');
  console.log('    ↳ Subscribe a practice to webhook events');
  console.log('');
  console.log('Examples:');
  console.log('  node scripts/setup-nexhealth-webhook-saas.js setup');
  console.log('  node scripts/setup-nexhealth-webhook-saas.js add-practice xyz');
  console.log('  node scripts/setup-nexhealth-webhook-saas.js add-practice sunnydale-dental');
}

// Main execution
async function main() {
  if (command === 'setup') {
    await setupSaaSWebhook();
  } else if (command === 'add-practice') {
    if (!subdomain) {
      console.error('❌ Subdomain required for add-practice command');
      showUsage();
      process.exit(1);
    }
    await addPractice(subdomain);
  } else {
    showUsage();
    process.exit(1);
  }
}

main(); 