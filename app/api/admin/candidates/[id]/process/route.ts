import {
  createClient as createSupabaseJsClient,
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from "@supabase/supabase-js";

import { requireAdminForRequest } from "@/lib/admin/require-admin-request";
import { getSupabasePublishableKey } from "@/lib/supabase/env";
import { runJdMatchForCandidate } from "@/lib/candidates/jd-match";

type RouteParams = { params: Promise<{ id: string }> };

async function messageFromInvokeError(error: unknown): Promise<{
  message: string;
  upstreamStatus?: number;
}> {
  if (error instanceof FunctionsHttpError) {
    const ctx = error.context;
    if (ctx instanceof Response) {
      const upstreamStatus = ctx.status;
      const raw = await ctx.text();
      try {
        const parsed = JSON.parse(raw) as {
          error?: string;
          message?: string;
        };
        const msg = parsed.error ?? parsed.message;
        if (msg) return { message: msg, upstreamStatus };
      } catch {
        /* not JSON */
      }
      if (raw?.trim()) {
        return {
          message: `${upstreamStatus}: ${raw.slice(0, 800)}`,
          upstreamStatus,
        };
      }
      return {
        message:
          upstreamStatus === 401
            ? "Edge Function rejected the session (401). Sign in again, or check that NEXT_PUBLIC_SUPABASE_URL and keys match the project where process-cv is deployed."
            : error.message,
        upstreamStatus,
      };
    }
  }
  if (error instanceof FunctionsRelayError) {
    const ctx = error.context;
    if (ctx instanceof Response) {
      const upstreamStatus = ctx.status;
      const raw = await ctx.text();
      return {
        message: raw?.trim()
          ? `Relay ${upstreamStatus}: ${raw.slice(0, 800)}`
          : error.message,
        upstreamStatus,
      };
    }
  }
  if (error instanceof FunctionsFetchError) {
    const ctx = error.context as { message?: string } | undefined;
    return {
      message: ctx?.message ?? error.message,
    };
  }
  if (error instanceof Error) {
    return { message: error.message };
  }
  return { message: String(error) };
}

export async function POST(request: Request, { params }: RouteParams) {
  const { id: candidateId } = await params;
  if (!candidateId) {
    return Response.json({ error: "Missing candidate id" }, { status: 400 });
  }

  const auth = await requireAdminForRequest(request);
  if (!auth.ok) return auth.response;

  const bearerHeader = request.headers.get("Authorization");
  const bearer =
    bearerHeader?.startsWith("Bearer ") ? bearerHeader.slice(7).trim() : "";

  let accessToken: string;
  if (bearer) {
    accessToken = bearer;
  } else {
    let {
      data: { session },
    } = await auth.supabase.auth.getSession();
    if (!session?.access_token) {
      await auth.supabase.auth.refreshSession();
      ({
        data: { session },
      } = await auth.supabase.auth.getSession());
    }
    if (!session?.access_token) {
      return Response.json(
        {
          error:
            "Missing access token for Edge Function. Send Authorization: Bearer from the client (getSession().access_token).",
        },
        { status: 401 },
      );
    }
    accessToken = session.access_token;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = getSupabasePublishableKey();
  if (!url || !key) {
    return Response.json(
      { error: "Missing Supabase configuration." },
      { status: 500 },
    );
  }

  const functionsClient = createSupabaseJsClient(url, key, {
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data, error } = await functionsClient.functions.invoke("process-cv", {
    body: { candidateId },
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (error) {
    const { message, upstreamStatus } = await messageFromInvokeError(error);
    if (process.env.NODE_ENV === "development") {
      console.error("[process-cv invoke]", error.name, message, { upstreamStatus });
    }
    const status =
      upstreamStatus === 401 || upstreamStatus === 403 ? upstreamStatus : 502;
    return Response.json({ error: message }, { status });
  }

  if (
    data &&
    typeof data === "object" &&
    "error" in data &&
    !("ok" in data)
  ) {
    const msg = String((data as { error: unknown }).error);
    return Response.json({ error: msg }, { status: 500 });
  }

  const jdMatch = await runJdMatchForCandidate(auth.supabase, candidateId);
  if (process.env.NODE_ENV === "development" && !jdMatch.ok) {
    console.warn("[jd-match]", candidateId, jdMatch);
  }

  const base =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : { ok: true };
  return Response.json({
    ...base,
    jdMatch: jdMatch.ok
      ? jdMatch.skipped
        ? { skipped: true, reason: jdMatch.reason }
        : { skipped: false, score: jdMatch.score }
      : { error: jdMatch.error },
  });
}
