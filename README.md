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
  context/
    InteractionContext.tsx
    ReaderContext.tsx
  App.tsx
  main.tsx
  index.css
```

## Notes
- The reader content is currently sourced from `src/content/poor_charlie_almanack.md`.
- Fonts are loaded via Google Fonts in `index.html` with `display=swap` to minimize layout shift.
- The API server runs on `http://localhost:8787` by default. Vite proxies `/api` to it in `vite.config.ts`.

## Environment variables
See `.env.example` for all options. Minimum required:
- `OPENAI_API_KEY`

Optional:
- `OPENAI_MODEL` (LLM)
- `OPENAI_TTS_MODEL`, `OPENAI_TTS_FORMAT`, `OPENAI_TTS_SPEED`
- `OPENAI_VOICE_MENTOR`, `OPENAI_VOICE_SKEPTIC`, `OPENAI_VOICE_HISTORIAN`, `OPENAI_VOICE_PRAGMATIST`
- `OPENAI_TRANSCRIBE_MODEL`
- `PORT`, `CORS_ORIGIN`

## Scripts
- `npm run dev` - start dev server
- `npm run dev:server` - start API server (SSE + audio)
- `npm run build` - typecheck + production build
- `npm run preview` - preview production build
