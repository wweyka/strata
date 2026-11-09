import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { describeError } from '@/data/errors';
import { useFeedPreferences, useUpdateFeedPreferences } from '@/data/modes';
import { BackButton, ErrorState, ListRow, Notice, Screen, Section, SegmentedControl, SkeletonRows, Text, Toggle, space } from '@/ui';

const RATES = [0.75, 1, 1.25, 1.5, 2];
const GOALS = [10, 15, 30, 45, 60];

export default function FeedPreferencesScreen() {
  const { t, i18n } = useTranslation();
  const prefs = useFeedPreferences();
  const update = useUpdateFeedPreferences();
  const number = new Intl.NumberFormat(i18n.language);

  return (
    <Screen>
      <BackButton fallback="/profile" />
      <View style={{ gap: space[6], paddingTop: space[4] }}>
        <View style={{ gap: space[1] }}>
          <Text variant="title">{t('profile.feedPreferences')}</Text>
          <Text variant="body" color="textMuted">
            {t('preferences.subtitle')}
          </Text>
        </View>
        {prefs.isPending ? (
          <SkeletonRows count={3} />
        ) : prefs.isError ? (
          <ErrorState message={describeError(prefs.error, t)} onRetry={() => void prefs.refetch()} />
        ) : (
          <>
            <Section title={t('preferences.videos')}>
              <ListRow
                title={t('preferences.autoplay')}
                subtitle={t('preferences.autoplayHint')}
                right={
                  <Toggle
                    label={t('preferences.autoplay')}
                    value={prefs.data.autoplay}
                    onValueChange={(v) => update.mutate({ autoplay: v })}
                  />
                }
              />
              <ListRow
                title={t('preferences.captions')}
                subtitle={t('preferences.captionsHint')}
                right={
                  <Toggle
                    label={t('preferences.captions')}
                    value={prefs.data.captions_enabled}
                    onValueChange={(v) => update.mutate({ captions_enabled: v })}
                  />
                }
              />
              <View style={{ padding: space[4], gap: space[3] }}>
                <Text variant="bodyMedium">{t('preferences.speed')}</Text>
                <SegmentedControl
                  label={t('preferences.speed')}
                  value={prefs.data.playback_rate}
                  onChange={(v) => update.mutate({ playback_rate: v })}
                  options={RATES.map((r) => ({ value: r, label: `${number.format(r)}×` }))}
                />
              </View>
            </Section>
            <Section title={t('preferences.goal')} footer={t('preferences.goalHint')}>
              <View style={{ padding: space[4] }}>
                <SegmentedControl
                  label={t('preferences.goal')}
                  value={prefs.data.daily_goal_minutes}
                  onChange={(v) => update.mutate({ daily_goal_minutes: v })}
                  options={GOALS.map((g) => ({ value: g, label: t('preferences.minutes', { count: g }) }))}
                />
              </View>
            </Section>
            {update.isError ? <Notice tone="danger">{describeError(update.error, t)}</Notice> : null}
          </>
        )}
      </View>
    </Screen>
  );
}
