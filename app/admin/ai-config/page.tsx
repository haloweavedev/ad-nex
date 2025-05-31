"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { RefreshCw, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import TestCallButton from "@/components/admin/TestCallButton";

interface AIConfigData {
  vapi_voice_id: string;
  vapi_system_prompt_override: string;
  vapi_first_message: string;
}

interface PracticeData {
  id: string;
  name: string | null;
  vapi_assistant_id: string | null;
  vapi_voice_id: string | null;
  vapi_system_prompt_override: string | null;
  vapi_first_message: string | null;
}

interface VapiTool {
  type: string;
  function: {
    name: string;
    description: string;
    parameters: {
      type: string;
      properties: Record<string, any>;
      required: string[];
    };
  };
}

interface AssistantDetails {
  id: string;
  name: string;
  model: {
    provider: string;
    model: string;
    tools: VapiTool[];
  };
  voice: {
    provider: string;
    voiceId: string;
  };
  server: {
    url: string;
    secret: string;
  };
}

const VOICE_OPTIONS = [
  { value: "jennifer", label: "Jennifer (Default)" },
  { value: "will", label: "Will" },
  { value: "chris", label: "Chris" },
  { value: "donna", label: "Donna" },
  { value: "anna", label: "Anna" },
  { value: "mark", label: "Mark" },
];

const EXPECTED_TOOLS = [
  "identify_patient",
  "check_availability", 
  "schedule_appointment",
  "get_patient_appointments",
  "cancel_appointment"
];

