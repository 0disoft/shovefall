export const PRODUCT_VERSION = "0.199.2";
export const SIMULATION_VERSION = "84.0.0";
export const CONTENT_VERSION = "50.0.0";
export const REPLAY_FORMAT_VERSION = 8;
export const FIXED_TICKS_PER_SECOND = 60;
export const MAX_REPLAY_TICKS = FIXED_TICKS_PER_SECOND * 120;
export const MAX_REPLAY_BYTES = 5 * 1024 * 1024;

export const SYSTEM_ORDER = Object.freeze([
  "commands",
  "combat-resource-regeneration",
  "action-transitions",
  "skill-casting",
  "active-items-and-built-in-grapple",
  "movement-intent",
  "active-displacement",
  "position-integration",
  "blocking-obstacle-contacts",
  "spatial-index",
  "contact-resolution",
  "projectile-impact-resolution",
  "skill-zone-resolution",
  "shove-contact-collection",
  "impulse-application",
  "health-elimination",
  "support-and-falling",
  "items-and-effects",
  "collapse-and-spawns",
  "elimination-and-result",
  "events-and-snapshot",
] as const);
