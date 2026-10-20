const STAFF_TOKEN_KEY = "care_access_token";

// The host sets an empty API URL when the backend shares its origin.
const apiBase = () =>
  (window.CARE_API_URL || window.location.origin).replace(/\/$/, "");

type Method = "GET" | "POST" | "PUT";

export interface Paginated<T> {
  count: number;
  results: T[];
}

export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(status: number, data: unknown) {
    super(`Request failed with status ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

export async function request<T>(
  path: string,
  method: Method = "GET",
  body?: unknown,
  queryParams?: Record<string, string | number | undefined>,
): Promise<T> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(queryParams ?? {})) {
    if (value !== undefined && value !== "") search.append(key, String(value));
  }
  const qs = search.toString();
  const token = localStorage.getItem(STAFF_TOKEN_KEY);

  const response = await fetch(
    `${apiBase()}${path}${qs ? `?${qs}` : ""}`,
    {
      method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
  );

  // Parse text-then-JSON so empty 204 bodies don't throw.
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) throw new ApiError(response.status, data);
  return data as T;
}
