import { Button } from "@/components/ui/button";
import Link from "next/link";
import { SignedIn, SignedOut } from "@clerk/nextjs";

export default function HomePage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Welcome to LAINE</h1>
      <p className="mb-4">AI Voice Receptionist - MVP</p>
      <SignedOut>
        <p className="mb-2">Please sign in or sign up to access the admin panel.</p>
        {/* Buttons are in the header, or add them here too */}
      </SignedOut>
      <SignedIn>
        <p className="mb-2">You are signed in.</p>
        <Link href="/admin/dashboard">
          <Button>Go to Dashboard</Button>
        </Link>
      </SignedIn>
    </div>
  );
}
