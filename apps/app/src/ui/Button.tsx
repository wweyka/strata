import type { LucideIcon } from 'lucide-react-native';
import { ActivityIndicator, Pressable, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { focusRingVisible } from './focus-visible';
import { Text } from './Text';
import { useTheme } from './theme';
import { radius, space } from './tokens';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';

export type ButtonProps = Omit<PressableProps, 'children' | 'style'> & {
  label: string;
  variant?: Variant;
  size?: 'md' | 'sm';
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  loading?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  icon: Icon,
  iconRight: IconRight,
  loading = false,
  fullWidth = false,
  disabled,
  style,
  ...props
}: ButtonProps) {
  const { colors } = useTheme();
  const palette = {
    primary: { bg: colors.ink, fg: colors.onInk, border: colors.ink },
    accent: { bg: colors.accent, fg: colors.onAccent, border: colors.accent },
    secondary: { bg: colors.surface, fg: colors.text, border: colors.borderStrong },
    ghost: { bg: 'transparent', fg: colors.text, border: 'transparent' },
    danger: { bg: colors.danger, fg: '#FFFFFF', border: colors.danger },
  }[variant];
  const inactive = disabled || loading;
  const height = size === 'md' ? 48 : 36;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!inactive, busy: loading }}
      disabled={inactive}
      {...props}
      style={({ pressed, hovered, focused }: { pressed: boolean; hovered?: boolean; focused?: boolean }) => [
        {
          height,
          paddingHorizontal: size === 'md' ? space[5] : space[3],
          borderRadius: radius.md,
          borderWidth: 1,
          backgroundColor: palette.bg,
          borderColor: palette.border,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: space[2],
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          opacity: inactive && !loading ? 0.45 : pressed ? 0.82 : hovered ? 0.92 : 1,
        },
        variant === 'ghost' && (hovered || pressed) ? { backgroundColor: colors.surfaceMuted } : null,
        focusRingVisible(focused) ? { outlineColor: colors.focus, outlineWidth: 2, outlineOffset: 2, outlineStyle: 'solid' } : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} size="small" />
      ) : (
        <>
          {Icon ? <Icon size={size === 'md' ? 18 : 16} color={palette.fg} strokeWidth={2} /> : null}
          <Text variant={size === 'md' ? 'bodyMedium' : 'smallMedium'} style={{ color: palette.fg }} numberOfLines={1}>
            {label}
          </Text>
          {IconRight ? (
            <View>
              <IconRight size={size === 'md' ? 18 : 16} color={palette.fg} strokeWidth={2} />
            </View>
          ) : null}
        </>
      )}
    </Pressable>
  );
}

export function IconButton({
  icon: Icon,
  label,
  onPress,
  disabled,
  tone = 'text',
  size = 40,
}: {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'text' | 'muted' | 'danger';
  size?: number;
}) {
  const { colors } = useTheme();
  const color = tone === 'danger' ? colors.danger : tone === 'muted' ? colors.textMuted : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({
        width: size,
        height: size,
        borderRadius: radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed || hovered ? colors.surfaceMuted : 'transparent',
        opacity: disabled ? 0.4 : 1,
      })}
    >
      <Icon size={20} color={color} strokeWidth={2} />
    </Pressable>
  );
}
