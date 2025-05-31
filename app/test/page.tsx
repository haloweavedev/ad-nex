'use client';

import { useState, useRef, useEffect } from 'react';

interface TestLog {
  timestamp: string;
  type: 'info' | 'success' | 'error' | 'warning';
  message: string;
  data?: any;
}

export default function TestPage() {
  const [logs, setLogs] = useState<TestLog[]>([]);
  const [isVapiLoaded, setIsVapiLoaded] = useState(false);
  const [isCallActive, setIsCallActive] = useState(false);
  const vapiRef = useRef<any>(null);

  const addLog = (type: TestLog['type'], message: string, data?: any) => {
    const log: TestLog = {
      timestamp: new Date().toISOString(),
      type,
      message,
      data
    };
    setLogs(prev => [...prev, log]);
    console.log(`[TEST LOG ${type.toUpperCase()}]`, message, data || '');
  };

  // Load VAPI SDK
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@vapi-ai/web@latest';
    script.onload = () => {
      setIsVapiLoaded(true);
      addLog('success', 'VAPI SDK loaded successfully');
    };
    script.onerror = () => {
      addLog('error', 'Failed to load VAPI SDK');
    };
    document.head.appendChild(script);

    return () => {
      document.head.removeChild(script);
    };
  }, []);

  const startVapiCall = async () => {
    if (!isVapiLoaded || !(window as any).Vapi) {
      addLog('error', 'VAPI SDK not loaded');
      return;
    }

    try {
      addLog('info', 'Initializing VAPI call...');
      
      const Vapi = (window as any).Vapi;
      vapiRef.current = new Vapi('6309638c-2598-49c3-ba33-d6765387e599'); // Replace with your actual public key

      // Add event listeners for extensive logging
      vapiRef.current.on('call-start', () => {
        setIsCallActive(true);
        addLog('success', 'Call started successfully');
      });

      vapiRef.current.on('call-end', () => {
        setIsCallActive(false);
        addLog('info', 'Call ended');
      });

      vapiRef.current.on('volume-level', (_volume: number) => {
        // Uncomment for volume debugging (might be noisy)
        // addLog('info', `Volume level: ${volume}`);
      });

      vapiRef.current.on('message', (message: any) => {
        addLog('info', 'VAPI message received', message);
      });

      vapiRef.current.on('error', (error: any) => {
        addLog('error', 'VAPI error occurred', error);
      });

      vapiRef.current.on('speech-start', () => {
        addLog('info', 'User started speaking');
      });

      vapiRef.current.on('speech-end', () => {
        addLog('info', 'User stopped speaking');
      });

      // Start the call with our test assistant
      await vapiRef.current.start({
        assistant: {
          name: "NexHealth Test Assistant",
          model: {
            provider: "openai",
            model: "gpt-3.5-turbo",
            temperature: 0.7,
          },
          voice: {
            provider: "playht",
            voiceId: "jennifer",
          },
          // Add server URL for webhooks
          serverUrl: `${window.location.origin}/api/test`,
          systemMessage: `[Role]
You are a helpful test assistant for NexHealth API testing. Your primary task is to help test the integration between VAPI and NexHealth APIs.

[Style]
- Be informative and comprehensive
- Maintain a professional and polite tone
- Be concise, as you are currently operating as a Voice Conversation

[Response Guidelines]
- Present dates in a clear format (e.g., January 15, 2024)
- Keep responses brief and focused
- Always confirm what you're about to do before calling tools

[Available Tools & Tasks]
You have access to several NexHealth API functions for testing:
1. get_appointment_types - Get available appointment types
2. get_providers - Get available providers
3. get_appointment_slots - Get available appointment slots for a date
4. get_operatories - Get available operatories/rooms
5. get_locations - Get location information

[Instructions]
When a user asks about any of these, use the appropriate tool and explain what you found. Always be clear about what you're testing.

Example interactions:
- "What are the appointment types?" → Use get_appointment_types
- "Who are the providers?" → Use get_providers  
- "Show me appointment slots for December 23rd 2025" → Use get_appointment_slots
- "What operatories are available?" → Use get_operatories

Always explain what you're about to do and what the results mean.`,
          tools: [
            {
              type: "function",
              function: {
                name: "get_appointment_types",
                description: "Get all available appointment types for the practice",
                parameters: {
                  type: "object",
                  properties: {},
                  required: []
                }
              }
            },
            {
              type: "function", 
              function: {
                name: "get_providers",
                description: "Get all available providers for the practice",
                parameters: {
                  type: "object",
                  properties: {},
                  required: []
                }
              }
            },
            {
              type: "function",
              function: {
                name: "get_appointment_slots", 
                description: "Get available appointment slots for a specific date",
                parameters: {
                  type: "object",
                  properties: {
                    date: {
                      type: "string",
                      description: "Date in YYYY-MM-DD format (e.g., 2025-12-23)"
                    },
                    appointment_type_id: {
                      type: "string", 
                      description: "Optional appointment type ID to filter by"
                    }
                  },
                  required: ["date"]
                }
              }
            },
            {
              type: "function",
              function: {
                name: "get_operatories",
                description: "Get all available operatories/rooms for the practice",
                parameters: {
                  type: "object",
                  properties: {},
                  required: []
                }
              }
            },
            {
              type: "function",
              function: {
                name: "get_locations",
                description: "Get location information for the practice",
                parameters: {
                  type: "object", 
                  properties: {},
                  required: []
                }
              }
            }
          ]
        }
      });

      addLog('success', 'VAPI call started with test assistant');
    } catch (error) {
      addLog('error', 'Failed to start VAPI call', error);
    }
  };

  const endVapiCall = () => {
    if (vapiRef.current) {
      vapiRef.current.stop();
      addLog('info', 'VAPI call stopped');
    }
  };

  const clearLogs = () => {
    setLogs([]);
  };

  const testQueries = [
    "What are the appointment types?",
    "Who are the providers?", 
    "Show me appointment slots for December 23rd 2025",
    "What operatories are available?",
    "Tell me about the location"
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            VAPI + NexHealth API Test Page
          </h1>
          <p className="text-gray-600 mb-6">
            Test the integration between VAPI and NexHealth APIs with extensive logging.
          </p>

          <div className="flex gap-4 mb-6">
            <button
              onClick={startVapiCall}
              disabled={!isVapiLoaded || isCallActive}
              className={`px-6 py-2 rounded-lg font-medium ${
                !isVapiLoaded || isCallActive
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-green-600 text-white hover:bg-green-700'
              }`}
            >
              {isCallActive ? 'Call Active' : 'Start Test Call'}
            </button>

            <button
              onClick={endVapiCall}
              disabled={!isCallActive}
              className={`px-6 py-2 rounded-lg font-medium ${
                !isCallActive
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-red-600 text-white hover:bg-red-700'
              }`}
            >
              End Call
            </button>

            <button
              onClick={clearLogs}
              className="px-6 py-2 rounded-lg font-medium bg-blue-600 text-white hover:bg-blue-700"
            >
              Clear Logs
            </button>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <h3 className="font-semibold text-yellow-800 mb-2">Test Queries to Try:</h3>
            <ul className="text-yellow-700 space-y-1">
              {testQueries.map((query, index) => (
                <li key={index} className="flex items-center">
                  <span className="w-2 h-2 bg-yellow-400 rounded-full mr-2"></span>
                  "{query}"
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-blue-800">Status</h3>
              <div className="flex gap-4 text-sm">
                <span className={`px-2 py-1 rounded ${isVapiLoaded ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                  VAPI SDK: {isVapiLoaded ? 'Loaded' : 'Loading...'}
                </span>
                <span className={`px-2 py-1 rounded ${isCallActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                  Call: {isCallActive ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Logs Section */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900">
              Test Logs ({logs.length})
            </h2>
          </div>

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {logs.length === 0 ? (
              <p className="text-gray-500 text-center py-8">
                No logs yet. Start a call to see activity.
              </p>
            ) : (
              logs.map((log, index) => (
                <div
                  key={index}
                  className={`p-3 rounded-lg border-l-4 ${
                    log.type === 'success'
                      ? 'bg-green-50 border-green-400'
                      : log.type === 'error'
                      ? 'bg-red-50 border-red-400'
                      : log.type === 'warning'
                      ? 'bg-yellow-50 border-yellow-400'
                      : 'bg-blue-50 border-blue-400'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`px-2 py-1 text-xs rounded font-medium ${
                            log.type === 'success'
                              ? 'bg-green-100 text-green-800'
                              : log.type === 'error'
                              ? 'bg-red-100 text-red-800'
                              : log.type === 'warning'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {log.type.toUpperCase()}
                        </span>
                        <span className="text-xs text-gray-500">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-sm text-gray-800 mb-1">{log.message}</p>
                      {log.data && (
                        <pre className="text-xs bg-gray-100 p-2 rounded overflow-x-auto">
                          {JSON.stringify(log.data, null, 2)}
                        </pre>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
} 