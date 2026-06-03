import { randomUUID } from "node:crypto";
import { ensureSchema, getSql } from "./db";
import { normalizeEmail } from "./auth";

export interface TripSummary {
  id: string;
  name: string;
  role: "owner" | "editor" | "viewer";
  ownerId: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface TripRow {
  id: string;
  name: string;
  role: "owner" | "editor" | "viewer";
  owner_id: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function listTrips(userId: string, email: string, { includeArchived = false }: { includeArchived?: boolean } = {}): Promise<TripSummary[]> {
  await applyPendingInvitations(userId, email);
  const rows = includeArchived
    ? ((await getSql()`
        select trips.id, trips.name, trip_memberships.role, trips.owner_id, trips.archived_at, trips.created_at, trips.updated_at
        from trip_memberships
        join trips on trips.id = trip_memberships.trip_id
        where trip_memberships.user_id = ${userId}
        order by trips.created_at asc
      `) as TripRow[])
    : ((await getSql()`
        select trips.id, trips.name, trip_memberships.role, trips.owner_id, trips.archived_at, trips.created_at, trips.updated_at
        from trip_memberships
        join trips on trips.id = trip_memberships.trip_id
        where trip_memberships.user_id = ${userId}
          and trips.archived_at is null
        order by trips.created_at asc
      `) as TripRow[]);

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
  const trip = await getTripForUser(userId, tripId, allowedRoles, false);
  if (!trip || !allowedRoles.includes(trip.role)) {
    throw new Error("Trip access denied");
  }

  return trip;
}

export async function archiveTrip(userId: string, tripId: string) {
  await ensureTripAccess(userId, tripId, ["owner"]);
  await getSql()`
    update trips
    set archived_at = now(), updated_at = now()
    where id = ${tripId}
      and archived_at is null
  `;
}

export async function deleteTrip(userId: string, tripId: string) {
  await ensureTripOwner(userId, tripId, true);
  await getSql()`
    delete from trips
    where id = ${tripId}
  `;
}

export async function restoreTrip(userId: string, tripId: string) {
  await ensureTripOwner(userId, tripId, true);
  await getSql()`
    update trips
    set archived_at = null, updated_at = now()
    where id = ${tripId}
  `;
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
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function ensureTripOwner(userId: string, tripId: string, includeArchived: boolean) {
  const trip = await getTripForUser(userId, tripId, ["owner"], includeArchived);
  if (!trip || trip.role !== "owner") {
    throw new Error("Trip access denied");
  }
  return trip;
}

async function getTripForUser(
  userId: string,
  tripId: string,
  allowedRoles: Array<TripSummary["role"]>,
  includeArchived: boolean,
) {
  await ensureSchema();
  const rows = includeArchived
    ? ((await getSql()`
        select trips.id, trips.name, trip_memberships.role, trips.owner_id, trips.archived_at, trips.created_at, trips.updated_at
        from trip_memberships
        join trips on trips.id = trip_memberships.trip_id
        where trip_memberships.user_id = ${userId}
          and trip_memberships.trip_id = ${tripId}
        limit 1
      `) as TripRow[])
    : ((await getSql()`
        select trips.id, trips.name, trip_memberships.role, trips.owner_id, trips.archived_at, trips.created_at, trips.updated_at
        from trip_memberships
        join trips on trips.id = trip_memberships.trip_id
        where trip_memberships.user_id = ${userId}
          and trip_memberships.trip_id = ${tripId}
          and trips.archived_at is null
        limit 1
      `) as TripRow[]);

  const trip = rows[0] ? toTripSummary(rows[0]) : null;
  if (!trip || !allowedRoles.includes(trip.role)) {
    return null;
  }
  return trip;
}
