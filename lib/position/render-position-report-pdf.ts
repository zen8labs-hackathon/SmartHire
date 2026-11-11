import { PDFDocument, rgb, type PDFFont } from "pdf-lib";
import { tryEmbedNotoSans } from "@/lib/evaluation/noto-fonts-for-pdf";
import type { PositionReport } from "./get-position-report";

export async function renderPositionReportPdf(
  report: PositionReport,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const fonts = await tryEmbedNotoSans(pdf);

  if (!fonts) {
    throw new Error("Could not load Vietnamese fonts.");
  }

  const { regular, bold } = fonts;

  pdf.setTitle(`Position report - ${report.position.title}`);
  pdf.setCreator("SmartHire");

  const W = 842;
  const H = 595;
  const M = 36;
  const BOTTOM = 42;
  const WIDTH = W - M * 2;
  const FONT_SIZE = 9;
  const LINE_HEIGHT = 13;
  const HEADER_HEIGHT = 25;

  let page = pdf.addPage([W, H]);
  let y = H - M;

  const newPage = () => {
    page = pdf.addPage([W, H]);
    y = H - M;
  };

  const ensure = (height: number) => {
    if (y - height < BOTTOM) newPage();
  };

  const dateFormatter = new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const formatDate = (value: string) =>
    dateFormatter.format(new Date(value));

  const wrap = (
    value: string,
    font: PDFFont,
    size: number,
    maxWidth: number,
  ): string[] => {
    const text = value
      .normalize("NFC")
      .replace(/\r\n?/g, "\n")
      .replace(/\t/g, " ")
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");

    const lines: string[] = [];

    for (const paragraph of text.split("\n")) {
      let line = "";

      for (const char of paragraph) {
        const next = line + char;

        if (line && font.widthOfTextAtSize(next, size) > maxWidth) {
          const space = line.lastIndexOf(" ");

          if (space > 0) {
            lines.push(line.slice(0, space));
            line = line.slice(space + 1) + char;
          } else {
            lines.push(line);
            line = char === " " ? "" : char;
          }
        } else {
          line = next;
        }
      }

      lines.push(line.trimEnd());
    }

    return lines.length ? lines : [""];
  };

  const text = (
    value: string,
    size = 10,
    font: PDFFont = regular,
  ) => {
    const lineHeight = size + 5;

    for (const line of wrap(value, font, size, WIDTH)) {
      ensure(lineHeight);

      page.drawText(line, {
        x: M,
        y: y - size,
        size,
        font,
        color: rgb(0.12, 0.18, 0.15),
      });

      y -= lineHeight;
    }
  };

  const section = (title: string) => {
    ensure(60);
    text(title, 14, bold);
    y -= 8;
  };

  const table = (
    headers: string[],
    widths: number[],
    rows: string[][],
  ) => {
    if (rows.length === 0) {
      text("Không có dữ liệu.");
      return;
    }

    const drawHeader = () => {
      ensure(HEADER_HEIGHT + LINE_HEIGHT + 12);

      page.drawRectangle({
        x: M,
        y: y - HEADER_HEIGHT,
        width: WIDTH,
        height: HEADER_HEIGHT,
        color: rgb(0.89, 0.94, 0.91),
      });

      let x = M;

      headers.forEach((label, index) => {
        page.drawText(label, {
          x: x + 6,
          y: y - 16,
          size: FONT_SIZE,
          font: bold,
          color: rgb(0.08, 0.25, 0.16),
        });

        x += widths[index];
      });

      y -= HEADER_HEIGHT;
    };

    drawHeader();

    rows.forEach((row, rowIndex) => {
      const cells = widths.map((width, index) =>
        wrap(row[index] ?? "—", regular, FONT_SIZE, width - 12),
      );

      const totalLines = Math.max(
        ...cells.map((cell) => cell.length),
      );

      let offset = 0;

      while (offset < totalLines) {
        const remainingHeight =
          (totalLines - offset) * LINE_HEIGHT + 12;

        const fullPageRowHeight =
          H - M - BOTTOM - HEADER_HEIGHT;

        // Giữ nguyên hàng nếu nó có thể nằm trọn trên một trang.
        if (
          remainingHeight > y - BOTTOM &&
          remainingHeight <= fullPageRowHeight
        ) {
          newPage();
          drawHeader();
        }

        if (y - BOTTOM < LINE_HEIGHT + 12) {
          newPage();
          drawHeader();
        }

        const capacity = Math.floor(
          (y - BOTTOM - 12) / LINE_HEIGHT,
        );

        const lineCount = Math.min(
          totalLines - offset,
          capacity,
        );

        const rowHeight = lineCount * LINE_HEIGHT + 12;

        if (rowIndex % 2 === 0) {
          page.drawRectangle({
            x: M,
            y: y - rowHeight,
            width: WIDTH,
            height: rowHeight,
            color: rgb(0.97, 0.98, 0.97),
          });
        }

        let x = M;

        cells.forEach((lines, index) => {
          lines
            .slice(offset, offset + lineCount)
            .forEach((line, lineIndex) => {
              page.drawText(line, {
                x: x + 6,
                y: y - 15 - lineIndex * LINE_HEIGHT,
                size: FONT_SIZE,
                font: regular,
                color: rgb(0.15, 0.18, 0.16),
              });
            });

          x += widths[index];
        });

        y -= rowHeight;

        page.drawLine({
          start: { x: M, y },
          end: { x: W - M, y },
          thickness: 0.4,
          color: rgb(0.82, 0.86, 0.83),
        });

        offset += lineCount;

        if (offset < totalLines) {
          newPage();
          drawHeader();
        }
      }
    });

    y -= 12;
  };

  text("BÁO CÁO TUYỂN DỤNG", 19, bold);
  text(report.position.title, 14, bold);
  text(`Position ID: ${report.position.id}`);
  text(
    `Chapter: ${
      report.position.chapters.map((chapter) => chapter.name).join(", ") ||
      "—"
    }`,
  );
  text(
    `Trạng thái: ${report.position.status} | ` +
    `Headcount: ${report.position.headcount ?? "—"} | ` +
    `Đã ghi nhận tuyển: ${report.position.hired}`,
  );
  text(`Thời điểm xuất: ${formatDate(report.generatedAt)} (UTC+7)`);
  y -= 12;

  section("1. Tổng quan trạng thái hiện tại");

  table(
    ["Chỉ số", "Số lượng"],
    [650, 120],
    [
      ["Tổng applications", String(report.summary.totalApplications)],
      ...report.summary.stages.map((stage) => [
        `Đang ở stage: ${stage.label}`,
        String(stage.current),
      ]),
      ["Đã dừng", String(report.summary.stopped)],
      ["Chưa xác định stage", String(report.summary.unassigned)],
    ],
  );

  newPage();
  section("2. Danh sách ứng viên");

  table(
    ["Ứng viên", "Nguồn", "Ngày thêm", "Stage hiện tại", "Tình trạng", "AI match"],
    [155, 90, 90, 225, 125, 85],
    report.applications.map((application) => [
      `${application.name}\n#${application.id.slice(0, 8)}`,
      application.source,
      formatDate(application.appliedAt),
      `${application.stage} / ${application.subStage}`,
      application.stopped
        ? "Đã dừng"
        : application.hiredAt
          ? "Đã ghi nhận tuyển"
          : "Đang tham gia",
      application.score != null
        ? String(application.score)
        : ({
            done: "—",
            scoring: "Đang chấm",
            error: "Lỗi",
            none: "Chưa chấm",
          }[application.scoring]),
    ]),
  );


  newPage();
  section("3. Lịch sử thay đổi stage");
  text("Chỉ bao gồm các thay đổi đã được hệ thống ghi nhận.", 9);
  y -= 8;

  table(
    ["Thời gian", "Ứng viên", "Từ", "Đến", "Người thực hiện", "Lý do"],
    [100, 140, 160, 160, 100, 110],
    report.history.map((event) => [
      formatDate(event.at),
      `${event.candidateName}\n#${event.applicationId.slice(0, 8)}`,
      `${event.fromStage} / ${event.fromSubStage}`,
      `${event.toStage} / ${event.toSubStage}`,
      event.actor,
      event.reason?.trim() || "—",
    ]),
  );

  const pages = pdf.getPages();

  pages.forEach((item, index) => {
    item.drawText("SmartHire | Báo cáo nội bộ", {
      x: M,
      y: 20,
      size: 8,
      font: regular,
      color: rgb(0.4, 0.45, 0.42),
    });

    const number = `${index + 1} / ${pages.length}`;

    item.drawText(number, {
      x: W - M - regular.widthOfTextAtSize(number, 8),
      y: 20,
      size: 8,
      font: regular,
      color: rgb(0.4, 0.45, 0.42),
    });
  });

  return pdf.save();
}
