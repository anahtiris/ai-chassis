import { describe, it, expect, vi } from "vitest";
import { buildSubmissionData, postSubmission } from "./submitForm";

describe("buildSubmissionData", () => {
  it("returns [] for empty values", () => {
    expect(buildSubmissionData({})).toEqual([]);
  });

  it("maps each entry to { field, value }, preserving types", () => {
    expect(buildSubmissionData({ name: "Ada", agree: true, count: 3 })).toEqual(
      [
        { field: "name", value: "Ada" },
        { field: "agree", value: true },
        { field: "count", value: 3 },
      ],
    );
  });
});

describe("postSubmission", () => {
  it("POSTs { form, submissionData } to /api/form-submissions and returns ok on 2xx", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ doc: { id: 1 } }),
    });

    const result = await postSubmission(
      7,
      { name: "Ada", email: "ada@example.com" },
      fetchImpl as unknown as typeof fetch,
    );

    expect(result).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledWith("/api/form-submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        form: 7,
        submissionData: [
          { field: "name", value: "Ada" },
          { field: "email", value: "ada@example.com" },
        ],
      }),
    });
  });

  it("returns the server error message on status >= 400", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      status: 400,
      json: async () => ({ errors: [{ message: "Email is required" }] }),
    });

    const result = await postSubmission(
      7,
      {},
      fetchImpl as unknown as typeof fetch,
    );

    expect(result).toEqual({
      ok: false,
      status: 400,
      message: "Email is required",
    });
  });

  it("falls back to a generic message when the error body has none", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      status: 500,
      json: async () => ({}),
    });

    const result = await postSubmission(
      7,
      {},
      fetchImpl as unknown as typeof fetch,
    );

    expect(result).toEqual({
      ok: false,
      status: 500,
      message: "Internal Server Error",
    });
  });
});
