export const MAXIMUM_LAUNCH_SPEED = 0.42;
export const STUMBLE_DRAG_PER_TICK = 0.965;

export function getUnobstructedStumbleDistance(
  initialSpeed: number,
  durationTicks: number,
): number {
  let speed = Math.min(MAXIMUM_LAUNCH_SPEED, Math.max(0, initialSpeed));
  let distance = 0;

  for (let tick = 0; tick < Math.max(0, Math.floor(durationTicks)); tick += 1) {
    speed *= STUMBLE_DRAG_PER_TICK;
    distance += speed;
  }

  return distance;
}
