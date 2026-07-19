import { describe, expect, it } from "vitest";
import { t, tCommon, getTranslator } from "./i18n";

describe("getTranslator", () => {
  it("resolves a top-level key", () => {
    expect(t("buttons.signOut")).toBe("Sign out");
  });

  it("resolves a deeply nested key", () => {
    expect(t("settings.changePassword.title")).toBe("Change password");
  });

  it("falls back to a humanized camelCase key when missing", () => {
    expect(t("nav.doesNotExist")).toBe("Does Not Exist");
  });

  it("falls back to a humanized snake_case/kebab-case key when missing", () => {
    expect(t("some_missing-key")).toBe("Some missing key");
  });

  it("falls back to humanized form when the resolved node is not a string", () => {
    expect(t("hub.cards")).toBe("Cards");
  });

  it("falls back to humanized form for an unknown namespace", () => {
    const tUnknown = getTranslator("doesNotExist");
    expect(tUnknown("someKey")).toBe("Some Key");
  });

  it("binds tCommon to the common namespace independently of admin", () => {
    expect(tCommon).not.toBe(t);
  });
});
