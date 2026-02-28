/**
 * Turn-type classifier – chooses a response style for the current user message.
 *
 * Returns one of:
 *   'explain'   – deep / structural (uses card layout)
 *   'challenge' – user pushes back
 *   'agree'     – user confirms / affirms
 *   'clarify'   – follow-up question
 *   'brief'     – short / low-effort reply
 */

/* ── Regex heuristic patterns ───────────────────────────── */

const EXPLAIN_RE =
  /\b(what|why|how|explain|describe|tell me about|walk me through|break down|elaborate|unpack)\b/i;

const CHALLENGE_RE =
  /\b(but |however|disagree|not right|wrong|I don'?t think|that's not|pushback|counter|on the other hand)\b/i;

const AGREE_RE =
  /\b(yes|yeah|exactly|makes sense|agree|right|got it|I see|understood|fair point|good point|true)\b/i;

const CLARIFY_RE =
  /\b(what do you mean|how so|can you clarify|in what sense|what does that mean|sorry.*confused|could you explain)\b/i;

const WORD_LIMIT_BRIEF = 15;

/* ── Main classifier ────────────────────────────────────── */

/**
 * @param {string} userMessage  – the latest user message text
 * @param {number} historyLength – number of messages in the conversation so far (including this one)
 * @returns {'explain'|'challenge'|'agree'|'clarify'|'brief'}
 */
export function classifyTurn(userMessage, historyLength) {
  const trimmed = (userMessage || '').trim();
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;

  // First message in a conversation always gets the full structured treatment
  if (historyLength <= 1) return 'explain';

  // Very short replies → brief (unless they match a more specific pattern below)
  if (wordCount <= WORD_LIMIT_BRIEF) {
    // Check specific patterns first even on short messages
    if (CLARIFY_RE.test(trimmed)) return 'clarify';
    if (CHALLENGE_RE.test(trimmed)) return 'challenge';
    if (AGREE_RE.test(trimmed)) return 'agree';
    return 'brief';
  }

  // Longer messages – check patterns in priority order
  if (CLARIFY_RE.test(trimmed)) return 'clarify';
  if (CHALLENGE_RE.test(trimmed)) return 'challenge';
  if (EXPLAIN_RE.test(trimmed)) return 'explain';
  if (AGREE_RE.test(trimmed)) return 'agree';

  // Default: conversational explanation
  return 'explain';
}
