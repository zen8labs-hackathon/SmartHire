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
  const docxResizeObserverRef = useRef<ResizeObserver | null>(null);

  const loadCv = useCallback(async (url: string) => {
    docxResizeObserverRef.current?.disconnect();
    docxResizeObserverRef.current = null;
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
          try {
            const { renderAsync } = await import("docx-preview");
            await renderAsync(blob, container, undefined, {
              className: "docx-preview",
              // Keep the docx's own page width (e.g. 816px for Letter) --
              // `ignoreWidth: true` makes docx-preview reflow-measure the
              // whole document at the container's width, which hangs on
              // multi-MB files with many embedded fonts (observed on a real
              // 6MB/23-font resume). Scale the already-rendered page down
              // with CSS via ResizeObserver below instead.
              ignoreWidth: false,
              ignoreHeight: true,
              ignoreFonts: false,
              breakPages: true,
              useBase64URL: true,
            });

            // The rendered page (fixed physical width, e.g. 816px for
            // Letter) is wider than some preview columns (e.g. the ~360px
            // evaluation-page split view). Shrink it to fit with a CSS
            // transform, sized from ResizeObserver's already-computed
            // layout rather than a manual `scrollWidth`/`clientWidth` read
            // -- that forces an immediate synchronous reflow of the whole
            // page while embedded @font-face resources are still loading,
            // which is what hung on the file above. ResizeObserver instead
            // reports geometry the browser already settled on its own
            // schedule, so it can't reintroduce that hang.
            const page = container.querySelector<HTMLElement>(".docx-preview");
            if (page) {
              const wrapper = page.parentElement;

              const observer = new ResizeObserver((entries) => {
                const entry = entries[0];
                const available = container.parentElement?.clientWidth;
                // `contentRect` excludes the page's own padding (72pt/side);
                // `borderBoxSize` is the full box that padding is part of,
                // which is what actually needs to fit -- using contentRect
                // here undershoots the scale and still clips the padded
                // edges. Reading `offsetWidth`/`offsetHeight` as a fallback
                // is safe here (unlike the scrollWidth read that hung
                // earlier): this callback only runs once the browser has
                // already computed layout, so it's not a new forced reflow.
                const borderBox = entry?.borderBoxSize?.[0];
                const natural = borderBox?.inlineSize ?? page.offsetWidth;
                const naturalHeight = borderBox?.blockSize ?? page.offsetHeight;
                if (!entry || !available || !natural) return;
                const scale = Math.min(1, available / natural);
                page.style.transformOrigin = "top left";
                if (scale < 1) {
                  // docx-preview's own wrapper centers the page horizontally
                  // (`align-items: center`) using its *pre-transform* box
                  // size, so scaling it down without neutralizing that
                  // leaves it centered around the wrong (unscaled) midpoint
                  // -- clipping off its left edge instead of sitting flush
                  // against it. Only override this once scaling actually
                  // applies; a page that already fits keeps its normal
                  // centering.
                  if (wrapper) wrapper.style.alignItems = "flex-start";
                  page.style.transform = `scale(${scale})`;
                  container.style.width = `${available}px`;
                  container.style.height = `${naturalHeight * scale}px`;
                  container.style.overflow = "hidden";
                } else {
                  if (wrapper) wrapper.style.alignItems = "";
                  page.style.transform = "";
                  container.style.width = "";
                  container.style.height = "";
                  container.style.overflow = "";
                }
              });
              observer.observe(page);
              docxResizeObserverRef.current = observer;
            }
          } catch (err) {
            setMode("error");
            setErrorMsg(
              err instanceof Error ? err.message : "Failed to render DOCX preview.",
            );
          }
        });
      } else {
        setMode("pdf");
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

  useEffect(() => {
    return () => docxResizeObserverRef.current?.disconnect();
  }, []);

  useEffect(() => {
    if (mode !== "pdf") return;

    const iframe = iframeRef.current;
    if (!iframe) return;

    try {
      iframe.contentWindow?.location.replace(cvUrl);
    } catch {
      iframe.src = cvUrl;
    }
  }, [cvUrl, mode]);

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
        <div ref={docxContainerRef} />
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
