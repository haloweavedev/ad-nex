"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

interface PracticeData {
  name: string;
  nexhealth_subdomain: string;
  nexhealth_location_id: string;
  nexhealth_api_key: string;
  timezone: string;
}

export default function SetupPage() {
  const [formData, setFormData] = useState<PracticeData>({
    name: "",
    nexhealth_subdomain: "",
    nexhealth_location_id: "",
    nexhealth_api_key: "",
    timezone: "America/New_York",
  });
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  // Fetch existing practice data on load
  useEffect(() => {
    const fetchPracticeData = async () => {
      try {
        const response = await fetch("/api/practice/setup");
        if (response.ok) {
          const data = await response.json();
          if (data.practice) {
            setFormData({
              name: data.practice.name || "",
              nexhealth_subdomain: data.practice.nexhealth_subdomain || "",
              nexhealth_location_id: data.practice.nexhealth_location_id || "",
              nexhealth_api_key: data.practice.nexhealth_api_key || "",
              timezone: data.practice.timezone || "America/New_York",
            });
          }
        }
      } catch (error) {
        console.error("Error fetching practice data:", error);
        toast.error("Failed to load practice data");
      } finally {
        setInitialLoading(false);
      }
    };

    fetchPracticeData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch("/api/practice/setup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        toast.success("Practice settings saved successfully");
      } else {
        throw new Error("Failed to save practice settings");
      }
    } catch (error) {
      console.error("Error saving practice:", error);
      toast.error("Failed to save practice settings");
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof PracticeData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (initialLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Practice Setup</CardTitle>
          <CardDescription>
            Configure your dental practice settings for LAINE integration
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">Practice Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleInputChange("name", e.target.value)}
                placeholder="e.g., Sunshine Dental"
                required
              />
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-medium">NexHealth Integration</h3>
              
              <div className="space-y-2">
                <Label htmlFor="nexhealth_subdomain">NexHealth Subdomain</Label>
                <Input
                  id="nexhealth_subdomain"
                  value={formData.nexhealth_subdomain}
                  onChange={(e) => handleInputChange("nexhealth_subdomain", e.target.value)}
                  placeholder="yourpractice"
                />
                <p className="text-sm text-muted-foreground">
                  From your NexHealth URL: https://yourpractice.nexhealth.com
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="nexhealth_location_id">Primary Location ID</Label>
                <Input
                  id="nexhealth_location_id"
                  value={formData.nexhealth_location_id}
                  onChange={(e) => handleInputChange("nexhealth_location_id", e.target.value)}
                  placeholder="location-id-from-nexhealth"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="nexhealth_api_key">NexHealth API Key</Label>
                <Input
                  id="nexhealth_api_key"
                  type="password"
                  value={formData.nexhealth_api_key}
                  onChange={(e) => handleInputChange("nexhealth_api_key", e.target.value)}
                  placeholder="Your NexHealth API key"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Select
                value={formData.timezone}
                onValueChange={(value) => handleInputChange("timezone", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select timezone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="America/New_York">Eastern Time</SelectItem>
                  <SelectItem value="America/Chicago">Central Time</SelectItem>
                  <SelectItem value="America/Denver">Mountain Time</SelectItem>
                  <SelectItem value="America/Los_Angeles">Pacific Time</SelectItem>
                  <SelectItem value="America/Phoenix">Arizona Time</SelectItem>
                  <SelectItem value="America/Anchorage">Alaska Time</SelectItem>
                  <SelectItem value="Pacific/Honolulu">Hawaii Time</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Saving..." : "Save Practice Settings"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
} 