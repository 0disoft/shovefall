export const BOT_PERSONALITY_KINDS = [
  "Aggressor",
  "Survivor",
  "Opportunist",
  "Disruptor",
  "Collector",
] as const;

export type BotPersonalityKind = (typeof BOT_PERSONALITY_KINDS)[number];

export interface BotPersonality {
  readonly kind: BotPersonalityKind;
  readonly approachWeight: number;
  readonly edgeOpportunityWeight: number;
  readonly stumblingTargetWeight: number;
  readonly safetyWeight: number;
  readonly heavyTargetPenalty: number;
  readonly shoveDistance: number;
  readonly jitterRadians: number;
  readonly itemInterestWeight: number;
}

export const BOT_PERSONALITIES: Readonly<Record<BotPersonalityKind, BotPersonality>> =
  Object.freeze({
    Aggressor: Object.freeze({
      kind: "Aggressor",
      approachWeight: 1.35,
      edgeOpportunityWeight: 1.1,
      stumblingTargetWeight: 0.9,
      safetyWeight: 0.7,
      heavyTargetPenalty: 0.2,
      shoveDistance: 0.96,
      jitterRadians: 0.11,
      itemInterestWeight: 0.28,
    }),
    Survivor: Object.freeze({
      kind: "Survivor",
      approachWeight: 0.68,
      edgeOpportunityWeight: 0.7,
      stumblingTargetWeight: 0.55,
      safetyWeight: 1.5,
      heavyTargetPenalty: 0.45,
      shoveDistance: 0.82,
      jitterRadians: 0.08,
      itemInterestWeight: 0.32,
    }),
    Opportunist: Object.freeze({
      kind: "Opportunist",
      approachWeight: 0.9,
      edgeOpportunityWeight: 1.45,
      stumblingTargetWeight: 1.55,
      safetyWeight: 1,
      heavyTargetPenalty: 0.35,
      shoveDistance: 0.9,
      jitterRadians: 0.09,
      itemInterestWeight: 0.34,
    }),
    Disruptor: Object.freeze({
      kind: "Disruptor",
      approachWeight: 1.1,
      edgeOpportunityWeight: 1.2,
      stumblingTargetWeight: 0.75,
      safetyWeight: 0.85,
      heavyTargetPenalty: 0.15,
      shoveDistance: 1,
      jitterRadians: 0.14,
      itemInterestWeight: 0.22,
    }),
    Collector: Object.freeze({
      kind: "Collector",
      approachWeight: 1,
      edgeOpportunityWeight: 1.3,
      stumblingTargetWeight: 0.95,
      safetyWeight: 1,
      heavyTargetPenalty: 0.35,
      shoveDistance: 0.92,
      jitterRadians: 0.12,
      itemInterestWeight: 1,
    }),
  });
