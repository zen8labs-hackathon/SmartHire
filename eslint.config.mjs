import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "react/no-unescaped-entities": "off",
    }
  },
  // Design system gold rule: gold-50..600 is a fill only. Gold text must use
  // --gold-text (gold-700); white text must never sit on a gold fill.
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "Literal[value=/(^|[\\s:\"'`])(text|border|ring|outline|fill|stroke)-(z8-)?gold-(50|100|200|300|400|500|600)\\b/]",
          message:
            "Gold is a fill only. Use text-gold-text (gold-700) for gold text; never gold as text, border, ring, or icon colour.",
        },
        {
          selector:
            "Literal[value=/(bg-(highlight|brand-gold|(z8-)?gold-(300|400|500))\\b[^\"'`]*\\btext-white\\b|\\btext-white\\b[^\"'`]*bg-(highlight|brand-gold|(z8-)?gold-(300|400|500))\\b)/]",
          message: "Use text-highlight-foreground (#142F21) on gold fills, not text-white.",
        },
      ],
    },
  },
  // Legacy/new boundary: the "-2" screens must not depend on legacy UI that is
  // removed at cutover. Move shared pieces into the "-2" tree instead.
  {
    files: ["app/admin/*-2/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/components/admin/jd/*", "@/components/admin/candidates/*", "@/app/admin/jd/*", "@/app/admin/pipelines/*"],
              message: "Legacy UI is removed at cutover; do not import it from the -2 screens.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
