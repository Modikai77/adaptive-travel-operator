import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let sql: NeonQueryFunction<false, false> | null = null;
let schemaReady = false;

export function getSql() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured");
  }

  if (!sql) {
    sql = neon(process.env.DATABASE_URL);
  }

  return sql;
}

export async function ensureSchema() {
  if (schemaReady) return;

  const db = getSql();
  await db`
    create table if not exists app_users (
      id text primary key,
      email text not null unique,
      password_hash text,
      salt text,
      iterations integer,
      google_sub text unique,
      name text,
      avatar_url text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  await db`alter table app_users alter column password_hash drop not null`;
  await db`alter table app_users alter column salt drop not null`;
  await db`alter table app_users alter column iterations drop not null`;
  await db`alter table app_users add column if not exists google_sub text unique`;
  await db`alter table app_users add column if not exists name text`;
  await db`alter table app_users add column if not exists avatar_url text`;
  await db`
    create table if not exists app_sessions (
      id text primary key,
      user_id text not null references app_users(id) on delete cascade,
      expires_at timestamptz not null,
      created_at timestamptz not null default now()
    )
  `;
  await db`
    create table if not exists trips (
      id text primary key,
      name text not null,
      owner_id text not null references app_users(id) on delete cascade,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  await db`
    create table if not exists trip_memberships (
      trip_id text not null references trips(id) on delete cascade,
      user_id text not null references app_users(id) on delete cascade,
      role text not null check (role in ('owner', 'editor', 'viewer')),
      created_at timestamptz not null default now(),
      primary key (trip_id, user_id)
    )
  `;
  await db`
    create table if not exists trip_invitations (
      id text primary key,
      trip_id text not null references trips(id) on delete cascade,
      email text not null,
      role text not null check (role in ('editor', 'viewer')),
      invited_by text not null references app_users(id) on delete cascade,
      accepted_at timestamptz,
      created_at timestamptz not null default now(),
      unique (trip_id, email)
    )
  `;
  await db`
    create table if not exists travel_data (
      trip_id text primary key references trips(id) on delete cascade,
      data jsonb not null,
      updated_at timestamptz not null default now()
    )
  `;
  await db`alter table travel_data add column if not exists trip_id text references trips(id) on delete cascade`;
  await db`alter table travel_data drop constraint if exists travel_data_pkey`;
  await db`alter table travel_data alter column trip_id drop not null`;
  await db`
    do $$
    begin
      if exists (
        select 1 from information_schema.columns
        where table_name = 'travel_data' and column_name = 'user_id'
      ) then
        alter table travel_data alter column user_id drop not null;
      end if;
    end $$;
  `;
  await db`create index if not exists app_sessions_user_id_idx on app_sessions(user_id)`;
  await db`create index if not exists app_sessions_expires_at_idx on app_sessions(expires_at)`;
  await db`create index if not exists trip_memberships_user_id_idx on trip_memberships(user_id)`;
  await db`create index if not exists trip_invitations_email_idx on trip_invitations(email)`;
  await db`create unique index if not exists travel_data_trip_id_idx on travel_data(trip_id)`;

  schemaReady = true;
}
