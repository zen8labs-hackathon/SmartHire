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
  const [errorMsg, setErrorMsg] = useState("");
  const prevCvUrl = useRef("");
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const docxContainerRef = useRef<HTMLDivElement>(null);

  const loadCv = useCallback(async (url: string) => {
    setMode("loading");
    setErrorMsg("");

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
        const blob = await fileRes.blob();
        setMode("docx");

        // Wait for the docx container to mount, then render into it.
        requestAnimationFrame(async () => {
          const container = docxContainerRef.current;
          if (!container) return;
          container.innerHTML = "";
          const { renderAsync } = await import("docx-preview");
          await renderAsync(blob, container, undefined, {
            className: "docx-preview",
            ignoreWidth: false,
            ignoreHeight: true,
            ignoreFonts: false,
            breakPages: true,
            useBase64URL: true,
          });
        });
      } else {
        setMode("pdf");
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
      <div
        className={className}
        style={{ ...style, overflow: "auto" }}
      >
        <div className="min-h-full bg-surface-secondary/40 px-3 py-4 md:px-4 md:py-5">
          <div ref={docxContainerRef} />
        </div>
        <style jsx global>{`
          .docx-preview-wrapper {
            padding: 0 !important;
            background: transparent !important;
            max-width: 100%;
          }

          .docx-preview {
            margin: 0 auto 20px !important;
            width: min(100%, 820px) !important;
            max-width: 100% !important;
            box-shadow: 0 8px 24px rgba(15, 23, 42, 0.1) !important;
            border: 1px solid rgba(148, 163, 184, 0.18) !important;
            border-radius: 14px !important;
            overflow: hidden;
            background: white !important;
          }

          .docx-preview:last-child {
            margin-bottom: 0 !important;
          }

          .docx-preview section {
            max-width: 100% !important;
          }
        `}</style>
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
