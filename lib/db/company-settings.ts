import type { QueryExecutor } from "@/lib/db/config/client";

export type CompanySettingRow<T = unknown> = {
  key: string;
  value: T;
  updated_by: string | null;
  updated_at: Date;
};

/**
 * Company working hours. `start`/`end` are minutes-of-day in GMT+7 (the app
 * validates 360..1260); `days` are ISO weekdays (1 = Mon .. 7 = Sun).
 */
export type WorkingHours = {
  start: number;
  end: number;
  days: number[];
};

export const WORKING_HOURS_KEY = "working_hours";

export const DEFAULT_WORKING_HOURS: WorkingHours = {
  start: 510,
  end: 1050,
  days: [1, 2, 3, 4, 5],
};

export async function getSetting<T>(
  db: QueryExecutor,
  key: string,
): Promise<CompanySettingRow<T> | null> {
  const { rows } = await db.query<CompanySettingRow<T>>(
    `SELECT * FROM company_settings WHERE key = $1`,
    [key],
  );
  return rows[0] ?? null;
}

export async function upsertSetting<T>(
  db: QueryExecutor,
  key: string,
  value: T,
  updatedBy: string | null,
): Promise<CompanySettingRow<T>> {
  const { rows } = await db.query<CompanySettingRow<T>>(
    `INSERT INTO company_settings (key, value, updated_by)
     VALUES ($1, $2::jsonb, $3)
     ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value,
           updated_by = EXCLUDED.updated_by,
           updated_at = now()
     RETURNING *`,
    [key, JSON.stringify(value), updatedBy],
  );
  return rows[0];
}

/** Falls back to {@link DEFAULT_WORKING_HOURS} when the row is missing. */
export async function getWorkingHours(
  db: QueryExecutor,
): Promise<WorkingHours> {
  const row = await getSetting<WorkingHours>(db, WORKING_HOURS_KEY);
  return row?.value ?? DEFAULT_WORKING_HOURS;
}

export async function setWorkingHours(
  db: QueryExecutor,
  hours: WorkingHours,
  updatedBy: string | null,
): Promise<WorkingHours> {
  const row = await upsertSetting(db, WORKING_HOURS_KEY, hours, updatedBy);
  return row.value;
}
