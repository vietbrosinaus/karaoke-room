---
name: add-livekit-keys
description: Add more LiveKit key sets for key rotation. Use when user says "add livekit key", "add more keys", "new livekit account", or "set-more-livekit-keys".
---

# Add LiveKit Key Sets

Add one or more LiveKit key sets to the key rotation system.

## Input

Parse from args. Expect one of:
- A number: `/add-livekit-keys 2` (add key set #2)
- Multiple: `/add-livekit-keys 2 3 4`
- No args: ask which key number(s) to add

## For Each Key Set

### Step 1: Collect credentials

Ask the user for these 3 values (one prompt, all at once):
```
For key set #N, paste these 3 values:
1. API Key (starts with API...)
2. API Secret
3. Server URL (starts with wss://...)
```

After they paste, confirm back what you received and ask: **"Does this look correct? No trailing spaces or newlines?"** Do NOT proceed until confirmed.

### Step 2: Add to Vercel (production + preview)

The suffix is `_N` (e.g., `_2`, `_3`). Primary key has no suffix.

```bash
# Production
printf "API_KEY_VALUE" | vercel env add LIVEKIT_API_KEY_N production
printf "API_SECRET_VALUE" | vercel env add LIVEKIT_API_SECRET_N production
printf "WSS_URL_VALUE" | vercel env add LIVEKIT_URL_N production

# Preview (use API to avoid CLI bug with preview)
VERCEL_TOKEN=$(jq -r '.token' "/Users/elvistran/Library/Application Support/com.vercel.cli/auth.json")
PROJECT_ID="prj_XkOLsianzym8z3kObRsCZJDEtXv5"
TEAM_ID="team_riTqVL9VqbQMnBsQLVVj7sp7"

for VAR_NAME in "LIVEKIT_API_KEY_N:API_KEY_VALUE" "LIVEKIT_API_SECRET_N:API_SECRET_VALUE" "LIVEKIT_URL_N:WSS_URL_VALUE"; do
  KEY="${VAR_NAME%%:*}"
  VAL="${VAR_NAME#*:}"
  curl -s -X POST "https://api.vercel.com/v10/projects/$PROJECT_ID/env?teamId=$TEAM_ID" \
    -H "Authorization: Bearer $VERCEL_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"key\":\"$KEY\",\"value\":\"$VAL\",\"target\":[\"preview\"],\"type\":\"encrypted\"}"
done
```

### Step 3: Add GitHub secret for health check

```bash
gh secret set LIVEKIT_URL_N --body "WSS_URL_VALUE" --repo vietbrosinaus/karaoke-room
```

### Step 4: Extend health check matrix (if key > 5)

The health-check.yml workflow matrix currently supports keys 1-5. If adding key 6+, add a new entry to the matrix in `.github/workflows/health-check.yml`:

```yaml
- name: Key N
  secret_key: LIVEKIT_URL_N
```

And add the corresponding env mapping in the step:
```yaml
LK_URL_N: ${{ secrets.LIVEKIT_URL_N }}
```

And in the case statement:
```bash
LIVEKIT_URL_N) LK_URL="$LK_URL_N" ;;
```

Commit and push the workflow change.

### Step 5: Redeploy

```bash
vercel --prod
```

### Step 6: Confirm

List all env vars to verify:
```bash
vercel env ls
gh secret list --repo vietbrosinaus/karaoke-room
```

Report: "Key set #N added. The least-loaded algorithm will start assigning new rooms to it automatically. Health check will verify it every 6 hours."

## Naming Convention

| Key # | Suffix | API Key | API Secret | URL | GitHub Secret |
|---|---|---|---|---|---|
| 1 | (none) | LIVEKIT_API_KEY | LIVEKIT_API_SECRET | LIVEKIT_URL | LIVEKIT_URL |
| 2 | _2 | LIVEKIT_API_KEY_2 | LIVEKIT_API_SECRET_2 | LIVEKIT_URL_2 | LIVEKIT_URL_2 |
| 3-20 | _N | LIVEKIT_API_KEY_N | LIVEKIT_API_SECRET_N | LIVEKIT_URL_N | LIVEKIT_URL_N |

## Important

- No code changes needed - `getKeySets()` auto-discovers up to `_20`
- Never remove a key with active rooms - wait for 1hr TTL to expire first
- If same LiveKit server URL as primary, `LIVEKIT_URL_N` can be omitted (falls back to primary)
