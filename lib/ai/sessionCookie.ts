import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

// Signed, httpOnly session identity for the public concierge widget.
//
// The visitor is anonymous — there is no login here and none is wanted. What
// this provides is narrower: the server, not the browser, decides which
// AiConversation row a request may touch. Previously the widget minted a UUID
// into sessionStorage and sent it in the request body, so any string a caller
// supplied became that caller's conversation — a leaked id (read by any
// third-party script on the page, since sessionStorage is not origin-private
// from JS) let someone else resume the thread and have the model read the
// history back to them, and a fabricated id created an unbounded number of
// rows.
//
// Two separate protections, doing two separate jobs:
//   - httpOnly cookie (SESSION_COOKIE_OPTIONS below) stops page scripts from
//     reading the id at all.
//   - the HMAC stops a caller from presenting an id this server never issued,
//     rejected before any database access.
// Neither replaces the other: the first guards against theft, the second
// against forgery.
export const CONCIERGE_SESSION_COOKIE = "concierge-sid";

// No maxAge, so this is a session cookie that dies with the browser. That
// preserves the reasoning the old sessionStorage implementation carried: a
// persistent id on a shared machine would hand one visitor's conversation to
// the next. Unlike sessionStorage it is shared across tabs, which is the
// better behavior anyway — one visitor in two tabs is one conversation.
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
} as const;

// Read at call time rather than module load so tests (and any runtime that
// populates env late) see the current value.
function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "AUTH_SECRET is required to sign concierge session cookies",
    );
  }
  return secret;
}

function sign(sessionId: string): string {
  return createHmac("sha256", getSecret()).update(sessionId).digest("base64url");
}

export interface IssuedSessionCookie {
  sessionId: string;
  value: string;
}

// Mints a new anonymous session. `sessionId` is what reaches the database;
// `value` is the cookie payload (id plus its signature) and is never stored.
export function issueSessionCookie(): IssuedSessionCookie {
  const sessionId = randomUUID();
  return { sessionId, value: `${sessionId}.${sign(sessionId)}` };
}

// Returns the session id only when this server signed it, and null otherwise
// — a caller that gets null should be issued a fresh session rather than
// trusted. Callers must never fall back to an unverified id.
export function readSessionCookie(value: string | undefined): string | null {
  if (!value) return null;

  const separator = value.lastIndexOf(".");
  if (separator <= 0) return null;

  const sessionId = value.slice(0, separator);
  const provided = Buffer.from(value.slice(separator + 1));
  const expected = Buffer.from(sign(sessionId));

  // timingSafeEqual throws on a length mismatch, so the lengths are compared
  // first. That comparison leaks only the signature's length, which is fixed
  // and public; the byte-wise comparison below stays constant-time so a
  // caller cannot recover a valid signature one byte at a time.
  if (provided.length !== expected.length) return null;
  return timingSafeEqual(provided, expected) ? sessionId : null;
}
