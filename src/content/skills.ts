import type { SkillDefinitionId, SkillZoneKind } from "../simulation/contracts";
import { getUnobstructedStumbleDistance } from "../simulation/motion-constants";

export type SkillCastKind = "melee" | "dash" | "line" | "zone" | "self";

export interface SkillDefinition {
  readonly id: SkillDefinitionId;
  readonly label: string;
  readonly castKind: SkillCastKind;
  readonly zoneKind: SkillZoneKind | null;
  readonly cooldownTicks: number;
  readonly manaCost: number;
  readonly range: number;
  readonly minimumAimDot: number;
  readonly radius: number;
  readonly damage: number;
  readonly impulse: number;
  readonly stumbleTicks: number;
  readonly stunTicks: number;
  readonly rootTicks: number;
  readonly slowMultiplier: number;
  readonly durationTicks: number;
  readonly delayTicks: number;
  readonly shield: number;
  readonly controlDurationMultiplier: number;
  readonly damageHealingRatio: number;
}

export const SKILL_DEFINITION_IDS = [
  "blink-step",
  "arc-bolt",
  "chain-bind",
  "meteor-mark",
  "frost-field",
  "aegis",
] as const satisfies readonly SkillDefinitionId[];

export const DEFAULT_SKILL_LOADOUT = Object.freeze([
  "blink-step",
  "arc-bolt",
] as const satisfies readonly SkillDefinitionId[]);

type SkillDefinitionInput = Omit<SkillDefinition, "damageHealingRatio"> &
  Partial<Pick<SkillDefinition, "damageHealingRatio">>;

function defineSkill(definition: SkillDefinitionInput): SkillDefinition {
  return Object.freeze({
    ...definition,
    damageHealingRatio: definition.damageHealingRatio ?? 0,
  });
}

