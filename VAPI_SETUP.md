# LAINE MVP - Vapi Integration Setup Guide

## Overview

The LAINE MVP now includes **real Vapi SDK integration** for creating and managing AI voice assistants. The mock assistant creation has been replaced with actual API calls to Vapi.

## Required Environment Variables

Add these to your `.env.local` file:

```bash
# Vapi Integration (Required for real assistant creation)
VAPI_API_KEY="your-vapi-server-api-key"
NEXT_PUBLIC_VAPI_PUBLIC_KEY="your-vapi-public-key" 
VAPI_WEBHOOK_SECRET="your-secure-webhook-secret"

# Application URL (Required for webhook endpoints)
NEXT_PUBLIC_APP_URL="https://your-domain.com"

# Database and Auth (Already configured)
DATABASE_URL="your-supabase-database-url"
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="your-clerk-key"
CLERK_SECRET_KEY="your-clerk-secret"
```

## Getting Your Vapi Keys

1. **Sign up at [Vapi.ai](https://dashboard.vapi.ai)**
2. **Get your API Keys:**
   - `VAPI_API_KEY`: Server-side API key from your Vapi dashboard
   - `NEXT_PUBLIC_VAPI_PUBLIC_KEY`: Public key for client-side calls
3. **Set webhook secret:** Generate a secure random string for `VAPI_WEBHOOK_SECRET`

## How It Works

### Assistant Creation Flow
1. User configures AI settings in `/admin/ai-config`
2. `createOrUpdateVapiAssistant()` is called with practice data
3. Function personalizes system prompt with practice details
4. Real Vapi API call creates/updates assistant with:
   - Personalized prompts
   - 5 dental practice tools (identify_patient, check_availability, etc.)
   - Webhook URL pointing to your LAINE backend
   - Voice and messaging preferences

### Test Call Integration
- `TestCallButton` component uses Vapi Web SDK
- Requires `NEXT_PUBLIC_VAPI_PUBLIC_KEY` for browser calls
- Real-time transcript and call status tracking
- Tests the actual configured assistant

### Webhook Security
- All incoming webhooks verify signature using `VAPI_WEBHOOK_SECRET`
- Call logs are automatically created/updated in database
- Tool calls are processed and logged

## Fallback Behavior

If Vapi SDK is not available or API calls fail:
- Function falls back to mock assistant creation for development
- Logs clearly indicate when fallback is used
- UI continues to function normally

## Testing Your Setup

1. **Configure practice and AI settings** in the admin dashboard
2. **Check logs** for "Vapi assistant created successfully" messages
3. **Verify in Vapi dashboard** that assistants appear with correct configuration
4. **Use Test Call button** to make a live call to your assistant
5. **Check call logs** to see real call data being captured

## Troubleshooting

### Common Issues:
- **"VAPI_API_KEY not found"**: Ensure environment variable is set
- **"Vapi SDK not available"**: Check if `@vapi-ai/server-sdk` is installed
- **Webhook signature errors**: Verify `VAPI_WEBHOOK_SECRET` matches Vapi config
- **Test calls fail**: Check `NEXT_PUBLIC_VAPI_PUBLIC_KEY` is valid

### Debug Logs:
The system provides detailed logging:
```
"Attempting to create/update Vapi assistant for practice: [id]"
"Assistant configuration prepared: [details]"
"Vapi assistant created successfully: [assistant-id]"
```

## Assistant Configuration Details

Each assistant is configured with:
- **Personalized name**: "LAINE - [Practice Name]"
- **System prompt**: Customized with practice details
- **Voice**: Selected by practice (Jennifer, Will, Chris, etc.)
- **Tools**: 5 dental-specific functions
- **Webhook**: Secure endpoint for tool calls and logging
- **Recording**: Enabled with transcript capture
- **Metadata**: Practice ID for association

The assistant appears in your Vapi dashboard and is immediately available for calls. 