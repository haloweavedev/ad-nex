"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface AIConfigData {
  vapi_voice_id: string;
  vapi_system_prompt_override: string;
  vapi_first_message: string;
}

const VOICE_OPTIONS = [
  { value: "jennifer", label: "Jennifer (Default)" },
  { value: "will", label: "Will" },
  { value: "chris", label: "Chris" },
  { value: "donna", label: "Donna" },
  { value: "anna", label: "Anna" },
  { value: "mark", label: "Mark" },
];

export default function AIConfigPage() {
  const [formData, setFormData] = useState<AIConfigData>({
    vapi_voice_id: "jennifer",
    vapi_system_prompt_override: "",
    vapi_first_message: "",
  });
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  // Fetch existing AI config data on load
  useEffect(() => {
    const fetchAIConfig = async () => {
      try {
        const response = await fetch("/api/practice/ai-config");
        if (response.ok) {
          const data = await response.json();
          if (data.practice) {
            setFormData({
              vapi_voice_id: data.practice.vapi_voice_id || "jennifer",
              vapi_system_prompt_override: data.practice.vapi_system_prompt_override || "",
              vapi_first_message: data.practice.vapi_first_message || "",
            });
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
  }, []);

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

      if (response.ok) {
        toast.success("AI configuration saved successfully");
      } else {
        throw new Error("Failed to save AI configuration");
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

  if (initialLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="max-w-2xl mx-auto">
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
    </div>
  );
} 