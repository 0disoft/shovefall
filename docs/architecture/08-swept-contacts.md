# Swept Weak Contacts

- Status: Implemented in simulation `5.0.0`; launch envelope extended in `10.0.0`
- Owner: Deterministic simulation
- Source of truth: `src/simulation/world.ts`, `src/simulation/tuning.ts`, and `tests/combat.test.ts`

## Problem

Fixed-tick overlap checks can miss two circles whose start and end positions are both separated even though their movement segments intersect between ticks. The risk exists at the supported speed cap for near-grazing paths, where the horizontal collision chord is shorter than the pair's relative movement. A final-frame-only normal can also point after the bodies have crossed and misclassify an approaching collision as separation.

## Resolution Contract

Each participant records `previousPosition` before action transitions and movement. On the first weak-contact iteration, every spatial-hash candidate solves the relative segment versus the squared combined radius. A candidate is accepted only when it starts outside, approaches, has a non-negative discriminant, and its first intersection lies within the current tick.

At the first intersection, the solver computes a deterministic normal, applies a mass-weighted non-penetrating impulse with the existing weak-contact damping as restitution, and reintegrates the remaining fraction of the tick with the resulting velocities. Actor ID supplies the zero-distance fallback direction. Later bounded iterations retain the existing overlap correction for piles and same-position starts.

The spatial hash still uses integrated positions. Simulation `10.0.0` separates the ordinary `0.26` body cap from the `0.42` launch cap. Two maximally launched bodies that intersect can finish at most `2 × 0.42 + 2 × 0.34 = 1.52` tiles apart, below the `1.7` hash-cell width, so they remain in the same or an adjacent cell. Weak-contact output uses the launch cap instead of silently truncating Wind Blast back to the ordinary cap. Raising launch speed, body radius, or shrinking the cell requires re-proving this containment before changing tuning.

## Compatibility

Previous position already entered authoritative participant state, but simulation `5.0.0` gives it new collision meaning. Replays from `4.0.0` are rejected instead of inheriting new outcomes. Content `3.0.0` is unchanged.

## Evidence and Limits

Vitest covers the containment inequality, three equal bodies at one coordinate, 21 deterministic grazing geometries across three horizontal and seven vertical separations, and Wind Blast transfer into a third body. Replay, determinism, shove, item, and spatial suites remain merge blocking. The `0.27.0` browser and headless profiles must be refreshed before repeating the earlier fixed-50 performance claim.

The solver handles one analytic contact per candidate on the first iteration, followed by overlap correction. It is not a general rigid-body engine and does not promise exact multi-impact time ordering, angular momentum, friction, or rotating shapes.
