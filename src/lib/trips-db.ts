import { randomUUID } from "node:crypto";
import { ensureSchema, getSql } from "./db";
import { normalizeEmail } from "./auth";

export interface TripSummary {
  id: string;
  name: string;
  role: "owner" | "editor" | "viewer";
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

interface TripRow {
  id: string;
  name: string;
  role: "owner" | "editor" | "viewer";
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export async function listTrips(userId: string, email: string): Promise<TripSummary[]> {
  await applyPendingInvitations(userId, email);
  const rows = (await getSql()`
    select trips.id, trips.name, trip_memberships.role, trips.owner_id, trips.created_at, trips.updated_at
    from trip_memberships
    join trips on trips.id = trip_memberships.trip_id
    where trip_memberships.user_id = ${userId}
    order by trips.created_at asc
  `) as TripRow[];

  return rows.map(toTripSummary);
}

export async function createTrip(userId: string, name: string) {
  await ensureSchema();
  const db = getSql();
  const id = randomUUID();
  const cleanName = name.trim() || "World Trip";

  await db.transaction([
    db`
      insert into trips (id, name, owner_id)
      values (${id}, ${cleanName}, ${userId})
    `,
    db`
      insert into trip_memberships (trip_id, user_id, role)
      values (${id}, ${userId}, 'owner')
    `,
  ]);

  return { id, name: cleanName };
}

export async function ensureTripAccess(userId: string, tripId: string, allowedRoles: Array<TripSummary["role"]> = ["owner", "editor", "viewer"]) {
  await ensureSchema();
  const rows = (await getSql()`
    select trips.id, trips.name, trip_memberships.role, trips.owner_id, trips.created_at, trips.updated_at
    from trip_memberships
    join trips on trips.id = trip_memberships.trip_id
    where trip_memberships.user_id = ${userId}
      and trip_memberships.trip_id = ${tripId}
    limit 1
  `) as TripRow[];

  const trip = rows[0] ? toTripSummary(rows[0]) : null;
  if (!trip || !allowedRoles.includes(trip.role)) {
    throw new Error("Trip access denied");
  }

  return trip;
}

export async function inviteToTrip({
  tripId,
  invitedBy,
  email,
  role,
}: {
  tripId: string;
  invitedBy: string;
  email: string;
  role: "editor" | "viewer";
}) {
  await ensureTripAccess(invitedBy, tripId, ["owner", "editor"]);
  const db = getSql();
  const normalized = normalizeEmail(email);
  const existingUser = (await db`
    select id from app_users where email = ${normalized} limit 1
  `) as Array<{ id: string }>;

  if (existingUser[0]) {
    await db`
      insert into trip_memberships (trip_id, user_id, role)
      values (${tripId}, ${existingUser[0].id}, ${role})
      on conflict (trip_id, user_id)
      do update set role = excluded.role
    `;
  }

  await db`
    insert into trip_invitations (id, trip_id, email, role, invited_by)
    values (${randomUUID()}, ${tripId}, ${normalized}, ${role}, ${invitedBy})
    on conflict (trip_id, email)
    do update set role = excluded.role, invited_by = excluded.invited_by, accepted_at = null
  `;
}

export async function applyPendingInvitations(userId: string, email: string) {
  await ensureSchema();
  const db = getSql();
  const normalized = normalizeEmail(email);
  const invitations = (await db`
    select id, trip_id, role
    from trip_invitations
    where email = ${normalized}
      and accepted_at is null
  `) as Array<{ id: string; trip_id: string; role: "editor" | "viewer" }>;

  if (!invitations.length) return;

  await db.transaction(
    invitations.flatMap((invitation) => [
      db`
        insert into trip_memberships (trip_id, user_id, role)
        values (${invitation.trip_id}, ${userId}, ${invitation.role})
        on conflict (trip_id, user_id)
        do update set role = excluded.role
      `,
      db`
        update trip_invitations
        set accepted_at = now()
        where id = ${invitation.id}
      `,
    ]),
  );
}

function toTripSummary(row: TripRow): TripSummary {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    ownerId: row.owner_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
