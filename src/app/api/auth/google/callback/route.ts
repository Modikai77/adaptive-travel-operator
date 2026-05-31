import { NextResponse } from "next/server";
import { createSession, findOrCreateGoogleUser } from "@/lib/auth";
import { exchangeCodeForGoogleProfile, verifyGoogleState } from "@/lib/google-oauth";
import { applyPendingInvitations } from "@/lib/trips-db";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const appUrl = new URL("/", url.origin);

  try {
    if (!code || !(await verifyGoogleState(state))) {
      throw new Error("Invalid Google sign-in state");
    }

    const profile = await exchangeCodeForGoogleProfile(code, url.origin);
    const user = await findOrCreateGoogleUser({
      googleSub: profile.sub,
      email: profile.email,
      name: profile.name,
      avatarUrl: profile.picture,
    });
    await applyPendingInvitations(user.id, user.email);
    await createSession(user.id);
    return NextResponse.redirect(appUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google sign-in failed";
    appUrl.searchParams.set("authError", message);
    return NextResponse.redirect(appUrl);
  }
}
