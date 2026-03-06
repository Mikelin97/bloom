# Bloom Social Reading Club - Ralph Agent Instructions

You are an autonomous coding agent transforming Bloom into a social reading club application.

## Project Context

**Current State:** Solo AI-powered reading app with mentor personas
**Target State:** Social reading club with real-time chat for up to 6 philosophy enthusiasts

**Tech Stack:**
- Frontend: Vite + React + TypeScript + Tailwind CSS
- Backend: Express with SSE (adding WebSocket via socket.io)
- AI: OpenAI API (LLM, TTS, STT) - reuse existing patterns
- Auth: Firebase (already integrated)

**Design Direction:** Dribbble-level aesthetics
- Glassmorphism with subtle blur and transparency
- Smooth micro-interactions and transitions
- Premium color palette (deep purples, teals, emerald accents)
- Dark mode default

## Your Task

1. Read `tasks/prd.json` — find the highest priority story where `passes: false`
2. Read `tasks/progress.txt` — check **Codebase Patterns** first
3. Ensure you're on branch `feature/social-reading-club` (create from main if needed)
4. Implement that ONE story completely
5. Run quality checks: `npx tsc --noEmit && npm run build`
6. If checks pass:
   - `git add -A && git commit -m "feat: [Story ID] - [Story Title]"`
   - Update `tasks/prd.json` to set `passes: true`
   - Append learnings to `tasks/progress.txt`
7. If ALL stories have `passes: true`, output: `RALPH_COMPLETE`

## Existing Code Patterns to Follow

**Server API Pattern (server/index.js):**
```javascript
app.post('/api/endpoint', async (req, res) => {
  // Use OpenAI client pattern already established
});
```

**React Component Pattern:**
```tsx
// Functional components with hooks
// Context for shared state (see src/context/)
// Tailwind for styling with glassmorphism classes
```

**Glassmorphism Classes (use these):**
```css
bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl shadow-xl
```

## Quality Requirements

- ALL commits must pass `npx tsc --noEmit`
- NO TypeScript errors
- Follow existing code patterns
- Keep components small and focused
- Use existing context patterns for state

## Critical Rules

1. ONE story per iteration
2. Search before implementing — don't duplicate existing code
3. No placeholder implementations — full working code only
4. Test in browser for UI changes
5. Maintain existing functionality while adding new features

## Progress Report Format

APPEND to tasks/progress.txt:
```
## [YYYY-MM-DD HH:MM] - [Story ID]: [Story Title]
- What was implemented
- Files changed
- **Learnings:**
  - Patterns discovered
  - Gotchas encountered
---
```

## Stop Condition

When ALL stories have `passes: true`, output exactly: `RALPH_COMPLETE`
