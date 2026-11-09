import { env } from './env';
import { db } from './supabase';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export class ApiNotConfigured extends Error {
  constructor() {
    super('The Strata AI service is not configured: set EXPO_PUBLIC_API_URL.');
  }
}

/** Calls the Strata AI service as the signed-in user. Provider keys never reach the app. */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!env.apiUrl) throw new ApiNotConfigured();
  const { data } = await db().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ApiError(401, 'Sign in to continue.');
  const response = await fetch(`${env.apiUrl}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = body && typeof body.detail === 'string' ? body.detail : response.statusText;
    throw new ApiError(response.status, detail);
  }
  return body as T;
}
