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
const BASE_SYSTEM_PROMPT = `[IDENTITY] 
You are Laine, the warm, confident voice receptionist for {PRACTICE_NAME}, a trusted dental clinic. You're knowledgeable, empathetic, and efficient at helping patients with their dental care needs.

[CORE RESPONSIBILITIES]
- Answer incoming calls professionally and warmly
- Help patients schedule appointments
- Provide information about dental services
- Assist with appointment changes and cancellations
- Gather patient information for new patients
- Handle basic inquiries about the practice

[COMMUNICATION STYLE]
- Be warm, professional, and reassuring
- Use a conversational tone while maintaining professionalism
- Be patient and understanding, especially with anxious patients
- Speak clearly and at an appropriate pace
- Confirm important details back to the patient

[APPOINTMENT SCHEDULING GUIDELINES]
- Always confirm patient details before scheduling
- Ask about preferred appointment times and dates
- Verify insurance information when relevant
- Confirm contact information
- Provide appointment confirmations with date, time, and any special instructions

[PRACTICE INFORMATION]
Practice Name: {PRACTICE_NAME}
Timezone: {PRACTICE_TIMEZONE}

[TOOLS AVAILABLE]
You have access to tools for:
- Patient identification and verification
- Checking appointment availability
- Scheduling new appointments
- Viewing existing patient appointments
- Canceling appointments when necessary

Always use the appropriate tools to help patients effectively. If you need information that isn't available through your tools, politely let the patient know you'll have someone call them back.

{PRACTICE_CUSTOM_INSTRUCTIONS}`;

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
    const tools = [
      {
        type: "function" as const,
        function: {
          name: "identify_patient",
          description: "Identifies an existing patient or gathers details for a new patient. Use this when a patient calls to book an appointment or inquire about their account.",
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
                description: "Patient's phone number"
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
                description: "Patient's gender (Male, Female, Other) (optional)"
              }
            },
            required: ["first_name", "last_name", "phone_number"]
          }
        }
      },
      {
        type: "function" as const,
        function: {
          name: "check_availability",
          description: "Checks appointment availability for a specific dental service and date/time preferences.",
          parameters: {
            type: "object",
            properties: {
              service_description: {
                type: "string",
                description: "Type of dental service requested (e.g., cleaning, checkup, emergency, root canal)"
              },
              requested_date: {
                type: "string",
                description: "Preferred date in YYYY-MM-DD format"
              },
              search_type: {
                type: "string", 
                enum: ["specific_date", "next_available"],
                description: "Whether to search for a specific date or next available appointment"
              }
            },
            required: ["service_description"]
          }
        }
      },
      {
        type: "function" as const,
        function: {
          name: "schedule_appointment",
          description: "Schedules a new appointment after confirming patient details and availability.",
          parameters: {
            type: "object",
            properties: {
              patient_id: {
                type: "string",
                description: "NexHealth patient ID"
              },
              provider_id: {
                type: "string",
                description: "Provider ID for the appointment"
              },
              operatory_id: {
                type: "string",
                description: "Operatory ID for the appointment"
              },
              appointment_type_id: {
                type: "string",
                description: "Appointment type ID from availability check"
              },
              start_time: {
                type: "string",
                description: "Appointment start time in ISO format"
              },
              end_time: {
                type: "string", 
                description: "Appointment end time in ISO format"
              },
              note: {
                type: "string",
                description: "Additional notes for the appointment (optional)"
              }
            },
            required: ["patient_id", "provider_id", "appointment_type_id", "start_time", "end_time"]
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
        tools: tools as VapiTool[]
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