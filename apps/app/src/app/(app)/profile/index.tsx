import { APPEARANCES, type Appearance } from '@strata/shared';
import { router } from 'expo-router';
import {
  BookOpen,
  Brain,
  CalendarClock,
  Cpu,
  Languages,
  LogOut,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  UserRound,
  type LucideIcon,
} from 'lucide-react-native';
import { useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useCapabilities, useDeleteAccount } from '@/data/account';
import { describeError } from '@/data/errors';
import { useActiveMode } from '@/data/modes';
import { useLearningStats, useProfile, useSubscription, useUpdateProfile } from '@/data/profile';
import { useAuth } from '@/features/auth/AuthProvider';
import { modeName } from '@/features/modes/labels';
import { ApiNotConfigured } from '@/lib/api';
import { env } from '@/lib/env';
import { db } from '@/lib/supabase';
import {
  Avatar,
  Button,
  Card,
  Dialog,
  ListRow,
  Notice,
  Pill,
  Screen,
  Section,
  SegmentedControl,
  Skeleton,
  Text,
  TextField,
  space,
  useTheme,
} from '@/ui';

const LANGUAGE_NAMES: Record<string, string> = { en: 'English', es: 'Español', ru: 'Русский' };

function StatTile({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value?: number }) {
  const { colors } = useTheme();
  return (
    <Card style={{ flex: 1, minWidth: 130, gap: space[2], padding: space[4] }}>
      <Icon size={16} color={colors.textMuted} strokeWidth={1.75} />
      {value === undefined ? <Skeleton width={36} height={26} /> : <Text variant="heading">{value}</Text>}
      <Text variant="caption" color="textMuted">
        {label}
      </Text>
    </Card>
  );
}

