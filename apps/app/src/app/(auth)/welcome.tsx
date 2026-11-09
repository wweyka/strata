import { router } from 'expo-router';
import { BookOpen, Network, SlidersHorizontal } from 'lucide-react-native';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AuthShell } from '@/features/auth/AuthShell';
import { Button, Text, radius, space, useTheme } from '@/ui';

export default function Welcome() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const steps = [
    { icon: BookOpen, title: t('welcome.step1Title'), body: t('welcome.step1Body') },
    { icon: Network, title: t('welcome.step2Title'), body: t('welcome.step2Body') },
    { icon: SlidersHorizontal, title: t('welcome.step3Title'), body: t('welcome.step3Body') },
  ];
  return (
    <AuthShell title={t('welcome.title')} subtitle={t('welcome.subtitle')}>
      <View style={{ gap: space[4] }}>
        {steps.map(({ icon: Icon, title, body }) => (
          <View key={title} style={{ flexDirection: 'row', gap: space[3] }}>
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: radius.md,
                backgroundColor: colors.surfaceMuted,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon size={18} color={colors.text} strokeWidth={1.75} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodyMedium">{title}</Text>
              <Text variant="small" color="textMuted">
                {body}
              </Text>
            </View>
          </View>
        ))}
      </View>
      <View style={{ gap: space[3] }}>
        <Button label={t('welcome.createAccount')} fullWidth onPress={() => router.push('/sign-up')} />
        <Button
          label={t('welcome.signIn')}
          variant="secondary"
          fullWidth
          onPress={() => router.push('/sign-in')}
        />
      </View>
    </AuthShell>
  );
}
