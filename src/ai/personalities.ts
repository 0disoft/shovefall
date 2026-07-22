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
      shoveDistance: 1.28,
      jitterRadians: 0.11,
      itemInterestWeight: 0.28,
    }),
    Survivor: Object.freeze({
      kind: "Survivor",
      approachWeight: 0.7,
      edgeOpportunityWeight: 0.75,
      stumblingTargetWeight: 0.45,
      safetyWeight: 1.6,
      heavyTargetPenalty: 0.55,
      shoveDistance: 1.08,
      jitterRadians: 0.08,
      itemInterestWeight: 0.42,
    }),
    Opportunist: Object.freeze({
      kind: "Opportunist",
      approachWeight: 0.9,
      edgeOpportunityWeight: 1.45,
      stumblingTargetWeight: 1.55,
      safetyWeight: 1,
      heavyTargetPenalty: 0.35,
      shoveDistance: 1.18,
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
      shoveDistance: 1.32,
      jitterRadians: 0.14,
      itemInterestWeight: 0.22,
    }),
    Collector: Object.freeze({
      kind: "Collector",
      approachWeight: 0.82,
      edgeOpportunityWeight: 0.9,
      stumblingTargetWeight: 0.65,
      safetyWeight: 1.15,
      heavyTargetPenalty: 0.4,
      shoveDistance: 1.12,
      jitterRadians: 0.12,
      itemInterestWeight: 1.8,
    }),
  });
