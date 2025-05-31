import { VapiClient } from '@vapi-ai/server-sdk';

// For now, we'll define a basic interface that matches our database schema
interface PracticeData {
  id: string;
  name: string | null;
  vapi_voice_id: string | null;
  vapi_system_prompt_override: string | null;
  vapi_first_message: string | null;
  vapi_assistant_id: string | null;
  timezone: string | null;
}

// Define proper Vapi API interfaces based on documentation
interface VapiOpenAIModel {
  provider: "openai";
  model: string;
  messages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }>;
  tools: VapiTool[];
}

interface VapiPlayHTVoice {
  provider: "playht";
  voiceId: string;
}

interface VapiTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, any>;
      required: string[];
    };
  };
}

interface VapiServer {
  url: string;
  secret: string;
}

interface VapiAssistantPayload {
  name: string;
  model: VapiOpenAIModel;
  voice: VapiPlayHTVoice;
  firstMessage: string;
  server: VapiServer;
  clientMessages: string[];
  serverMessages: string[];
  recordingEnabled: boolean;
  silenceTimeoutSeconds: number;
  maxDurationSeconds: number;
}

// Base system prompt template with placeholders
export const BASE_SYSTEM_PROMPT = `You are LAINE, an AI dental assistant for {{PRACTICE_NAME}}. You help patients schedule appointments through our practice management system.

## IDENTITY & ROLE
- Professional, warm, and empathetic dental practice assistant
- Knowledgeable about dental services and scheduling
- Focused on providing exceptional patient care and experience
- Always maintain patient confidentiality and HIPAA compliance

## CORE RESPONSIBILITIES
1. **Appointment Scheduling**: Help patients book dental appointments efficiently
2. **Patient Identification**: Verify existing patients or register new ones
3. **Service Guidance**: Help patients understand what type of appointment they need
4. **Schedule Management**: Find available time slots that work for patients
5. **Information Collection**: Gather necessary details for appointment booking

## CONVERSATION FLOW - FOLLOW THIS EXACT SEQUENCE:

### Step 1: Greeting & Reason for Visit
- Greet the patient warmly and ask how you can help
- If they want to schedule an appointment, ask: "What type of appointment are you looking for today?"
- Get their specific reason for visit (e.g., "cleaning", "checkup", "toothache", "consultation")

### Step 2: Service Type Identification  
- Use the **check_appointment_type** tool with their reason for visit
- The tool returns structured JSON with "success" field:
  - If success=true: Confirm the appointment type and duration with the patient
  - If success=false: Ask for clarification and try again with different wording
- Example: "Okay, a General Cleaning which takes about 60 minutes. Is that what you're looking for?"

### Step 3: Patient Identification
- Ask if they are a new or existing patient
- Collect: first name, last name, phone number
- For new patients, also collect: date of birth (optional), email (optional)
- Use the **identify_patient** tool with this information
- The tool returns structured JSON with "success" field:
  - If success=true: Welcome them and proceed to scheduling
  - If success=false: Handle the error gracefully, may need to retry

### Step 4: Availability Check
- Ask for their preferred date/time or if they want next available
- Use the **check_availability** tool with:
  - appointment_type_id (from Step 2)
  - duration_minutes (from Step 2)  
  - requested_date and search_type
- The tool returns structured JSON with "success" field and available_slots
- Present the available times clearly to the patient

### Step 5: Appointment Booking
- Once patient selects a specific time slot, use the **schedule_appointment** tool
- Include all required information from previous steps:
  - patient_id (from Step 3)
  - appointment_type_id (from Step 2)
  - start_time, end_time, provider_id (from selected slot in Step 4)
- The tool returns structured JSON with booking confirmation

## TOOL USAGE GUIDELINES

### Always Use Structured JSON Results
- All tools return JSON with a "success" field (true/false)
- If success=true: Use the data and proceed to next step
- If success=false: Handle the error_code and show message_to_patient to user
- Pass data between tools using the structured results (e.g., patient_id from identify_patient to schedule_appointment)

### Error Handling
- If any tool returns success=false, show the message_to_patient to the user
- For persistent errors, offer to have someone from the office call them back
- Never expose technical_details to patients

### Data Flow Between Tools
- check_appointment_type provides: appointment_type_id, duration_minutes
- identify_patient provides: patient_id, is_new_patient  
- check_availability provides: available_slots with start_time, end_time, provider_id
- Use these outputs as inputs for subsequent tools

## COMMUNICATION STYLE
- **Warm & Professional**: Sound like a caring member of the dental team
- **Clear & Concise**: Avoid medical jargon, explain things simply
- **Patient-Focused**: Always prioritize the patient's needs and comfort
- **Efficient**: Move through the process smoothly without rushing
- **Empathetic**: Acknowledge any concerns or anxiety about dental visits

## IMPORTANT GUIDELINES
- **Never** make up appointment times or availability
- **Always** use the tools to check real availability and book appointments
- **Never** share other patients' information
- If you cannot help with something, offer to have someone call them back
- Confirm all details before finalizing any appointment
- Be patient with elderly callers or those who need extra time

## SAMPLE RESPONSES
- Greeting: "Hi! This is LAINE, {{PRACTICE_NAME}}'s AI assistant. How can I help you today?"
- Service inquiry: "What type of appointment are you looking for today? For example, a cleaning, checkup, or something else?"
- Scheduling: "Great! I have these times available: [list options]. Which works best for you?"
- Confirmation: "Perfect! You're all set for [date] at [time]. Your confirmation number is [ID]. We'll see you then!"

Remember: Follow the exact 5-step conversation flow, use structured JSON tool results, and always prioritize patient care and experience.`;

