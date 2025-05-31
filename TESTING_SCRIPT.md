# VAPI Assistant Testing Script

## 🎯 **Testing Flow After Assistant Registration**

Use this script to systematically test your VAPI + NexHealth integration. Say these phrases in order to verify each tool function works correctly.

---

## **📞 Phase 1: Basic Connection Test**

### 1. **Initial Greeting**
**Say:** *"Hello, can you hear me?"*
- **Expected:** Assistant responds and confirms it can hear you
- **Verify:** Speech detection is working

### 2. **System Check**
**Say:** *"What can you help me with today?"*
- **Expected:** Assistant explains its NexHealth testing capabilities
- **Verify:** System prompt is working correctly

---

## **🏥 Phase 2: Basic Data Retrieval**

### 3. **Test Appointment Types**
**Say:** *"What are the appointment types?"*
- **Expected:** List of appointment types with durations and IDs
- **Watch logs for:** 
  - Tool call received: `get_appointment_types`
  - NexHealth API call to `/appointment_types`
  - Successful response with data

### 4. **Test Providers**
**Say:** *"Who are the providers?"*
- **Expected:** List of doctors/providers with names and IDs
- **Watch logs for:**
  - Tool call received: `get_providers`
  - NexHealth API call to `/providers`
  - Provider names and IDs returned

### 5. **Test Operatories**
**Say:** *"What operatories are available?"*
- **Expected:** List of rooms/operatories with names and IDs
- **Watch logs for:**
  - Tool call received: `get_operatories`
  - NexHealth API call to `/operatories`
  - Room/operatory information

### 6. **Test Location Info**
**Say:** *"Tell me about the location"*
- **Expected:** Location name, address, and contact info
- **Watch logs for:**
  - Tool call received: `get_locations`
  - NexHealth API call for location details
  - Address and contact information

---

## **📅 Phase 3: Appointment Slots Testing**

### 7. **Test Today's Slots**
**Say:** *"Show me appointment slots for today"*
- **Expected:** Available time slots or "no slots available"
- **Watch logs for:**
  - Tool call received: `get_appointment_slots`
  - Date parameter passed correctly
  - NexHealth API call to `/appointment_slots`

### 8. **Test Specific Date**
**Say:** *"Show me appointment slots for December 23rd 2025"*
- **Expected:** Available slots for that specific date
- **Watch logs for:**
  - Date conversion to YYYY-MM-DD format (2025-12-23)
  - Correct date parameter in API call
  - Slot times returned (or no availability message)

### 9. **Test Different Date Format**
**Say:** *"What about slots for January 15th?"*
- **Expected:** Assistant asks for year or assumes current/next year
- **Watch logs for:**
  - How assistant handles incomplete date

---

## **🔧 Phase 4: Error Handling Tests**

### 10. **Test Invalid Request**
**Say:** *"Book me an appointment right now"*
- **Expected:** Assistant explains it can only show information, not book
- **Watch logs for:**
  - No tool calls triggered (since no booking function exists)
  - Appropriate response from system prompt

### 11. **Test Unclear Request**
**Say:** *"What's available?"*
- **Expected:** Assistant asks for clarification
- **Watch logs for:**
  - No tool calls or appropriate clarification request

---

## **🚀 Phase 5: Complex Interactions**

### 12. **Test Multiple Requests**
**Say:** *"First show me the providers, then show me appointment types"*
- **Expected:** Assistant handles both requests sequentially
- **Watch logs for:**
  - Two separate tool calls
  - Both API calls executed
  - Both results returned

### 13. **Test Follow-up**
**Say:** *"Now show me slots for December 23rd using appointment type 997003"*
- **Expected:** Slots filtered by specific appointment type
- **Watch logs for:**
  - `appointment_type_id` parameter included in API call
  - Filtered results

---

## **📊 What to Monitor During Testing**

### **Frontend Logs (Browser)**
- ✅ VAPI SDK loaded
- ✅ Call started successfully  
- ✅ Speech start/end detection
- ✅ Messages received from VAPI
- ❌ Any JavaScript errors

### **Server Logs (Terminal)**
- ✅ Webhook requests received
- ✅ Tool calls parsed correctly
- ✅ NexHealth API calls successful
- ✅ Tool results returned
- ❌ API errors or timeouts

### **Expected Response Times**
- **Tool execution:** < 2 seconds
- **NexHealth API calls:** < 3 seconds  
- **Voice response:** < 1 second after tool completion

---

## **✅ Success Criteria**

### **Basic Success**
- [ ] All 5 tool functions execute without errors
- [ ] NexHealth API returns data successfully
- [ ] Assistant speaks responses clearly
- [ ] Logs show complete request/response cycle

### **Advanced Success**
- [ ] Assistant handles edge cases gracefully
- [ ] Multiple requests work in sequence
- [ ] Error messages are user-friendly
- [ ] Response times are acceptable

---

## **🚨 Common Issues & Quick Fixes**

### **No Tool Calls Triggered**
- Check webhook URL in assistant config
- Verify system prompt includes tool descriptions
- Ensure serverUrl is correct in VAPI config

### **NexHealth API Errors**
- Verify API key is valid and set
- Check TEST_CONFIG values match your account
- Ensure subdomain/location exists

### **Silent Assistant**
- Check VAPI public key
- Verify voice settings
- Test microphone permissions

### **Tool Execution Fails**
- Check server logs for detailed error messages
- Verify all required parameters
- Test individual API endpoints manually

---

## **📝 Testing Checklist**

After completing the script, verify:

- [ ] All basic tools work (appointment types, providers, operatories, locations)
- [ ] Appointment slots work for different dates
- [ ] Error handling is appropriate
- [ ] Logs show complete traceability
- [ ] Response times are acceptable
- [ ] No JavaScript or server errors
- [ ] Assistant remains responsive throughout

---

## **🎯 Next Steps After Successful Testing**

1. **Expand tool functions** (booking, cancellation, etc.)
2. **Add authentication** and user context
3. **Implement database logging** for call records
4. **Create production assistant** configurations
5. **Set up monitoring** and alerting
6. **Test with real phone numbers** (if using phone assistant)

Remember: This is your testing foundation. Once these basic interactions work flawlessly, you can confidently build more complex features! 🚀 