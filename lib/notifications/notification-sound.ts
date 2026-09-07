"use client";

/** Chime played when a live notification arrives (see `use-notifications.ts`). */
const SOUND_URL = "/notification-sound.mp3";

let audio: HTMLAudioElement | null = null;

/**
 * Plays the notification chime for a just-arrived notification. Reuses one
 * `Audio` element, rewinding it so rapid-fire events still each play. No-ops
 * on the server and swallows the autoplay-policy rejection browsers raise
 * before the user has interacted with the page.
 */
export function playNotificationSound(): void {
  if (typeof window === "undefined" || typeof Audio === "undefined") return;

  try {
    if (!audio) {
      audio = new Audio(SOUND_URL);
      audio.volume = 0.5;
    }
    audio.currentTime = 0;
    void audio.play().catch(() => {
      // Autoplay blocked (no user gesture yet) -- nothing we can do, ignore.
    });
  } catch {
    // Audio unavailable in this environment -- ignore.
  }
}