export default function AIConfigPage() {
  const [formData, setFormData] = useState<AIConfigData>({
    vapi_voice_id: "jennifer",
    vapi_system_prompt_override: "",
    vapi_first_message: "",
  });
  const [practiceData, setPracticeData] = useState<PracticeData | null>(null);
  const [assistantDetails, setAssistantDetails] = useState<AssistantDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [toolsLoading, setToolsLoading] = useState(false);

  // Fetch existing AI config data on load
  useEffect(() => {
    const fetchAIConfig = async () => {
      try {
        const response = await fetch("/api/practice/ai-config");
        if (response.ok) {
          const data = await response.json();
          if (data.practice) {
            const practice = data.practice;
            setPracticeData(practice);
            setFormData({
              vapi_voice_id: practice.vapi_voice_id || "jennifer",
              vapi_system_prompt_override: practice.vapi_system_prompt_override || "",
              vapi_first_message: practice.vapi_first_message || "",
            });

            // Auto-fetch tools if assistant ID exists
            if (practice.vapi_assistant_id) {
              // Call fetchAssistantTools directly here to avoid dependency issues
              setToolsLoading(true);
              try {
                const toolsResponse = await fetch("/api/practice/ai-config?action=get-tools");
                if (toolsResponse.ok) {
                  const toolsData = await toolsResponse.json();
                  if (toolsData.success && toolsData.assistant) {
                    setAssistantDetails(toolsData.assistant);
                  }
                } else {
                  const errorData = await toolsResponse.json();
                  console.error("Failed to fetch assistant tools:", errorData);
                }
              } catch (toolsError) {
                console.error("Error fetching assistant tools:", toolsError);
              } finally {
                setToolsLoading(false);
              }
            }
          }
        }
      } catch (error) {
        console.error("Error fetching AI config:", error);
        toast.error("Failed to load AI configuration");
      } finally {
        setInitialLoading(false);
      }
    };

    fetchAIConfig();
  }, []); // Empty dependency array is fine now since we don't reference external functions

  const fetchAssistantTools = async () => {
    if (!practiceData?.vapi_assistant_id) return;
    
    setToolsLoading(true);
    try {
      const response = await fetch("/api/practice/ai-config?action=get-tools");
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.assistant) {
          setAssistantDetails(data.assistant);
        }
      } else {
        const errorData = await response.json();
        toast.error(`Failed to fetch assistant tools: ${errorData.details || errorData.error}`);
      }
    } catch (error) {
      console.error("Error fetching assistant tools:", error);
      toast.error("Failed to fetch assistant tools");
    } finally {
      setToolsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch("/api/practice/ai-config", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      const result = await response.json();

      if (response.ok) {
        toast.success("AI configuration saved successfully");
        // Update practice data with the new assistant ID if returned
        if (result.practice) {
          setPracticeData(result.practice);
          // Fetch tools for the updated assistant
          setTimeout(fetchAssistantTools, 1000); // Small delay to allow assistant to be fully created
        }
      } else {
        throw new Error(result.error || "Failed to save AI configuration");
      }
    } catch (error) {
      console.error("Error saving AI config:", error);
      toast.error("Failed to save AI configuration");
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof AIConfigData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const getToolStatus = () => {
    if (!assistantDetails?.model?.tools) return { status: "unknown", message: "No tools data available" };
    
    const configuredTools = assistantDetails.model.tools.map(tool => tool.function.name);
    const missingTools = EXPECTED_TOOLS.filter(tool => !configuredTools.includes(tool));
    const extraTools = configuredTools.filter(tool => !EXPECTED_TOOLS.includes(tool));

    if (missingTools.length === 0 && extraTools.length === 0) {
      return { status: "good", message: "All required tools configured correctly" };
    } else if (missingTools.length > 0) {
      return { status: "error", message: `Missing tools: ${missingTools.join(", ")}` };
    } else {
      return { status: "warning", message: `Extra tools detected: ${extraTools.join(", ")}` };
    }
  };

  const toolStatus = getToolStatus();
  const canTestCall = practiceData?.vapi_assistant_id && toolStatus.status !== "error";

  if (initialLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>AI Configuration</CardTitle>
            <CardDescription>
              Configure LAINE&apos;s AI voice assistant settings and prompts
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="vapi_voice_id">Voice Selection</Label>
                <Select
                  value={formData.vapi_voice_id}
                  onValueChange={(value) => handleInputChange("vapi_voice_id", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a voice" />
                  </SelectTrigger>
                  <SelectContent>
                    {VOICE_OPTIONS.map((voice) => (
                      <SelectItem key={voice.value} value={voice.value}>
                        {voice.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  Choose the voice that will represent your practice
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="vapi_first_message">First Message</Label>
                <Textarea
                  id="vapi_first_message"
                  value={formData.vapi_first_message}
                  onChange={(e) => handleInputChange("vapi_first_message", e.target.value)}
                  placeholder="Hello, thank you for calling [Practice Name]. My name is LAINE, how can I help you today?"
                  rows={3}
                />
                <p className="text-sm text-muted-foreground">
                  The initial greeting message when patients call
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="vapi_system_prompt_override">System Prompt Override</Label>
                <Textarea
                  id="vapi_system_prompt_override"
                  value={formData.vapi_system_prompt_override}
                  onChange={(e) => handleInputChange("vapi_system_prompt_override", e.target.value)}
                  placeholder="Additional instructions for the AI assistant (optional)..."
                  rows={6}
                />
                <p className="text-sm text-muted-foreground">
                  Custom instructions to override or supplement the default AI behavior. 
                  This will be added to the base system prompt.
                </p>
              </div>

              <Button type="submit" disabled={loading} className="w-full">
                {loading ? "Saving..." : "Save AI Configuration"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-6">
          {practiceData && (
            <Card>
              <CardHeader>
                <CardTitle>Assistant Status</CardTitle>
                <CardDescription>Current configuration status</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Practice:</span>
                  <span className="text-sm font-medium">{practiceData.name || "Not configured"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Voice:</span>
                  <span className="text-sm font-medium">
                    {VOICE_OPTIONS.find(v => v.value === practiceData.vapi_voice_id)?.label || "Jennifer (Default)"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Assistant ID:</span>
                  <span className="text-sm font-mono">
                    {practiceData.vapi_assistant_id || "Not created"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Custom Prompt:</span>
                  <span className="text-sm">
                    {practiceData.vapi_system_prompt_override ? "Yes" : "No"}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Setup Guide Card */}
          {!practiceData?.vapi_assistant_id && (
            <Card>
              <CardHeader>
                <CardTitle>🚀 Getting Started</CardTitle>
                <CardDescription>Follow these steps to activate your AI assistant</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs">1</span>
                    <span>Configure your voice and messages above</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs">2</span>
                    <span>Click "Save AI Configuration" to create your assistant</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 bg-gray-300 text-white rounded-full flex items-center justify-center text-xs">3</span>
                    <span className="text-muted-foreground">Test your assistant (available after setup)</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Tools Inspection Section */}
      {practiceData?.vapi_assistant_id && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <div>
              <CardTitle>Assistant Tools</CardTitle>
              <CardDescription>
                Configured tools for appointment booking functionality
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchAssistantTools}
              disabled={toolsLoading}
              className="flex items-center gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${toolsLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Tool Status */}
            <div className="flex items-center gap-2">
              {toolStatus.status === "good" && <CheckCircle className="h-5 w-5 text-green-600" />}
              {toolStatus.status === "warning" && <AlertCircle className="h-5 w-5 text-yellow-600" />}
              {toolStatus.status === "error" && <XCircle className="h-5 w-5 text-red-600" />}
              {toolStatus.status === "unknown" && <AlertCircle className="h-5 w-5 text-gray-600" />}
              
              <span className="text-sm font-medium">{toolStatus.message}</span>
            </div>

            {/* Tools List */}
            {assistantDetails?.model?.tools ? (
              <div className="space-y-3">
                <div className="text-sm font-medium">Configured Tools ({assistantDetails.model.tools.length})</div>
                <div className="grid gap-2">
                  {assistantDetails.model.tools.map((tool, index) => (
                    <div key={index} className="p-3 border rounded-lg space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant={EXPECTED_TOOLS.includes(tool.function.name) ? "default" : "secondary"}>
                            {tool.function.name}
                          </Badge>
                          {!EXPECTED_TOOLS.includes(tool.function.name) && (
                            <Badge variant="outline" className="text-yellow-600">Extra</Badge>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">{tool.type}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">{tool.function.description}</p>
                      {tool.function.parameters.required.length > 0 && (
                        <div className="text-xs">
                          <span className="font-medium">Required params: </span>
                          <span className="text-muted-foreground">
                            {tool.function.parameters.required.join(", ") || "None"}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Expected vs Configured Tools */}
                <div className="mt-4 p-3 bg-muted/30 rounded-lg space-y-2">
                  <div className="text-sm font-medium">Expected Tools</div>
                  <div className="flex flex-wrap gap-1">
                    {EXPECTED_TOOLS.map((toolName) => {
                      const isConfigured = assistantDetails.model.tools.some(t => t.function.name === toolName);
                      return (
                        <Badge 
                          key={toolName} 
                          variant={isConfigured ? "default" : "destructive"}
                          className="text-xs"
                        >
                          {toolName}
                          {isConfigured ? " ✓" : " ✗"}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : toolsLoading ? (
              <div className="text-center py-4">
                <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Loading assistant tools...</p>
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-sm text-muted-foreground">
                  No tools data available. Click refresh to load.
                </p>
              </div>
            )}

            {/* Test Call Button with Validation */}
            <div className="pt-4 border-t">
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium">🧪 Test Your AI Assistant</p>
                  <p className="text-xs text-muted-foreground">
                    {canTestCall 
                      ? "All required tools are configured. Ready to test!" 
                      : "Please fix tool configuration issues before testing calls"
                    }
                  </p>
                </div>
                <div className="flex items-center justify-center">
                  {canTestCall ? (
                    <TestCallButton
                      assistantId={practiceData?.vapi_assistant_id || null}
                      vapiPublicKey={process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY}
                    />
                  ) : (
                    <Button disabled variant="outline" size="sm">
                      Fix Tools Configuration First
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
} 