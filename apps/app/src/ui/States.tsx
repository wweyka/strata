import type { LucideIcon } from 'lucide-react-native';
import { AlertTriangle, Info, CircleCheck } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from './Button';
import { Text } from './Text';
import { useTheme } from './theme';
import { radius, space } from './tokens';

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: LucideIcon;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: space[12], paddingHorizontal: space[6], gap: space[4] }}>
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: radius.lg,
          backgroundColor: colors.surfaceMuted,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon size={24} color={colors.textMuted} strokeWidth={1.75} />
      </View>
      <View style={{ gap: space[2], maxWidth: 420 }}>
        <Text variant="heading" align="center">
          {title}
        </Text>
        {body ? (
          <Text variant="body" color="textMuted" align="center">
            {body}
          </Text>
        ) : null}
      </View>
      {action}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon={AlertTriangle}
      title={t('common.errorTitle')}
      body={message ?? t('common.errorBody')}
      action={onRetry ? <Button variant="secondary" label={t('common.retry')} onPress={onRetry} /> : undefined}
    />
  );
}

type Tone = 'info' | 'danger' | 'success' | 'warning';

export function Notice({ tone = 'info', title, children }: { tone?: Tone; title?: string; children?: ReactNode }) {
  const { colors } = useTheme();
  const map = {
    info: { bg: colors.surfaceMuted, fg: colors.text, icon: Info },
    danger: { bg: colors.dangerSoft, fg: colors.danger, icon: AlertTriangle },
    success: { bg: colors.successSoft, fg: colors.success, icon: CircleCheck },
    warning: { bg: colors.warningSoft, fg: colors.warning, icon: AlertTriangle },
  }[tone];
  const Icon = map.icon;
  return (
    <View
      role={tone === 'danger' ? 'alert' : undefined}
      accessibilityLiveRegion="polite"
      style={{
        flexDirection: 'row',
        gap: space[3],
        padding: space[4],
        borderRadius: radius.md,
        backgroundColor: map.bg,
        alignSelf: 'stretch',
      }}
    >
      <Icon size={18} color={map.fg} style={{ marginTop: 2 }} />
      <View style={{ flex: 1, gap: space[1] }}>
        {title ? (
          <Text variant="smallMedium" style={{ color: map.fg }}>
            {title}
          </Text>
        ) : null}
        {typeof children === 'string' ? (
          <Text variant="small" color="text">
            {children}
          </Text>
        ) : (
          children
        )}
      </View>
    </View>
  );
}

export function Pill({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | Tone | 'accent' }) {
  const { colors } = useTheme();
  const map = {
    neutral: { bg: colors.surfaceMuted, fg: colors.textMuted },
    info: { bg: colors.surfaceMuted, fg: colors.text },
    accent: { bg: colors.accentSoft, fg: colors.text },
    danger: { bg: colors.dangerSoft, fg: colors.danger },
    success: { bg: colors.successSoft, fg: colors.success },
    warning: { bg: colors.warningSoft, fg: colors.warning },
  }[tone];
  return (
    <View
      style={{
        paddingHorizontal: space[2],
        paddingVertical: 3,
        borderRadius: radius.pill,
        backgroundColor: map.bg,
        alignSelf: 'flex-start',
      }}
    >
      <Text variant="caption" style={{ color: map.fg }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  const { colors } = useTheme();
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: pct }}
      style={{ height: 4, borderRadius: 2, backgroundColor: colors.surfaceSunken, overflow: 'hidden' }}
    >
      <View style={{ width: `${pct}%`, height: 4, backgroundColor: colors.ink }} />
    </View>
  );
}
