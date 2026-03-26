---
applyTo: "**"
---

# KaraOK Code Review Instructions

## Project Context

Real-time karaoke room app. Singer shares tab audio + mic through a single Web Audio API mix, published as one LiveKit track. PartyKit handles room state. Next.js 15 frontend.

## Critical: Audio Latency Path

The singer's audio pipeline (`startSharing` → `AudioContext` → `publishTrack`) is the most latency-sensitive code. Any change to `startSharing`, `stopSharing`, `cleanupMix`, or the mix AudioContext requires extra scrutiny. `MediaRecorder` and `AnalyserNode` are passive taps on `mixDest.stream` — they must never insert nodes into the audio graph.

## Type Synchronization

`party/types.ts` and `src/types/room.ts` must stay in sync manually. Every message type, field, or `RoomState` change must be updated in both files. Flag any PR that modifies one without the other.

## Key Patterns

- **Refs over state** for values used in callbacks/timeouts to avoid stale closures (`isMicEnabledRef`, `talkingNCRef`, `singingNCRef`, `voiceEffectRef`). When reviewing, check that new callbacks don't capture stale React state.
- **`useCallback` with `[]` deps + ref reads inside** is the standard pattern for stable callbacks that need current values. Don't flag missing deps when refs are used intentionally.
- **`eslint-disable-next-line react-hooks/exhaustive-deps`** comments are intentional — the deps are managed via refs. Don't flag these.
- **Web Audio `connect()` is fan-out** — connecting a node to multiple destinations is valid and expected (e.g., mic source → effect chain + analyser).

## What to Check

1. **Protocol consistency**: New message types in both type files + handled in server switch + handled in client `onMessage`.
2. **Gain node lifecycle**: Any code that sets `gain.value` must consider auto-mix (`setTargetAtTime` ramps). Direct `gain.value = x` cancels ramps — this is correct behavior.
3. **MediaStream cleanup**: Every `getUserMedia` call must have a corresponding `track.stop()` in all code paths (success, error, unmount).
4. **AudioContext cleanup**: Every `new AudioContext()` must have `ctx.close()` in cleanup.
5. **`Number.isFinite` validation**: Any numeric values from PartyKit messages must be validated before use in Web Audio (NaN poisons `AudioParam`).
6. **Mute-all state**: `mutedBySinger` is server-persisted in `RoomState`. Check that it's cleared on singer change and survives reconnects.

## What NOT to Flag

- Vercel preview deployment failures (env vars not set for preview — known infra issue)
- `require("lamejs")` style imports (CommonJS lib, bundled correctly by webpack)
- `setSinkId` on `AudioContext` — experimental API, guarded by `"setSinkId" in ctx`
- The single-track mixing approach (mic + tab audio in one AudioContext) — this is the core architecture, not a bug
- `data-lk-identity` DOM attributes on audio elements — intentional for per-person volume matching

## Style

- Lucide icons for all UI elements (no emoji in UI, emoji only in chat/reactions)
- CSS variables for all colors (`var(--color-primary)`, etc.) - no hardcoded hex colors
- TypeScript strict mode with `noUncheckedIndexedAccess`
- Path alias `~/` maps to `src/`
- Named exports only (`export function X`) - no default exports
- PascalCase for components, camelCase for hooks/utils
- No em dashes in any text (comments, commits, strings)
- Fonts referenced via CSS vars (`var(--font-display)`, `var(--font-body)`)

## Component Patterns

- Props interface defined above the component function, named `ComponentNameProps`
- Modals: backdrop (fixed inset-0) + centered card (fixed left-1/2 top-1/2) + Escape key handler + click-outside dismiss
- Error state in hooks: `error: string | null`, displayed as conditional banner
- `useCallback` with `[]` deps + ref reads inside is intentional - don't flag missing deps when refs are used
- `eslint-disable-next-line react-hooks/exhaustive-deps` comments are intentional - deps managed via refs

## Cleanup Requirements

- Every `new AudioContext()` must have `ctx.close()` in all cleanup paths
- Every `getUserMedia()` must have `track.stop()` in all cleanup paths
- Every `setInterval`/`setTimeout` must be cleared on component unmount
- `mutedBySinger`, `autoMix`, recording state must reset when room empties
