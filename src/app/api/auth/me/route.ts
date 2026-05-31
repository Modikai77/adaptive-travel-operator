import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getCurrentUser();
    return NextResponse.json({ user });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Auth failed";
    return NextResponse.json({ user: null, error: message }, { status: 500 });
  }
}
