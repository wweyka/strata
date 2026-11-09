import { Settings } from 'lucide-react-native';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { EmptyState, Screen, Text, space } from '@/ui';

/** Shown instead of the app when the build has no Supabase configuration. */
export function ConfigMissing() {
  const { t } = useTranslation();
  return (
    <Screen>
      <EmptyState icon={Settings} title={t('config.title')} body={t('config.body')} />
      <View style={{ gap: space[2], alignItems: 'center' }}>
        <Text variant="smallMedium">EXPO_PUBLIC_SUPABASE_URL</Text>
        <Text variant="smallMedium">EXPO_PUBLIC_SUPABASE_ANON_KEY</Text>
        <Text variant="small" color="textMuted" align="center">
          {t('config.docs')}
        </Text>
      </View>
    </Screen>
  );
}
