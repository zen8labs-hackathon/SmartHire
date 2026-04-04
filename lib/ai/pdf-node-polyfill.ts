/**
 * pdfjs-dist evaluates `new DOMMatrix()` at module load (canvas.js). Node on Vercel
 * has no DOMMatrix; pdf.js tries @napi-rs/canvas via createRequire, which often
 * fails once Next bundles the dependency graph. Install a small JS shim first.
 */
import CSSMatrix from "dommatrix";

if (typeof globalThis.DOMMatrix === "undefined") {
  (globalThis as unknown as { DOMMatrix: typeof CSSMatrix }).DOMMatrix =
    CSSMatrix;
}
