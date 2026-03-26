# KaraOK - Sing Together Online

[![Vercel](https://github.com/vietbrosinaus/karaoke-room/actions/workflows/health-vercel.yml/badge.svg)](https://github.com/vietbrosinaus/karaoke-room/actions/workflows/health-vercel.yml)
[![PartyKit](https://github.com/vietbrosinaus/karaoke-room/actions/workflows/health-partykit.yml/badge.svg)](https://github.com/vietbrosinaus/karaoke-room/actions/workflows/health-partykit.yml)
[![Upstash](https://github.com/vietbrosinaus/karaoke-room/actions/workflows/health-upstash.yml/badge.svg)](https://github.com/vietbrosinaus/karaoke-room/actions/workflows/health-upstash.yml)
[![LiveKit](https://img.shields.io/endpoint?url=https%3A%2F%2Fgist.githubusercontent.com%2Felvistranhere%2F9578abf10f65c07ec2e82f6e272255b3%2Fraw%2Flivekit-health.json)](https://github.com/vietbrosinaus/karaoke-room/actions/workflows/health-livekit.yml)
[![Deploy PartyKit](https://github.com/vietbrosinaus/karaoke-room/actions/workflows/deploy-partykit.yml/badge.svg)](https://github.com/vietbrosinaus/karaoke-room/actions/workflows/deploy-partykit.yml)

Real-time online karaoke rooms. Join with a code, share your audio, and sing with friends.

## Stack

- **Frontend**: Next.js 15, React, Tailwind CSS, TypeScript
- **Audio**: LiveKit SFU (WebRTC), Web Audio API
- **Signaling**: PartyKit (Cloudflare Durable Objects)
- **Deploy**: Vercel + PartyKit Cloud

## Features

- Create/join rooms with a 6-character code
- Queue system — take turns singing
- Share tab audio (karaoke music from YouTube, Spotify, etc.)
- Single-track mixing — voice + music combined with zero latency
- Voice effects: Hall reverb, Echo, Warm, Bright, Chorus (pure Web Audio API)
- Per-person volume control
- Audio-reactive ambient glow
- Real-time chat + emoji reactions with sound effects
- Browser detection (Chromium required for singing)
- Heartbeat-based connection management

## Getting Started

```bash
npm install
cp .env.example .env  # add your LiveKit + PartyKit credentials
npm run dev
```

## Environment Variables

```
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
LIVEKIT_URL=wss://your-project.livekit.cloud
NEXT_PUBLIC_LIVEKIT_URL=wss://your-project.livekit.cloud
NEXT_PUBLIC_PARTY_HOST=your-project.partykit.dev
```

## Architecture

```
Browser A (Singer)                    Browser B (Listener)
  |-- getUserMedia (mic)                |-- Receives single mixed track
  |-- getDisplayMedia (tab audio)       |-- AudioVisualizer (glow effect)
  |-- Web Audio mixing:                 |-- Per-person volume control
  |    mic -> effects -> gain --+       +-- Chat + reactions
  |    tab audio -> gain -------+
  |                             +-> single track -> LiveKit SFU
  |-- PartyKit (room state, chat, queue)
  +-- Voice effects (reverb, echo, EQ, chorus)
```
