import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const practice = await prisma.practice.findUnique({
      where: { clerk_user_id: userId },
      include: {
        service_mappings: {
          where: { is_active: true }
        }
      }
    });

    if (!practice) {
      return NextResponse.json({ 
        isValid: false,
        issues: ["Practice not found"],
        recommendations: ["Complete practice setup first"]
      });
    }

    const issues: string[] = [];
    const recommendations: string[] = [];

    // Check basic practice information
    if (!practice.name?.trim()) {
      issues.push("Practice name is missing");
      recommendations.push("Set your practice name in admin setup");
    }

    // Check NexHealth API configuration
    if (!practice.nexhealth_subdomain?.trim()) {
      issues.push("NexHealth subdomain is missing");
      recommendations.push("Configure NexHealth subdomain in admin setup");
    }

    if (!practice.nexhealth_location_id?.trim()) {
      issues.push("NexHealth location ID is missing");
      recommendations.push("Set NexHealth location ID in admin setup");
    }

    // Check provider configuration
    if (!practice.nexhealth_selected_provider_ids || practice.nexhealth_selected_provider_ids.length === 0) {
      issues.push("No providers selected");
      recommendations.push("Select at least one provider for appointment booking");
    }

    // Check service mappings
    if (practice.service_mappings.length === 0) {
      issues.push("No service mappings configured");
      recommendations.push("Create service mappings to enable AI appointment booking");
    } else {
      // Check for common service mappings
      const spokenServices = practice.service_mappings.map((m: any) => m.spoken_service_name.toLowerCase());
      const commonServices = ['cleaning', 'checkup', 'consultation'];
      const missingCommon = commonServices.filter(service => 
        !spokenServices.some((spoken: string) => spoken.includes(service))
      );
      
      if (missingCommon.length > 0) {
        issues.push(`Missing common service mappings: ${missingCommon.join(', ')}`);
        recommendations.push("Use Quick Setup to add common service variations");
      }
    }

    // Check AI assistant configuration
    if (!practice.vapi_assistant_id?.trim()) {
      issues.push("AI assistant not configured");
      recommendations.push("Configure AI assistant in AI Config page");
    }

    // Check timezone
    if (!practice.timezone?.trim()) {
      issues.push("Timezone not set");
      recommendations.push("Set practice timezone for accurate appointment scheduling");
    }

    const isValid = issues.length === 0;
    const completionScore = Math.max(0, Math.round(((7 - issues.length) / 7) * 100));

    return NextResponse.json({
      isValid,
      completionScore,
      issues,
      recommendations,
      practice: {
        name: practice.name,
        hasNexHealthConfig: !!(practice.nexhealth_subdomain && practice.nexhealth_location_id),
        providerCount: practice.nexhealth_selected_provider_ids?.length || 0,
        serviceMappingCount: practice.service_mappings.length,
        hasAIAssistant: !!practice.vapi_assistant_id,
        timezone: practice.timezone
      }
    });

  } catch (error) {
    console.error("Error validating practice setup:", error);
    return NextResponse.json(
      { error: "Failed to validate practice setup" },
      { status: 500 }
    );
  }
} 