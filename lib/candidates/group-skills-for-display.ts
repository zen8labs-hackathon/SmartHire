export type SkillBucketId = "languages" | "frameworks" | "tools" | "other";

const BUCKET_ORDER: SkillBucketId[] = [
  "languages",
  "frameworks",
  "tools",
  "other",
];

const BUCKET_LABELS: Record<SkillBucketId, string> = {
  languages: "Languages",
  frameworks: "Frameworks & libraries",
  tools: "Tools & platforms",
  other: "Other",
};

/** Lowercase exact keys and common aliases for heuristic grouping (display only). */
const LANGUAGES = new Set(
  [
    "javascript",
    "js",
    "typescript",
    "ts",
    "python",
    "py",
    "java",
    "kotlin",
    "scala",
    "swift",
    "objective-c",
    "objc",
    "dart",
    "rust",
    "ruby",
    "php",
    "perl",
    "lua",
    "haskell",
    "elixir",
    "erlang",
    "clojure",
    "f#",
    "fsharp",
    "c",
    "c++",
    "cpp",
    "c#",
    "csharp",
    "go",
    "golang",
    "solidity",
    "matlab",
    "r",
    "julia",
    "groovy",
    "cobol",
    "fortran",
    "assembly",
    "asm",
    "vba",
    "delphi",
    "pascal",
  ].map((s) => s.toLowerCase()),
);

const FRAMEWORKS = new Set(
  [
    "react",
    "react.js",
    "reactjs",
    "react native",
    "vue",
    "vue.js",
    "vuejs",
    "angular",
    "angularjs",
    "svelte",
    "sveltekit",
    "next.js",
    "nextjs",
    "nuxt",
    "nuxt.js",
    "remix",
    "gatsby",
    "ember",
    "backbone",
    "jquery",
    "express",
    "express.js",
    "nestjs",
    "nest.js",
    "fastify",
    "koa",
    "hapi",
    "django",
    "flask",
    "fastapi",
    "tornado",
    "spring",
    "spring boot",
    "springboot",
    "hibernate",
    "laravel",
    "symfony",
    "rails",
    "ruby on rails",
    "ror",
    "asp.net",
    "aspnet",
    ".net",
    "dotnet",
    "blazor",
    "electron",
    "tauri",
    "expo",
    "redux",
    "mobx",
    "zustand",
    "recoil",
    "rxjs",
    "tailwind",
    "tailwindcss",
    "bootstrap",
    "material-ui",
    "mui",
    "chakra",
    "antd",
    "shadcn",
    "three.js",
    "threejs",
    "d3",
    "d3.js",
    "graphql",
    "apollo",
    "relay",
    "trpc",
    "prisma",
    "typeorm",
    "sequelize",
    "mongoose",
    "jest",
    "mocha",
    "cypress",
    "playwright",
    "vitest",
    "testing library",
    "storybook",
    "webpack",
    "rollup",
    "vite",
    "esbuild",
    "parcel",
    "babel",
    "eslint",
    "prettier",
    "turbo",
    "nx",
    "lerna",
    "pnpm",
    "yarn",
    "npm",
  ].map((s) => s.toLowerCase()),
);

const TOOLS = new Set(
  [
    "docker",
    "kubernetes",
    "k8s",
    "helm",
    "terraform",
    "ansible",
    "pulumi",
    "jenkins",
    "gitlab ci",
    "github actions",
    "circleci",
    "travis",
    "teamcity",
    "bamboo",
    "argo",
    "spinnaker",
    "aws",
    "amazon web services",
    "gcp",
    "google cloud",
    "azure",
    "cloudflare",
    "vercel",
    "netlify",
    "heroku",
    "digitalocean",
    "linode",
    "nginx",
    "apache",
    "kafka",
    "rabbitmq",
    "redis",
    "memcached",
    "mongodb",
    "mongo",
    "postgres",
    "postgresql",
    "mysql",
    "mariadb",
    "sqlite",
    "dynamodb",
    "cassandra",
    "elasticsearch",
    "opensearch",
    "splunk",
    "datadog",
    "grafana",
    "prometheus",
    "loki",
    "kibana",
    "snowflake",
    "bigquery",
    "redshift",
    "databricks",
    "airflow",
    "dbt",
    "tableau",
    "power bi",
    "looker",
    "git",
    "github",
    "gitlab",
    "bitbucket",
    "svn",
    "jira",
    "confluence",
    "linear",
    "notion",
    "slack",
    "figma",
    "sketch",
    "photoshop",
    "illustrator",
    "linux",
    "unix",
    "ubuntu",
    "debian",
    "windows server",
    "bash",
    "shell",
    "zsh",
    "powershell",
    "vim",
    "emacs",
    "sql",
    "nosql",
    "openapi",
    "swagger",
    "postman",
    "insomnia",
    "oauth",
    "oidc",
    "saml",
    "ldap",
    "okta",
    "auth0",
    "stripe",
    "sentry",
    "launchdarkly",
  ].map((s) => s.toLowerCase()),
);

function normalizeToken(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Phrase appears as a whole token (avoids `java` inside `javascript`). */
function matchesPhrase(haystack: string, needle: string): boolean {
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  if (h === n) return true;
  if (n.length < 2) return false;
  const esc = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`, "i").test(haystack);
}

function bucketFromPhraseSet(
  skill: string,
  set: Set<string>,
  minPhraseLen: number,
): boolean {
  for (const k of set) {
    if (k.length < minPhraseLen) continue;
    if (matchesPhrase(skill, k)) return true;
  }
  return false;
}

/** Single skill → bucket. Priority: languages → frameworks → tools → other. */
export function categorizeSkill(skill: string): SkillBucketId {
  const raw = skill.trim();
  if (!raw) return "other";
  const n = normalizeToken(raw);

  if (LANGUAGES.has(n)) return "languages";
  if (FRAMEWORKS.has(n)) return "frameworks";
  if (TOOLS.has(n)) return "tools";

  /** Split composite labels like "React / Node". */
  const parts = n.split(/\s*[/|,;]+\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length > 1) {
    for (const p of parts) {
      if (LANGUAGES.has(p)) return "languages";
    }
    for (const p of parts) {
      if (FRAMEWORKS.has(p)) return "frameworks";
    }
    for (const p of parts) {
      if (TOOLS.has(p)) return "tools";
    }
  }

  if (bucketFromPhraseSet(raw, LANGUAGES, 2)) return "languages";
  if (bucketFromPhraseSet(raw, FRAMEWORKS, 3)) return "frameworks";
  if (bucketFromPhraseSet(raw, TOOLS, 3)) return "tools";

  return "other";
}

export type SkillDisplaySection = {
  id: SkillBucketId;
  label: string;
  skills: string[];
};

/**
 * Groups flat skill strings for CV preview. Dedupes case-insensitively, preserves
 * first-seen casing within each bucket, and orders sections Languages →
 * Frameworks → Tools → Other.
 */
export function groupSkillsForDisplay(skills: string[]): SkillDisplaySection[] {
  const buckets: Record<SkillBucketId, string[]> = {
    languages: [],
    frameworks: [],
    tools: [],
    other: [],
  };
  const seen = new Set<string>();

  for (const raw of skills) {
    const s = raw.trim();
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const id = categorizeSkill(s);
    buckets[id].push(s);
  }

  return BUCKET_ORDER.filter((id) => buckets[id].length > 0).map((id) => ({
    id,
    label: BUCKET_LABELS[id],
    skills: buckets[id],
  }));
}
