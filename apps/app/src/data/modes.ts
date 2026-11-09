import type { ContentType } from '@strata/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import { db } from '@/lib/supabase';

import type { FeedPreferences, FeedPreferencesUpdate, LearningMode, LearningModeUpdate } from './types';

const modesKey = (userId?: string) => ['modes', userId] as const;
const feedKey = (userId?: string) => ['feed-preferences', userId] as const;

export function useLearningModes() {
  const { session } = useAuth();
  const userId = session?.user.id;
  return useQuery({
    queryKey: modesKey(userId),
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await db()
        .from('learning_modes')
        .select('*')
        .order('sort_order')
        .order('created_at');
      if (error) throw error;
      return (data as LearningMode[]).map((m) => ({ ...m, target_retention: Number(m.target_retention) }));
    },
  });
}

export function useFeedPreferences() {
  const { session } = useAuth();
  const userId = session?.user.id;
  return useQuery({
    queryKey: feedKey(userId),
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await db().from('feed_preferences').select('*').eq('user_id', userId!).single();
      if (error) throw error;
      const prefs = data as FeedPreferences;
      return { ...prefs, playback_rate: Number(prefs.playback_rate) };
    },
  });
}

export function useUpdateFeedPreferences() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (patch: FeedPreferencesUpdate) => {
      const { data, error } = await db()
        .from('feed_preferences')
        .update(patch)
        .eq('user_id', userId!)
        .select('*')
        .single();
      if (error) throw error;
      return data as FeedPreferences;
    },
    onMutate: async (patch) => {
      await client.cancelQueries({ queryKey: feedKey(userId) });
      const previous = client.getQueryData<FeedPreferences>(feedKey(userId));
      if (previous) client.setQueryData(feedKey(userId), { ...previous, ...patch });
      return { previous };
    },
    onError: (_e, _p, context) => {
      if (context?.previous) client.setQueryData(feedKey(userId), context.previous);
    },
    onSettled: () => client.invalidateQueries({ queryKey: feedKey(userId) }),
  });
}

export function useUpdateLearningMode() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: LearningModeUpdate }) => {
      const { data, error } = await db().from('learning_modes').update(patch).eq('id', id).select('*').single();
      if (error) throw error;
      return data as LearningMode;
    },
    onMutate: async ({ id, patch }) => {
      await client.cancelQueries({ queryKey: modesKey(userId) });
      const previous = client.getQueryData<LearningMode[]>(modesKey(userId));
      if (previous) {
        client.setQueryData(
          modesKey(userId),
          previous.map((m) => (m.id === id ? { ...m, ...patch } : m)),
        );
      }
      return { previous };
    },
    onError: (_e, _v, context) => {
      if (context?.previous) client.setQueryData(modesKey(userId), context.previous);
    },
    onSettled: () => client.invalidateQueries({ queryKey: modesKey(userId) }),
  });
}

export type NewLearningMode = LearningModeUpdate & { name: string; content_types: ContentType[] };

export function useCreateLearningMode() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (mode: NewLearningMode) => {
      const existing = client.getQueryData<LearningMode[]>(modesKey(userId)) ?? [];
      const sort_order = existing.reduce((max, m) => Math.max(max, m.sort_order), 0) + 1;
      const { data, error } = await db()
        .from('learning_modes')
        .insert({ ...mode, sort_order })
        .select('*')
        .single();
      if (error) throw error;
      return data as LearningMode;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: modesKey(userId) }),
  });
}

export function useDeleteLearningMode() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db().from('learning_modes').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: modesKey(userId) });
      // The active mode falls back to none when deleted (ON DELETE SET NULL).
      client.invalidateQueries({ queryKey: feedKey(userId) });
    },
  });
}

/** The active mode, falling back to the first mode when none is selected. */
export function useActiveMode() {
  const modes = useLearningModes();
  const prefs = useFeedPreferences();
  const active =
    modes.data?.find((m) => m.id === prefs.data?.active_mode_id) ?? modes.data?.[0] ?? null;
  return { modes, prefs, active };
}
