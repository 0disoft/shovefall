import { describe, expect, it } from "vitest";
import { createBackgroundMusic, type AudioElementPort } from "../src/presentation/audio-feedback";

class FakeAudioElement implements AudioElementPort {
  loop = false;
  muted = false;
  preload = "none";
  volume = 1;
  pauseCount = 0;
  playCount = 0;
  playError: unknown;

  pause(): void {
    this.pauseCount += 1;
  }

  async play(): Promise<void> {
    this.playCount += 1;
    if (this.playError !== undefined) {
      throw this.playError;
    }
  }
}

describe("background music", () => {
  it("loops the bundled track and starts only once after unlock", async () => {
    const element = new FakeAudioElement();
    const music = createBackgroundMusic(() => element);
    music.setVolume(35);

    await expect(music.unlock()).resolves.toBe("playing");
    await expect(music.unlock()).resolves.toBe("playing");
    expect(element).toMatchObject({ loop: true, preload: "auto", volume: 0.35, playCount: 1 });
  });

  it("keeps mute and volume independent from sound effects", async () => {
    const element = new FakeAudioElement();
    const music = createBackgroundMusic(() => element);
    music.setVolume(140);
    music.setMuted(true);
    await music.unlock();

    expect(music.volume).toBe(100);
    expect(music.state).toBe("muted");
    expect(element).toMatchObject({ muted: true, volume: 1 });
    music.setMuted(false);
    expect(music.state).toBe("playing");
  });

  it("retries an autoplay rejection and closes without blocking play", async () => {
    const element = new FakeAudioElement();
    element.playError = new DOMException("gesture required", "NotAllowedError");
    const music = createBackgroundMusic(() => element);

    await expect(music.unlock()).resolves.toBe("locked");
    element.playError = undefined;
    await expect(music.unlock()).resolves.toBe("playing");
    music.destroy();
    expect(music.state).toBe("closed");
    expect(element.pauseCount).toBe(1);
  });
});
