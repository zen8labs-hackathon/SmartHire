import type { QueryExecutor } from "@/lib/db/config/client";
import { buildSetClause } from "@/lib/db/query-helpers";

export type BusyBlockRepeat = "none" | "weekdays" | "weekly";

/**
 * Personal busy time. `from_min`/`to_min` are minutes-of-day in GMT+7
 * (480..1140, step 30); both are NULL when `all_day`. `date` columns come
 * back from `pg` as local-midnight `Date`s -- format them with `dbDateToIso`.
 * A weekly repeat recurs on the weekday of `start_date`.
 */
export type BusyBlockRow = {
  id: string;
  owner_id: string;
  start_date: Date;
  all_day: boolean;
  from_min: number | null;
  to_min: number | null;
  repeat: BusyBlockRepeat;
  until_date: Date | null;
  note: string | null;
  removed_dates: Date[];
  series_parent_id: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
};

/** Dates are `YYYY-MM-DD` strings (GMT+7 calendar days). */
export type CreateBusyBlockInput = {
  ownerId: string;
  startDate: string;
  allDay?: boolean;
  fromMin?: number | null;
  toMin?: number | null;
  repeat?: BusyBlockRepeat;
  untilDate?: string | null;
  note?: string | null;
  seriesParentId?: string | null;
};

export type UpdateBusyBlockInput = {
  startDate?: string;
  allDay?: boolean;
  fromMin?: number | null;
  toMin?: number | null;
  repeat?: BusyBlockRepeat;
  untilDate?: string | null;
  note?: string | null;
};

export async function getBusyBlockById(
  db: QueryExecutor,
  id: string,
): Promise<BusyBlockRow | null> {
  const { rows } = await db.query<BusyBlockRow>(
    `SELECT * FROM busy_blocks WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
  return rows[0] ?? null;
}

/**
 * Blocks of the given owners that can produce an occurrence inside
 * `[fromDate, toDate]` (inclusive). Recurrence expansion and
 * `removed_dates` filtering happen in the app layer.
 */
export async function listBusyBlocksByOwnersInRange(
  db: QueryExecutor,
  ownerIds: string[],
  fromDate: string,
  toDate: string,
): Promise<BusyBlockRow[]> {
  if (ownerIds.length === 0) return [];
  const { rows } = await db.query<BusyBlockRow>(
    `SELECT * FROM busy_blocks
     WHERE owner_id = ANY($1::uuid[])
       AND deleted_at IS NULL
       AND start_date <= $3::date
       AND COALESCE(until_date, start_date) >= $2::date
     ORDER BY start_date ASC, from_min ASC NULLS FIRST`,
    [ownerIds, fromDate, toDate],
  );
  return rows;
}

export async function createBusyBlock(
  db: QueryExecutor,
  input: CreateBusyBlockInput,
): Promise<BusyBlockRow> {
  const allDay = input.allDay ?? false;
  const { rows } = await db.query<BusyBlockRow>(
    `INSERT INTO busy_blocks (
       owner_id, start_date, all_day, from_min, to_min, repeat,
       until_date, note, series_parent_id
     )
     VALUES ($1, $2, $3, $4, $5, COALESCE($6, 'none'), $7, $8, $9)
     RETURNING *`,
    [
      input.ownerId,
      input.startDate,
      allDay,
      allDay ? null : (input.fromMin ?? null),
      allDay ? null : (input.toMin ?? null),
      input.repeat ?? null,
      input.untilDate ?? null,
      input.note ?? null,
      input.seriesParentId ?? null,
    ],
  );
  return rows[0];
}

export async function updateBusyBlock(
  db: QueryExecutor,
  id: string,
  patch: UpdateBusyBlockInput,
): Promise<BusyBlockRow | null> {
  const { clause, values } = buildSetClause(
    {
      start_date: patch.startDate,
      all_day: patch.allDay,
      from_min: patch.fromMin,
      to_min: patch.toMin,
      repeat: patch.repeat,
      until_date: patch.untilDate,
      note: patch.note,
    },
    2,
  );
  if (!clause) return getBusyBlockById(db, id);

  const { rows } = await db.query<BusyBlockRow>(
    `UPDATE busy_blocks
     SET ${clause}, updated_at = now()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [id, ...values],
  );
  return rows[0] ?? null;
}

export async function softDeleteBusyBlock(
  db: QueryExecutor,
  id: string,
): Promise<boolean> {
  const { rows } = await db.query<{ id: string }>(
    `UPDATE busy_blocks
     SET deleted_at = now(), updated_at = now()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING id`,
    [id],
  );
  return rows.length > 0;
}

/** Removes a single occurrence from a recurring series ("this day only"). */
export async function addBusyBlockRemovedDate(
  db: QueryExecutor,
  id: string,
  date: string,
): Promise<BusyBlockRow | null> {
  const { rows } = await db.query<BusyBlockRow>(
    `UPDATE busy_blocks
     SET removed_dates = CASE
           WHEN $2::date = ANY(removed_dates) THEN removed_dates
           ELSE array_append(removed_dates, $2::date)
         END,
         updated_at = now()
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [id, date],
  );
  return rows[0] ?? null;
}

/**
 * Ends a series the day before `fromDate` ("this and following"). Returns
 * the updated block, or `null` when `fromDate` is the series start -- the
 * caller should then soft-delete or edit the block itself instead.
 */
export async function truncateBusyBlockSeries(
  db: QueryExecutor,
  id: string,
  fromDate: string,
): Promise<BusyBlockRow | null> {
  const { rows } = await db.query<BusyBlockRow>(
    `UPDATE busy_blocks
     SET until_date = $2::date - 1,
         removed_dates = ARRAY(
           SELECT d FROM unnest(removed_dates) AS d WHERE d < $2::date
         ),
         updated_at = now()
     WHERE id = $1 AND deleted_at IS NULL
       AND repeat <> 'none'
       AND start_date < $2::date
     RETURNING *`,
    [id, fromDate],
  );
  return rows[0] ?? null;
}
