export type SubmissionField = { field: string; value: unknown };

export type SubmissionResult =
  { ok: true } | { ok: false; status: number; message: string };

export function buildSubmissionData(
  values: Record<string, unknown>,
): SubmissionField[] {
  return Object.entries(values).map(([field, value]) => ({ field, value }));
}

export async function postSubmission(
  formID: number | string,
  values: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
): Promise<SubmissionResult> {
  const res = await fetchImpl("/api/form-submissions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      form: formID,
      submissionData: buildSubmissionData(values),
    }),
  });

  const json: unknown = await res.json().catch(() => ({}));

  if (res.status >= 400) {
    const message =
      (json as { errors?: { message?: string }[] })?.errors?.[0]?.message ||
      "Internal Server Error";
    return { ok: false, status: res.status, message };
  }

  return { ok: true };
}
