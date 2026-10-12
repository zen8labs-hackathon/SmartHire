/**
 * F0.2 — navigation by work. Pure, permission-driven menu so it can be
 * snapshot-tested per role (08 · PM-01). Items whose route is not built yet
 * are marked `ready: false` and are never rendered.
 */
export type NavIcon =
  | "dashboard"
  | "stats"
  | "positions"
  | "candidates"
  | "talent"
  | "pipelines"
  | "probation"
  | "users"
  | "chapters"
  | "templates";

export type NavItem = {
  id: string;
  label: string;
  href: string;
  icon: NavIcon;
  ready: boolean;
};

export type NavGroup = { id: string; label: string; items: NavItem[] };

export type NavViewer = {
  isHr: boolean;
  isChapterHead: boolean;
};

const ITEMS: Record<string, NavItem & { show: (v: NavViewer) => boolean }> = {
  dashboard: { id: "dashboard", label: "Dashboard", href: "/dashboard", icon: "dashboard", ready: true, show: () => true },
  stats: { id: "stats", label: "Statistic", href: "/admin", icon: "stats", ready: true, show: (v) => v.isHr },
  positions: { id: "positions", label: "Position Management", href: "/admin/jd", icon: "positions", ready: true, show: () => true },
  positions2: { id: "positions2", label: "Position Management 2", href: "/admin/position-management-2", icon: "positions", ready: true, show: () => true },
  candidates: { id: "candidates", label: "Candidates", href: "/admin/candidates", icon: "candidates", ready: true, show: (v) => v.isHr },
  talent: { id: "talent", label: "Talent pool", href: "/admin/talent-pool", icon: "talent", ready: false, show: (v) => v.isHr },
  pipelines: { id: "pipelines", label: "Pipelines", href: "/admin/pipelines", icon: "pipelines", ready: true, show: (v) => v.isHr },
  probation: { id: "probation", label: "Probation", href: "/admin/probation", icon: "probation", ready: false, show: (v) => v.isHr || v.isChapterHead },
  users: { id: "users", label: "Users", href: "/admin/users", icon: "users", ready: true, show: (v) => v.isHr },
  chapters: { id: "chapters", label: "Chapters", href: "/admin/chapters", icon: "chapters", ready: true, show: (v) => v.isHr },
  templates: { id: "templates", label: "Templates", href: "/admin/evaluation-template", icon: "templates", ready: true, show: (v) => v.isHr },
};

const GROUPS: { id: string; label: string; items: string[] }[] = [
  { id: "work", label: "Work", items: ["dashboard", "stats", "positions", "positions2", "candidates", "talent", "pipelines", "probation"] },
  { id: "setup", label: "Setup", items: ["users", "chapters", "templates"] },
];

export function buildMenu(viewer: NavViewer): NavGroup[] {
  return GROUPS.map((g) => ({
    id: g.id,
    label: g.label,
    items: g.items
      .map((id) => ITEMS[id])
      .filter((i) => i.ready && i.show(viewer))
      .map(({ show: _show, ...item }) => item),
  })).filter((g) => g.items.length > 0);
}

export function isNavActive(href: string, pathname: string): boolean {
  if (href === "/dashboard" || href === "/admin") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Scope shown in the header breadcrumb (F0.2). */
export function scopeLabel(
  viewer: NavViewer,
  chapterNames: string[],
): string {
  if (viewer.isHr) return "All chapters";
  if (chapterNames.length === 1) return chapterNames[0];
  if (chapterNames.length > 1) return "My chapters";
  return "Shared with you";
}
