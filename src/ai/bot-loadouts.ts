import { SKILL_DEFINITION_IDS } from "../content/skills";
import {
  MAXIMUM_PARTICIPANT_COUNT,
  type ActorId,
  type ItemDefinitionId,
  type SkillDefinitionId,
} from "../simulation/contracts";
import { RandomStreamSet, type SeedInput } from "../simulation/random";

const ACTIVE_ITEMS = Object.freeze([
  "wind-blast",
  "brick-bag",
  "boat",
  "bomb",
  "soap",
] as const satisfies readonly ItemDefinitionId[]);
export type BotActiveItemId = (typeof ACTIVE_ITEMS)[number];

export interface BotLoadoutAssignment {
  readonly actorId: ActorId;
  readonly startingItems: readonly [BotActiveItemId];
  readonly startingSkills: readonly [SkillDefinitionId, SkillDefinitionId];
}

export function createBotLoadoutAssignments(
  masterSeed: SeedInput,
  participantCount: number,
  humanActorId: ActorId | null,
): readonly BotLoadoutAssignment[] {
  if (
    !Number.isSafeInteger(participantCount) ||
    participantCount < 2 ||
    participantCount > MAXIMUM_PARTICIPANT_COUNT
  ) {
    throw new Error(
      `bot loadout participantCount must be an integer from 2 through ${MAXIMUM_PARTICIPANT_COUNT}`,
    );
  }

  const random = new RandomStreamSet(masterSeed).get("bot-loadouts");
  const activeOffset = random.nextUint32() % ACTIVE_ITEMS.length;
  const activeStep = random.nextUint32() % 2 === 0 ? 1 : ACTIVE_ITEMS.length - 1;
  const assignments: BotLoadoutAssignment[] = [];

  for (let actorId = 1; actorId <= participantCount; actorId += 1) {
    if (actorId === humanActorId) {
      continue;
    }

    const botIndex = assignments.length;
    const active = ACTIVE_ITEMS[(botIndex * activeStep + activeOffset) % ACTIVE_ITEMS.length];

    if (active === undefined) {
      throw new Error(`bot loadout assignment failed for actor ${actorId}`);
    }

    assignments.push(
      Object.freeze({
        actorId,
        startingItems: Object.freeze([active] as const),
        startingSkills: Object.freeze([
          SKILL_DEFINITION_IDS[botIndex % SKILL_DEFINITION_IDS.length]!,
          SKILL_DEFINITION_IDS[(botIndex + 4) % SKILL_DEFINITION_IDS.length]!,
        ] as const),
      }),
    );
  }

  return Object.freeze(assignments);
}

export const BOT_ACTIVE_ITEM_IDS = ACTIVE_ITEMS;
