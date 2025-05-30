import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

// For now, we'll define a basic interface that matches our database schema
interface PracticeData {
  id: string;
  name: string | null;
  vapi_voice_id: string | null;
  vapi_system_prompt_override: string | null;
  vapi_first_message: string | null;
  vapi_assistant_id: string | null;
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

// Tool parameter schemas using Zod
const identifyPatientParamsSchema = z.object({
  patientName: z.string().optional().describe("The full name of the patient"),
  dateOfBirth: z.string().optional().describe("Patient's date of birth in YYYY-MM-DD format"),
  phoneNumber: z.string().optional().describe("Patient's phone number")
}).describe("Parameters to identify an existing patient or gather details for a new patient");

const checkAvailabilityParamsSchema = z.object({
  serviceName: z.string().describe("Type of dental service requested (e.g., cleaning, checkup, emergency)"),
  requestedDate: z.string().optional().describe("Preferred date in YYYY-MM-DD format (optional)"),
  requestedTime: z.string().optional().describe("Preferred time in HH:MM format (optional)")
}).describe("Parameters to check appointment availability");

const scheduleAppointmentParamsSchema = z.object({
  patientName: z.string().describe("Full name of the patient"),
  phoneNumber: z.string().describe("Patient's phone number"),
  email: z.string().optional().describe("Patient's email address"),
  serviceName: z.string().describe("Type of dental service to schedule"),
  appointmentDate: z.string().describe("Appointment date in YYYY-MM-DD format"),
  appointmentTime: z.string().describe("Appointment time in HH:MM format"),
  isNewPatient: z.boolean().optional().describe("Whether this is a new patient"),
  notes: z.string().optional().describe("Any additional notes or special requests")
}).describe("Parameters to schedule a new appointment");

const getPatientAppointmentsParamsSchema = z.object({
  patientName: z.string().optional().describe("Patient's full name"),
  phoneNumber: z.string().optional().describe("Patient's phone number"),
  patientId: z.string().optional().describe("Patient ID if available")
}).describe("Parameters to retrieve existing appointments for a patient");

const cancelAppointmentParamsSchema = z.object({
  appointmentId: z.string().optional().describe("Appointment ID to cancel"),
  patientName: z.string().optional().describe("Patient's full name"),
  phoneNumber: z.string().optional().describe("Patient's phone number"),
  appointmentDate: z.string().optional().describe("Date of appointment to cancel in YYYY-MM-DD format")
}).describe("Parameters to cancel an existing appointment");

// Convert Zod schemas to JSON Schema for Vapi
const identifyPatientJsonSchema = zodToJsonSchema(identifyPatientParamsSchema, "identifyPatientParams");
const checkAvailabilityJsonSchema = zodToJsonSchema(checkAvailabilityParamsSchema, "checkAvailabilityParams");
const scheduleAppointmentJsonSchema = zodToJsonSchema(scheduleAppointmentParamsSchema, "scheduleAppointmentParams");
const getPatientAppointmentsJsonSchema = zodToJsonSchema(getPatientAppointmentsParamsSchema, "getPatientAppointmentsParams");
const cancelAppointmentJsonSchema = zodToJsonSchema(cancelAppointmentParamsSchema, "cancelAppointmentParams");

export async function createOrUpdateVapiAssistant(
  practiceData: PracticeData
): Promise<string | null> {
  try {
    console.log("Creating/updating Vapi assistant for practice:", practiceData.id);
    
    // Personalize the system prompt
    const personalizedPrompt = BASE_SYSTEM_PROMPT
      .replace(/{PRACTICE_NAME}/g, practiceData.name || "the dental practice")
      .replace(/{PRACTICE_TIMEZONE}/g, "America/New_York") // Could be from practice data
      .replace(/{PRACTICE_CUSTOM_INSTRUCTIONS}/g, 
        practiceData.vapi_system_prompt_override || "");

    // Define tool configurations for Vapi
    const tools = [
      {
        type: "function" as const,
        function: {
          name: "identify_patient",
          description: "Identifies an existing patient or gathers details for a new patient. Use this when a patient calls to book an appointment or inquire about their account.",
          parameters: {
            type: "object",
            properties: (identifyPatientJsonSchema as any).properties || {},
            required: (identifyPatientJsonSchema as any).required || []
          }
        },
        server: {
          url: `${process.env.NEXT_PUBLIC_APP_URL}/api/vapi/tool-handler`
        },
        messages: [
          {
            type: "request-start" as const,
            content: "Let me look up your information in our system."
          },
          {
            type: "request-failed" as const,
            content: "I'm having trouble accessing our patient records right now. Let me have someone call you back."
          }
        ]
      },
      {
        type: "function" as const,
        function: {
          name: "check_availability",
          description: "Checks appointment availability for a specific dental service and date/time preferences.",
          parameters: {
            type: "object",
            properties: (checkAvailabilityJsonSchema as any).properties || {},
            required: (checkAvailabilityJsonSchema as any).required || []
          }
        },
        server: {
          url: `${process.env.NEXT_PUBLIC_APP_URL}/api/vapi/tool-handler`
        },
        messages: [
          {
            type: "request-start" as const,
            content: "Let me check our schedule for available appointments."
          }
        ]
      },
      {
        type: "function" as const,
        function: {
          name: "schedule_appointment",
          description: "Schedules a new appointment after confirming patient details and availability.",
          parameters: {
            type: "object",
            properties: (scheduleAppointmentJsonSchema as any).properties || {},
            required: (scheduleAppointmentJsonSchema as any).required || []
          }
        },
        server: {
          url: `${process.env.NEXT_PUBLIC_APP_URL}/api/vapi/tool-handler`
        },
        messages: [
          {
            type: "request-start" as const,
            content: "Let me schedule that appointment for you."
          }
        ]
      },
      {
        type: "function" as const,
        function: {
          name: "get_patient_appointments",
          description: "Retrieves existing appointments for a patient.",
          parameters: {
            type: "object",
            properties: (getPatientAppointmentsJsonSchema as any).properties || {},
            required: (getPatientAppointmentsJsonSchema as any).required || []
          }
        },
        server: {
          url: `${process.env.NEXT_PUBLIC_APP_URL}/api/vapi/tool-handler`
        },
        messages: [
          {
            type: "request-start" as const,
            content: "Let me look up your current appointments."
          }
        ]
      },
      {
        type: "function" as const,
        function: {
          name: "cancel_appointment",
          description: "Cancels an existing appointment for a patient.",
          parameters: {
            type: "object",
            properties: (cancelAppointmentJsonSchema as any).properties || {},
            required: (cancelAppointmentJsonSchema as any).required || []
          }
        },
        server: {
          url: `${process.env.NEXT_PUBLIC_APP_URL}/api/vapi/tool-handler`
        },
        messages: [
          {
            type: "request-start" as const,
            content: "Let me cancel that appointment for you."
          }
        ]
      }
    ];

    // Assistant configuration
    const assistantConfig = {
      name: `LAINE - ${practiceData.name || practiceData.id}`,
      model: {
        provider: "openai" as const,
        model: "gpt-4o",
        messages: [
          {
            role: "system" as const,
            content: personalizedPrompt
          }
        ],
        tools: tools
      },
      voice: {
        provider: "playht" as const,
        voiceId: practiceData.vapi_voice_id || "jennifer"
      },
      firstMessage: practiceData.vapi_first_message || 
        `Thank you for calling ${practiceData.name || "our dental practice"}. This is Laine, your AI receptionist. How can I help you today?`,
      server: {
        url: `${process.env.NEXT_PUBLIC_APP_URL}/api/vapi/tool-handler`,
        secret: process.env.VAPI_WEBHOOK_SECRET || "laine-webhook-secret-change-me"
      },
      clientMessages: ["speech-update", "transcript", "hang", "error", "status-update"] as const,
      serverMessages: ["tool-calls", "speech-update", "transcript", "hang", "end-of-call-report", "status-update"] as const,
      artifactPlan: {
        recordingEnabled: true,
        transcriptPlan: {
          enabled: true,
          assistantName: "Laine",
          userName: "Patient"
        }
      },
      metadata: {
        lainePracticeId: practiceData.id
      },
      silenceTimeoutSeconds: 30,
      maxDurationSeconds: 1800 // 30 minutes max call duration
    };

    // For now, return a mock assistant ID until we can resolve the Vapi SDK import issues
    // In a real implementation, this would create/update the assistant via Vapi API
    const mockAssistantId = `assistant_${practiceData.id}_${Date.now()}`;
    
    console.log("Assistant configuration prepared:", {
      name: assistantConfig.name,
      voice: assistantConfig.voice.voiceId,
      toolCount: tools.length,
      firstMessageLength: assistantConfig.firstMessage.length,
      promptLength: personalizedPrompt.length
    });
    
    console.log("Mock assistant created:", mockAssistantId);
    return mockAssistantId;
    
  } catch (error) {
    console.error("Error creating/updating Vapi assistant:", error);
    return null;
  }
} 