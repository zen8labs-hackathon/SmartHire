import type { SupabaseClient } from "@supabase/supabase-js";

import { isValidEmail, normalizeEmail } from "@/lib/auth/email";

/**
 * Parse comma/newline/semicolon-separated emails or string arrays from forms / JSON.
 */
export function parseViewerEmailInput(
  input: string | string[] | null | undefined,
): string[] {
  if (input == null) return [];
  const rawParts: string[] = [];
  if (Array.isArray(input)) {
    for (const s of input) {
      if (typeof s !== "string") continue;
      rawParts.push(...s.split(/[\s,;]+/));
    }
  } else {
    rawParts.push(...input.split(/[\s,;]+/));
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of rawParts) {
    const e = normalizeEmail(part);
    if (!isValidEmail(e)) continue;
    if (seen.has(e)) continue;
    seen.add(e);
    out.push(e);
  }
  return out;
}

/**
 * Resolve emails to auth user ids (paginates `listUsers` until all matches found).
 */
export async function resolveViewerEmailsToUserIds(
  admin: SupabaseClient,
  emails: string[],
): Promise<{ idByEmail: Map<string, string>; notFound: string[] }> {
  if (emails.length === 0) {
    return { idByEmail: new Map(), notFound: [] };
  }
  const need = new Set(emails);
  const idByEmail = new Map<string, string>();
  let page = 1;
  const perPage = 1000;
  const maxPages = 100;

  while (need.size > 0 && page <= maxPages) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(error.message);
    }
    for (const u of data.users) {
      const em = u.email ? normalizeEmail(u.email) : "";
      if (em && need.has(em)) {
        idByEmail.set(em, u.id);
        need.delete(em);
      }
    }
    if (data.users.length < perPage) break;
    page += 1;
  }

  return { idByEmail, notFound: [...need] };
}

export async function fetchViewerEmailsForJobDescription(
  admin: SupabaseClient,
  jobDescriptionId: number,
): Promise<string[]> {
  const { data: rows, error } = await admin
    .from("job_description_viewers")
    .select("user_id")
    .eq("job_description_id", jobDescriptionId);

  if (error || !rows?.length) return [];

  const emails: string[] = [];
  for (const r of rows) {
    const uid = r.user_id as string;
    const { data, error: gErr } = await admin.auth.admin.getUserById(uid);
    if (!gErr && data.user?.email) {
      emails.push(normalizeEmail(data.user.email));
    }
  }
  emails.sort();
  return emails;
}

/**
 * Replaces all viewer rows for this JD with the given user ids.
 */
export async function replaceJobDescriptionViewers(
  admin: SupabaseClient,
  params: {
    jobDescriptionId: number;
    userIds: string[];
    grantedBy: string;
  },
): Promise<void> {
  const { error: delErr } = await admin
    .from("job_description_viewers")
    .delete()
    .eq("job_description_id", params.jobDescriptionId);

  if (delErr) {
    throw new Error(delErr.message);
  }

  if (params.userIds.length === 0) return;

  const { error: insErr } = await admin.from("job_description_viewers").insert(
    params.userIds.map((user_id) => ({
      job_description_id: params.jobDescriptionId,
      user_id,
      granted_by: params.grantedBy,
    })),
  );

  if (insErr) {
    throw new Error(insErr.message);
  }
}

/**
 * Validates emails exist, then replaces viewer rows. Returns unknown emails without mutating.
 */
export async function syncJobDescriptionViewersFromEmails(
  admin: SupabaseClient,
  params: {
    jobDescriptionId: number;
    emails: string[];
    grantedBy: string;
  },
): Promise<{ notFound: string[] }> {
  if (params.emails.length === 0) {
    await replaceJobDescriptionViewers(admin, {
      jobDescriptionId: params.jobDescriptionId,
      userIds: [],
      grantedBy: params.grantedBy,
    });
    return { notFound: [] };
  }

  const { idByEmail, notFound } = await resolveViewerEmailsToUserIds(
    admin,
    params.emails,
  );
  if (notFound.length > 0) {
    return { notFound };
  }
  const userIds = params.emails.map((e) => idByEmail.get(e)!);
  await replaceJobDescriptionViewers(admin, {
    jobDescriptionId: params.jobDescriptionId,
    userIds,
    grantedBy: params.grantedBy,
  });
  return { notFound: [] };
}
