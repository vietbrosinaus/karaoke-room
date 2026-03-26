# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev:all          # Next.js (3000) + PartyKit (1999) — use this for local dev
npm run dev              # Next.js only
npm run dev:party        # PartyKit only
npm run typecheck        # tsc --noEmit
npm run build            # Production build
npm run deploy:party     # Deploy PartyKit server to Cloudflare
```

No test framework is configured. Verify changes with `npm run typecheck`.

## Git

Do NOT include `Co-Authored-By` lines in commit messages.

## Writing

Never use em dashes (—). Use regular dashes (-) or rewrite the sentence.

## Architecture

**KaraOK** is a real-time karaoke room app. Three systems work together:

1. **PartyKit** (`party/`) — Cloudflare Durable Objects for room state (participants, queue, chat, mute-all). The server in `party/index.ts` is a state machine with heartbeat-based cleanup (15s ping, 40s evict, 60s singer timeout).

2. **LiveKit** — SFU for WebRTC audio transport. The singer publishes a **single mixed track** (mic + tab audio combined via Web Audio API) to avoid voice/music latency drift. Listeners subscribe to this one track.

3. **Next.js 15** (App Router) — UI + `/api/livekit-token` endpoint with multi-key rotation.

### Single-Track Mixing (Critical Path)

The singer's audio pipeline in `useLiveKit.ts`:
```
getUserMedia (mic) → Voice Effect Chain → Mic GainNode ─┐
getDisplayMedia (tab audio) → Music GainNode ────────────┤
                                                          ↓
                                              AudioContext.destination
                                                          ↓
                                              publishTrack (LiveKit)
```
Both sources share one AudioContext render clock → zero drift. This is the most latency-sensitive code path. Changes to `startSharing`/`stopSharing`/`cleanupMix` require careful review.

### Type Synchronization

`party/types.ts` and `src/types/room.ts` **must be kept in sync manually**. Every message type, field addition, or RoomState change needs updating in both files. The PartyKit server imports from `party/types.ts`; the client imports from `src/types/room.ts`.

## Key Hooks

- **`useRoomState`** — PartyKit WebSocket, room state, chat, reactions, mute-all. Returns `send()` for raw messages.
- **`useLiveKit`** — LiveKit connection, mic toggle, tab audio sharing, voice effects, mic check (live loopback). The most complex hook (~1000 lines).
- **`useAudioDevices`** — Device enumeration, mic mode (`"voice"` = NC on, `"raw"` = NC off).
- **`usePartySocket`** — Low-level PartyKit WebSocket wrapper with auto-reconnect.

## Voice Effects

`src/lib/voiceEffects.ts` — Pure Web Audio API, zero dependencies. Each effect returns `{ input, output, cleanup, setWetDry }`. Effects: Hall (feedback delay network), Echo (delay + feedback), Warm/Bright (BiquadFilter EQ), Chorus (LFO-modulated delay).

## Patterns

- **Refs over state** for values accessed in callbacks/timeouts to avoid stale closures (`isMicEnabledRef`, `talkingNCRef`, `singingNCRef`, `voiceEffectRef`).
- **Hot-swap during sharing**: NC toggle and voice effect changes re-capture the mic stream or rebuild the effect chain live without stopping the published track.
- **Mic check uses separate AudioContext**: Routes mic → effect chain → `ctx.destination` (speakers) for self-monitoring. Completely isolated from the sharing mix path.
- **`mutedBySinger` is server-persisted**: Included in `RoomState` so reconnecting clients get the correct mute state. Cleared automatically in `promoteNextSinger()`.
- **Per-person volume**: Uses `lkIdentity` from PartyKit status updates (not DOM queries) to match LiveKit audio elements to participants.

## Adding a New PartyKit Message

1. Add to `ClientMessage` / `ServerMessage` in **both** `party/types.ts` and `src/types/room.ts`
2. Handle in `party/index.ts` `onMessage` switch + add handler method
3. Handle in `src/hooks/useRoomState.ts` `onMessage` switch
4. Wire up in `RoomView.tsx`

## Environment

Required env vars: `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_URL`, `NEXT_PUBLIC_LIVEKIT_URL`. Optional: `NEXT_PUBLIC_PARTY_HOST` (defaults to `localhost:1999`), `LIVEKIT_API_KEY_2`/`_3` for multi-key failover.

Path alias: `~/*` → `./src/*`. TypeScript strict mode with `noUncheckedIndexedAccess`.

## Deployment

- **Next.js**: Vercel (auto-deploy from GitHub, or `vercel deploy --prod`)
- **PartyKit**: `npm run deploy:party` (separate deploy required after `party/` changes)
- Singing requires Chromium (Chrome/Edge/Brave/Arc) — `getDisplayMedia` audio capture is Chromium-only.
