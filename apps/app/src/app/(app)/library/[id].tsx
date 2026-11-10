import { router, useLocalSearchParams } from 'expo-router';
import { ExternalLink, RotateCcw, SearchX } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { describeError } from '@/data/errors';
import { openMaterialFile, useChapters, useIngestJob, useMaterialTopics, useRetryMaterial } from '@/data/knowledge';
import { useMaterials } from '@/data/materials';
import type { Material, ProcessingWarning } from '@/data/types';
import { MaterialIcon } from '@/features/library/MaterialIcon';
import { canRetry, failureMessage, formatBytes, stageLabel, statusTone } from '@/features/library/status';
import { pageRange } from '@/features/knowledge/labels';
import {
  BackButton,
  Button,
  Card,
  EmptyState,
  ErrorState,
  ListRow,
  Notice,
  Pill,
  ProgressBar,
  Screen,
  Section,
  SkeletonRows,
  Text,
  space,
} from '@/ui';

export default function MaterialScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const materials = useMaterials();
  const material = materials.data?.find((m) => m.id === id);

  if (materials.isPending) {
    return (
      <Screen>
        <BackButton fallback="/library" />
        <SkeletonRows count={5} />
      </Screen>
    );
  }
  if (!material) {
    return (
      <Screen>
        <BackButton fallback="/library" />
        <EmptyState icon={SearchX} title={t('material.notFound')} />
      </Screen>
    );
  }
  return <MaterialView material={material} />;
}

function MaterialView({ material }: { material: Material }) {
  const { t, i18n } = useTranslation();
  const ready = material.status === 'ready';
  const job = useIngestJob(material);
  const retry = useRetryMaterial();
  const [opening, setOpening] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const date = new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' });

  const meta = [
    t(`library.kind.${material.kind}`),
    material.page_count ? t('material.pages', { count: material.page_count }) : null,
    formatBytes(material.size_bytes, i18n.language),
    date.format(new Date(material.created_at)),
  ].filter(Boolean);

  const open = async () => {
    setActionError(null);
    setOpening(true);
    try {
      await openMaterialFile(material);
    } catch (e) {
      setActionError(describeError(e, t));
    } finally {
      setOpening(false);
    }
  };

  const stats = job.data?.result?.stats;
  const warnings = job.data?.result?.warnings ?? [];

  return (
    <Screen>
      <BackButton fallback="/library" />
      <View style={{ gap: space[6], paddingTop: space[4] }}>
        <View style={{ flexDirection: 'row', gap: space[4], alignItems: 'flex-start' }}>
          <MaterialIcon kind={material.kind} />
          <View style={{ flex: 1, minWidth: 0, gap: space[2] }}>
            <Text variant="title">{material.title}</Text>
            <Text variant="small" color="textMuted">
              {meta.join(' · ')}
            </Text>
            <Pill label={t(`library.status.${material.status}`)} tone={statusTone[material.status]} />
          </View>
        </View>

        {material.status === 'queued' || material.status === 'processing' || material.status === 'uploading' ? (
          <Card style={{ gap: space[3] }}>
            <Text variant="subheading">{t('material.processingTitle')}</Text>
            <ProgressBar value={material.progress} label={stageLabel(material.stage, t)} />
            <Text variant="small" color="textMuted">
              {stageLabel(material.stage, t)} · {Math.round(material.progress * 100)}%
            </Text>
            {material.stage === 'retrying' && material.error ? (
              <Text variant="small" color="textMuted">
                {failureMessage(material.error, t)}
              </Text>
            ) : null}
            <Text variant="small" color="textFaint">
              {material.status === 'processing' ? t('material.processingBody') : t('material.queuedBody')}
            </Text>
          </Card>
        ) : null}

        {material.status === 'awaiting_credentials' ? (
          <Notice tone="warning" title={t('material.awaitingTitle')}>
            {t('material.awaitingBody')}
          </Notice>
        ) : null}

        {material.status === 'failed' ? (
          <Notice tone="danger" title={t('material.failedTitle')}>
            <View style={{ gap: space[3] }}>
              <Text variant="small">{failureMessage(material.error, t)}</Text>
              {canRetry(material.error) ? (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={RotateCcw}
                  label={t('material.retry')}
                  loading={retry.isPending}
                  style={{ alignSelf: 'flex-start' }}
                  onPress={async () => {
                    setActionError(null);
                    try {
                      await retry.mutateAsync(material.id);
                    } catch (e) {
                      setActionError(describeError(e, t));
                    }
                  }}
                />
              ) : null}
            </View>
          </Notice>
        ) : null}

        {actionError ? <Notice tone="danger">{actionError}</Notice> : null}

        {ready ? (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[3] }}>
              <Button variant="secondary" icon={ExternalLink} label={t('material.openFile')} loading={opening} onPress={open} />
              {stats?.topics != null ? (
                <Text variant="small" color="textMuted">
                  {[
                    t('material.topicsCount', { count: stats.topics }),
                    t('material.ideasCount', { count: stats.items ?? 0 }),
                  ].join(' · ')}
                </Text>
              ) : null}
            </View>
            {warnings.map((warning) => (
              <Notice key={warning.kind} tone="warning">
                {warningText(warning, t)}
              </Notice>
            ))}
            <Text variant="small" color="textFaint">
              {t('material.grounding')}
            </Text>
            <TopicList materialId={material.id} />
            <ChapterList materialId={material.id} />
          </>
        ) : null}
      </View>
    </Screen>
  );
}

function warningText(warning: ProcessingWarning, t: ReturnType<typeof useTranslation>['t']): string {
  switch (warning.kind) {
    case 'scans_skipped':
      return t('material.warnings.scans_skipped', { count: warning.count, limit: warning.limit });
    case 'illegible_pages':
      return t('material.warnings.illegible_pages', { count: warning.count });
    case 'no_topics':
      return t('material.warnings.no_topics');
  }
}

function TopicList({ materialId }: { materialId: string }) {
  const { t } = useTranslation();
  const topics = useMaterialTopics(materialId, true);
  if (topics.isPending) return <SkeletonRows count={4} />;
  if (topics.isError) return <ErrorState message={describeError(topics.error, t)} onRetry={() => void topics.refetch()} />;
  const list = topics.data ?? [];
  return (
    <Section title={t('material.topics')}>
      {list.length === 0 ? (
        <ListRow title={t('material.noTopics')} />
      ) : (
        list.map((topic) => (
          <ListRow
            key={topic.id}
            title={topic.title}
            subtitle={[
              topic.difficulty ? t(`topic.level.level${topic.difficulty}`) : null,
              t('material.ideasCount', { count: topic.knowledge_items[0]?.count ?? 0 }),
            ]
              .filter(Boolean)
              .join(' · ')}
            onPress={() => router.push(`/library/topic/${topic.id}`)}
          />
        ))
      )}
    </Section>
  );
}

function ChapterList({ materialId }: { materialId: string }) {
  const { t } = useTranslation();
  const chapters = useChapters(materialId, true);
  if (chapters.isPending || chapters.isError || !chapters.data?.length) return null;
  return (
    <Section title={t('material.chapters')}>
      {chapters.data.map((chapter) => (
        <View key={chapter.id} style={{ paddingLeft: (chapter.level - 1) * space[4] }}>
          <ListRow title={chapter.title} value={pageRange(chapter.page_start, chapter.page_end, t)} />
        </View>
      ))}
    </Section>
  );
}
