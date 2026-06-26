import { newUuidV8 } from "@/lib/uuid-v8";

export function sanitizeFolderName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove accents for clean storage paths
    .replace(/[^\w\s.-]/g, "")      // Allow alphanumeric, space, dot, and dash
    .trim()
    .replace(/\s+/g, "_");          // Replace spaces with underscores
}

export function getFormattedTimestamp(date: Date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}_${hh}${min}${ss}`;
}

export function extractFolderNameFromPath(path: string): string | null {
  const parts = (path || "").split("/");
  if (parts.length === 3) {
    return parts[1] || null;
  }
  return null;
}
