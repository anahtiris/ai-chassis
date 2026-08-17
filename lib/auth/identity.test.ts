import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  isEmailClaimTrusted,
  readEmailVerified,
  resolveSignIn,
  trustedEmailProviders,
  type OAuthIdentity,
  type SignInFacts,
} from "./identity";

const ORIGINAL_TRUSTED = process.env.AUTH_TRUSTED_EMAIL_PROVIDERS;

function identity(overrides: Partial<OAuthIdentity> = {}): OAuthIdentity {
  return {
    provider: "oidc",
    providerAccountId: "sub-123",
    email: "someone@example.com",
    emailVerified: true,
    ...overrides,
  };
}

function facts(overrides: Partial<SignInFacts> = {}): SignInFacts {
  return {
    linkedUserId: null,
    linkedUserArchived: false,
    emailUserId: null,
    emailUserArchived: false,
    isFirstUser: false,
    ...overrides,
  };
}

beforeEach(() => {
  delete process.env.AUTH_TRUSTED_EMAIL_PROVIDERS;
});

afterEach(() => {
  if (ORIGINAL_TRUSTED === undefined) {
    delete process.env.AUTH_TRUSTED_EMAIL_PROVIDERS;
  } else {
    process.env.AUTH_TRUSTED_EMAIL_PROVIDERS = ORIGINAL_TRUSTED;
  }
});

describe("trustedEmailProviders", () => {
  it("defaults to Entra ID only", () => {
    expect(trustedEmailProviders()).toEqual(["microsoft-entra-id"]);
  });

  it("parses a comma-separated override, trimming entries", () => {
    process.env.AUTH_TRUSTED_EMAIL_PROVIDERS = "oidc, microsoft-entra-id ";
    expect(trustedEmailProviders()).toEqual(["oidc", "microsoft-entra-id"]);
  });

  it("treats an empty override as trusting nothing", () => {
    process.env.AUTH_TRUSTED_EMAIL_PROVIDERS = "";
    expect(trustedEmailProviders()).toEqual([]);
  });
});

describe("isEmailClaimTrusted", () => {
  it("trusts an explicitly verified email from any provider", () => {
    expect(isEmailClaimTrusted(identity({ emailVerified: true }))).toBe(true);
  });

  it("rejects an explicitly unverified email even from a trusted provider", () => {
    process.env.AUTH_TRUSTED_EMAIL_PROVIDERS = "oidc";
    expect(isEmailClaimTrusted(identity({ emailVerified: false }))).toBe(false);
  });

  it("falls back to the trust list when the provider says nothing", () => {
    expect(
      isEmailClaimTrusted(
        identity({ provider: "microsoft-entra-id", emailVerified: null }),
      ),
    ).toBe(true);
    expect(isEmailClaimTrusted(identity({ emailVerified: null }))).toBe(false);
  });
});

describe("resolveSignIn", () => {
  it("allows a known identity without consulting email", () => {
    expect(
      resolveSignIn(
        identity({ email: null, emailVerified: null }),
        facts({ linkedUserId: "user-1" }),
      ),
    ).toEqual({ action: "allow", userId: "user-1" });
  });

  it("denies a known identity whose user is archived", () => {
    const decision = resolveSignIn(
      identity(),
      facts({ linkedUserId: "user-1", linkedUserArchived: true }),
    );
    expect(decision.action).toBe("deny");
  });

  it("links a verified email to an existing user", () => {
    expect(resolveSignIn(identity(), facts({ emailUserId: "user-2" }))).toEqual(
      { action: "link", userId: "user-2" },
    );
  });

  // The reason this module exists: with two IdPs configured, an untrusted
  // one asserting an owner's address must not reach that account.
  it("refuses to link an untrusted email claim to an existing user", () => {
    const decision = resolveSignIn(
      identity({ emailVerified: null }),
      facts({ emailUserId: "owner-1" }),
    );
    expect(decision).toEqual({
      action: "deny",
      reason: 'email claim from "oidc" is not trusted for account linking',
    });
  });

  it("denies linking to an archived user", () => {
    const decision = resolveSignIn(
      identity(),
      facts({ emailUserId: "user-3", emailUserArchived: true }),
    );
    expect(decision.action).toBe("deny");
  });

  it("bootstraps the first user as owner", () => {
    expect(resolveSignIn(identity(), facts({ isFirstUser: true }))).toEqual({
      action: "bootstrap",
    });
  });

  it("will not bootstrap on an untrusted email claim", () => {
    const decision = resolveSignIn(
      identity({ emailVerified: null }),
      facts({ isFirstUser: true }),
    );
    expect(decision.action).toBe("deny");
  });

  it("does not auto-provision an unknown email once a user exists", () => {
    const decision = resolveSignIn(identity(), facts());
    expect(decision).toEqual({
      action: "deny",
      reason: "no user provisioned for this email",
    });
  });

  it("denies when the provider returns no email and no identity is linked", () => {
    const decision = resolveSignIn(
      identity({ email: null }),
      facts({ isFirstUser: true }),
    );
    expect(decision).toEqual({
      action: "deny",
      reason: "provider returned no email",
    });
  });

  it("denies when the provider returns no account id", () => {
    const decision = resolveSignIn(
      identity({ providerAccountId: "" }),
      facts({ emailUserId: "user-4" }),
    );
    expect(decision).toEqual({
      action: "deny",
      reason: "provider returned no account id",
    });
  });
});

describe("readEmailVerified", () => {
  it("reads the boolean claim", () => {
    expect(readEmailVerified({ email_verified: true })).toBe(true);
    expect(readEmailVerified({ email_verified: false })).toBe(false);
  });

  it("reads the stringified claim some providers send", () => {
    expect(readEmailVerified({ email_verified: "true" })).toBe(true);
    expect(readEmailVerified({ email_verified: "false" })).toBe(false);
  });

  it("returns null when the claim is absent or unusable", () => {
    expect(readEmailVerified({})).toBeNull();
    expect(readEmailVerified(null)).toBeNull();
    expect(readEmailVerified({ email_verified: 1 })).toBeNull();
  });
});
