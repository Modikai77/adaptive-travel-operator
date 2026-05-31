import type { TravelDataExport } from "./types";
import { ensureSchema, getSql } from "./db";

interface TravelDataRow {
  data: TravelDataExport;
}

export async function getTravelData(tripId: string) {
  await ensureSchema();
  const rows = (await getSql()`
    select data
    from travel_data
    where trip_id = ${tripId}
    limit 1
  `) as TravelDataRow[];

  return rows[0]?.data ?? null;
}

export async function saveTravelData(tripId: string, data: TravelDataExport) {
  await ensureSchema();
  await getSql().query(
    `
      insert into travel_data (trip_id, data, updated_at)
      values ($1, $2::jsonb, now())
      on conflict (trip_id)
      do update set data = excluded.data, updated_at = now()
    `,
    [tripId, JSON.stringify(data)],
  );
}
