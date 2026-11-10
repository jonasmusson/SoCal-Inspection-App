import { supabase, supabaseAnonKey, supabaseUrl } from './supabase';

export class HubWorkspaceError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'HubWorkspaceError';
    this.status = status;
  }
}

export async function hubWorkspace<T>(
  action: string,
  options: { method?: 'GET' | 'POST'; body?: Record<string, unknown>; query?: Record<string, string> } = {},
): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new HubWorkspaceError(401, 'Sign in again to continue.');

  const url = new URL(`${supabaseUrl}/functions/v1/socal-hub-workspace`);
  url.searchParams.set('action', action);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value) url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    method: options.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: supabaseAnonKey,
      'Content-Type': 'application/json',
    },
    body: options.method === 'POST' ? JSON.stringify(options.body ?? {}) : undefined,
    redirect: 'error',
    cache: 'no-store',
  });

  const payload = await response.json().catch(() => ({})) as { error?: string } & T;
  if (!response.ok) {
    throw new HubWorkspaceError(response.status, payload.error || 'HUB request failed.');
  }
  return payload;
}
