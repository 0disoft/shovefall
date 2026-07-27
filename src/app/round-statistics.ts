import type {
  ActorId,
  RenderFrameV1,
  SimulationEventV1,
  SkillDefinitionId,
} from "../simulation/contracts";

export interface RoundStatistics {
  readonly distanceMoved: number;
  readonly damageDealt: number;
  readonly damageTaken: number;
  readonly damageBlocked: number;
  readonly slowedTicks: number;
  readonly skillUses: Readonly<Record<SkillDefinitionId, number>>;
}

function createSkillUseCounts(): Record<SkillDefinitionId, number> {
  return {
    "force-palm": 0,
    "blink-step": 0,
    "arc-bolt": 0,
    "chain-bind": 0,
    "meteor-mark": 0,
    "frost-field": 0,
    "tidal-charge": 0,
    aegis: 0,
  };
}

export class RoundStatisticsTracker {
  #distanceMoved = 0;
  #damageDealt = 0;
  #damageTaken = 0;
  #damageBlocked = 0;
  #slowedTicks = 0;
  #skillUses = createSkillUseCounts();

  public reset(): void {
    this.#distanceMoved = 0;
    this.#damageDealt = 0;
    this.#damageTaken = 0;
    this.#damageBlocked = 0;
    this.#slowedTicks = 0;
    this.#skillUses = createSkillUseCounts();
  }

  public recordStep(
    previousFrame: RenderFrameV1,
    frame: RenderFrameV1,
    events: readonly SimulationEventV1[],
    actorId: ActorId,
  ): void {
    const previous = previousFrame.participants.find(
      (participant) => participant.actorId === actorId,
    );
    const current = frame.participants.find((participant) => participant.actorId === actorId);

    if (previous !== undefined && current !== undefined) {
      this.#distanceMoved += Math.hypot(
        current.position.x - previous.position.x,
        current.position.y - previous.position.y,
      );
      if (current.combat.slowedUntilTick > frame.tick) {
        this.#slowedTicks += 1;
      }
    }

    for (const event of events) {
      if (
        event.kind === "skill-used" &&
        event.actorId === actorId &&
        event.skillDefinitionId !== undefined
      ) {
        this.#skillUses[event.skillDefinitionId] += 1;
      }

      if (event.kind !== "damage-applied") {
        continue;
      }

      if (event.actorId === actorId) {
        this.#damageDealt += event.amount ?? 0;
      }
      if (event.targetActorId === actorId) {
        this.#damageTaken += event.amount ?? 0;
        this.#damageBlocked += event.absorbedAmount ?? 0;
      }
    }
  }

  public snapshot(): RoundStatistics {
    return Object.freeze({
      distanceMoved: this.#distanceMoved,
      damageDealt: this.#damageDealt,
      damageTaken: this.#damageTaken,
      damageBlocked: this.#damageBlocked,
      slowedTicks: this.#slowedTicks,
      skillUses: Object.freeze({ ...this.#skillUses }),
    });
  }
}
