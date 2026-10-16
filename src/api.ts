export class HttpError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  // Defense in depth: children cannot silently fall back to production APIs
  // inside the presentation. Only read-only authorization crosses the boundary.
  if(typeof window!=='undefined'&&/^\/arena\/(showtime|discover)(?:\/|$)/.test(window.location.pathname)&&
    !(path==='/arena/superadmin/presentation-access'&&(options.method??'GET')==='GET'))
    throw new HttpError('Produktionsanrop är spärrade i presentationen.',403);
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: "same-origin",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok)
    throw new HttpError(data.error ?? "Anropet misslyckades.", response.status);
  return data as T;
}
export const send = (method: string, data: unknown): RequestInit => ({
  method,
  body: JSON.stringify(data),
});
export const sek = (value: number) =>
  new Intl.NumberFormat("sv-SE", {
    style: "currency",
    currency: "SEK",
    maximumFractionDigits: 0,
  }).format(value);
export const percent = (value: number) =>
  `${new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 1 }).format(value)} %`;
