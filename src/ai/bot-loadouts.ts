import type { ActorId, ItemDefinitionId } from "../simulation/contracts";
import { RandomStreamSet, type SeedInput } from "../simulation/random";

const PASSIVE_ITEMS = Object.freeze([
  "iron-boots",
  "feather",
  "spring-glove",
] as const satisfies readonly ItemDefinitionId[]);
const ACTIVE_ITEMS = Object.freeze([
  "wind-blast",
  "brick-bag",
  "boat",
  "bomb",
  "soap",
  "grappling-hook",
] as const satisfies readonly ItemDefinitionId[]);
export type BotPassiveItemId = (typeof PASSIVE_ITEMS)[number];
export type BotActiveItemId = (typeof ACTIVE_ITEMS)[number];

export interface BotLoadoutAssignment {
  readonly actorId: ActorId;
  readonly startingItems: readonly [BotPassiveItemId, BotActiveItemId];
}

export function createBotLoadoutAssignments(
  masterSeed: SeedInput,
  participantCount: number,
  humanActorId: ActorId | null,
): readonly BotLoadoutAssignment[] {
  if (!Number.isSafeInteger(participantCount) || participantCount < 2 || participantCount > 50) {
    throw new Error("bot loadout participantCount must be an integer from 2 through 50");
  }

  const random = new RandomStreamSet(masterSeed).get("bot-loadouts");
  const passiveOffset = random.nextUint32() % PASSIVE_ITEMS.length;
  const activeOffset = random.nextUint32() % ACTIVE_ITEMS.length;
  const activeStep = random.nextUint32() % 2 === 0 ? 1 : ACTIVE_ITEMS.length - 1;
  const assignments: BotLoadoutAssignment[] = [];

  for (let actorId = 1; actorId <= participantCount; actorId += 1) {
    if (actorId === humanActorId) {
      continue;
    }

    const botIndex = assignments.length;
    const passive = PASSIVE_ITEMS[(botIndex + passiveOffset) % PASSIVE_ITEMS.length];
    const active = ACTIVE_ITEMS[(botIndex * activeStep + activeOffset) % ACTIVE_ITEMS.length];

    if (passive === undefined || active === undefined) {
      throw new Error(`bot loadout assignment failed for actor ${actorId}`);
    }

    assignments.push(
      Object.freeze({
        actorId,
        startingItems: Object.freeze([passive, active] as const),
      }),
    );
  }

  return Object.freeze(assignments);
}

export const BOT_PASSIVE_ITEM_IDS = PASSIVE_ITEMS;
export const BOT_ACTIVE_ITEM_IDS = ACTIVE_ITEMS;
