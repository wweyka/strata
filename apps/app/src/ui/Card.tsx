import { Pressable, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';

import { useTheme } from './theme';
import { radius, space } from './tokens';

export function Card({
  style,
  padded = true,
  muted = false,
  ...props
}: ViewProps & { padded?: boolean; muted?: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      {...props}
      style={[
        {
          backgroundColor: muted ? colors.surfaceMuted : colors.surface,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: muted ? 'transparent' : colors.border,
          padding: padded ? space[5] : 0,
          overflow: 'hidden',
        },
        style,
      ]}
    />
  );
}

export function PressableCard({
  onPress,
  label,
  style,
  children,
}: {
  onPress: () => void;
  label: string;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        {
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: hovered ? colors.borderStrong : colors.border,
          padding: space[5],
          opacity: pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}
