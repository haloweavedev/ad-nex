import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getProviders } from "@/lib/nexhealth.server";

export async function GET() {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const practice = await prisma.practice.findUnique({
      where: { clerk_user_id: userId },
      select: {
        nexhealth_subdomain: true,
        nexhealth_location_id: true,
      },
    });

    if (!practice || !practice.nexhealth_subdomain || !practice.nexhealth_location_id) {
      return NextResponse.json(
        { error: "Practice NexHealth configuration is incomplete. Please set subdomain and location ID first." },
        { status: 400 }
      );
    }

    const providers = await getProviders(
      practice.nexhealth_subdomain,
      practice.nexhealth_location_id
    );

    // Convert IDs to strings for consistency
    const normalizedProviders = providers.map((provider: any) => ({
      ...provider,
      id: provider.id.toString()
    }));

    return NextResponse.json({ providers: normalizedProviders });
  } catch (error) {
    console.error("Error fetching providers:", error);
    return NextResponse.json(
      { error: "Failed to fetch providers from NexHealth" },
      { status: 500 }
    );
  }
} 