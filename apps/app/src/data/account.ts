import { useMutation, useQuery } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import { api } from '@/lib/api';
import { env } from '@/lib/env';
import { db } from '@/lib/supabase';

export type Capability = {
  key: string;
  purpose: string;
  provider: string;
  required: boolean;
  phase: number;
  status: 'ready' | 'awaiting_credentials';
  env_var: string;
};

export function useCapabilities() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['capabilities'],
    enabled: !!session && !!env.apiUrl,
    staleTime: 5 * 60_000,
    queryFn: () => api<{ capabilities: Capability[] }>('/v1/capabilities').then((r) => r.capabilities),
  });
}

export function useDeleteAccount() {
  return useMutation({
    mutationFn: async () => {
      await api<{ deleted: boolean }>('/v1/account', { method: 'DELETE' });
      // The account no longer exists; clear the local session without calling the server.
      await db().auth.signOut({ scope: 'local' });
    },
  });
}
