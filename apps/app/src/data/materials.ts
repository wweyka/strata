import {
  materialKindFor,
  materialStoragePath,
  resolveMimeType,
  titleFromFileName,
} from '@strata/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { useEffect } from 'react';

import { useAuth } from '@/features/auth/AuthProvider';
import { db } from '@/lib/supabase';

import { readPickedFile, type PickedFile } from './picked-file';
import type { Material } from './types';

const materialsKey = (userId?: string) => ['materials', userId] as const;

let liveChannels = 0;

/**
 * Keep the learner's materials current while they are signed in: status changes
 * (queued → processing → ready) arrive live from the workers. Mounted once, by the signed-in
 * layout, so screens that read materials never open channels of their own.
 */
export function useMaterialsLiveUpdates() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const client = useQueryClient();

  useEffect(() => {
    if (!userId) return;
    // Each subscription gets its own topic. supabase-js hands back an existing channel when the
    // topic matches (for example while the previous one is still closing), and adding listeners
    // to a channel that has already subscribed throws.
    const channel = db()
      .channel(`materials:${userId}:${++liveChannels}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'materials', filter: `user_id=eq.${userId}` },
        () => client.invalidateQueries({ queryKey: materialsKey(userId) }),
      )
      .subscribe();
    return () => {
      void db().removeChannel(channel);
    };
  }, [userId, client]);
}

export function useMaterials() {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: materialsKey(userId),
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await db()
        .from('materials')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Material[];
    },
  });
}

export class UploadError extends Error {
  constructor(
    public code: 'unsupported_type' | 'duplicate' | 'empty_file',
    message: string,
  ) {
    super(message);
  }
}

export type UploadProgress = 'preparing' | 'uploading' | 'finishing';

/**
 * Upload one file into the user's private folder and queue it for processing:
 * 1. insert the material row (plan limits are enforced by the database),
 * 2. upload the bytes to Storage under `<user>/<material>/…`,
 * 3. confirm with `complete_material_upload`, which enqueues ingestion exactly once.
 */
export function useUploadMaterial(onProgress?: (stage: UploadProgress) => void) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (file: PickedFile) => {
      onProgress?.('preparing');
      const mimeType = resolveMimeType(file.name, file.mimeType);
      if (!mimeType) throw new UploadError('unsupported_type', 'unsupported_type');
      const bytes = await readPickedFile(file);
      if (bytes.byteLength === 0) throw new UploadError('empty_file', 'empty_file');
      const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes);
      const checksum = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');

      const { data: existing } = await db()
        .from('materials')
        .select('id, title')
        .eq('checksum_sha256', checksum)
        .neq('status', 'uploading')
        .limit(1);
      if (existing && existing.length > 0) {
        throw new UploadError('duplicate', existing[0].title as string);
      }

      const id = Crypto.randomUUID();
      const storagePath = materialStoragePath(userId!, id, file.name);
      const { error: insertError } = await db().from('materials').insert({
        id,
        title: titleFromFileName(file.name),
        kind: materialKindFor(mimeType),
        original_filename: file.name.slice(0, 255),
        mime_type: mimeType,
        size_bytes: bytes.byteLength,
        storage_path: storagePath,
        checksum_sha256: checksum,
      });
      if (insertError) throw insertError;

      onProgress?.('uploading');
      const { error: uploadError } = await db()
        .storage.from('materials')
        .upload(storagePath, bytes, { contentType: mimeType, upsert: false });
      if (uploadError) {
        await db().from('materials').delete().eq('id', id);
        throw uploadError;
      }

      onProgress?.('finishing');
      const { data, error } = await db().rpc('complete_material_upload', { p_material_id: id });
      if (error) throw error;
      return data as Material;
    },
    onSettled: () => {
      client.invalidateQueries({ queryKey: materialsKey(userId) });
      client.invalidateQueries({ queryKey: ['stats', userId] });
    },
  });
}

export function useRenameMaterial() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      const { error } = await db().from('materials').update({ title: title.trim() }).eq('id', id);
      if (error) throw error;
    },
    onSettled: () => client.invalidateQueries({ queryKey: materialsKey(userId) }),
  });
}

/** Removes the stored file first, then the row; derived knowledge cascades with the row. */
export function useDeleteMaterial() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (material: Material) => {
      const { error: storageError } = await db().storage.from('materials').remove([material.storage_path]);
      if (storageError) throw storageError;
      const { error } = await db().from('materials').delete().eq('id', material.id);
      if (error) throw error;
    },
    onSettled: () => {
      client.invalidateQueries({ queryKey: materialsKey(userId) });
      client.invalidateQueries({ queryKey: ['stats', userId] });
    },
  });
}
