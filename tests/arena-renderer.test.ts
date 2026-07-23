import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createArenaRenderer } from "../src/presentation/arena-renderer";
import { normalizeGameConfig } from "../src/simulation/contracts";
import { SimulationWorld } from "../src/simulation/world";

const applicationRender = vi.hoisted(() => vi.fn<() => void>());

vi.mock("pixi.js", () => {
  class FakeGraphics {
    public bezierCurveTo(): this {
      return this;
    }

    public circle(): this {
      return this;
    }

    public clear(): this {
      return this;
    }

    public fill(): this {
      return this;
    }

    public lineTo(): this {
      return this;
    }

    public moveTo(): this {
      return this;
    }

    public poly(): this {
      return this;
    }

    public rect(): this {
      return this;
    }

    public roundRect(): this {
      return this;
    }

    public stroke(): this {
      return this;
    }
  }

  class FakeApplication {
    public readonly canvas = {
      addEventListener(): void {},
      className: "",
      removeEventListener(): void {},
      setAttribute(): void {},
      tabIndex: 0,
    };
    public readonly renderer = {
      off(): void {},
      on(): void {},
      resize(): void {},
      resolution: 1,
      screen: { height: 430, width: 640 },
    };
    public readonly stage = {
      addChild(): void {},
    };
    public readonly ticker = {
      stop(): void {},
    };

    public get screen(): { readonly height: number; readonly width: number } {
      return this.renderer.screen;
    }

    public destroy(): void {}

    public async init(): Promise<void> {}

    public render(): void {
      applicationRender();
    }
  }

  return {
    Application: FakeApplication,
    Graphics: FakeGraphics,
  };
});

function isHTMLElement(value: unknown): value is HTMLElement {
  return (
    typeof value === "object" &&
    value !== null &&
    "clientHeight" in value &&
    "clientWidth" in value &&
    "dataset" in value &&
    "replaceChildren" in value
  );
}

function createHost(): HTMLElement {
  const host: unknown = {
    clientHeight: 430,
    clientWidth: 640,
    dataset: {},
    replaceChildren(): void {},
  };

  if (!isHTMLElement(host)) {
    throw new Error("The renderer test host does not match the required DOM boundary.");
  }

  return host;
}

describe("arena renderer presentation", () => {
  beforeEach(() => {
    applicationRender.mockClear();
    vi.stubGlobal("window", {
      devicePixelRatio: 1,
      matchMedia: () => ({
        addEventListener(): void {},
        matches: false,
        removeEventListener(): void {},
      }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("presents every requested simulation frame without relying on a resize event", async () => {
    const renderer = await createArenaRenderer(createHost());
    const frame = new SimulationWorld(
      normalizeGameConfig({ participantCount: 8 }),
      "explicit-present",
    ).createRenderFrame();

    renderer.render(frame, 0, 1);

    expect(applicationRender).toHaveBeenCalledTimes(1);
  });
});
