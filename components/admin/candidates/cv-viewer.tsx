"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  /** Base cv-download API URL (without query params). */
  cvUrl: string;
  title: string;
  className?: string;
  style?: React.CSSProperties;
};

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function isDocx(mime: string): boolean {
  return mime === DOCX_MIME || mime.includes("wordprocessingml");
}

export function CvViewer({ cvUrl, title, className, style }: Props) {
  const [mode, setMode] = useState<"loading" | "pdf" | "docx" | "error">("loading");
  const [docxHtml, setDocxHtml] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const prevCvUrl = useRef("");
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const loadCv = useCallback(async (url: string) => {
    setMode("loading");
    setErrorMsg("");
    setDocxHtml("");

    try {
      const metaUrl = url + (url.includes("?") ? "&" : "?") + "meta=1";
      const res = await fetch(metaUrl);
      if (!res.ok) {
        setMode("error");
        setErrorMsg("Could not load CV info.");
        return;
      }
      const { mimeType } = (await res.json()) as { mimeType: string };

      if (isDocx(mimeType)) {
        const proxyUrl = url + (url.includes("?") ? "&" : "?") + "proxy=1";
        const fileRes = await fetch(proxyUrl);
        if (!fileRes.ok) {
          setMode("error");
          setErrorMsg("Could not download CV file.");
          return;
        }
        const arrayBuffer = await fileRes.arrayBuffer();
        const mammoth = (await import("mammoth")).default;
        const result = await mammoth.convertToHtml({ arrayBuffer });
        setDocxHtml(result.value);
        setMode("docx");
      } else {
        setMode("pdf");
        // Let the iframe load via the redirect-based URL directly.
        const iframe = iframeRef.current;
        if (iframe) {
          try {
            iframe.contentWindow?.location.replace(url);
          } catch {
            iframe.src = url;
          }
        }
      }
    } catch (err) {
      setMode("error");
      setErrorMsg(err instanceof Error ? err.message : "Failed to load CV.");
    }
  }, []);

  useEffect(() => {
    if (cvUrl === prevCvUrl.current) return;
    prevCvUrl.current = cvUrl;
    loadCv(cvUrl);
  }, [cvUrl, loadCv]);

  if (mode === "loading") {
    return (
      <div className={className} style={style}>
        <div className="flex items-center justify-center h-full text-muted text-sm">
          Loading CV…
        </div>
      </div>
    );
  }

  if (mode === "error") {
    return (
      <div className={className} style={style}>
        <div className="flex items-center justify-center h-full text-danger text-sm">
          {errorMsg || "Failed to load CV."}
        </div>
      </div>
    );
  }

  if (mode === "docx") {
    return (
      <div className={className} style={{ ...style, overflow: "auto" }}>
        <div
          className="p-6 bg-white text-black prose prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: docxHtml }}
        />
      </div>
    );
  }

  return (
    <iframe
      ref={iframeRef}
      title={title}
      className={className}
      style={style}
    />
  );
}
