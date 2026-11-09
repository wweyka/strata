import { CONTENT_TYPES, type ContentType } from '@strata/shared';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Plus, Sparkles } from 'lucide-react-native';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';

import { describeError } from '@/data/errors';
import { useMaterials } from '@/data/materials';
import { useActiveMode, useUpdateFeedPreferences, useUpdateLearningMode } from '@/data/modes';
import { useAuth } from '@/features/auth/AuthProvider';
import { TextLink } from '@/features/auth/AuthShell';
import { MaterialStatusList } from '@/features/library/MaterialStatusList';
import { CONTENT_TYPE_ICONS, mixSummary, modeDescription, modeName } from '@/features/modes/labels';
import { db } from '@/lib/supabase';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Notice,
  Screen,
  Skeleton,
  SkeletonRows,
  Text,
  space,
} from '@/ui';

function useReadyContentCount(types: ContentType[] | undefined) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['content-count', session?.user.id, types],
    enabled: !!session && !!types,
    queryFn: async () => {
      const { count, error } = await db()
        .from('content_items')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'ready')
        .in('type', types!);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export default function Discover() {
  const { t } = useTranslation();
  const wide = useWindowDimensions().width >= 600;
  const { modes, prefs, active } = useActiveMode();
  const setPrefs = useUpdateFeedPreferences();
  const updateMode = useUpdateLearningMode();
  const materials = useMaterials();
  const content = useReadyContentCount(active?.content_types);

  const loading = modes.isPending || prefs.isPending;
  const failed = modes.isError || prefs.isError;

  const toggleType = (type: ContentType) => {
    if (!active) return;
    const enabled = active.content_types.includes(type);
    if (enabled && active.content_types.length === 1) return;
    const next = enabled ? active.content_types.filter((c) => c !== type) : [...active.content_types, type];
    updateMode.mutate({ id: active.id, patch: { content_types: next } });
  };

  const ready = (materials.data ?? []).filter((m) => m.status === 'ready');
  const pending = (materials.data ?? []).filter((m) => m.status !== 'ready');
  const awaitingKeys = pending.some((m) => m.status === 'awaiting_credentials');

  return (
    <Screen
      title={t('discover.title')}
      subtitle={t('discover.subtitle')}
      refreshing={materials.isRefetching}
      onRefresh={() => {
        void materials.refetch();
        void modes.refetch();
        void content.refetch();
      }}
    >
      {failed ? (
        <ErrorState
          message={describeError(modes.error ?? prefs.error, t)}
          onRetry={() => {
            void modes.refetch();
            void prefs.refetch();
          }}
        />
      ) : (
        <View style={{ gap: space[8] }}>
          <View style={{ gap: space[3] }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text variant="overline" color="textFaint">
                {t('discover.mode')}
              </Text>
              <TextLink href="/profile/modes" label={t('discover.manageModes')} />
            </View>
            {loading ? (
              <View style={{ flexDirection: 'row', gap: space[2] }}>
                <Skeleton width={110} height={36} rounded={999} />
                <Skeleton width={140} height={36} rounded={999} />
                <Skeleton width={120} height={36} rounded={999} />
              </View>
            ) : (
              <ScrollView
                horizontal={!wide}
                scrollEnabled={!wide}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: space[2], flexWrap: wide ? 'wrap' : 'nowrap', flexDirection: 'row' }}
              >
                {modes.data?.map((mode) => (
                  <Chip
                    key={mode.id}
                    label={modeName(mode, t)}
                    selected={mode.id === active?.id}
                    onPress={() => setPrefs.mutate({ active_mode_id: mode.id })}
                  />
                ))}
              </ScrollView>
            )}
            {active ? (
              <Text variant="small" color="textMuted">
                {[modeDescription(active, t), mixSummary(active, t)].filter(Boolean).join('  ·  ')}
              </Text>
            ) : null}
          </View>

          <View style={{ gap: space[3] }}>
            <Text variant="overline" color="textFaint">
              {t('discover.showInFeed')}
            </Text>
            {loading ? (
              <Skeleton height={36} />
            ) : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
                {CONTENT_TYPES.map((type) => {
                  const on = !!active?.content_types.includes(type);
                  return (
                    <Chip
                      key={type}
                      label={t(`contentTypes.${type}`)}
                      icon={CONTENT_TYPE_ICONS[type]}
                      tone="soft"
                      selected={on}
                      disabled={!active}
                      accessibilityHint={on && active?.content_types.length === 1 ? t('discover.lastType') : undefined}
                      onPress={() => toggleType(type)}
                    />
                  );
                })}
              </View>
            )}
            <Text variant="small" color="textFaint">
              {t('discover.togglesHint')}
            </Text>
            {updateMode.isError ? <Notice tone="danger">{describeError(updateMode.error, t)}</Notice> : null}
          </View>

          {materials.isPending || content.isPending ? (
            <SkeletonRows count={3} />
          ) : (materials.data?.length ?? 0) === 0 ? (
            <Card>
              <EmptyState
                icon={Sparkles}
                title={t('discover.emptyTitle')}
                body={t('discover.emptyBody')}
                action={<Button icon={Plus} label={t('discover.addMaterial')} onPress={() => router.push('/library')} />}
              />
            </Card>
          ) : (content.data ?? 0) === 0 ? (
            <View style={{ gap: space[4] }}>
              <Card style={{ gap: space[5] }}>
                <View style={{ gap: space[1] }}>
                  <Text variant="subheading">
                    {ready.length > 0 ? t('discover.generatingTitle') : t('discover.preparingTitle')}
                  </Text>
                  <Text variant="small" color="textMuted">
                    {ready.length > 0 ? t('discover.generatingBody') : t('discover.preparingBody')}
                  </Text>
                </View>
                <MaterialStatusList materials={[...pending, ...ready].slice(0, 6)} />
              </Card>
              {awaitingKeys ? (
                <Notice tone="warning" title={t('discover.awaitingTitle')}>
                  <Text variant="small">{t('discover.awaitingBody')}</Text>
                </Notice>
              ) : null}
            </View>
          ) : (
            <Card>
              <Text variant="body">{t('discover.readyCount', { count: content.data })}</Text>
            </Card>
          )}
        </View>
      )}
    </Screen>
  );
}
