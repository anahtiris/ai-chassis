// Size bounds for one public concierge turn.
//
// These exist to stop abuse, not to tune answer quality, so the default is
// generous enough that a real visitor never meets it: a long paragraph is
// around 800 characters and a pasted error plus a question around 1500.
//
// Counted in characters rather than tokens on purpose. This project is
// provider-pluggable (lib/ai/provider.ts), and an accurate token count needs
// the tokenizer belonging to whichever provider is active — expensive to load
// and wrong the moment AI_PROVIDER changes. Characters are free, synchronous,
// and already the unit lib/ai/memory/settings.ts budgets history in.
//
// Two things to weigh before raising this:
//
//   - Thai, and any non-Latin script, costs far more tokens per character
//     than English: 2000 characters is roughly 500 tokens of English but
//     closer to 1500-2000 of Thai. Size this for the expensive case.
//   - WindowStrategy keeps `keepRecentTurns` messages verbatim with no
//     character budget of its own, so this cap is really a cap on history
//     divided by about half that turn count. At the default of 10 turns,
//     raising this to 8000 admits roughly 40,000 characters of history.
//
// The binding constraint is usually the model's context window, and on the
// default local setup that is small: lib/ai/provider.ts does not set Ollama's
// `num_ctx`, so it runs at whatever Ollama defaults to, not at the six-figure
// windows the hosted providers offer.
export const DEFAULT_MAX_MESSAGE_CHARS = 2000;

// Deliberately env-only, not a field on the AiConcierge global like the
// memory settings are. Two reasons: this is checked in the route before any
// database access, and reading a global to decide it would put a query in
// front of the cheapest validation on the path; and a size bound that an
// operator can raise to a million from a CMS form is not much of a bound.
// Forks that want a different number set it per environment.
const MAX_MESSAGE_CHARS_ENV = "CONCIERGE_MAX_MESSAGE_CHARS";

// Mirrors positiveNumber() in lib/ai/memory/settings.ts: anything that is not
// a finite positive number falls back rather than throwing, since it arrives
// from deployment configuration.
function positiveNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

export function getMaxMessageChars(): number {
  return positiveNumber(
    process.env[MAX_MESSAGE_CHARS_ENV],
    DEFAULT_MAX_MESSAGE_CHARS,
  );
}

// A separate, coarser bound checked before the body is parsed at all.
//
// App Router route handlers have no default body size limit — unlike the Pages
// API's 1mb — so `await request.json()` on a huge body buffers it before any
// field-level check can run. That is a memory problem, not a token problem,
// and the message cap above cannot help with it because it needs the parsed
// body to apply.
//
// The multiplier is loose on purpose: UTF-8 costs up to 3 bytes per character
// and a client is free to \u-escape every one of them into 6, so a legitimate
// message can be several times its character count. This only has to reject
// bodies that are orders of magnitude too large.
export function getMaxBodyBytes(): number {
  return getMaxMessageChars() * 8 + 1024;
}
