interface VapiCall {
  id: string;
  assistantId: string;
  phoneNumberId?: string;
  customer?: {
    number?: string;
    extension?: string;
  };
  type: string;
  status: string;
  startedAt: string;
  endedAt?: string;
  cost?: number;
  transcript?: string;
  recordingUrl?: string;
  summary?: string;
  analysis?: {
    summary?: string;
    structuredData?: any;
  };
  artifact?: {
    transcript?: string;
    recordingUrl?: string;
    stereoRecordingUrl?: string;
  };
}

class VapiService {
  private apiKey: string;
  private baseUrl: string = "https://api.vapi.ai";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Vapi API error (${response.status}):`, errorText);
      throw new Error(`Vapi API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  async getCallLogsForAssistant(
    assistantId: string, 
    limit: number = 100,
    options: {
      createdAtGt?: string; // ISO date string
      createdAtLt?: string; // ISO date string
    } = {}
  ): Promise<VapiCall[]> {
    try {
      console.log(`Fetching call logs for assistant: ${assistantId}`);
      
      const queryParams = new URLSearchParams({
        assistantId,
        limit: limit.toString(),
      });

      if (options.createdAtGt) {
        queryParams.append('createdAtGt', options.createdAtGt);
      }
      if (options.createdAtLt) {
        queryParams.append('createdAtLt', options.createdAtLt);
      }

      const calls = await this.request<VapiCall[]>(`/call?${queryParams.toString()}`);
      console.log(`Retrieved ${calls.length} calls for assistant ${assistantId}`);
      
      return calls;
    } catch (error) {
      console.error(`Error fetching call logs for assistant ${assistantId}:`, error);
      throw error;
    }
  }

  async getCallById(callId: string): Promise<VapiCall> {
    try {
      console.log(`Fetching call details for: ${callId}`);
      const call = await this.request<VapiCall>(`/call/${callId}`);
      return call;
    } catch (error) {
      console.error(`Error fetching call ${callId}:`, error);
      throw error;
    }
  }
}

// Export singleton instance
let vapiServiceInstance: VapiService | null = null;

export function getVapiService(): VapiService {
  if (!process.env.VAPI_API_KEY) {
    throw new Error("VAPI_API_KEY not found in environment variables");
  }
  
  if (!vapiServiceInstance) {
    vapiServiceInstance = new VapiService(process.env.VAPI_API_KEY);
  }
  
  return vapiServiceInstance;
}

export type { VapiCall }; 