import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["workers/file-upload/file-upload.worker.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outfile: "dist/worker/file-upload.worker.js",
  packages: "external",
  alias: { "@": "." },
  logLevel: "info",
});
