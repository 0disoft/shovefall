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

Arc Bolt and Chain Bind hit events retain their deterministic tick but animate their generated projectile texture from caster to impact at three tiles per second. The travel is presentation-only, ends in a bounded impact cue, and collapses to the existing short stationary feedback under reduced motion.

## Optional Audio

Procedural sound effects and licensed background music are separate browser-local channels. Web Audio creates the six-voice effect mixer only after a user gesture. When the cap is full, a higher-priority fall or result cue may replace a lower-priority miss or pickup cue; equal or lower priority is dropped. A same-origin `HTMLAudioElement` loops `HYP - Catch Me If You Can` from the first accepted pointer or keyboard gesture and remains alive through menu, settings, and arena transitions.

Effects and background music both default to 50 on independent persisted 0–100 controls. The music channel applies a separate 0.08 reference trim before its perceptual volume curve, so equal slider values remain balanced without exposing an arbitrary low music number. Enabled non-gameplay buttons emit one bounded layered click cue after the audio gesture boundary; gameplay action buttons retain only their action-specific feedback. The visible global sound button mutes or unmutes both channels without changing either saved level. Browser autoplay rejection leaves music `locked` so another gesture may retry; missing or failed media becomes `unavailable`. Either channel may fail while play continues with the other channel or in silence. Audio state never enters replay or simulation state and no runtime audio request leaves the same origin.

## Renderer Loss and Fatal Recovery

WebGL context loss pauses the fixed-step session, clears held input, exposes a DOM error status, and keeps the current world intact. Context restoration resumes only when the document is visible. The DOM status gives renderer loss precedence over the session's generic paused label.

An uncaught round-loop failure stops scheduling and enters the existing DOM fatal state. Development builds expose an explicit diagnostic event solely so Playwright can prove this recovery boundary; production input cannot trigger it. Restart always creates a fresh world and monotonically advances the round ID.

## Evidence and Limits

Vitest proves event deduplication, new-round acceptance, artillery rendering calls, atlas integration under a mocked PixiJS boundary, effect fallback and voice priority, music looping, retry, mute, and independent volume. Playwright proves menu/history/settings/HUD state, separate persisted audio levels, generated item-card art and arena-asset loading, mute semantics, unavailable audio, reduced motion, deterministic human defeat and immediate restart, fatal recovery, context-loss pause, and restoration. The production Chrome profile targets the public fixed-60 presentation.

This evidence does not establish audio-device quality, final-art readability, photosensitivity approval, physical-GPU performance, cross-browser support, or external playtest acceptance.
