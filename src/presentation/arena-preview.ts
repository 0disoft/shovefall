import { Application, Graphics } from "pixi.js";

export interface ArenaPreview {
  destroy(): void;
  setParticipantCount(count: number): void;
}

const TILE_COLUMNS = 9;
const TILE_ROWS = 7;
const TILE_GAP = 5;

export async function createArenaPreview(host: HTMLElement): Promise<ArenaPreview> {
  const application = new Application();

  await application.init({
    antialias: true,
    autoDensity: true,
    background: "#101514",
    preference: "webgl",
    resolution: Math.min(window.devicePixelRatio, 2),
    resizeTo: host,
  });

  application.canvas.className = "arena-canvas";
  application.canvas.setAttribute("aria-hidden", "true");
  application.canvas.tabIndex = -1;
  host.replaceChildren(application.canvas);

  const arena = new Graphics();
  const participants = new Graphics();
  application.stage.addChild(arena, participants);

  let participantCount = 12;

  const draw = (): void => {
    const width = application.screen.width;
    const height = application.screen.height;
    const tileSize = Math.max(
      12,
      Math.min(
        (width * 0.72 - TILE_GAP * (TILE_COLUMNS - 1)) / TILE_COLUMNS,
        (height * 0.72 - TILE_GAP * (TILE_ROWS - 1)) / TILE_ROWS,
      ),
    );
    const arenaWidth = tileSize * TILE_COLUMNS + TILE_GAP * (TILE_COLUMNS - 1);
    const arenaHeight = tileSize * TILE_ROWS + TILE_GAP * (TILE_ROWS - 1);
    const originX = (width - arenaWidth) / 2;
    const originY = (height - arenaHeight) / 2;

    arena.clear();
    participants.clear();

    for (let row = 0; row < TILE_ROWS; row += 1) {
      for (let column = 0; column < TILE_COLUMNS; column += 1) {
        const distanceFromCenter = Math.hypot(
          column - (TILE_COLUMNS - 1) / 2,
          row - (TILE_ROWS - 1) / 2,
        );
        const color = distanceFromCenter > 4.25 ? 0x2d3734 : 0x46524e;

        arena
          .roundRect(
            originX + column * (tileSize + TILE_GAP),
            originY + row * (tileSize + TILE_GAP),
            tileSize,
            tileSize,
            Math.max(2, tileSize * 0.09),
          )
          .fill({ color });
      }
    }

    const visibleParticipants = Math.min(participantCount, 16);
    const playerRadius = Math.max(4, tileSize * 0.16);

    for (let index = 0; index < visibleParticipants; index += 1) {
      const angle = (index / visibleParticipants) * Math.PI * 2 - Math.PI / 2;
      const ring = tileSize * (index % 2 === 0 ? 1.75 : 2.65);
      const x = width / 2 + Math.cos(angle) * ring;
      const y = height / 2 + Math.sin(angle) * ring * 0.72;

      participants
        .circle(x, y, index === 0 ? playerRadius * 1.25 : playerRadius)
        .fill({ color: index === 0 ? 0xf2f1e8 : 0x929c98 })
        .stroke({ color: index === 0 ? 0x1e73ea : 0x101514, width: 2 });
    }
  };

  application.renderer.on("resize", draw);
  draw();

  return {
    destroy(): void {
      application.renderer.off("resize", draw);
      application.destroy(true, { children: true });
    },
    setParticipantCount(count: number): void {
      participantCount = count;
      draw();
    },
  };
}
