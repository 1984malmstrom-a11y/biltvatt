export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const json = (data: unknown, status = 200, headers: HeadersInit = {}) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
export const fail = (status: number, message: string): never => {
  throw new ApiError(status, message);
};
export function text(value: unknown, label: string, max = 80): string {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    return fail(400, `${label} är ogiltigt.`);
  return value.trim();
}
export function integer(
  value: unknown,
  label: string,
  maximum = 1000000,
): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > maximum
  )
    return fail(400, `${label} måste vara ett giltigt heltal.`);
  return value;
}
export async function body(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("Content-Type")?.includes("application/json"))
    return fail(415, "Använd JSON för anropet.");
  const raw = await request.text();
  if (raw.length > 8192) return fail(413, "Anropet är för stort.");
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object" || Array.isArray(data))
      throw new Error();
    return data;
  } catch {
    return fail(400, "Anropet innehåller ogiltig JSON.");
  }
}
export function checkFields(data: Record<string, unknown>, allowed: string[]) {
  if (
    !Object.keys(data).length ||
    Object.keys(data).some((k) => !allowed.includes(k))
  )
    fail(400, "Anropet innehåller okända eller saknade fält.");
}
