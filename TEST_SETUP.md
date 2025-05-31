# VAPI + NexHealth API Test Setup

## Overview

This test setup allows you to test the integration between VAPI and NexHealth APIs with extensive logging to see exactly where things succeed or fail.

## What's Included

### 1. Test Page (`/test`)
- Simple UI to start VAPI calls
- Real-time logging of all VAPI events
- Suggested test queries
- Status monitoring

### 2. Test API Endpoint (`/api/test`)
- Dedicated webhook endpoint for testing
- Extensive logging of all requests/responses
- Handles NexHealth API tool calls
- No authentication/database saving (for simplicity)

### 3. Available Tool Functions
- `get_appointment_types` - Lists all appointment types
- `get_providers` - Lists all providers
- `get_appointment_slots` - Gets available slots for a specific date
- `get_operatories` - Lists all operatories/rooms
- `get_locations` - Gets location information

## Configuration Required

### 1. Update Test Configuration
In `app/api/test/route.ts`, update the `TEST_CONFIG` object:

```typescript
const TEST_CONFIG = {
  subdomain: "your-test-subdomain", // Replace with your actual subdomain
  locationId: "your-location-id",   // Replace with your actual location ID
  providerId: "your-provider-id",   // Replace with your actual provider ID
  appointmentTypeId: "your-apt-type-id", // Replace with your actual appointment type ID
  operatoryId: "your-operatory-id"  // Replace with your actual operatory ID
};
```

### 2. Update VAPI Public Key
In `app/test/page.tsx`, replace the VAPI public key:

```typescript
vapiRef.current = new Vapi('your-actual-vapi-public-key');
```

### 3. Environment Variables
Make sure you have:
- `NEXHEALTH_API_KEY` - Your NexHealth API key

## How to Test

### 1. Start the Development Server
```bash
npm run dev
```

### 2. Navigate to Test Page
Open your browser to: `http://localhost:3000/test`

### 3. Start a Test Call
1. Click "Start Test Call"
2. Allow microphone permissions
3. Wait for "Call started successfully" log

### 4. Try Test Queries
Say any of these phrases:
- "What are the appointment types?"
- "Who are the providers?"
- "Show me appointment slots for December 23rd 2025"
- "What operatories are available?"
- "Tell me about the location"

### 5. Monitor Logs
Watch the logs on the page and in your server console to see:
- VAPI events (call start, speech detection, etc.)
- Webhook requests from VAPI
- NexHealth API calls and responses
- Tool execution results

## What to Look For

### Success Indicators
✅ VAPI SDK loads successfully  
✅ Call starts without errors  
✅ Speech is detected  
✅ Tool calls are received  
✅ NexHealth API calls succeed  
✅ Results are returned to VAPI  

### Common Issues
❌ **VAPI SDK fails to load** - Check internet connection  
❌ **Call fails to start** - Check VAPI public key  
❌ **No tool calls received** - Check webhook URL and system prompt  
❌ **NexHealth API errors** - Check API key and test configuration  
❌ **Empty responses** - Check if test data exists in NexHealth  

## Debugging Tips

### Server Logs
Check your terminal/server logs for detailed information:
- All webhook requests are logged with full headers and bodies
- Each NexHealth API call is logged with request/response details
- Tool execution is logged step by step

### Browser Logs
Check the browser console for:
- VAPI SDK loading issues
- Frontend logging from the test page
- Any JavaScript errors

### Test Webhook Health
Visit `http://localhost:3000/api/test` directly to verify the endpoint is working.

## Next Steps After Testing

Once you've verified the basic tool calls work:
1. Add more complex tool functions
2. Implement proper authentication
3. Add database logging
4. Create production assistant configurations
5. Set up proper error handling and fallbacks

## Troubleshooting

### No Audio/Microphone Issues
- Ensure you're using HTTPS in production
- Check browser microphone permissions
- Test with different browsers

### NexHealth API Issues
- Verify your API key is valid
- Check if the test subdomain/location exists
- Ensure you have proper permissions for the endpoints

### VAPI Integration Issues
- Verify the webhook URL is publicly accessible
- Check VAPI dashboard for call logs
- Ensure the assistant configuration is correct 