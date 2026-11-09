import { Link, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { Text, breakpoints, radius, space, useTheme } from '@/ui';

export function Wordmark({ size = 28 }: { size?: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
      <View style={{ gap: 3 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={{ width: size * 0.7, height: 3, borderRadius: 2, backgroundColor: colors.text }} />
        <View style={{ width: size * 0.5, height: 3, borderRadius: 2, backgroundColor: colors.accent }} />
        <View style={{ width: size * 0.7, height: 3, borderRadius: 2, backgroundColor: colors.text }} />
      </View>
      <Text variant="title" style={{ fontSize: size, lineHeight: size * 1.1 }} accessibilityLabel="Strata">
        Strata
      </Text>
    </View>
  );
}

/** Two-column frame on wide screens (statement + form), single column on phones. */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const wide = width >= breakpoints.wide;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background, flexDirection: 'row' }}>
      {wide ? (
        <View
          style={{
            flex: 1,
            backgroundColor: colors.surfaceMuted,
            padding: space[12],
            justifyContent: 'space-between',
            borderRightWidth: 1,
            borderRightColor: colors.border,
          }}
        >
          <Wordmark />
          <View style={{ gap: space[4], maxWidth: 460 }}>
            <Text variant="display">{t('welcome.headline')}</Text>
            <Text variant="body" color="textMuted">
              {t('welcome.body')}
            </Text>
          </View>
          <Text variant="small" color="textFaint">
            {t('welcome.privacy')}
          </Text>
        </View>
      ) : null}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: wide ? space[12] : space[5] }}
        >
          <View style={{ width: '100%', maxWidth: 400, alignSelf: 'center', gap: space[6] }}>
            {!wide ? <Wordmark size={24} /> : null}
            <View style={{ gap: space[2] }}>
              <Text variant="title">{title}</Text>
              {subtitle ? (
                <Text variant="body" color="textMuted">
                  {subtitle}
                </Text>
              ) : null}
            </View>
            {children}
            {footer ? <View style={{ alignItems: 'center', gap: space[2] }}>{footer}</View> : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function TextLink({ href, label }: { href: Href; label: string }) {
  const { colors } = useTheme();
  return (
    <Link href={href} accessibilityRole="link" style={{ borderRadius: radius.sm }}>
      <Text variant="smallMedium" style={{ color: colors.text, textDecorationLine: 'underline' }}>
        {label}
      </Text>
    </Link>
  );
}

export function OrDivider({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
      <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
      <Text variant="caption" color="textFaint">
        {label}
      </Text>
      <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
    </View>
  );
}
