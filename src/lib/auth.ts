import { randomBytes, randomUUID, timingSafeEqual, pbkdf2Sync } from "node:crypto";
import { cookies } from "next/headers";
import { ensureSchema, getSql } from "./db";

export const SESSION_COOKIE = "ato_session";
const SESSION_DAYS = 30;
const ITERATIONS = 210_000;
const KEY_LENGTH = 64;
const DIGEST = "sha512";

export interface AuthUser {
  id: string;
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string | null;
  salt: string | null;
  iterations: number | null;
  google_sub?: string | null;
  name?: string | null;
  avatar_url?: string | null;
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function hashPassword(password: string, salt = randomBytes(16).toString("hex"), iterations = ITERATIONS) {
  const passwordHash = pbkdf2Sync(password, salt, iterations, KEY_LENGTH, DIGEST).toString("hex");
  return { passwordHash, salt, iterations };
}

export function verifyPassword(password: string, row: Pick<UserRow, "password_hash" | "salt" | "iterations">) {
  if (!row.password_hash || !row.salt || !row.iterations) return false;
  const candidate = pbkdf2Sync(password, row.salt, row.iterations, KEY_LENGTH, DIGEST);
  const expected = Buffer.from(row.password_hash, "hex");
  return expected.length === candidate.length && timingSafeEqual(expected, candidate);
}

export async function createUser(email: string, password: string): Promise<AuthUser> {
  await ensureSchema();
  const db = getSql();
  const normalized = normalizeEmail(email);
  const { passwordHash, salt, iterations } = hashPassword(password);
  const id = randomUUID();

  const rows = (await db`
    insert into app_users (id, email, password_hash, salt, iterations)
    values (${id}, ${normalized}, ${passwordHash}, ${salt}, ${iterations})
    returning id, email, password_hash, salt, iterations, name, avatar_url
  `) as UserRow[];

  return toAuthUser(rows[0]);
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  await ensureSchema();
  const db = getSql();
  const rows = (await db`
    select id, email, password_hash, salt, iterations, google_sub, name, avatar_url
    from app_users
    where email = ${normalizeEmail(email)}
    limit 1
  `) as UserRow[];
  return rows[0] ?? null;
}

export async function findOrCreateGoogleUser({
  googleSub,
  email,
  name,
  avatarUrl,
}: {
  googleSub: string;
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
}) {
  await ensureSchema();
  const db = getSql();
  const normalized = normalizeEmail(email);
  const existingBySub = (await db`
    select id, email, password_hash, salt, iterations, google_sub, name, avatar_url
    from app_users
    where google_sub = ${googleSub}
    limit 1
  `) as UserRow[];

  if (existingBySub[0]) {
    const rows = (await db`
      update app_users
      set email = ${normalized}, name = ${name ?? null}, avatar_url = ${avatarUrl ?? null}, updated_at = now()
      where id = ${existingBySub[0].id}
      returning id, email, password_hash, salt, iterations, google_sub, name, avatar_url
    `) as UserRow[];
    return toAuthUser(rows[0]);
  }

  const existingByEmail = await findUserByEmail(normalized);
  if (existingByEmail) {
    const rows = (await db`
      update app_users
      set google_sub = ${googleSub}, name = ${name ?? existingByEmail.name ?? null}, avatar_url = ${avatarUrl ?? existingByEmail.avatar_url ?? null}, updated_at = now()
      where id = ${existingByEmail.id}
      returning id, email, password_hash, salt, iterations, google_sub, name, avatar_url
    `) as UserRow[];
    return toAuthUser(rows[0]);
  }

  const id = randomUUID();
  const rows = (await db`
    insert into app_users (id, email, google_sub, name, avatar_url)
    values (${id}, ${normalized}, ${googleSub}, ${name ?? null}, ${avatarUrl ?? null})
    returning id, email, password_hash, salt, iterations, google_sub, name, avatar_url
  `) as UserRow[];

  return toAuthUser(rows[0]);
}

export async function createSession(userId: string) {
  await ensureSchema();
  const db = getSql();
  const sessionId = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await db`
    insert into app_sessions (id, user_id, expires_at)
    values (${sessionId}, ${userId}, ${expiresAt.toISOString()})
  `;

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  if (sessionId) {
    await ensureSchema();
    await getSql()`delete from app_sessions where id = ${sessionId}`;
  }
  cookieStore.delete(SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionId) return null;

  await ensureSchema();
  const rows = (await getSql()`
    select app_users.id, app_users.email, app_users.name, app_users.avatar_url
    from app_sessions
    join app_users on app_users.id = app_sessions.user_id
    where app_sessions.id = ${sessionId}
      and app_sessions.expires_at > now()
    limit 1
  `) as UserRow[];

  if (!rows[0]) {
    cookieStore.delete(SESSION_COOKIE);
    return null;
  }

  return toAuthUser(rows[0]);
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Unauthorized");
  }
  return user;
}

function toAuthUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    avatarUrl: row.avatar_url,
  };
}
