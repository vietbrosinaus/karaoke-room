# Room Browsing, Passwords & Admin Roles

Issue: #6 | Date: 2026-03-30

## Data Model

### PartyKit room state additions (`party/index.ts`)

```ts
adminPeerId: string | null = null;      // first joiner becomes admin
passwordHash: string | null = null;      // null = public room
```

Password hashing: SHA-256. Constant-time comparison. `passwordHash` is never broadcast to clients.

### RoomState additions (broadcast to clients)

```ts
interface RoomState {
  // ...existing fields
  adminPeerId: string | null;
  isLocked: boolean;  // derived from passwordHash !== null
}
```

### Admin assignment

- First person to successfully `join` a room becomes admin
- On admin disconnect, auto-promote next participant by Map insertion order
- Transfer announced in chat

### Registry party (`party/registry.ts`)

Separate Durable Object holding:

```ts
Map<roomCode, {
  participantCount: number;
  mode: "karaoke" | "watch";
  currentSinger: string | null;
  currentSong: string | null;
  isLocked: boolean;
  updatedAt: number;
}>
```

- Rooms report on state changes, debounced to max once per 30s
- Immediate DELETE on room empty
- Auto-expire entries older than 2 minutes
- Free tier budget: ~100k req/day fits comfortably

---

## New Messages

### Client -> Server

```ts
| { type: "kick"; peerId: string }
| { type: "set-password"; password: string | null }  // null = remove
| { type: "transfer-admin"; peerId: string }
| { type: "auth"; password: string }
```

### Server -> Client

```ts
| { type: "kicked"; by: string }
| { type: "auth-required" }
| { type: "auth-failed" }
| { type: "admin-changed"; peerId: string; name: string }
```

---

## Join Flow for Locked Rooms

1. Client connects, gets `you-joined`
2. Client sends `join` with name
3. Server sees room has password - sends `auth-required` (does NOT add to participants)
4. Client shows password modal
5. Client sends `auth` with password
6. Server validates - adds to participants + broadcasts `room-state`, or sends `auth-failed`
7. Existing 30s eviction timer handles abandoned auth flows

### Room creation with password

- Home page stores password in `sessionStorage` on create
- When RoomView gets `auth-required`, auto-submits from sessionStorage
- No URL params needed

---

## UI

### Home page (`page.tsx`)

- New toggle: "Set room password" checkbox below room code input
- When toggled, shows password field
- Password stored in `sessionStorage` on create

### Browse page (`/browse`) - new

- Grid of room cards: room code, participant count, mode icon, singer/video, lock icon
- Polls registry every 10s via HTTP GET
- "No active rooms" empty state
- Link from home page navbar

### Room view changes

- **People panel**: crown icon next to admin. Admin sees "..." menu with Kick / Transfer Admin.
- **Admin settings modal**: gear icon (admin only). Password toggle + field.
- **Auth modal**: shown on `auth-required`. Password input + submit. Error on `auth-failed`.
- **Kicked state**: banner "You were kicked by [name]" + "Back to Home" button. WebSocket disconnected.

### No changes to

- Stage banner, watch player, audio pipeline, singer controls, auto-mix

---

## Implementation Phases

### Phase 1: Foundation

1. Add new fields to `party/types.ts` and `src/types/room.ts`
2. Admin assignment in `party/index.ts` - first joiner = admin, auto-promote on disconnect
3. `buildRoomState()` includes `adminPeerId` and `isLocked`

### Phase 2: Admin Powers

4. `kick`, `transfer-admin`, `set-password` handlers in `party/index.ts`
5. Auth flow: `auth-required`, `auth`, `auth-failed` messages
6. `useRoomState.ts` handles new server messages

### Phase 3: UI

7. Admin controls in People panel
8. Admin settings modal
9. Auth modal for locked rooms
10. Home page password toggle
11. Kicked state banner

### Phase 4: Browse

12. `party/registry.ts` - new Durable Object
13. Registry reporting from room party (debounced 30s)
14. `/browse` page

---

## Regression Risk

None. All changes are additive:

- Public rooms (no password) follow exact same join path as today
- Singer/mute-all untouched - admin is a separate role
- Watch mode untouched
- New RoomState fields are nullable, existing clients ignore unknown fields
- Registry is a separate DO - if it's down, rooms still work
