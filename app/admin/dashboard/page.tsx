import { auth, currentUser } from "@clerk/nextjs/server"; // For server-side auth access
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

export default async function DashboardPage() {
  const { userId } = await auth(); // Get user ID
  const user = await currentUser(); // Get full user object

  if (!userId || !user) {
    // This should ideally be handled by middleware, but good for robustness
    return <div>Not authorized.</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome, {user.firstName || user.emailAddresses[0]?.emailAddress}!
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Practice Setup</CardTitle>
            <CardDescription>
              Configure your dental practice settings and NexHealth integration
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/admin/setup">
              <Button className="w-full">Configure Practice</Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>AI Configuration</CardTitle>
            <CardDescription>
              Set up LAINE&apos;s voice, prompts, and AI behavior
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/admin/ai-config">
              <Button className="w-full">Configure AI</Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Call Logs</CardTitle>
            <CardDescription>
              View call history and transcripts
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/admin/call-logs">
              <Button className="w-full" variant="outline">View Logs</Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Appointments</CardTitle>
            <CardDescription>
              Manage appointments scheduled through LAINE
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/admin/appointments">
              <Button className="w-full" variant="outline">View Appointments</Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Getting Started</CardTitle>
          <CardDescription>
            Follow these steps to set up LAINE for your practice
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center space-x-3">
            <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
              1
            </div>
            <span>Complete your practice setup with NexHealth integration</span>
          </div>
          <div className="flex items-center space-x-3">
            <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
              2
            </div>
            <span>Configure AI voice and prompts for your practice</span>
          </div>
          <div className="flex items-center space-x-3">
            <div className="w-6 h-6 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-sm font-medium">
              3
            </div>
            <span>Test your AI assistant and review call logs</span>
          </div>
        </CardContent>
      </Card>

      <div className="text-sm text-muted-foreground">
        <p>User ID: {userId}</p>
        <p>LAINE MVP - Phase 2 Implementation</p>
      </div>
    </div>
  );
} 