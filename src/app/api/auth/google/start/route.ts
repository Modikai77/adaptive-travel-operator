import { NextResponse } from "next/server";
import { createGoogleAuthUrl } from "@/lib/google-oauth";

export async function GET(request: Request) {
  try {
    const url = await createGoogleAuthUrl(new URL(request.url).origin);
    return NextResponse.redirect(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google OAuth failed";
    return NextResponse.redirect(new URL(`/?authError=${encodeURIComponent(message)}`, request.url));
  }
}
