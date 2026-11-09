import { useEffect, useState } from 'react';
import { Animated, Pressable } from 'react-native';

import { useTheme } from './theme';

export function Toggle({
  value,
  onValueChange,
  label,
  disabled,
}: {
  value: boolean;
  onValueChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const [position] = useState(() => new Animated.Value(value ? 1 : 0));
  useEffect(() => {
    Animated.timing(position, { toValue: value ? 1 : 0, duration: 160, useNativeDriver: false }).start();
  }, [value, position]);
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      onPress={() => onValueChange(!value)}
      disabled={disabled}
      hitSlop={8}
      style={{ opacity: disabled ? 0.45 : 1 }}
    >
      <Animated.View
        style={{
          width: 44,
          height: 26,
          borderRadius: 13,
          padding: 3,
          backgroundColor: position.interpolate({
            inputRange: [0, 1],
            outputRange: [colors.borderStrong, colors.ink],
          }),
        }}
      >
        <Animated.View
          style={{
            width: 20,
            height: 20,
            borderRadius: 10,
            backgroundColor: value ? colors.onInk : colors.surface,
            transform: [{ translateX: position.interpolate({ inputRange: [0, 1], outputRange: [0, 18] }) }],
          }}
        />
      </Animated.View>
    </Pressable>
  );
}
