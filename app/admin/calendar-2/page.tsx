import { redirect } from "next/navigation";
import { getRequestAuth } from "@/lib/admin/request-auth";
import { weekStart } from "@/lib/calendar/time";
import { isIsoDate } from "@/lib/calendar/validation";
import { CalendarApp } from "./cal-app";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Schedule ids are numeric today; accept any short, URL-safe id. */
const SESSION_RE = /^[\w-]{1,64}$/;

export default async function Calendar2Page({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { user, access } = await getRequestAuth();
  if (!user) redirect("/login?next=/admin/calendar-2");
  if (!access?.isStaff) redirect("/admin");
  const sp = await searchParams;
  const raw = typeof sp.people === "string" ? sp.people : "";
  const people = [...new Set(raw.split(",").map((s) => s.trim()))]
    .filter((id) => UUID_RE.test(id) && id !== access.userId)
    .slice(0, 3);
  // Deep links from notifications: ?week=<any date in the week>&session=<schedule id>.
  const week = typeof sp.week === "string" && isIsoDate(sp.week) ? weekStart(sp.week) : undefined;
  const session = typeof sp.session === "string" && SESSION_RE.test(sp.session) ? sp.session : undefined;
  return (
    <CalendarApp
      embedded
      viewer={{ userId: access.userId, name: access.username, role: access.role, isHr: access.isHr, isAdmin: access.isAdmin }}
      initialPeople={people}
      initialWeek={week}
      initialSession={session}
    />
  );
}
