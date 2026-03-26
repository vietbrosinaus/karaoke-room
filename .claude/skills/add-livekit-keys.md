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
# Read project/team IDs from .vercel/project.json and auth token from Vercel CLI config
VERCEL_TOKEN=$(jq -r '.token' "$(find ~/Library -name auth.json -path '*com.vercel*' 2>/dev/null | head -1)")
PROJECT_ID=$(jq -r '.projectId' .vercel/project.json)
TEAM_ID=$(jq -r '.orgId' .vercel/project.json)

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

### Step 4: Extend health check workflow

Add the new key to `.github/workflows/health-livekit.yml`. Three edits needed:

1. Add to the matrix `include` list:
```yaml
          - name: Key N
            secret_key: LIVEKIT_URL_N
```

2. Add the env mapping in the `Check LiveKit` step:
```yaml
          LK_URL_N: ${{ secrets.LIVEKIT_URL_N }}
```

3. Add to the case statement:
```bash
            LIVEKIT_URL_N) LK_URL="$LK_URL_N" ;;
```

Commit and push. The badge will automatically update to show `N/N healthy` on the next run.

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