export default function ProfileScreen() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const { width } = useWindowDimensions();
  const { setPreference } = useTheme();
  const profile = useProfile();
  const update = useUpdateProfile();
  const subscription = useSubscription();
  const stats = useLearningStats();
  const { active } = useActiveMode();
  const capabilities = useCapabilities();
  const deleteAccount = useDeleteAccount();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const p = profile.data;
  const awaiting = capabilities.data?.filter((c) => c.status === 'awaiting_credentials') ?? [];
  const confirmWord = t('profile.deleteConfirmWord');

  const setAppearance = (value: Appearance) => {
    setPreference(value);
    update.mutate({ appearance: value });
  };

  return (
    <Screen title={t('profile.title')} refreshing={stats.isRefetching} onRefresh={() => void stats.refetch()}>
      <View style={{ gap: space[8] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[4] }}>
          <Avatar name={p?.display_name} email={session?.user.email} size={64} />
          <View style={{ flex: 1, gap: space[1] }}>
            {p ? (
              <Text variant="heading" numberOfLines={1}>
                {p.display_name || session?.user.email}
              </Text>
            ) : (
              <Skeleton width={160} height={22} />
            )}
            <Text variant="small" color="textMuted" numberOfLines={1}>
              {session?.user.email}
            </Text>
          </View>
          {subscription.data ? <Pill tone="accent" label={subscription.data.plans?.name ?? subscription.data.plan_id} /> : null}
        </View>

        <View style={{ flexDirection: 'row', flexWrap: width < 520 ? 'wrap' : 'nowrap', gap: space[3] }}>
          <StatTile icon={BookOpen} label={t('profile.statMaterials')} value={stats.data?.materials} />
          <StatTile icon={Brain} label={t('profile.statTopics')} value={stats.data?.topics} />
          <StatTile icon={Sparkles} label={t('profile.statMastered')} value={stats.data?.mastered} />
          <StatTile icon={CalendarClock} label={t('profile.statDue')} value={stats.data?.dueReviews} />
        </View>

        <Section title={t('profile.learning')}>
          <ListRow
            icon={SlidersHorizontal}
            title={t('profile.modes')}
            subtitle={active ? t('profile.activeMode', { name: modeName(active, t) }) : undefined}
            onPress={() => router.push('/profile/modes')}
          />
          <ListRow
            icon={Sparkles}
            title={t('profile.feedPreferences')}
            subtitle={t('profile.feedPreferencesHint')}
            onPress={() => router.push('/profile/preferences')}
          />
          <ListRow
            icon={UserRound}
            title={t('profile.editProfile')}
            subtitle={p ? [p.learning_languages.join(', ').toUpperCase(), t('profile.interestsCount', { count: p.interests.length })].join(' · ') : undefined}
            onPress={() => router.push('/profile/edit')}
          />
        </Section>

        <Section title={t('profile.appearance')}>
          <View style={{ padding: space[4] }}>
            <SegmentedControl
              label={t('profile.appearance')}
              value={p?.appearance ?? 'system'}
              onChange={setAppearance}
              options={APPEARANCES.map((a) => ({ value: a, label: t(`profile.appearanceOptions.${a}`) }))}
            />
          </View>
          <ListRow
            icon={Languages}
            title={t('profile.interfaceLanguage')}
            value={p ? LANGUAGE_NAMES[p.interface_language] ?? p.interface_language : undefined}
            onPress={() => router.push('/profile/edit')}
          />
        </Section>

        <Section
          title={t('profile.aiFeatures')}
          footer={env.apiUrl ? t('profile.aiFeaturesFooter') : undefined}
        >
          {!env.apiUrl || capabilities.error instanceof ApiNotConfigured ? (
            <ListRow icon={Cpu} title={t('profile.apiNotConfigured')} subtitle={t('profile.apiNotConfiguredHint')} />
          ) : capabilities.isPending ? (
            <View style={{ padding: space[4] }}>
              <Skeleton height={18} />
            </View>
          ) : capabilities.isError ? (
            <ListRow icon={Cpu} title={t('profile.apiUnreachable')} subtitle={describeError(capabilities.error, t)} />
          ) : (
            capabilities.data!.map((c) => (
              <ListRow
                key={c.key}
                title={t(`capabilities.${c.key}`)}
                subtitle={c.provider}
                right={
                  <Pill
                    tone={c.status === 'ready' ? 'success' : 'warning'}
                    label={c.status === 'ready' ? t('profile.ready') : t('profile.awaitingCredentials')}
                  />
                }
              />
            ))
          )}
        </Section>
        {awaiting.length > 0 ? <Notice tone="warning">{t('profile.awaitingExplainer')}</Notice> : null}

        <Section title={t('profile.account')}>
          <ListRow
            icon={LogOut}
            title={t('profile.signOut')}
            chevron={false}
            onPress={() => void db().auth.signOut()}
          />
          {env.apiUrl ? (
            <ListRow
              icon={Trash2}
              title={t('profile.deleteAccount')}
              subtitle={t('profile.deleteAccountHint')}
              destructive
              chevron={false}
              onPress={() => {
                setConfirmText('');
                setConfirmDelete(true);
              }}
            />
          ) : null}
        </Section>
      </View>

      <Dialog
        visible={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t('profile.deleteTitle')}
        description={t('profile.deleteBody')}
        actions={
          <>
            <Button variant="ghost" label={t('common.cancel')} onPress={() => setConfirmDelete(false)} />
            <Button
              variant="danger"
              label={t('profile.deleteForever')}
              loading={deleteAccount.isPending}
              disabled={confirmText.trim().toUpperCase() !== confirmWord.toUpperCase()}
              onPress={() => deleteAccount.mutate()}
            />
          </>
        }
      >
        <TextField
          label={t('profile.deleteTypeToConfirm', { word: confirmWord })}
          value={confirmText}
          onChangeText={setConfirmText}
          autoCapitalize="characters"
          autoCorrect={false}
        />
        {deleteAccount.isError ? <Notice tone="danger">{describeError(deleteAccount.error, t)}</Notice> : null}
      </Dialog>
    </Screen>
  );
}
