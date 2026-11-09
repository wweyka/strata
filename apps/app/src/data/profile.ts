import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import { db } from '@/lib/supabase';

import type { Profile, ProfileUpdate, Subscription } from './types';

export const profileKey = (userId: string | undefined) => ['profile', userId] as const;

export function useProfile() {
  const { session } = useAuth();
  const userId = session?.user.id;
  return useQuery({
    queryKey: profileKey(userId),
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await db().from('profiles').select('*').eq('id', userId!).single();
      if (error) throw error;
      return data as Profile;
    },
  });
}

export function useUpdateProfile() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (patch: ProfileUpdate) => {
      const { data, error } = await db().from('profiles').update(patch).eq('id', userId!).select('*').single();
      if (error) throw error;
      return data as Profile;
    },
    onMutate: async (patch) => {
      await client.cancelQueries({ queryKey: profileKey(userId) });
      const previous = client.getQueryData<Profile>(profileKey(userId));
      if (previous) client.setQueryData(profileKey(userId), { ...previous, ...patch });
      return { previous };
    },
    onError: (_error, _patch, context) => {
      if (context?.previous) client.setQueryData(profileKey(userId), context.previous);
    },
    onSuccess: (profile) => client.setQueryData(profileKey(userId), profile),
  });
}

export function useSubscription() {
  const { session } = useAuth();
  const userId = session?.user.id;
  return useQuery({
    queryKey: ['subscription', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await db()
        .from('subscriptions')
        .select('plan_id, status, current_period_end, plans(name, limits)')
        .eq('user_id', userId!)
        .single();
      if (error) throw error;
      return data as unknown as Subscription;
    },
  });
}

export type LearningStats = {
  materials: number;
  topics: number;
  mastered: number;
  dueReviews: number;
};

async function count(table: string, apply?: (q: any) => any): Promise<number> {
  let query = db().from(table).select('*', { count: 'exact', head: true });
  if (apply) query = apply(query);
  const { count: total, error } = await query;
  if (error) throw error;
  return total ?? 0;
}

export function useLearningStats() {
  const { session } = useAuth();
  const userId = session?.user.id;
  return useQuery({
    queryKey: ['stats', userId],
    enabled: !!userId,
    queryFn: async (): Promise<LearningStats> => {
      const [materials, topics, mastered, dueReviews] = await Promise.all([
        count('materials'),
        count('topics'),
        count('learning_progress', (q) => q.eq('status', 'mastered')),
        count('revision_schedules', (q) => q.lte('due_at', new Date().toISOString())),
      ]);
      return { materials, topics, mastered, dueReviews };
    },
  });
}
