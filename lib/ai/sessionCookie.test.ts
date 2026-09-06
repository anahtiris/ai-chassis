import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  issueSessionCookie,
  readSessionCookie,
} from "@/lib/ai/sessionCookie";

beforeEach(() => {
  vi.stubEnv("AUTH_SECRET", "test-secret-value");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("issueSessionCookie", () => {
  it("mints a fresh session id each call", () => {
    const first = issueSessionCookie();
    const second = issueSessionCookie();
    expect(first.sessionId).not.toBe(second.sessionId);
  });

  it("produces a cookie value that verifies back to the same id", () => {
    const { sessionId, value } = issueSessionCookie();
    expect(readSessionCookie(value)).toBe(sessionId);
  });
});

describe("readSessionCookie", () => {
  it("returns null when no cookie was sent", () => {
    expect(readSessionCookie(undefined)).toBeNull();
    expect(readSessionCookie("")).toBeNull();
  });

  it("rejects a bare id with no signature", () => {
    const { sessionId } = issueSessionCookie();
    expect(readSessionCookie(sessionId)).toBeNull();
  });

  it("rejects an id swapped onto someone else's signature", () => {
    const victim = issueSessionCookie();
    const attacker = issueSessionCookie();
    const signature = attacker.value.slice(attacker.value.lastIndexOf(".") + 1);

    expect(readSessionCookie(`${victim.sessionId}.${signature}`)).toBeNull();
  });

  it("rejects a tampered signature", () => {
    const { sessionId } = issueSessionCookie();
    expect(readSessionCookie(`${sessionId}.not-a-real-signature`)).toBeNull();
  });

  it("rejects a cookie signed with a different secret", () => {
    const { value } = issueSessionCookie();
    vi.stubEnv("AUTH_SECRET", "a-different-secret");
    expect(readSessionCookie(value)).toBeNull();
  });

  it("throws when AUTH_SECRET is not configured", () => {
    vi.stubEnv("AUTH_SECRET", "");
    expect(() => issueSessionCookie()).toThrow(/AUTH_SECRET/);
  });
});
