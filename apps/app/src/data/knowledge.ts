import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { useAuth } from '@/features/auth/AuthProvider';
import { db } from '@/lib/supabase';

import type {
  Chapter,
  IngestJob,
  KnowledgeItem,
  Material,
  TopicDetail,
  TopicLink,
  TopicListItem,
} from './types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The latest processing job of a material: its stats, warnings and failure details. */
export function useIngestJob(material: Material | undefined) {
  const { session } = useAuth();
  return useQuery({
    // The material's updated_at changes with every stage, so the job is re-read as it moves.
    queryKey: ['ingest-job', session?.user.id, material?.id, material?.updated_at],
    enabled: !!material && material.status !== 'uploading',
    queryFn: async () => {
      const { data, error } = await db()
        .from('jobs')
        .select('status, stage, result, error, updated_at')
        .eq('subject_type', 'material')
        .eq('subject_id', material!.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as IngestJob | null;
    },
  });
}

/** Chapters of a processed material, in reading order. */
export function useChapters(materialId: string, enabled: boolean) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['chapters', session?.user.id, materialId],
    enabled,
    queryFn: async () => {
      const { data, error } = await db()
        .from('documents')
        .select('id, chapters(id, parent_id, title, level, ordinal, page_start, page_end)')
        .eq('material_id', materialId)
        .maybeSingle();
      if (error) throw error;
      const chapters = ((data?.chapters ?? []) as Chapter[]).slice();
      return chapters.sort((a, b) => a.ordinal - b.ordinal);
    },
  });
}

/** Topics this material teaches, most important first. */
export function useMaterialTopics(materialId: string, enabled: boolean) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['material-topics', session?.user.id, materialId],
    enabled,
    queryFn: async () => {
      const { data, error } = await db()
        .from('topics')
        .select('id, title, difficulty, importance, parent_topic_id, knowledge_items(count), topic_sources!inner(material_id)')
        .eq('topic_sources.material_id', materialId)
        .order('importance', { ascending: false })
        .order('title');
      if (error) throw error;
      return (data ?? []) as unknown as TopicListItem[];
    },
  });
}

export function useTopic(topicId: string) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['topic', session?.user.id, topicId],
    enabled: !!session,
    queryFn: async (): Promise<TopicDetail | null> => {
      if (!UUID.test(topicId)) return null;
      const [topic, items, sources, relations, children] = await Promise.all([
        db()
          .from('topics')
          .select('id, title, summary, difficulty, parent_topic_id, subjects(name)')
          .eq('id', topicId)
          .maybeSingle(),
        db()
          .from('knowledge_items')
          .select('id, kind, term, content, basis, material_id')
          .eq('topic_id', topicId)
          .order('ordinal'),
        db().from('topic_sources').select('material_id, chapters(title, ordinal, page_start, page_end)').eq('topic_id', topicId),
        db()
          .from('topic_relations')
          .select('relation, from_topic_id, to_topic_id')
          .or(`from_topic_id.eq.${topicId},to_topic_id.eq.${topicId}`),
        db().from('topics').select('id, title').eq('parent_topic_id', topicId).order('title'),
      ]);
      for (const result of [topic, items, sources, relations, children]) if (result.error) throw result.error;
      if (!topic.data) return null;

      const itemRows = (items.data ?? []) as Omit<KnowledgeItem, 'citations'>[];
      const citations = itemRows.length
        ? await db()
            .from('citations')
            .select('subject_id, page_number, quote')
            .eq('subject_type', 'knowledge_item')
            .in(
              'subject_id',
              itemRows.map((item) => item.id),
            )
            .order('page_number')
        : { data: [], error: null };
      if (citations.error) throw citations.error;

      const links = (relations.data ?? []) as { relation: string; from_topic_id: string; to_topic_id: string }[];
      const parentId = topic.data.parent_topic_id as string | null;
      const otherIds = [
        ...new Set([
          ...links.map((r) => (r.from_topic_id === topicId ? r.to_topic_id : r.from_topic_id)),
          ...(parentId ? [parentId] : []),
        ]),
      ];
      const titles = otherIds.length
        ? await db().from('topics').select('id, title').in('id', otherIds)
        : { data: [], error: null };
      if (titles.error) throw titles.error;
      const byId = new Map(((titles.data ?? []) as TopicLink[]).map((t) => [t.id, t]));
      const pick = (ids: string[]) =>
        [...new Set(ids)].map((id) => byId.get(id)).filter((t): t is TopicLink => !!t);

      const subject = topic.data.subjects as unknown as { name: string } | null;
      const chapterRows = (sources.data ?? []) as unknown as {
        material_id: string;
        chapters: { title: string; ordinal: number; page_start: number | null; page_end: number | null } | null;
      }[];
      return {
        id: topic.data.id,
        title: topic.data.title,
        summary: topic.data.summary,
        difficulty: topic.data.difficulty,
        subject: subject?.name ?? null,
        parent: parentId ? (byId.get(parentId) ?? null) : null,
        children: (children.data ?? []) as TopicLink[],
        learnFirst: pick(links.filter((r) => r.relation === 'prerequisite' && r.to_topic_id === topicId).map((r) => r.from_topic_id)),
        leadsTo: pick(links.filter((r) => r.relation === 'prerequisite' && r.from_topic_id === topicId).map((r) => r.to_topic_id)),
        related: pick(
          links
            .filter((r) => r.relation !== 'prerequisite' && r.relation !== 'part_of')
            .map((r) => (r.from_topic_id === topicId ? r.to_topic_id : r.from_topic_id)),
        ),
        items: itemRows.map((item) => ({
          ...item,
          citations: ((citations.data ?? []) as { subject_id: string; page_number: number | null; quote: string | null }[])
            .filter((c) => c.subject_id === item.id)
            .map(({ page_number, quote }) => ({ page_number, quote })),
        })),
        sources: chapterRows
          .filter((row) => row.chapters)
          .sort((a, b) => a.material_id.localeCompare(b.material_id) || a.chapters!.ordinal - b.chapters!.ordinal)
          .map((row) => ({
            material_id: row.material_id,
            chapter: row.chapters!.title,
            page_start: row.chapters!.page_start,
            page_end: row.chapters!.page_end,
          })),
      };
    },
  });
}

/** Queue a failed material for processing again. */
export function useRetryMaterial() {
  const { session } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (materialId: string) => {
      const { error } = await db().rpc('retry_material_processing', { p_material_id: materialId });
      if (error) throw error;
    },
    onSettled: () => client.invalidateQueries({ queryKey: ['materials', session?.user.id] }),
  });
}

/**
 * Open the learner's own file through a short-lived private link, at a page when the viewer
 * supports it (PDF viewers honour #page=N).
 */
export async function openMaterialFile(material: Pick<Material, 'storage_path' | 'mime_type'>, page?: number | null) {
  const { data, error } = await db().storage.from('materials').createSignedUrl(material.storage_path, 600);
  if (error) throw error;
  const url = material.mime_type === 'application/pdf' && page ? `${data.signedUrl}#page=${page}` : data.signedUrl;
  if (Platform.OS === 'web') {
    window.open(url, '_blank', 'noopener,noreferrer');
  } else {
    await WebBrowser.openBrowserAsync(url);
  }
}
