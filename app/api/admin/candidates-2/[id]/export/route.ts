import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { requireHrForRequest } from "@/lib/admin/require-staff-request";
import { getPool } from "@/lib/db/config/client";
import { getCandidate2Detail } from "@/lib/db/candidates-detail2";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ id: string }> };

/** Standard PDF fonts are WinAnsi only: fold Vietnamese diacritics and drop anything else unencodable. */
function ascii(v: string | null | undefined): string {
  return (v ?? "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7e]/g, "?");
}

const fmtDate = (v: string | null | undefined) => (v ? String(v).slice(0, 10) : "—");

/**
 * Profile export (UC-02-05): a PDF of the candidate's profile and applications.
 * Internal notes, evaluations and salary are deliberately never read here.
 */
export async function GET(request: Request, { params }: RouteContext) {
  const auth = await requireHrForRequest(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!id || !UUID_RE.test(id)) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  try {
    const detail = await getCandidate2Detail(getPool(), id);
    if (!detail) return Response.json({ error: "Not found." }, { status: 404 });
    const c = detail.candidate;

    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const W = 595;
    const H = 842;
    const M = 48;
    let page = pdf.addPage([W, H]);
    let y = H - M;

    const ensure = (h: number) => {
      if (y - h < M) {
        page = pdf.addPage([W, H]);
        y = H - M;
      }
    };
    const wrap = (text: string, f: PDFFont, size: number, max: number): string[] => {
      const out: string[] = [];
      let line = "";
      for (const word of text.split(/\s+/).filter(Boolean)) {
        const next = line ? `${line} ${word}` : word;
        if (f.widthOfTextAtSize(next, size) > max && line) {
          out.push(line);
          line = word;
        } else line = next;
      }
      if (line) out.push(line);
      return out.length ? out : [""];
    };
    const text = (t: string, f: PDFFont, size: number, x = M, color = rgb(0.1, 0.1, 0.1)) => {
      for (const l of wrap(ascii(t), f, size, W - M - x)) {
        ensure(size + 4);
        y -= size + 4;
        page.drawText(l, { x, y, size, font: f, color });
      }
    };
    const heading = (t: string) => {
      y -= 10;
      ensure(30);
      text(t, bold, 12, M, rgb(0.15, 0.25, 0.55));
      page.drawLine({ start: { x: M, y: y - 3 }, end: { x: W - M, y: y - 3 }, thickness: 0.5, color: rgb(0.8, 0.8, 0.85) });
      y -= 4;
    };
    const field = (label: string, value: string | null | undefined) => {
      ensure(18);
      const lines = wrap(ascii(value) || "—", font, 10, W - M - 170);
      lines.forEach((l, i) => {
        ensure(14);
        y -= 14;
        if (i === 0) page.drawText(ascii(label), { x: M, y, size: 10, font: bold, color: rgb(0.35, 0.35, 0.4) });
        page.drawText(l, { x: M + 122, y, size: 10, font, color: rgb(0.1, 0.1, 0.1) });
      });
    };

    text(c.name ?? "Unnamed candidate", bold, 20);
    text(c.role ?? "", font, 11, M, rgb(0.35, 0.35, 0.4));

    heading("Contact");
    field("Email", c.email);
    field("Phone", c.phone);
    field("Date of birth", fmtDate(c.date_of_birth));
    field("Source", [c.source, c.source_other].filter(Boolean).join(" · "));

    heading("Profile");
    field("Experience", c.experience_years != null ? `${c.experience_years} years` : null);
    field("English", c.english_level);
    field("Education", [c.degree, c.education].filter(Boolean).join(" · "));
    field("Skills", (c.skills ?? []).join(", "));
    field("Tags", (c.tags ?? []).join(", "));
    field("Rehire", c.rehire_status ? c.rehire_status.replace("_", " ") : null);

    heading("Applications");
    if (!detail.applications.length) field("", "No applications yet.");
    for (const a of detail.applications) {
      y -= 4;
      text(a.title ?? "Talent pool", bold, 10.5);
      const parts = [
        `Added ${fmtDate(a.created_at)}`,
        a.stage ? `Stage: ${a.stage}` : null,
        a.hired_at ? `Hired ${fmtDate(a.hired_at)}` : a.ended_at ? `Ended ${fmtDate(a.ended_at)}${a.end_reason ? ` (${a.end_reason})` : ""}` : null,
        a.score != null ? `AI match: ${a.score}` : null,
      ].filter(Boolean);
      text(parts.join("  |  "), font, 9.5, M + 8, rgb(0.35, 0.35, 0.4));
    }

    const footer = `Exported ${new Date().toISOString().slice(0, 10)} - confidential, internal notes not included`;
    pdf.getPages().forEach((p, i, all) => {
      p.drawText(`${footer}   ${i + 1}/${all.length}`, { x: M, y: 24, size: 8, font, color: rgb(0.5, 0.5, 0.55) });
    });

    const bytes = await pdf.save();
    const base = ascii(c.name ?? "candidate").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "candidate";
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${base}-profile.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to export profile.";
    return Response.json({ error: message }, { status: 500 });
  }
}
