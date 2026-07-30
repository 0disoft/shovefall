import { describe, expect, it } from "vitest";
import {
  createBackgroundMusic,
  MUSIC_DUCKING_GAIN,
  MUSIC_REFERENCE_GAIN,
  type AudioElementPort,
  volumeToGain,
} from "../src/presentation/audio-feedback";

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
    expect(music.volume).toBe(50);
    music.setVolume(35);

    await expect(music.unlock()).resolves.toBe("playing");
    await expect(music.unlock()).resolves.toBe("playing");
    expect(element.loop).toBe(true);
    expect(element.preload).toBe("auto");
    expect(element.volume).toBeCloseTo(volumeToGain(35) * MUSIC_REFERENCE_GAIN, 10);
    expect(element.playCount).toBe(1);
  });

  it("keeps mute and volume independent from sound effects", async () => {
    const element = new FakeAudioElement();
    const music = createBackgroundMusic(() => element);
    music.setVolume(140);
    music.setMuted(true);
    await music.unlock();

    expect(music.volume).toBe(100);
    expect(music.state).toBe("muted");
    expect(element.muted).toBe(true);
    expect(element.volume).toBeCloseTo(MUSIC_REFERENCE_GAIN, 10);
    music.setMuted(false);
    expect(music.state).toBe("playing");
  });

  it("temporarily ducks the music bus without changing the saved user volume", async () => {
    const element = new FakeAudioElement();
    const music = createBackgroundMusic(() => element);
    await music.unlock();

    const normalVolume = volumeToGain(50) * MUSIC_REFERENCE_GAIN;
    expect(element.volume).toBeCloseTo(normalVolume, 10);
    music.duck(1_000);
    expect(music.volume).toBe(50);
    expect(element.volume).toBeCloseTo(normalVolume * MUSIC_DUCKING_GAIN, 10);
    music.destroy();
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