function formatNumber(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function formatTicksAsSeconds(ticks: number): string {
  return formatNumber(ticks / 60);
}

function formatDistance(value: number): string {
  return String(Math.round(value * 10) / 10);
}

export function getBaseSkillKnockbackDistance(skill: SkillDefinition): number {
  return getUnobstructedStumbleDistance(skill.impulse, skill.stumbleTicks);
}

function formatKnockback(skill: SkillDefinition): string | undefined {
  if (skill.impulse <= 0 || skill.stumbleTicks <= 0) {
    return undefined;
  }

  return `기준 넉백 약 ${formatDistance(getBaseSkillKnockbackDistance(skill))}칸`;
}

function formatControl(skill: SkillDefinition): string | undefined {
  if (skill.stunTicks > 0) {
    return `기본 ${formatTicksAsSeconds(skill.stunTicks)}초 기절`;
  }

  if (skill.stumbleTicks > 0) {
    return `${formatTicksAsSeconds(skill.stumbleTicks)}초 휘청`;
  }

  return undefined;
}

function formatAimAssist(minimumAimDot: number): string {
  if (minimumAimDot >= 1) {
    return "";
  }

  const clampedDot = Math.max(-1, Math.min(1, minimumAimDot));
  const degrees = Math.round((Math.acos(clampedDot) * 180) / Math.PI);
  return `전방 약 ${degrees}도까지 조준 보정`;
}

export function formatSkillDescription(skill: SkillDefinition): string {
  switch (skill.castKind) {
    case "melee": {
      return [
        skill.range > 0 ? `사거리 ${formatNumber(skill.range)}칸 안의 첫 적` : "첫 적",
        formatAimAssist(skill.minimumAimDot).trim() || undefined,
        skill.damage > 0 ? `피해 ${formatNumber(skill.damage)}` : undefined,
        formatKnockback(skill),
        formatControl(skill),
      ]
        .filter((part): part is string => part !== undefined)
        .join(", ");
    }
    case "dash":
      const distance = skill.range > 0 ? ` 최대 ${formatNumber(skill.range)}칸` : "";
      const evasion = formatTicksAsSeconds(skill.durationTicks);
      return `지정 방향으로${distance} 이동하고 ${evasion}초 동안 공격 회피`;
    case "line": {
      if (skill.id === "chain-bind") {
        const target =
          skill.range > 0 ? `전방 ${formatNumber(skill.range)}칸의 첫 적` : "전방의 첫 적";
        return [
          target,
          formatAimAssist(skill.minimumAimDot).trim() || undefined,
          skill.damage > 0 ? `피해 ${formatNumber(skill.damage)}` : undefined,
          skill.rootTicks > 0
            ? `${formatTicksAsSeconds(skill.rootTicks)}초 이동 봉쇄`
            : "이동 봉쇄",
        ]
          .filter((part): part is string => part !== undefined)
          .join(", ");
      }
      const target =
        skill.range > 0 ? `전방 ${formatNumber(skill.range)}칸 안의 첫 적` : "전방의 첫 적";
      const effects = [
        skill.damage > 0 ? `피해 ${formatNumber(skill.damage)}` : undefined,
        formatKnockback(skill),
        formatControl(skill),
      ].filter((effect): effect is string => effect !== undefined);
      return effects.length > 0
        ? `${target}을 조준 보정, ${effects.join(", ")}`
        : `${target}을 조준 보정`;
    }
    case "zone": {
      const placement = skill.range > 0 ? `${formatNumber(skill.range)}칸 앞에` : "현재 위치에";
      switch (skill.zoneKind) {
        case "delayed-blast": {
          return [
            `${placement} 표식`,
            skill.delayTicks > 0
              ? `${formatTicksAsSeconds(skill.delayTicks)}초 뒤${skill.radius > 0 ? ` 반경 ${formatNumber(skill.radius)}칸` : ""}`
              : skill.radius > 0
                ? `반경 ${formatNumber(skill.radius)}칸`
                : undefined,
            skill.damage > 0 ? `피해 ${formatNumber(skill.damage)}` : undefined,
            formatKnockback(skill),
            formatControl(skill),
          ]
            .filter((part): part is string => part !== undefined)
            .join(", ");
        }
        case "frost": {
          const duration =
            skill.durationTicks > 0 ? `${formatTicksAsSeconds(skill.durationTicks)}초간 ` : "";
          const damage = skill.damage > 0 ? `피해 ${formatNumber(skill.damage)}` : "";
          const slowPercent = Math.round((1 - skill.slowMultiplier) * 10_000) / 100;
          const slow =
            slowPercent > 0
              ? `${damage.length > 0 ? "와 " : ""}${formatNumber(slowPercent)}% 둔화`
              : "";
          const healing =
            skill.damageHealingRatio > 0
              ? `, 준 피해의 ${formatNumber(skill.damageHealingRatio * 100)}% 체력 회복`
              : "";
          return `${placement} ${duration}${damage}${slow} 지대${healing}`;
        }
        case null:
          throw new Error(`Zone skill ${skill.id} requires a zone kind`);
      }
    }
    case "self": {
      const duration =
        skill.durationTicks > 0 ? `${formatTicksAsSeconds(skill.durationTicks)}초간 ` : "";
      const shield = skill.shield > 0 ? `피해 ${formatNumber(skill.shield)} 흡수, ` : "";
      const controlReduction = Math.round((1 - skill.controlDurationMultiplier) * 10_000) / 100;
      const control =
        controlReduction > 0 ? `제어 시간 ${formatNumber(controlReduction)}% 감소` : "";
      return `${duration}${shield}${control}`;
    }
  }

  throw new Error("Unsupported skill cast kind");
}

export const SKILL_DEFINITIONS: Readonly<Record<SkillDefinitionId, SkillDefinition>> =
  Object.freeze({
    "blink-step": defineSkill({
      id: "blink-step",
      label: "잔상 회피",
      castKind: "dash",
      zoneKind: null,
      cooldownTicks: 132,
      manaCost: 20,
      range: 2.4,
      minimumAimDot: 1,
      radius: 0,
      damage: 0,
      impulse: 0,
      stumbleTicks: 0,
      stunTicks: 0,
      rootTicks: 0,
      slowMultiplier: 1,
      durationTicks: 42,
      delayTicks: 0,
      shield: 0,
      controlDurationMultiplier: 1,
    }),
    "arc-bolt": defineSkill({
      id: "arc-bolt",
      label: "파동탄",
      castKind: "line",
      zoneKind: null,
      cooldownTicks: 360,
      manaCost: 32,
      range: 3.5,
      minimumAimDot: 0.94,
      radius: 0,
      damage: 20,
      impulse: 0.3,
      stumbleTicks: 24,
      stunTicks: 0,
      rootTicks: 0,
      slowMultiplier: 1,
      durationTicks: 0,
      delayTicks: 0,
      shield: 0,
      controlDurationMultiplier: 1,
    }),
    "chain-bind": defineSkill({
      id: "chain-bind",
      label: "사슬 속박",
      castKind: "line",
      zoneKind: null,
      cooldownTicks: 360,
      manaCost: 32,
      range: 5.5,
      minimumAimDot: 0.966,
      radius: 0,
      damage: 20,
      impulse: 0,
      stumbleTicks: 0,
      stunTicks: 0,
      rootTicks: 60,
      slowMultiplier: 1,
      durationTicks: 0,
      delayTicks: 0,
      shield: 0,
      controlDurationMultiplier: 1,
    }),
    "meteor-mark": defineSkill({
      id: "meteor-mark",
      label: "낙석 표식",
      castKind: "zone",
      zoneKind: "delayed-blast",
      cooldownTicks: 480,
      manaCost: 36,
      range: 5,
      minimumAimDot: 1,
      radius: 3,
      damage: 36,
      impulse: 0.18,
      stumbleTicks: 18,
      stunTicks: 48,
      rootTicks: 0,
      slowMultiplier: 1,
      durationTicks: 1,
      delayTicks: 90,
      shield: 0,
      controlDurationMultiplier: 1,
    }),
    "frost-field": defineSkill({
      id: "frost-field",
      label: "빙결 지대",
      castKind: "zone",
      zoneKind: "frost",
      cooldownTicks: 480,
      manaCost: 30,
      range: 3.5,
      minimumAimDot: 1,
      radius: 2.3,
      damage: 5,
      impulse: 0,
      stumbleTicks: 0,
      stunTicks: 0,
      rootTicks: 0,
      slowMultiplier: 0.75,
      durationTicks: 300,
      delayTicks: 0,
      shield: 0,
      controlDurationMultiplier: 1,
      damageHealingRatio: 0.25,
    }),
    aegis: defineSkill({
      id: "aegis",
      label: "수호 방패",
      castKind: "self",
      zoneKind: null,
      cooldownTicks: 720,
      manaCost: 40,
      range: 0,
      minimumAimDot: 1,
      radius: 0,
      damage: 0,
      impulse: 0,
      stumbleTicks: 0,
      stunTicks: 0,
      rootTicks: 0,
      slowMultiplier: 1,
      durationTicks: 300,
      delayTicks: 0,
      shield: 22,
      controlDurationMultiplier: 0.7,
    }),
  });

export function getSkillDefinition(id: SkillDefinitionId): SkillDefinition {
  return SKILL_DEFINITIONS[id];
}

export function isSkillDefinitionId(value: unknown): value is SkillDefinitionId {
  return (
    typeof value === "string" && SKILL_DEFINITION_IDS.some((definitionId) => definitionId === value)
  );
}
