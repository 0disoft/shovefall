# Presentation Feedback and Recovery

- Status: Implemented functional baseline; final art pending
- Owner: Frontend presentation boundary
- Source of truth: `src/presentation/`, `src/app/`, and simulation event contracts

## Ownership Boundary

The deterministic simulation emits ordered `SimulationEventV1` values and never imports browser audio, PixiJS effects, motion preferences, or renderer lifecycle state. Presentation consumers may translate those events into visuals and sound, but cannot write commands, move actors, or change authoritative round state.

`SimulationEventLedger` keeps the greatest consumed `(roundId, tick, sequence)` cursor. It accepts each ordered event once and rejects duplicates and older events in constant time. A session assigns monotonically increasing round IDs so a restart cannot replay the prior round's feedback.

## Visual Feedback

The PixiJS renderer derives short-lived shove, dodge, fall, item, water-impact, rock-impact, and result effects from accepted events. It also derives mass, timed-effect, Spring Glove, mounted-wall, offshore ship, ammunition-label, cannon-arc, orange exclamation, red skull, and lethal-rock markers from the current render frame. Sixteen measured character frames and nine measured item frames are cut from two owner-generated transparent atlases, cached as PixiJS textures, and layered over the procedural collision/status shapes. Loading is asynchronous and does not delay countdown or simulation; a rejected load leaves the procedural world intact. Normal rounds cap transient effects at 36. The fixed 50-participant mode caps them at 14 and removes nonessential bot dodge trails while keeping human feedback and authoritative artillery telegraphs. Eight ship labels and generated sprites are cached and updated instead of recreated every frame.

The browser reduced-motion preference removes nonessential movement and flash amplitude without changing simulation timing, collision windows, cooldowns, or event delivery. Reduced motion is presentation policy, not a lower game-speed mode.

## Optional Audio

Web Audio is created only after a user gesture. Six oscillator voices may be active at once. When the cap is full, a higher-priority fall or result cue may replace a lower-priority miss or pickup cue; equal or lower priority is dropped. The visible mute control is local UI state and does not enter replay or simulation state.

Missing, rejected, or failed Web Audio changes the audio state to `unavailable` and play continues silently. There are no downloaded audio assets, autoplay claims, background music, remote requests, or automatic retries.

## Renderer Loss and Fatal Recovery

WebGL context loss pauses the fixed-step session, clears held input, exposes a DOM error status, and keeps the current world intact. Context restoration resumes only when the document is visible. The DOM status gives renderer loss precedence over the session's generic paused label.

An uncaught round-loop failure stops scheduling and enters the existing DOM fatal state. Development builds expose an explicit diagnostic event solely so Playwright can prove this recovery boundary; production input cannot trigger it. Restart always creates a fresh world and monotonically advances the round ID.

## Evidence and Limits

Vitest proves event deduplication, new-round acceptance, artillery rendering calls, atlas integration under a mocked PixiJS boundary, silent fallback, unlock, mute, and voice priority. Playwright proves menu/history/settings/HUD state, generated item-card art and arena-asset loading, mute semantics, unavailable audio, reduced motion, deterministic human defeat and immediate restart, fatal recovery, context-loss pause, and restoration. The production Chrome profile targets the public fixed-50 presentation.

This evidence does not establish audio-device quality, final-art readability, photosensitivity approval, physical-GPU performance, cross-browser support, or external playtest acceptance.
