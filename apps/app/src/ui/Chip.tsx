import type { LucideIcon } from 'lucide-react-native';
import { Check } from 'lucide-react-native';
import { Pressable } from 'react-native';

import { Text } from './Text';
import { useTheme } from './theme';
import { radius, space } from './tokens';

export function Chip({
  label,
  selected = false,
  onPress,
  icon: Icon,
  disabled,
  showCheck = false,
  tone = 'solid',
  accessibilityHint,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: LucideIcon;
  disabled?: boolean;
  showCheck?: boolean;
  /** solid: single choice (one filled chip). soft: multi-select toggles, lighter when many are on. */
  tone?: 'solid' | 'soft';
  accessibilityHint?: string;
}) {
  const { colors } = useTheme();
  const soft = tone === 'soft';
  const fg = selected && !soft ? colors.onInk : colors.text;
  const bg = selected ? (soft ? colors.accentSoft : colors.ink) : colors.surface;
  const border = selected ? (soft ? colors.accent : colors.ink) : colors.borderStrong;
  return (
    <Pressable
      accessibilityRole={onPress ? 'checkbox' : undefined}
      accessibilityState={{ checked: selected, disabled: !!disabled }}
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      disabled={disabled || !onPress}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[1] + 2,
        height: 36,
        paddingHorizontal: space[3] + 2,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: !selected && hovered ? colors.text : border,
        backgroundColor: bg,
        opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
      })}
    >
      {(showCheck || soft) && selected ? <Check size={14} color={fg} strokeWidth={2.5} /> : null}
      {Icon && !(soft && selected) ? <Icon size={15} color={fg} strokeWidth={2} /> : null}
      <Text variant="smallMedium" style={{ color: fg }} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}
