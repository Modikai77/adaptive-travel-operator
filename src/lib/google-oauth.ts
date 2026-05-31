import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";

const GOOGLE_STATE_COOKIE = "ato_google_state";

interface GoogleTokenResponse {
  access_token: string;
  id_token?: string;
  token_type: string;
  expires_in: number;
}

export interface GoogleProfile {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

export async function createGoogleAuthUrl(origin: string) {
  assertGoogleConfig();
  const state = randomBytes(24).toString("hex");
  const redirectUri = getGoogleRedirectUri(origin);
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");

  url.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID!);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");

  const cookieStore = await cookies();
  cookieStore.set(GOOGLE_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 10 * 60,
  });

  return url;
}

export async function verifyGoogleState(state: string | null) {
  const cookieStore = await cookies();
  const expected = cookieStore.get(GOOGLE_STATE_COOKIE)?.value;
  cookieStore.delete(GOOGLE_STATE_COOKIE);
  return Boolean(state && expected && state === expected);
}

export async function exchangeCodeForGoogleProfile(code: string, origin: string): Promise<GoogleProfile> {
  assertGoogleConfig();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: getGoogleRedirectUri(origin),
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) throw new Error("Google token exchange failed");
  const token = (await response.json()) as GoogleTokenResponse;

  const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });

  if (!profileResponse.ok) throw new Error("Google profile fetch failed");
  const profile = (await profileResponse.json()) as GoogleProfile;
  if (!profile.email || !profile.sub) throw new Error("Google profile is missing required fields");
  return profile;
}

function getGoogleRedirectUri(origin: string) {
  return `${origin}/api/auth/google/callback`;
}

function assertGoogleConfig() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    throw new Error("Google OAuth is not configured");
  }
}
