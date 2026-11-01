export class DashboardRequestError extends Error {
  constructor(public readonly status: number | null) {
    super(
      status === null
        ? "Request timed out or network unavailable"
        : `Request failed (${status})`,
    );
    this.name = "DashboardRequestError";
  }
}

export async function apiFetch<T>(url: string): Promise<T> {
  let response: Response;
  try {
    // A hung edge/database request must resolve to an error state, not leave a
    // full-page skeleton on screen indefinitely.
    response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new DashboardRequestError(null);
  }
  if (!response.ok) throw new DashboardRequestError(response.status);
  try {
    return (await response.json()) as T;
  } catch {
    throw new DashboardRequestError(null);
  }
}
export const inr = (paise: string | number | bigint) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(paise) / 100);
export const sentence = (value: string) =>
  value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
