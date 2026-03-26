# Key Rotation Architecture

Single source of truth for how LiveKit key rotation works.

## Why

LiveKit free tier: 5,000 participant-minutes/month per account (shared across all projects on same account). Multiple accounts = multiplied quota. Key rotation distributes rooms across accounts.

## Core Rule

All users in the same room MUST use the same LiveKit key. LiveKit rooms are project-scoped - different keys = different projects = users can't hear each other.

## Strategy: Hash with Room Affinity + Exhaustion Tracking

**New room:** hash room code among non-exhausted keys, store mapping in Redis with SET NX (atomic).

**Existing room:** read mapping from Redis, use that key (room affinity).

**Key exhausted + room has mapping:** return 429. Never assign a different key (would split the room).

**All keys exhausted:** return 429. "All sessions at capacity."

**Redis down:** fall back to deterministic hash (no Redis, same as a simple deployment).

### Why hash instead of least-loaded

We can't track actual LiveKit quota usage (no API on free plan). Room-count tracking (INCR/DECR) drifts because PartyKit room-close events don't cross to our API. Hash gives even distribution without maintenance. Exhaustion markers handle key failures reactively.

## Redis Data Model

```
room:{code}:key = {keyIndex}     TTL: 1 hour    Room-to-key mapping
key:{index}:exhausted = "1"      TTL: 5 min     Key health marker
```

No counters. No INCR/DECR. Room counts are implicit in the number of active `room:*:key` mappings (TTL self-cleans).

## Race Condition Prevention

Two concurrent requests for the same new room:
```
Request A: GET room:NEW:key -> null
Request B: GET room:NEW:key -> null
Request A: SET room:NEW:key 3 NX -> OK (wins)
Request B: SET room:NEW:key 7 NX -> null (loses)
Request B: GET room:NEW:key -> 3 (reads A's assignment)
Both sign tokens for key #3. No split.
```

`SET NX` (set-if-not-exists) makes room assignment atomic.

## User Workflows

### Normal join
```
Token endpoint -> Redis GET room:ABC:key -> null (new room)
-> Hash among non-exhausted keys -> key #3
-> SET NX room:ABC:key = 3 (TTL 1hr)
-> Sign JWT with key #3 -> return token
```

### Join existing room
```
Token endpoint -> Redis GET room:ABC:key -> 3
-> Key #3 not exhausted -> refresh TTL -> sign JWT with key #3
```

### Key exhausted, room has users
```
Token endpoint -> Redis GET room:ABC:key -> 3
-> key:3:exhausted exists -> return null
-> Client sees: "This room has hit its session limit."
-> [Create New Room] button
```

### Key exhausted, client retries
```
Client sends ?keyHint=next after connect failure
-> Server marks key exhausted in Redis (5 min cooldown)
-> Deletes room mapping (allows reassignment)
-> Finds next non-exhausted key via hash
-> New room mapping stored
```

### All keys exhausted
```
All key:N:exhausted markers exist -> no non-exhausted keys
-> Return null -> client sees "All sessions at capacity"
```

### Mid-session quota depletion
```
Users A, B, C connected on key #3. Quota hits 0.
-> Existing connections STAY ALIVE (LiveKit: "new requests will fail")
-> New user D tries to join -> connect fails -> retry with keyHint=next
-> Key #3 marked exhausted -> room mapping cleared
-> D gets 429 (room had mapping to exhausted key)
-> D creates new room -> assigned to non-exhausted key -> works
```

## Fallback

If Redis is unreachable (env vars not set, or Upstash down):
- `getKeyForRoom` catches the error
- Falls back to `hashRoomToKey(room, totalKeys)` - deterministic, no state
- Loses: room affinity guarantee, cross-instance exhaustion sync
- Keeps: functional connections, even distribution

## Dangling Prevention

| Data | TTL | Self-cleans? |
|------|-----|-------------|
| Room mapping | 1 hour | Yes - expired rooms auto-removed |
| Exhaustion marker | 5 min | Yes - key retried after cooldown |

No INCR/DECR counters = no drift.

## Adding New Keys

1. Create new LiveKit account, get API key + secret + WSS URL
2. Add env vars:
```bash
vercel env add LIVEKIT_API_KEY_N production "" --value "key" --yes
vercel env add LIVEKIT_API_SECRET_N production "" --value "secret" --yes
vercel env add LIVEKIT_URL_N production "" --value "wss://..." --yes
# Repeat for preview
```
3. Add to local `.env` for development
4. No code changes. No redeploy. Next function invocation auto-discovers.

### Rules
- Never remove a key with active rooms
- Suffixes: `_2`, `_3`, ... `_20` (primary key has no suffix)
- Each needs API_KEY + API_SECRET (URL optional, falls back to primary)

## Security

- API keys in Vercel env vars (encrypted at rest) - never in Redis
- Redis stores only key index numbers (3, 47) and boolean exhaustion flags
- Room codes are not sensitive (already in URLs)

## Limits

- **5,000 p-min/month per account** (free tier)
- **100 concurrent participants** across all rooms per project
- **No quota API** on free plan - exhaustion detected reactively
- **1-2s detection delay** on first failure per key (inherent)
