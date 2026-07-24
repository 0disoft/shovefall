import { SimulationContractError } from "./math";

export type SeedInput = string | number;

const NON_ZERO_FALLBACK = 0x6d2b79f5;

function fnv1a32(value: string): number {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}

export function normalizeSeed(seed: SeedInput): number {
  if (typeof seed === "number") {
    if (!Number.isFinite(seed)) {
      throw new SimulationContractError("numeric seed must be finite");
    }

    return Math.trunc(seed) >>> 0 || NON_ZERO_FALLBACK;
  }

  const normalized = seed.normalize("NFC");

  if (normalized.length === 0) {
    throw new SimulationContractError("string seed must not be empty");
  }

  return fnv1a32(normalized) || NON_ZERO_FALLBACK;
}

export function deriveSeed(masterSeed: SeedInput, streamName: string): number {
  if (streamName.length === 0) {
    throw new SimulationContractError("stream name must not be empty");
  }

  return (
    fnv1a32(`${normalizeSeed(masterSeed).toString(16)}\u0000${streamName}`) || NON_ZERO_FALLBACK
  );
}

export class XorShift32 {
  readonly #initialSeed: number;
  #state: number;

  public constructor(seed: SeedInput) {
    this.#initialSeed = normalizeSeed(seed);
    this.#state = this.#initialSeed;
  }

  public get initialSeed(): number {
    return this.#initialSeed;
  }

  public nextUint32(): number {
    let next = this.#state;
    next ^= next << 13;
    next ^= next >>> 17;
    next ^= next << 5;
    this.#state = next >>> 0;
    return this.#state;
  }

  public nextFloat(): number {
    return this.nextUint32() / 0x1_0000_0000;
  }
}

export class RandomStreamSet {
  readonly #masterSeed: SeedInput;
  readonly #streams = new Map<string, XorShift32>();

  public constructor(masterSeed: SeedInput) {
    normalizeSeed(masterSeed);
    this.#masterSeed = masterSeed;
  }

  public get(name: string): XorShift32 {
    const existing = this.#streams.get(name);

    if (existing !== undefined) {
      return existing;
    }

    const stream = new XorShift32(deriveSeed(this.#masterSeed, name));
    this.#streams.set(name, stream);
    return stream;
  }
}

export function getRequiredStreamNames(actorIds: readonly number[]): readonly string[] {
  return Object.freeze([
    "arena",
    "collapse",
    "items",
    "tie-break",
    "artillery",
    ...actorIds.flatMap((actorId) => [`bot-personality:${actorId}`, `bot-jitter:${actorId}`]),
  ]);
}
