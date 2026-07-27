import type { SkillDefinitionId, SkillZoneKind } from "../simulation/contracts";

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
}

export const SKILL_DEFINITION_IDS = [
  "force-palm",
  "blink-step",
  "arc-bolt",
  "chain-bind",
  "meteor-mark",
  "frost-field",
  "tidal-charge",
  "aegis",
] as const satisfies readonly SkillDefinitionId[];

export const DEFAULT_SKILL_LOADOUT = Object.freeze([
  "force-palm",
  "blink-step",
] as const satisfies readonly SkillDefinitionId[]);

function defineSkill(definition: SkillDefinition): SkillDefinition {
  return Object.freeze(definition);
}

function formatNumber(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function formatTicksAsSeconds(ticks: number): string {
  return formatNumber(ticks / 60);
}

function formatAimAssist(minimumAimDot: number): string {
  if (minimumAimDot >= 1) {
    return "";
  }

  const clampedDot = Math.max(-1, Math.min(1, minimumAimDot));
  const degrees = Math.round((Math.acos(clampedDot) * 180) / Math.PI);
  return `전방 약 ${degrees}도까지 조준 보정해 `;
}

export function formatSkillDescription(skill: SkillDefinition): string {
  switch (skill.castKind) {
    case "melee": {
      const effects = [
        skill.damage > 0 ? `피해 ${formatNumber(skill.damage)}` : undefined,
        skill.impulse > 0 ? "넉백" : undefined,
        skill.stunTicks > 0 ? `${formatTicksAsSeconds(skill.stunTicks)}초 기절` : undefined,
      ].filter((effect): effect is string => effect !== undefined);
      const target =
        skill.range > 0 ? `사거리 ${formatNumber(skill.range)}칸 안의 첫 적에게` : "첫 적에게";
      const aimAssist = formatAimAssist(skill.minimumAimDot);
      const detail = effects.join(", ");
      return detail.length > 0
        ? `${target} ${aimAssist}${detail}`
        : `${target} ${aimAssist}`.trim();
    }
    case "dash":
      if (skill.id === "blink-step") {
        const distance = skill.range > 0 ? ` 최대 ${formatNumber(skill.range)}칸` : "";
        const evasion = formatTicksAsSeconds(skill.durationTicks);
        return `지정 방향으로${distance} 이동하고 ${evasion}초 동안 공격 회피`;
      }
      return [
        skill.range > 0
          ? `첫 적이나 물가에서 멈추며 최대 ${formatNumber(skill.range)}칸 돌진`
          : "첫 적이나 물가에서 멈추는 돌진",
        skill.damage > 0 ? `피해 ${formatNumber(skill.damage)}` : undefined,
        skill.impulse > 0 ? "넉백" : undefined,
        skill.stunTicks > 0 ? `${formatTicksAsSeconds(skill.stunTicks)}초 기절` : undefined,
      ]
        .filter((part): part is string => part !== undefined)
        .join(", ");
    case "line": {
      if (skill.id === "chain-bind") {
        const target =
          skill.range > 0 ? `전방 ${formatNumber(skill.range)}칸의 첫 적` : "전방의 첫 적";
        const aimAssist = formatAimAssist(skill.minimumAimDot);
        const damage = skill.damage > 0 ? `피해 ${formatNumber(skill.damage)}와 ` : "";
        const root =
          skill.rootTicks > 0
            ? `${formatTicksAsSeconds(skill.rootTicks)}초 이동 봉쇄`
            : "이동 봉쇄";
        return `${target}에게 ${aimAssist}${damage}${root}`;
      }
      const target =
        skill.range > 0 ? `전방 ${formatNumber(skill.range)}칸 안의 첫 적` : "전방의 첫 적";
      const effects = [
        skill.damage > 0 ? `피해 ${formatNumber(skill.damage)}` : undefined,
        skill.impulse > 0 ? `넉백 ${formatNumber(skill.impulse)}` : undefined,
      ].filter((effect): effect is string => effect !== undefined);
      const detail = effects.join("와 ");
      return detail.length > 0 ? `${target}을 조준 보정해 ${detail}` : `${target}을 조준 보정`;
    }
    case "zone": {
      const placement = skill.range > 0 ? `${formatNumber(skill.range)}칸 앞에` : "현재 위치에";
      switch (skill.zoneKind) {
        case "delayed-blast": {
          const delay =
            skill.delayTicks > 0 ? `, ${formatTicksAsSeconds(skill.delayTicks)}초 뒤` : "";
          const radius = skill.radius > 0 ? ` 반경 ${formatNumber(skill.radius)}칸` : "";
          const damage = skill.damage > 0 ? ` 피해 ${formatNumber(skill.damage)}` : "";
          const stun = skill.stunTicks > 0 ? "와 기절" : "";
          return `${placement} 표식${delay}${radius}${damage}${stun}`;
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
          return `${placement} ${duration}${damage}${slow} 지대`;
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
    "force-palm": defineSkill({
      id: "force-palm",
      label: "충격 장타",
      castKind: "melee",
      zoneKind: null,
      cooldownTicks: 72,
      manaCost: 18,
      range: 1.7,
      minimumAimDot: 0.94,
      radius: 0,
      damage: 18,
      impulse: 0.22,
      stumbleTicks: 14,
      stunTicks: 120,
      rootTicks: 0,
      slowMultiplier: 1,
      durationTicks: 0,
      delayTicks: 0,
      shield: 0,
      controlDurationMultiplier: 1,
    }),
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
      damage: 12,
      impulse: 0,
      stumbleTicks: 0,
      stunTicks: 0,
      rootTicks: 72,
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
      cooldownTicks: 600,
      manaCost: 45,
      range: 5,
      minimumAimDot: 1,
      radius: 2.15,
      damage: 36,
      impulse: 0.18,
      stumbleTicks: 18,
      stunTicks: 48,
      rootTicks: 0,
      slowMultiplier: 1,
      durationTicks: 1,
      delayTicks: 120,
      shield: 0,
      controlDurationMultiplier: 1,
    }),
    "frost-field": defineSkill({
      id: "frost-field",
      label: "빙결 지대",
      castKind: "zone",
      zoneKind: "frost",
      cooldownTicks: 480,
      manaCost: 38,
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
    }),
    "tidal-charge": defineSkill({
      id: "tidal-charge",
      label: "파도 돌진",
      castKind: "dash",
      zoneKind: null,
      cooldownTicks: 300,
      manaCost: 26,
      range: 3.6,
      minimumAimDot: 1,
      radius: 0,
      damage: 24,
      impulse: 0.3,
      stumbleTicks: 20,
      stunTicks: 90,
      rootTicks: 0,
      slowMultiplier: 1,
      durationTicks: 0,
      delayTicks: 0,
      shield: 0,
      controlDurationMultiplier: 1,
    }),
    aegis: defineSkill({
      id: "aegis",
      label: "수호 방패",
      castKind: "self",
      zoneKind: null,
      cooldownTicks: 720,
      manaCost: 45,
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
      shield: 24,
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
