export interface GrapplingHookDefinition {
  readonly id: "grappling-hook";
  readonly label: string;
  readonly inputKey: "E";
  readonly cooldownTicks: number;
  readonly castRange: number;
  readonly effectRadius: number;
  readonly minimumAnchorDistance: number;
  readonly targetSpeed: number;
  readonly acceleration: number;
  readonly pullTicks: number;
}

export const GRAPPLING_HOOK_DEFINITION: GrapplingHookDefinition = Object.freeze({
  id: "grappling-hook",
  label: "구조 갈고리",
  inputKey: "E",
  cooldownTicks: 630,
  castRange: 4.5,
  effectRadius: 0.35,
  minimumAnchorDistance: 1.25,
  targetSpeed: 0.3,
  acceleration: 0.24,
  pullTicks: 16,
});

function formatNumber(value: number): string {
  return String(Math.round(value * 100) / 100);
}

export function formatGrapplingHookDescription(
  definition: GrapplingHookDefinition = GRAPPLING_HOOK_DEFINITION,
): string {
  return `${formatNumber(definition.cooldownTicks / 60)}초 재사용 · 최대 ${formatNumber(
    definition.castRange,
  )}칸 앞의 나무·벽돌에만 걸림 · 장애물 앞까지 이동`;
}
