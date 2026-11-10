import { router, useLocalSearchParams } from 'expo-router';
import { FileText, SearchX } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { describeError } from '@/data/errors';
import { openMaterialFile, useTopic } from '@/data/knowledge';
import { useMaterials } from '@/data/materials';
import type { KnowledgeItem, Material, TopicDetail, TopicLink } from '@/data/types';
import { pageRange } from '@/features/knowledge/labels';
import {
  BackButton,
  EmptyState,
  ErrorState,
  ListRow,
  Notice,
  Pill,
  Screen,
  Section,
  SkeletonRows,
  Text,
  radius,
  space,
  useTheme,
} from '@/ui';

export default function TopicScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const topic = useTopic(id);

  return (
    <Screen>
      <BackButton fallback="/library" />
      {topic.isPending ? (
        <SkeletonRows count={6} />
      ) : topic.isError ? (
        <ErrorState message={describeError(topic.error, t)} onRetry={() => void topic.refetch()} />
      ) : !topic.data ? (
        <EmptyState icon={SearchX} title={t('topic.notFound')} />
      ) : (
        <TopicView topic={topic.data} />
      )}
    </Screen>
  );
}

function TopicView({ topic }: { topic: TopicDetail }) {
  const { t } = useTranslation();
  const materials = useMaterials();
  const byId = new Map((materials.data ?? []).map((m) => [m.id, m]));
  const [openError, setOpenError] = useState<string | null>(null);
  const hasAdditions = topic.items.some((item) => item.basis === 'ai_supplement');

  const open = async (material: Material, page: number | null) => {
    setOpenError(null);
    try {
      await openMaterialFile(material, page);
    } catch (e) {
      setOpenError(describeError(e, t));
    }
  };

  return (
    <View style={{ gap: space[8], paddingTop: space[4] }}>
      <View style={{ gap: space[2] }}>
        {topic.subject ? (
          <Text variant="overline" color="textFaint">
            {topic.subject}
          </Text>
        ) : null}
        <Text variant="title">{topic.title}</Text>
        {topic.difficulty ? <Pill label={t(`topic.level.level${topic.difficulty}`)} /> : null}
        {topic.summary ? (
          <Text variant="body" color="textMuted">
            {topic.summary}
          </Text>
        ) : null}
      </View>

      <View style={{ gap: space[3] }}>
        <Text variant="overline" color="textFaint">
          {t('topic.keyIdeas')}
        </Text>
        {hasAdditions ? <Notice>{t('topic.aiAdditionHint')}</Notice> : null}
        {openError ? <Notice tone="danger">{openError}</Notice> : null}
        {topic.items.length === 0 ? (
          <Text variant="body" color="textMuted">
            {t('topic.noIdeas')}
          </Text>
        ) : (
          topic.items.map((item) => (
            <ItemCard key={item.id} item={item} material={item.material_id ? byId.get(item.material_id) : undefined} onOpen={open} />
          ))
        )}
      </View>

      <Links title={t('topic.partOf')} topics={topic.parent ? [topic.parent] : []} />
      <Links title={t('topic.subtopics')} topics={topic.children} />
      <Links title={t('topic.learnFirst')} topics={topic.learnFirst} />
      <Links title={t('topic.leadsTo')} topics={topic.leadsTo} />
      <Links title={t('topic.related')} topics={topic.related} />

      {topic.sources.length ? (
        <Section title={t('topic.sources')}>
          {topic.sources.map((source, index) => {
            const material = byId.get(source.material_id);
            return (
              <ListRow
                key={`${source.material_id}-${index}`}
                icon={FileText}
                title={source.chapter}
                subtitle={material?.title}
                value={pageRange(source.page_start, source.page_end, t)}
                onPress={material ? () => router.push(`/library/${material.id}`) : undefined}
              />
            );
          })}
        </Section>
      ) : null}
    </View>
  );
}

function ItemCard({
  item,
  material,
  onOpen,
}: {
  item: KnowledgeItem;
  material?: Material;
  onOpen: (material: Material, page: number | null) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const fromSource = item.basis === 'source';
  return (
    <View
      style={{
        gap: space[2],
        padding: space[4],
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        // AI additions are set apart visually as well as by their label.
        backgroundColor: fromSource ? colors.surface : colors.surfaceMuted,
        borderStyle: fromSource ? 'solid' : 'dashed',
      }}
    >
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2] }}>
        <Text variant="caption" color="textMuted">
          {t(`topic.kind.${item.kind}`)}
        </Text>
        <Pill
          label={fromSource ? t('topic.fromMaterial') : t('topic.aiAddition')}
          tone={fromSource ? 'success' : 'accent'}
        />
      </View>
      {item.term ? <Text variant="subheading">{item.term}</Text> : null}
      <Text variant="body">{item.content}</Text>
      {item.citations.map((citation, index) => (
        <View key={index} style={{ gap: space[1], borderLeftWidth: 2, borderLeftColor: colors.borderStrong, paddingLeft: space[3] }}>
          {citation.quote ? (
            <Text variant="small" color="textMuted">
              {t('topic.quote', { quote: citation.quote })}
            </Text>
          ) : null}
          {material ? (
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={
                citation.page_number
                  ? t('topic.openAtPage', { title: material.title, page: citation.page_number })
                  : t('topic.openSource', { title: material.title })
              }
              onPress={() => onOpen(material, citation.page_number)}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, alignSelf: 'flex-start' })}
            >
              <Text variant="caption" color="textFaint" style={{ textDecorationLine: 'underline' }}>
                {[material.title, citation.page_number ? t('material.page', { page: citation.page_number }) : null]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ))}
    </View>
  );
}

function Links({ title, topics }: { title: string; topics: TopicLink[] }) {
  if (!topics.length) return null;
  return (
    <Section title={title}>
      {topics.map((topic) => (
        <ListRow key={topic.id} title={topic.title} onPress={() => router.push(`/library/topic/${topic.id}`)} />
      ))}
    </Section>
  );
}
