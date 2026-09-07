import { afterEach, describe, expect, it, vi } from "vitest";

async function freshModule() {
  vi.resetModules();
  return import("@/lib/notifications/notification-sound");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("playNotificationSound", () => {
  it("no-ops without throwing when Audio is unavailable", async () => {
    const { playNotificationSound } = await freshModule();
    expect(() => playNotificationSound()).not.toThrow();
  });

  it("plays a reused, rewound Audio element on each call", async () => {
    const play = vi.fn().mockResolvedValue(undefined);
    const instances: unknown[] = [];
    class FakeAudio {
      src: string;
      volume = 1;
      currentTime = 99;
      play = play;
      constructor(src: string) {
        this.src = src;
        instances.push(this);
      }
    }
    vi.stubGlobal("window", {} as Window & typeof globalThis);
    vi.stubGlobal("Audio", FakeAudio as unknown as typeof Audio);

    const { playNotificationSound } = await freshModule();
    playNotificationSound();
    playNotificationSound();

    expect(instances).toHaveLength(1); // reused
    expect((instances[0] as FakeAudio).src).toContain("/notification-sound.mp3");
    expect((instances[0] as FakeAudio).currentTime).toBe(0); // rewound
    expect(play).toHaveBeenCalledTimes(2);
  });

  it("swallows a rejected play() (autoplay blocked)", async () => {
    class FakeAudio {
      volume = 1;
      currentTime = 0;
      play = vi.fn().mockRejectedValue(new Error("NotAllowedError"));
      constructor(_src: string) {}
    }
    vi.stubGlobal("window", {} as Window & typeof globalThis);
    vi.stubGlobal("Audio", FakeAudio as unknown as typeof Audio);

    const { playNotificationSound } = await freshModule();
    expect(() => playNotificationSound()).not.toThrow();
  });
});
