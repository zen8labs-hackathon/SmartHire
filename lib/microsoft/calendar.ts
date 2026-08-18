import { getGraphClient } from "@/lib/microsoft/graph-client";

export type GraphCalendarAttendee = { email: string; name?: string | null };

export type CreateCalendarEventInput = {
  organizerMailbox: string;
  subject: string;
  bodyHtml: string;
  startsAt: Date;
  endsAt: Date;
  location: string | null;
  attendees: GraphCalendarAttendee[];
};

export type UpdateCalendarEventInput = {
  organizerMailbox: string;
  graphEventId: string;
  subject: string;
  bodyHtml: string;
  startsAt: Date;
  endsAt: Date;
  location: string | null;
  attendees: GraphCalendarAttendee[];
};

function toGraphAttendees(attendees: GraphCalendarAttendee[]) {
  return attendees.map((a) => ({
    emailAddress: { address: a.email, name: a.name ?? a.email },
    type: "required",
  }));
}

function toGraphDateTime(date: Date) {
  return { dateTime: date.toISOString(), timeZone: "UTC" };
}

/**
 * Creates a plain (non-Teams-online-meeting) calendar event on
 * `organizerMailbox` -- application-permission Graph flow, same
 * `MS_GRAPH_*` app registration as `lib/microsoft/mail.ts`, just with the
 * `Calendars.ReadWrite` application permission additionally consented.
 * Graph pushes the event onto every attendee's own calendar; no per-attendee
 * call needed.
 */
export async function createCalendarEvent(
  input: CreateCalendarEventInput,
): Promise<{ graphEventId: string }> {
  const client = getGraphClient();
  const response = await client
    .api(`/users/${encodeURIComponent(input.organizerMailbox)}/events`)
    .post({
      subject: input.subject,
      body: { contentType: "HTML", content: input.bodyHtml },
      start: toGraphDateTime(input.startsAt),
      end: toGraphDateTime(input.endsAt),
      location: input.location ? { displayName: input.location } : undefined,
      attendees: toGraphAttendees(input.attendees),
      isOnlineMeeting: false,
    });
  const graphEventId = response?.id;
  if (!graphEventId) {
    throw new Error("Microsoft Graph did not return an event id.");
  }
  return { graphEventId };
}

/** Replaces subject/time/location/attendees on an already-created event (reschedule detail edits, interviewer add/remove). */
export async function updateCalendarEvent(
  input: UpdateCalendarEventInput,
): Promise<void> {
  const client = getGraphClient();
  await client
    .api(
      `/users/${encodeURIComponent(input.organizerMailbox)}/events/${encodeURIComponent(input.graphEventId)}`,
    )
    .patch({
      subject: input.subject,
      body: { contentType: "HTML", content: input.bodyHtml },
      start: toGraphDateTime(input.startsAt),
      end: toGraphDateTime(input.endsAt),
      location: input.location ? { displayName: input.location } : undefined,
      attendees: toGraphAttendees(input.attendees),
    });
}

/** Cancels via Graph's `/cancel` action (not DELETE) so attendees get a cancellation notice, not a silent disappearance. */
export async function cancelCalendarEvent(
  organizerMailbox: string,
  graphEventId: string,
): Promise<void> {
  const client = getGraphClient();
  await client
    .api(
      `/users/${encodeURIComponent(organizerMailbox)}/events/${encodeURIComponent(graphEventId)}/cancel`,
    )
    .post({});
}
