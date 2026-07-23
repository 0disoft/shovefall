import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createArenaRenderer } from "../src/presentation/arena-renderer";
import { normalizeGameConfig } from "../src/simulation/contracts";
import { SimulationWorld } from "../src/simulation/world";

const applicationRender = vi.hoisted(() => vi.fn<() => void>());

vi.mock("pixi.js", () => {
  class FakeGraphics {
    public x = 0;
    public y = 0;

    public bezierCurveTo(): this {
      return this;
    }

    public circle(): this {
      return this;
    }

    public ellipse(): this {
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
      resize(width: number, height: number): void {
        this.screen.width = width;
        this.screen.height = height;
      },
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
    const host = createHost();
    const renderer = await createArenaRenderer(host);
    const frame = new SimulationWorld(
      normalizeGameConfig({ participantCount: 8 }),
      "explicit-present",
    ).createRenderFrame();

    renderer.render(frame, 0, 1);

    expect(applicationRender).toHaveBeenCalledTimes(1);
    expect(host.dataset.projectionAngle).toBe("58");
    expect(Number(host.dataset.projectionScaleY)).toBeCloseTo(Math.sin((58 * Math.PI) / 180), 4);
    expect(Number(host.dataset.cliffDepth)).toBeGreaterThanOrEqual(6);
  });

  it("moves the world camera opposite the human instead of fitting the whole island", async () => {
    const host = createHost();
    const renderer = await createArenaRenderer(host);
    const frame = new SimulationWorld(
      normalizeGameConfig({
        participantCount: 32,
        arenaColumns: 31,
        arenaRows: 26,
      }),
      "camera-follow",
    ).createRenderFrame();
    const centered = Object.freeze({ x: 15.5, y: 13 });
    const centerFrame = Object.freeze({
      ...frame,
      participants: Object.freeze(
        frame.participants.map((participant) =>
          participant.actorId === 1
            ? Object.freeze({
                ...participant,
                position: centered,
                previousPosition: centered,
              })
            : participant,
        ),
      ),
    });
    renderer.render(centerFrame, 1, 1);
    const centerCameraX = Number(host.dataset.cameraX);
    const moved = Object.freeze({ x: 18.5, y: 13 });
    const movedFrame = Object.freeze({
      ...centerFrame,
      participants: Object.freeze(
        centerFrame.participants.map((participant) =>
          participant.actorId === 1
            ? Object.freeze({ ...participant, position: moved, previousPosition: moved })
            : participant,
        ),
      ),
    });

    renderer.render(movedFrame, 1, 1);

    expect(Number(host.dataset.cameraX)).toBeLessThan(centerCameraX);
  });

  it("moves the projected camera opposite vertical human movement", async () => {
    const host = createHost();
    const renderer = await createArenaRenderer(host);
    const frame = new SimulationWorld(
      normalizeGameConfig({
        participantCount: 32,
        arenaColumns: 31,
        arenaRows: 26,
      }),
      "camera-depth-follow",
    ).createRenderFrame();
    const centered = Object.freeze({ x: 15.5, y: 13 });
    const centerFrame = Object.freeze({
      ...frame,
      participants: Object.freeze(
        frame.participants.map((participant) =>
          participant.actorId === 1
            ? Object.freeze({
                ...participant,
                position: centered,
                previousPosition: centered,
              })
            : participant,
        ),
      ),
    });
    renderer.render(centerFrame, 1, 1);
    const centerCameraY = Number(host.dataset.cameraY);
    const moved = Object.freeze({ x: 15.5, y: 16 });
    const movedFrame = Object.freeze({
      ...centerFrame,
      participants: Object.freeze(
        centerFrame.participants.map((participant) =>
          participant.actorId === 1
            ? Object.freeze({ ...participant, position: moved, previousPosition: moved })
            : participant,
        ),
      ),
    });

    renderer.render(movedFrame, 1, 1);

    expect(Number(host.dataset.cameraY)).toBeLessThan(centerCameraY);
  });

  it("renders Wind Blast activation and impact feedback without changing simulation state", async () => {
    const host = createHost();
    const renderer = await createArenaRenderer(host);
    const frame = new SimulationWorld(
      normalizeGameConfig({ participantCount: 4 }),
      "wind-presentation",
    ).createRenderFrame();
    const stateHash = frame.stateHash;

    renderer.consumeEvents(
      [
        {
          eventVersion: 1,
          roundId: frame.roundId,
          tick: frame.tick,
          sequence: 0,
          kind: "item-used",
          actorId: 1,
          itemDefinitionId: "wind-blast",
          vector: { x: 1, y: 0 },
        },
        {
          eventVersion: 1,
          roundId: frame.roundId,
          tick: frame.tick,
          sequence: 1,
          kind: "wind-blast-hit",
          actorId: 1,
          targetActorId: 2,
          itemDefinitionId: "wind-blast",
          vector: { x: 0.315, y: 0 },
        },
      ],
      frame,
    );
    renderer.render(frame, 0, 1);

    expect(applicationRender).toHaveBeenCalledTimes(1);
    expect(frame.stateHash).toBe(stateHash);
  });

  it("renders a stationary Bomb fuse and its position-bound detonation ring", async () => {
    const host = createHost();
    const renderer = await createArenaRenderer(host);
    const baseFrame = new SimulationWorld(
      normalizeGameConfig({ participantCount: 4 }),
      "bomb-presentation",
    ).createRenderFrame();
    const stateHash = baseFrame.stateHash;
    const position = Object.freeze({ x: 4.5, y: 5.5 });
    const frame = Object.freeze({
      ...baseFrame,
      bombs: Object.freeze([
        Object.freeze({
          ownerActorId: 1,
          position,
          fallbackDirection: Object.freeze({ x: 1, y: 0 }),
          placedTick: baseFrame.tick,
          detonateTick: baseFrame.tick + 300,
        }),
      ]),
    });

    renderer.consumeEvents(
      [
        {
          eventVersion: 1,
          roundId: frame.roundId,
          tick: frame.tick,
          sequence: 0,
          kind: "bomb-detonated",
          actorId: 1,
          itemDefinitionId: "bomb",
          position,
        },
      ],
      frame,
    );
    renderer.render(frame, 1, 1);

    expect(applicationRender).toHaveBeenCalledTimes(1);
    expect(frame.stateHash).toBe(stateHash);
  });
});
