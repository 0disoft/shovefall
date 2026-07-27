import { GRAPPLING_HOOK_DEFINITION } from "../content/built-in-actions";
import { getItemDefinition, isActiveItemDefinitionId, type ItemDefinition } from "../content/items";
import { getSkillDefinition } from "../content/skills";
import type {
  InventorySlotIndex,
  RenderParticipantV1,
  SkillSlotIndex,
} from "../simulation/contracts";
import { getSkillManaMultiplier } from "../simulation/progression";
import { FIXED_TICKS_PER_SECOND } from "../simulation/versions";

export type ActionButtonState = "blocked" | "cooldown" | "mana" | "ready";

export interface ActionButtonViewModel {
  readonly state: ActionButtonState;
  readonly text: string;
  readonly disabled: boolean;
  readonly ariaLabel?: string;
}

export interface ActionHudContext {
  readonly tick: number;
  readonly countdownActive: boolean;
  readonly roundActive: boolean;
}

function formatCooldown(ticks: number): string {
  return `${(ticks / FIXED_TICKS_PER_SECOND).toFixed(1)}초`;
}

function isGrappleBlocked(participant: RenderParticipantV1, context: ActionHudContext): boolean {
  return (
    context.countdownActive ||
    !context.roundActive ||
    !participant.active ||
    participant.action !== "Ready" ||
    participant.combat.stunnedUntilTick > context.tick
  );
}

export function createGrappleButtonViewModel(
  participant: RenderParticipantV1,
  context: ActionHudContext,
): ActionButtonViewModel {
  const cooldownTicks = Math.max(0, participant.grappleReadyTick - context.tick);
  const blocked = isGrappleBlocked(participant, context);
  const state: ActionButtonState = blocked ? "blocked" : cooldownTicks > 0 ? "cooldown" : "ready";
  const baseCooldown = formatCooldown(GRAPPLING_HOOK_DEFINITION.cooldownTicks);
  return Object.freeze({
    state,
    text: `${GRAPPLING_HOOK_DEFINITION.inputKey} · ${GRAPPLING_HOOK_DEFINITION.label} · ${
      blocked
        ? "행동 불가"
        : cooldownTicks > 0
          ? formatCooldown(cooldownTicks)
          : `준비 · 재사용 ${baseCooldown}`
    }`,
    disabled: blocked || cooldownTicks > 0,
    ariaLabel: `${GRAPPLING_HOOK_DEFINITION.label}, ${
      blocked
        ? "행동 불가"
        : cooldownTicks > 0
          ? `재사용까지 ${formatCooldown(cooldownTicks)}`
          : `사용 가능, 재사용 대기시간 ${baseCooldown}`
    }`,
  });
}

export function createSkillButtonViewModel(
  participant: RenderParticipantV1,
  slotIndex: SkillSlotIndex,
  context: ActionHudContext,
): ActionButtonViewModel {
  const slot = participant.skills.find((candidate) => candidate.slotIndex === slotIndex);
  const key = ["Q", "W"][slotIndex] ?? "?";
  const definition = slot === undefined ? undefined : getSkillDefinition(slot.definitionId);
  const label = definition?.label ?? `스킬 ${slotIndex + 1}`;
  const skillRank = participant.progression.skillRanks[slotIndex] ?? 0;
  const manaCost =
    definition === undefined
      ? 0
      : Math.ceil(definition.manaCost * getSkillManaMultiplier(skillRank));
  const cooldownTicks = Math.max(0, (slot?.readyTick ?? 0) - context.tick);
  const blocked =
    context.countdownActive ||
    !context.roundActive ||
    !participant.active ||
    participant.action === "Falling" ||
    participant.action === "Eliminated" ||
    participant.action !== "Ready" ||
    participant.combat.stunnedUntilTick > context.tick ||
    (definition?.castKind === "dash" && participant.combat.rootedUntilTick > context.tick);
  const lacksMana = participant.combat.mana + 1e-9 < manaCost;
  const state: ActionButtonState = blocked
    ? "blocked"
    : cooldownTicks > 0
      ? "cooldown"
      : lacksMana
        ? "mana"
        : "ready";
  return Object.freeze({
    state,
    text: `${key} · ${label} · ${
      blocked
        ? "행동 불가"
        : cooldownTicks > 0
          ? formatCooldown(cooldownTicks)
          : lacksMana
            ? `${manaCost}MP 필요`
            : `${manaCost}MP`
    }`,
    disabled: blocked || cooldownTicks > 0 || lacksMana || slot === undefined,
  });
}

function formatInventoryAriaLabel(
  definition: ItemDefinition | undefined,
  charges: number | null | undefined,
  fallbackLabel: string,
): string {
  if (definition === undefined) {
    return `${fallbackLabel}, 비어 있음`;
  }
  if (charges === null) {
    return `${definition.label}, 상시 효과`;
  }
  return `${definition.label} 사용, ${charges}회 남음`;
}

export function createItemButtonViewModel(
  participant: RenderParticipantV1,
  slotIndex: InventorySlotIndex,
  context: ActionHudContext,
): ActionButtonViewModel {
  const slot = participant.inventory.find((candidate) => candidate.slotIndex === slotIndex);
  const definition = slot === undefined ? undefined : getItemDefinition(slot.definitionId);
  const fallbackLabel = `슬롯 ${slotIndex + 1}`;
  const label = definition?.label ?? fallbackLabel;
  const amount =
    slot === undefined ? "비어 있음" : slot.charges === null ? "상시" : `${slot.charges}회`;
  const blocked =
    context.countdownActive ||
    !context.roundActive ||
    !participant.active ||
    participant.action === "Falling" ||
    participant.action === "Eliminated" ||
    definition === undefined ||
    !isActiveItemDefinitionId(definition.id) ||
    slot?.charges === null ||
    (slot?.charges ?? 0) < 1;
  return Object.freeze({
    state: blocked ? "blocked" : "ready",
    text: `D · ${label} · ${amount}`,
    ariaLabel: formatInventoryAriaLabel(definition, slot?.charges, fallbackLabel),
    disabled: blocked,
  });
}
