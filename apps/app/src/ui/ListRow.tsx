import type { LucideIcon } from 'lucide-react-native';
import { ChevronRight } from 'lucide-react-native';
import { Children, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { Text } from './Text';
import { useTheme } from './theme';
import { radius, space } from './tokens';

export function ListRow({
  title,
  subtitle,
  icon: Icon,
  value,
  right,
  onPress,
  chevron = !!onPress,
  destructive = false,
  accessibilityLabel,
}: {
  title: string;
  subtitle?: string | null;
  icon?: LucideIcon;
  value?: string | null;
  right?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  destructive?: boolean;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  const content = (
    <>
      {Icon ? (
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: radius.md,
            backgroundColor: destructive ? colors.dangerSoft : colors.surfaceMuted,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon size={18} color={destructive ? colors.danger : colors.text} strokeWidth={1.75} />
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyMedium" color={destructive ? 'danger' : 'text'} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="small" color="textMuted" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text variant="small" color="textMuted" numberOfLines={1} style={{ maxWidth: '45%' }}>
          {value}
        </Text>
      ) : null}
      {right}
      {chevron ? <ChevronRight size={18} color={colors.textFaint} /> : null}
    </>
  );
  const rowStyle = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space[3],
    paddingVertical: space[3],
    paddingHorizontal: space[4],
    minHeight: 56,
  };
  if (!onPress) return <View style={rowStyle}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      onPress={onPress}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        rowStyle,
        { backgroundColor: pressed || hovered ? colors.surfaceMuted : 'transparent' },
      ]}
    >
      {content}
    </Pressable>
  );
}

export function Divider({ inset = 0 }: { inset?: number }) {
  const { colors } = useTheme();
  return <View style={{ height: 1, backgroundColor: colors.border, marginLeft: inset }} />;
}

/** A titled card of rows separated by hairlines. */
export function Section({ title, children, footer }: { title?: string; children: ReactNode; footer?: string }) {
  const { colors } = useTheme();
  const items = Children.toArray(children);
  return (
    <View style={{ gap: space[2] }}>
      {title ? (
        <Text variant="overline" color="textFaint" style={{ paddingHorizontal: space[1] }}>
          {title}
        </Text>
      ) : null}
      <View
        style={{
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.border,
          overflow: 'hidden',
        }}
      >
        {items.map((child, i) => (
          <View key={i}>
            {i > 0 ? <Divider inset={space[4]} /> : null}
            {child}
          </View>
        ))}
      </View>
      {footer ? (
        <Text variant="small" color="textFaint" style={{ paddingHorizontal: space[1] }}>
          {footer}
        </Text>
      ) : null}
    </View>
  );
}
