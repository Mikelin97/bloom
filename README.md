# Reimagine Reading

An AI-native, voice-native reading environment built with Vite + React + Tailwind on the frontend and an Express SSE API for LLM + audio.

## Stack
- Vite + React (TypeScript)
- Tailwind CSS + @tailwindcss/typography
- Express API (SSE streaming)
- OpenAI Responses API (streaming)
- OpenAI audio (STT + TTS)
- LocalStorage for persisted settings

## Features
- Pure reading mode with Markdown rendering
- Theme switcher (Light / True Black / Sepia)
- Font family switcher (Serif / Sans / Mono)
- Fluid typography via CSS `clamp()`
- Scroll position persistence
- Minimal UI controls with glassmorphism styling
- Mentor + Round-Table interaction panel
- Paragraph anchors with viewport context
- SSE streaming responses
- Voice input (press-to-talk) and persona TTS playback

## Quick start
```bash
npm install
npm run dev:server
npm run dev
```

Create a local env file for the API:
```bash
cp .env.example .env
```
Then set `OPENAI_API_KEY` in `.env`.

Build for production:
```bash
npm run build
```

Preview the production build:
```bash
npm run preview
```

## Expose to local network
```bash
npm run dev -- --host
```
Then open `http://<your-local-ip>:5173` on another device.

## HTTPS for voice on other devices
Microphone access requires HTTPS (or `localhost`). For testing on your LAN, generate a trusted local cert and run Vite + the API over HTTPS.

High-level steps:
1. Create a local cert (e.g. with mkcert) for your machine IP/hostname.
2. Trust the mkcert root CA on each device.
3. Set env vars for HTTPS + host and start the servers.

Example env (add to `.env`):
```
VITE_HOST=0.0.0.0
HOST=0.0.0.0
HTTPS_KEY=</absolute/path/to/key.pem>
HTTPS_CERT=</absolute/path/to/cert.pem>
HTTPS_CA=</absolute/path/to/rootCA.pem> # optional
```

Run:
```bash
npm run dev:server
npm run dev -- --host
```

Then open `https://<your-local-ip>:5173` on other devices.

Production-ish LAN flow:
```
VITE_API_BASE=https://<your-local-ip>:8787
```
```bash
npm run build
npm run preview -- --host
```
Keep `npm run dev:server` running so `/api` calls reach the API server.

## Project structure
```
server/
  index.js
  prompts.js
src/
  components/
    Controls/
    Layout/
    Interaction/
    Reader/
  content/
    poor_charlie_almanack.md
    thus_spoke_zarathustra.md
    library.ts
  context/
    InteractionContext.tsx
    ReaderContext.tsx
  App.tsx
  main.tsx
  index.css
```

## Notes
- Reader content is configured in `src/content/library.ts` and selected from the in-app controls.
- Fonts are loaded via Google Fonts in `index.html` with `display=swap` to minimize layout shift.
- The API server runs on `http://localhost:8787` by default. Vite proxies `/api` to it in `vite.config.ts`.

## Environment variables
See `.env.example` for all options. Minimum required:
- `OPENAI_API_KEY`

Optional:
- `OPENAI_MODEL` (LLM)
- `OPENAI_TTS_MODEL`, `OPENAI_TTS_FORMAT`, `OPENAI_TTS_SPEED`
- `OPENAI_REALTIME_MODEL`, `OPENAI_REALTIME_VOICE`, `OPENAI_REALTIME_SPEED`
- `OPENAI_VOICE_MENTOR`, `OPENAI_VOICE_SKEPTIC`, `OPENAI_VOICE_HISTORIAN`, `OPENAI_VOICE_PRAGMATIST`
- `OPENAI_TRANSCRIBE_MODEL`
- `PORT`, `CORS_ORIGIN`
- `VITE_HOST`, `HOST`, `HTTPS_KEY`, `HTTPS_CERT`, `HTTPS_CA`

## Scripts
- `npm run dev` - start dev server
- `npm run dev:server` - start API server (SSE + audio)
- `npm run build` - typecheck + production build
- `npm run preview` - preview production build
