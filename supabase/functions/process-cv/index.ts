import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import mammoth from "npm:mammoth@1.8.0";
import { extractText, getDocumentProxy } from "npm:unpdf@0.12.1";

const BUCKET = "candidate-cvs";

/**
 * Override model with Supabase secret `AI_GATEWAY_MODEL` or optional `LLM_MODEL`
 * (same name as the Next.js app global model env for consistency).
 */
const DEFAULT_AI_GATEWAY_MODEL = "xai/grok-4.1-fast-reasoning";

type ParsedResume = {
  name: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  experienceYears: number | null;
  skills: string[];
  degree: string | null;
  school: string | null;
  experienceSummary: string | null;
  /** e.g. IELTS 7.5, Fluent, B2 */
  englishLevel: string | null;
  /** Grade point if mentioned */
  gpa: string | null;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function requireAdmin(
  authHeader: string | null,
): Promise<
  { ok: true; userId: string } | { ok: false; status: number; message: string }
> {
  if (!authHeader?.startsWith("Bearer ")) {
    return { ok: false, status: 401, message: "Missing authorization" };
  }
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anon) {
    return { ok: false, status: 500, message: "Server misconfigured" };
  }
  const supabase = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    return { ok: false, status: 401, message: "Invalid session" };
  }
  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (profErr || profile?.is_admin !== true) {
    return { ok: false, status: 403, message: "Admin only" };
  }
  return { ok: true, userId: user.id };
}

function sanitizeFolderName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/[^\w\s.-]/g, "") // Allow alphanumeric, space, dot, and dash
    .trim()
    .replace(/\s+/g, "_"); // Replace spaces with underscores
}

function getFormattedTimestamp(date: Date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}_${hh}${min}${ss}`;
}

function newUuidV8(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x80; // v8
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant
  return [...bytes]
    .map((b, i) => {
      const hex = b.toString(16).padStart(2, "0");
      if (i === 4 || i === 6 || i === 8 || i === 10) return "-" + hex;
      return hex;
    })
    .join("");
}

function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  const out = new ArrayBuffer(u8.byteLength);
  new Uint8Array(out).set(u8);
  return out;
}

async function sha256ToHex(data: BufferSource): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function cvContentSha256Hex(plain: string): Promise<string> {
  const normalized = plain
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return sha256ToHex(new TextEncoder().encode(normalized));
}

/** Raw file bytes; returns null if hashing fails so parse can still complete. */
async function cvFileSha256Hex(bytes: Uint8Array): Promise<string | null> {
  try {
    return await sha256ToHex(bytes);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[process-cv] cv_file_sha256 failed:", msg);
    return null;
  }
}

async function extractPlainText(
  bytes: Uint8Array,
  mime: string | null,
  originalFilename: string,
): Promise<string> {
  const lower = originalFilename.toLowerCase();
  const m = (mime ?? "").toLowerCase();
  const isDocx =
    lower.endsWith(".docx") ||
    m.includes("wordprocessingml") ||
    m === "application/msword";

  if (isDocx) {
    const result = await mammoth.extractRawText({
      arrayBuffer: toArrayBuffer(bytes),
    });
    return (result.value ?? "").trim();
  }

  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return (text ?? "").trim();
}

function safeParseParsedResume(raw: string): ParsedResume | null {
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const skillsRaw = o.skills;
    const skills = Array.isArray(skillsRaw)
      ? skillsRaw.filter((s): s is string => typeof s === "string")
      : [];
    const exp = o.experienceYears;
    let experienceYears: number | null = null;
    if (typeof exp === "number" && !Number.isNaN(exp)) experienceYears = exp;
    else if (typeof exp === "string" && exp.trim() !== "") {
      const n = parseFloat(exp);
      if (!Number.isNaN(n)) experienceYears = n;
    }
    const gpaRaw = o.gpa;
    let gpa: string | null = null;
    if (typeof gpaRaw === "number" && Number.isFinite(gpaRaw)) {
      gpa = String(gpaRaw);
    } else if (typeof gpaRaw === "string" && gpaRaw.trim()) {
      gpa = gpaRaw.trim();
    }
    return {
      name: typeof o.name === "string" ? o.name : null,
      email: typeof o.email === "string" ? o.email : null,
      phone: typeof o.phone === "string" ? o.phone : null,
      role: typeof o.role === "string" ? o.role : null,
      experienceYears,
      skills,
      degree: typeof o.degree === "string" ? o.degree : null,
      school: typeof o.school === "string" ? o.school : null,
      experienceSummary:
        typeof o.experienceSummary === "string" ? o.experienceSummary : null,
      englishLevel:
        typeof o.englishLevel === "string" && o.englishLevel.trim()
          ? o.englishLevel.trim()
          : typeof o.english === "string" && o.english.trim()
            ? o.english.trim()
            : null,
      gpa,
    };
  } catch {
    return null;
  }
}

type LlmRoute = {
  url: string;
  apiKey: string;
  model: string;
  errorLabel: string;
};

function resolveLlmRoute(): LlmRoute {
  const gatewayKey = Deno.env.get("AI_GATEWAY_API_KEY")?.trim();
  if (gatewayKey) {
    const model =
      Deno.env.get("LLM_MODEL")?.trim() ||
      Deno.env.get("AI_GATEWAY_MODEL")?.trim() ||
      DEFAULT_AI_GATEWAY_MODEL;
    return {
      url: "https://ai-gateway.vercel.sh/v1/chat/completions",
      apiKey: gatewayKey,
      model,
      errorLabel: "AI Gateway",
    };
  }

  // const xaiKey = Deno.env.get("XAI_API_KEY")?.trim();
  // if (xaiKey) {
  //   const model = Deno.env.get("XAI_MODEL")?.trim() || "grok-2-1212";
  //   return {
  //     url: "https://api.x.ai/v1/chat/completions",
  //     apiKey: xaiKey,
  //     model,
  //     errorLabel: "xAI",
  //   };
  // }

  throw new Error(
    "No LLM credentials: set AI_GATEWAY_API_KEY (Vercel AI Gateway) or XAI_API_KEY (direct xAI API).",
  );
}

async function grokParseResume(
  plainText: string,
): Promise<ParsedResume | null> {
  const route = resolveLlmRoute();
  const system = `You extract structured candidate data from resume text. Respond with a single JSON object only, no markdown, with keys:
