export const PRODUCT_VERSION = "0.20.0";
export const SIMULATION_VERSION = "6.0.0";
export const CONTENT_VERSION = "4.0.0";
export const REPLAY_FORMAT_VERSION = 1;
export const FIXED_TICKS_PER_SECOND = 60;
export const MAX_REPLAY_TICKS = FIXED_TICKS_PER_SECOND * 120;
export const MAX_REPLAY_BYTES = 5 * 1024 * 1024;

export const SYSTEM_ORDER = Object.freeze([
  "commands",
  "action-transitions",
  "movement-intent",
  "active-displacement",
  "position-integration",
  "spatial-index",
  "contact-resolution",
  "shove-contact-collection",
  "impulse-application",
  "support-and-falling",
  "items-and-effects",
  "collapse-and-spawns",
  "elimination-and-result",
  "events-and-snapshot",
] as const);
