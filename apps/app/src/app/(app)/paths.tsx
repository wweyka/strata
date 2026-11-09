import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Library, Route } from 'lucide-react-native';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { describeError } from '@/data/errors';
import { useAuth } from '@/features/auth/AuthProvider';
import { db } from '@/lib/supabase';
import { Button, Card, EmptyState, ErrorState, Pill, Screen, SkeletonRows, Text, space } from '@/ui';

type PathRow = { id: string; title: string; description: string | null; status: string };

export default function Paths() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const paths = useQuery({
    queryKey: ['paths', session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await db()
        .from('learning_paths')
        .select('id, title, description, status')
        .neq('status', 'archived')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return data as PathRow[];
    },
  });

  return (
    <Screen
      title={t('paths.title')}
      subtitle={t('paths.subtitle')}
      refreshing={paths.isRefetching}
      onRefresh={() => void paths.refetch()}
    >
      {paths.isPending ? (
        <SkeletonRows count={3} />
      ) : paths.isError ? (
        <ErrorState message={describeError(paths.error, t)} onRetry={() => void paths.refetch()} />
      ) : paths.data.length === 0 ? (
        <Card>
          <EmptyState
            icon={Route}
            title={t('paths.emptyTitle')}
            body={t('paths.emptyBody')}
            action={
              <Button variant="secondary" icon={Library} label={t('paths.openLibrary')} onPress={() => router.push('/library')} />
            }
          />
        </Card>
      ) : (
        <View style={{ gap: space[3] }}>
          {paths.data.map((p) => (
            <Card key={p.id} style={{ gap: space[2] }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space[3] }}>
                <Text variant="subheading" style={{ flex: 1 }}>
                  {p.title}
                </Text>
                <Pill label={t(`paths.status.${p.status}`)} />
              </View>
              {p.description ? (
                <Text variant="small" color="textMuted" numberOfLines={3}>
                  {p.description}
                </Text>
              ) : null}
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}