name (string|null), email (string|null), phone (string|null), role (string|null), experienceYears (number|null), skills (string array), degree (string|null), school (string|null), experienceSummary (string|null), englishLevel (string|null), gpa (string|null).
Use null when unknown. skills should be concise skill tokens. experienceYears is total years of professional experience if inferable. englishLevel should summarize language proficiency if stated (e.g. IELTS 7.5, Fluent English). gpa should be numeric grade or scale if clearly stated (e.g. 3.7/4.0).`;

  async function callApi(useJsonObjectFormat: boolean): Promise<string | null> {
    const body: Record<string, unknown> = {
      model: route.model,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: `Resume text:\n\n${plainText.slice(0, 120_000)}`,
        },
      ],
      temperature: 0.1,
    };
    if (useJsonObjectFormat) {
      body.response_format = { type: "json_object" };
    }

    const res = await fetch(route.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${route.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(
        `${route.errorLabel} error ${res.status}: ${errText.slice(0, 500)}`,
      );
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    return typeof content === "string" ? content : null;
  }

  let content: string | null = null;
  try {
    content = await callApi(true);
  } catch {
    // e.g. json_object unsupported for some models
  }
  if (!content) {
    content = await callApi(false);
  }
  if (!content) return null;
  return safeParseParsedResume(content);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const auth = await requireAdmin(req.headers.get("Authorization"));
  if (!auth.ok) {
    return jsonResponse({ error: auth.message }, auth.status);
  }

  let candidateId: string;
  try {
    const json = await req.json();
    candidateId = typeof json.candidateId === "string" ? json.candidateId : "";
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }
  if (!candidateId) {
    return jsonResponse({ error: "candidateId required" }, 400);
  }

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey);

  const { data: row, error: fetchErr } = await admin
    .from("candidates")
    .select(
      "id, parsing_status, cv_storage_path, mime_type, original_filename, job_opening_id",
    )
    .eq("id", candidateId)
    .maybeSingle();

  if (fetchErr || !row) {
    return jsonResponse({ error: "Candidate not found" }, 404);
  }

  if (row.parsing_status === "completed") {
    return jsonResponse({
      ok: true,
      skipped: true,
      reason: "already_completed",
    });
  }
  if (row.parsing_status === "processing") {
    return jsonResponse({
      ok: true,
      skipped: true,
      reason: "already_processing",
    });
  }

  const { data: locked, error: lockErr } = await admin
    .from("candidates")
    .update({ parsing_status: "processing", parsing_error: null })
    .eq("id", candidateId)
    .in("parsing_status", ["pending", "failed"])
    .select("id")
    .maybeSingle();

  if (lockErr || !locked) {
    return jsonResponse({ ok: true, skipped: true, reason: "race_or_state" });
  }

  try {
    const { data: fileBlob, error: dlErr } = await admin.storage
      .from(BUCKET)
      .download(row.cv_storage_path);

    if (dlErr || !fileBlob) {
      throw new Error(dlErr?.message ?? "Download failed");
    }

    const ab = await fileBlob.arrayBuffer();
    const bytes = new Uint8Array(ab);
    const cvFileSha256 = await cvFileSha256Hex(bytes);

    const plain = await extractPlainText(
      bytes,
      row.mime_type,
      row.original_filename,
    );

    if (!plain || plain.length < 20) {
      throw new Error("Could not extract enough text from the document");
    }

    const cvContentSha256 = await cvContentSha256Hex(plain);

    const parsed = await grokParseResume(plain);
    if (!parsed) {
      throw new Error("Model returned no parseable JSON");
    }

    const candidateName = parsed.name || "Unknown_Candidate";
    const sanitizedName = sanitizeFolderName(candidateName);
    const timestamp = getFormattedTimestamp();
    const uuidv8 = newUuidV8();
    const candidateFolder = `${sanitizedName}_${timestamp}_${uuidv8}`;

    const originalFilename = row.original_filename || "resume.pdf";
    const extIdx = originalFilename.lastIndexOf(".");
    const ext = extIdx !== -1 ? originalFilename.substring(extIdx) : ".pdf";
    const nameWithoutExt =
      extIdx !== -1 ? originalFilename.substring(0, extIdx) : originalFilename;
    const sanitizedFilename = sanitizeFolderName(nameWithoutExt);
    const newFilename = `${sanitizedFilename}_v1_${timestamp}${ext}`;

    let jobFolder = row.job_opening_id || "Job_Opening";
    const pathParts = (row.cv_storage_path || "").split("/");
    if (pathParts.length > 1) {
      jobFolder = pathParts[0];
    }
    const newPath = `${jobFolder}/${candidateFolder}/${newFilename}`;

    const { error: moveErr } = await admin.storage
      .from(BUCKET)
      .move(row.cv_storage_path, newPath);

    if (moveErr) {
      throw new Error(`Failed to move CV file in storage: ${moveErr.message}`);
    }

    const { error: upErr } = await admin
      .from("candidates")
      .update({
        parsing_status: "completed",
        parsing_error: null,
        parsed_payload: JSON.parse(JSON.stringify(parsed)) as Record<
          string,
          unknown
        >,
        name: parsed.name,
        role: parsed.role,
        experience_years: parsed.experienceYears,
        skills: parsed.skills.length ? parsed.skills : [],
        degree: parsed.degree,
        school: parsed.school,
        cv_content_sha256: cvContentSha256,
        cv_file_sha256: cvFileSha256,
        cv_storage_path: newPath,
      })
      .eq("id", candidateId);

    if (upErr) throw new Error(upErr.message);

    return jsonResponse({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await admin
      .from("candidates")
      .update({ parsing_status: "failed", parsing_error: msg })
      .eq("id", candidateId);
    return jsonResponse({ error: msg }, 500);
  }
});