function createVapiClient() {
  if (!process.env.VAPI_API_KEY) {
    throw new Error("VAPI_API_KEY not found in environment variables");
  }

  console.log("Creating VapiClient instance...");
  return new VapiClient({ token: process.env.VAPI_API_KEY });
}

// Helper function to validate UUID format
function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

export async function createOrUpdateVapiAssistant(
  practiceData: PracticeData
): Promise<string | null> {
  if (!process.env.VAPI_API_KEY) {
    console.error("VAPI_API_KEY not configured. Cannot proceed with Vapi assistant creation.");
    console.log("Falling back to mock assistant creation for development (VAPI_API_KEY missing)");
    const mockId = `mock_assistant_${practiceData.id}_${Date.now()}`;
    console.log("Mock assistant ID generated:", mockId);
    return mockId;
  }

  try {
    console.log("Creating/updating Vapi assistant for practice:", practiceData.id);
    
    // Personalize the system prompt
    const personalizedPrompt = BASE_SYSTEM_PROMPT
      .replace(/{PRACTICE_NAME}/g, practiceData.name || "the dental practice")
      .replace(/{PRACTICE_TIMEZONE}/g, practiceData.timezone || "America/New_York")
      .replace(/{PRACTICE_CUSTOM_INSTRUCTIONS}/g, 
        practiceData.vapi_system_prompt_override || "");

    // Define tool configurations for Vapi with explicit parameter schemas
    const VAPI_TOOLS = [
      {
        type: "function" as const,
        function: {
          name: "identify_patient",
          description: "Identify an existing patient or register a new patient in the practice management system. Call this after getting the patient's name, phone number, and determining if they are new or existing.",
          parameters: {
            type: "object",
            properties: {
              first_name: {
                type: "string",
                description: "Patient's first name"
              },
              last_name: {
                type: "string", 
                description: "Patient's last name"
              },
              phone_number: {
                type: "string",
                description: "Patient's phone number (10 digits, no formatting)"
              },
              date_of_birth: {
                type: "string",
                description: "Patient's date of birth in YYYY-MM-DD format (optional)"
              },
              email: {
                type: "string",
                description: "Patient's email address (optional)"
              },
              gender: {
                type: "string",
                description: "Patient's gender: Male, Female, or Other (optional)"
              }
            },
            required: ["first_name", "last_name", "phone_number"]
          }
        }
      },
      {
        type: "function" as const,
        function: {
          name: "check_appointment_type",
          description: "Determines the appropriate appointment type based on the patient's stated reason for their visit. Use this after asking the patient why they need an appointment.",
          parameters: {
            type: "object",
            properties: {
              patient_reason_for_visit: {
                type: "string",
                description: "The patient's verbatim description of why they need an appointment (e.g., 'cleaning', 'check-up', 'toothache', 'consultation')"
              }
            },
            required: ["patient_reason_for_visit"]
          }
        }
      },
      {
        type: "function" as const,
        function: {
          name: "check_availability",
          description: "Find available appointment slots for a specific appointment type. Use this after confirming the appointment type and patient preferences.",
          parameters: {
            type: "object",
            properties: {
              appointment_type_id: {
                type: "string",
                description: "The appointment type ID from check_appointment_type tool result"
              },
              duration_minutes: {
                type: "number",
                description: "Duration in minutes from check_appointment_type tool result"
              },
              requested_date: {
                type: "string",
                description: "Preferred date in YYYY-MM-DD format (optional, defaults to today)"
              },
              search_type: {
                type: "string",
                enum: ["specific_date", "next_available"],
                description: "Whether to search for a specific date or find next available slots"
              }
            },
            required: ["appointment_type_id"]
          }
        }
      },
      {
        type: "function" as const,
        function: {
          name: "schedule_appointment",
          description: "Book an appointment slot for a patient. Use this after the patient selects a specific time from available slots.",
          parameters: {
            type: "object",
            properties: {
              patient_id: {
                type: "string",
                description: "Patient ID from identify_patient tool result"
              },
              appointment_type_id: {
                type: "string",
                description: "Appointment type ID from check_appointment_type tool result"
              },
              start_time: {
                type: "string",
                description: "Appointment start time in ISO format from selected slot"
              },
              end_time: {
                type: "string",
                description: "Appointment end time in ISO format from selected slot"
              },
              provider_id: {
                type: "string",
                description: "Provider ID from selected slot"
              },
              operatory_id: {
                type: "string",
                description: "Operatory ID from selected slot (optional)"
              },
              note: {
                type: "string",
                description: "Additional notes about the appointment (optional)"
              }
            },
            required: ["patient_id", "appointment_type_id", "start_time", "end_time", "provider_id"]
          }
        }
      },
      {
        type: "function" as const,
        function: {
          name: "get_patient_appointments",
          description: "Retrieves existing appointments for a patient.",
          parameters: {
            type: "object",
            properties: {
              patient_id: {
                type: "string",
                description: "NexHealth patient ID"
              },
              phone_number: {
                type: "string",
                description: "Patient's phone number as alternative identifier"
              }
            },
            required: []
          }
        }
      },
      {
        type: "function" as const,
        function: {
          name: "cancel_appointment",
          description: "Cancels an existing appointment for a patient.",
          parameters: {
            type: "object",
            properties: {
              appointment_id: {
                type: "string",
                description: "NexHealth appointment ID to cancel"
              },
              patient_id: {
                type: "string",
                description: "Patient ID (optional if appointment_id provided)"
              },
              cancellation_reason: {
                type: "string",
                description: "Reason for cancellation (optional)"
              }
            },
            required: ["appointment_id"]
          }
        }
      }
    ];

    // Initialize Vapi client
    const vapi = createVapiClient();

    // Prepare assistant payload for Vapi API with proper typing
    const assistantPayload: VapiAssistantPayload = {
      name: `LAINE - ${practiceData.name || practiceData.id}`,
      model: {
        provider: "openai",
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: personalizedPrompt
          }
        ],
        tools: VAPI_TOOLS as VapiTool[]
      },
      voice: {
        provider: "playht",
        voiceId: practiceData.vapi_voice_id || "jennifer"
      },
      firstMessage: practiceData.vapi_first_message || 
        `Thank you for calling ${practiceData.name || "our dental practice"}. This is Laine, your AI receptionist. How can I help you today?`,
      server: {
        url: `${process.env.NEXT_PUBLIC_APP_URL}/api/vapi/tool-handler`,
        secret: process.env.VAPI_WEBHOOK_SECRET || "laine-webhook-secret-change-me"
      },
      clientMessages: ["speech-update", "transcript", "hang", "status-update"],
      serverMessages: ["tool-calls", "speech-update", "transcript", "hang", "end-of-call-report", "status-update"],
      recordingEnabled: true,
      silenceTimeoutSeconds: 30,
      maxDurationSeconds: 1800 // 30 minutes max call duration
    };

    console.log("Assistant configuration prepared:", {
      name: assistantPayload.name,
      voice: assistantPayload.voice.voiceId,
      toolCount: assistantPayload.model.tools.length,
      firstMessageLength: assistantPayload.firstMessage.length,
      promptLength: personalizedPrompt.length,
      serverUrl: assistantPayload.server.url
    });

    let assistantId: string;

    // Check if we have a valid UUID for existing assistant
    const hasValidAssistantId = practiceData.vapi_assistant_id && 
                               isValidUUID(practiceData.vapi_assistant_id);

    if (hasValidAssistantId) {
      // Update existing assistant
      console.log("Updating existing Vapi assistant:", practiceData.vapi_assistant_id);
      try {
        const updatedAssistant = await vapi.assistants.update(
          practiceData.vapi_assistant_id!,
          assistantPayload as any // Keep minimal 'as any' here due to SDK type limitations
        );
        assistantId = updatedAssistant.id;
        console.log("Vapi assistant updated successfully:", assistantId);
      } catch (updateError) {
        console.error("Failed to update assistant, will create new one:", updateError);
        // If update fails, create a new assistant
        const newAssistant = await vapi.assistants.create(assistantPayload as any);
        assistantId = newAssistant.id;
        console.log("New Vapi assistant created after update failure:", assistantId);
      }
    } else {
      // Create new assistant (either no ID exists or it's not a valid UUID)
      if (practiceData.vapi_assistant_id) {
        console.log("Existing assistant ID is not a valid UUID format, creating new assistant");
        console.log("Invalid ID:", practiceData.vapi_assistant_id);
      } else {
        console.log("Creating new Vapi assistant");
      }
      console.log("Payload:", JSON.stringify(assistantPayload, null, 2));
      const newAssistant = await vapi.assistants.create(assistantPayload as any);
      assistantId = newAssistant.id;
      console.log("New Vapi assistant created successfully:", assistantId);
    }

    return assistantId;
    
  } catch (error) {
    console.error("Error creating/updating Vapi assistant:", error);
    
    // Enhanced error logging for debugging
    if (error instanceof TypeError && error.message.includes("is not a constructor")) {
      console.error("This looks like an SDK import issue. VapiClient constructor not found.");
      console.error("Error details:", error.message);
    }
    
    if (error instanceof Error && 'body' in error) {
      console.error("Vapi API Error Body:", (error as any).body);
    }
    
    console.log("Falling back to mock assistant creation for development");
    const mockAssistantId = `mock_assistant_${practiceData.id}_${Date.now()}`;
    console.log("Mock assistant created:", mockAssistantId);
    return mockAssistantId;
  }
} 