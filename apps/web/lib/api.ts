import { createClient } from "@/lib/supabase/client";
import type { ApiResponse } from "@/lib/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL!;

/** Error de API con el código devuelto por el backend (envelope ApiResponse). */
export class ApiCallError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
      ...(init.headers ?? {}),
    },
  });

  let body: ApiResponse<T> | null = null;
  try {
    body = (await res.json()) as ApiResponse<T>;
  } catch {
    // sin cuerpo JSON
  }

  if (!res.ok) {
    const code = body?.error?.code ?? String(res.status);
    const message = body?.error?.message ?? res.statusText;
    // FastAPI devuelve {detail: "..."} para HTTPException; lo contemplamos.
    const detail = (body as unknown as { detail?: string } | null)?.detail;
    throw new ApiCallError(detail ?? code, detail ?? message, res.status);
  }

  return (body?.data ?? null) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(data ?? {}) }),
  patch: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(data ?? {}) }),
};
