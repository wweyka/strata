import { router } from 'expo-router';
import { Check, Plus } from 'lucide-react-native';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { describeError } from '@/data/errors';
import { useActiveMode, useUpdateFeedPreferences } from '@/data/modes';
import { mixSummary, modeName } from '@/features/modes/labels';
import { BackButton, Button, ErrorState, ListRow, Screen, Section, SkeletonRows, Text, space, useTheme } from '@/ui';

export default function ModesScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { modes, active } = useActiveMode();
  const setPrefs = useUpdateFeedPreferences();

  return (
    <Screen>
      <BackButton fallback="/profile" />
      <View style={{ gap: space[6], paddingTop: space[4] }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: space[3] }}>
          <View style={{ flex: 1, gap: space[1] }}>
            <Text variant="title">{t('profile.modes')}</Text>
            <Text variant="body" color="textMuted">
              {t('modes.subtitle')}
            </Text>
          </View>
          <Button icon={Plus} label={t('modes.new')} onPress={() => router.push('/profile/modes/new')} />
        </View>
        {modes.isPending ? (
          <SkeletonRows count={6} />
        ) : modes.isError ? (
          <ErrorState message={describeError(modes.error, t)} onRetry={() => void modes.refetch()} />
        ) : (
          <Section footer={t('modes.footer')}>
            {modes.data.map((mode) => (
              <ListRow
                key={mode.id}
                title={modeName(mode, t)}
                subtitle={`${t('modes.typesCount', { count: mode.content_types.length })} · ${mixSummary(mode, t)}`}
                onPress={() => router.push({ pathname: '/profile/modes/[id]', params: { id: mode.id } })}
                right={
                  mode.id === active?.id ? (
                    <Check size={18} color={colors.accent} accessibilityLabel={t('modes.active')} />
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      label={t('modes.use')}
                      onPress={() => setPrefs.mutate({ active_mode_id: mode.id })}
                    />
                  )
                }
              />
            ))}
          </Section>
        )}
      </View>
    </Screen>
  );
}
