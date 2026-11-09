import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { CalendarClock, Dumbbell, Layers, Library, ListChecks, type LucideIcon } from 'lucide-react-native';
import { View, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';

import { describeError } from '@/data/errors';
import { useAuth } from '@/features/auth/AuthProvider';
import { db } from '@/lib/supabase';
import { Button, Card, EmptyState, ErrorState, Screen, Skeleton, Text, space, useTheme } from '@/ui';

async function countRows(table: string, filter?: (q: any) => any): Promise<number> {
  let query = db().from(table).select('id', { count: 'exact', head: true });
  if (filter) query = filter(query);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

function Stat({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value?: number }) {
  const { colors } = useTheme();
  return (
    <Card style={{ flex: 1, minWidth: 150, gap: space[3] }}>
      <Icon size={18} color={colors.textMuted} strokeWidth={1.75} />
      {value === undefined ? <Skeleton width={48} height={28} /> : <Text variant="title">{value}</Text>}
      <Text variant="small" color="textMuted">
        {label}
      </Text>
    </Card>
  );
}

export default function Practice() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const { width } = useWindowDimensions();
  const stats = useQuery({
    queryKey: ['practice-stats', session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const [due, flashcards, questions] = await Promise.all([
        countRows('revision_schedules', (q) => q.lte('due_at', new Date().toISOString())),
        countRows('flashcards'),
        countRows('quiz_questions'),
      ]);
      return { due, flashcards, questions };
    },
  });

  const empty = stats.data && stats.data.flashcards === 0 && stats.data.questions === 0;

  return (
    <Screen
      title={t('practice.title')}
      subtitle={t('practice.subtitle')}
      refreshing={stats.isRefetching}
      onRefresh={() => void stats.refetch()}
    >
      {stats.isError ? (
        <ErrorState message={describeError(stats.error, t)} onRetry={() => void stats.refetch()} />
      ) : (
        <View style={{ gap: space[6] }}>
          <View style={{ flexDirection: width < 520 ? 'column' : 'row', gap: space[3] }}>
            <Stat icon={CalendarClock} label={t('practice.due')} value={stats.data?.due} />
            <Stat icon={Layers} label={t('practice.flashcards')} value={stats.data?.flashcards} />
            <Stat icon={ListChecks} label={t('practice.questions')} value={stats.data?.questions} />
          </View>
          {empty ? (
            <Card>
              <EmptyState
                icon={Dumbbell}
                title={t('practice.emptyTitle')}
                body={t('practice.emptyBody')}
                action={
                  <Button
                    variant="secondary"
                    icon={Library}
                    label={t('paths.openLibrary')}
                    onPress={() => router.push('/library')}
                  />
                }
              />
            </Card>
          ) : null}
        </View>
      )}
    </Screen>
  );
}
