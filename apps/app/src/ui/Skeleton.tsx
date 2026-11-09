import { useEffect, useState } from 'react';
import { Animated, View, type DimensionValue } from 'react-native';

import { useTheme } from './theme';
import { radius, space } from './tokens';

export function Skeleton({
  width = '100%',
  height = 16,
  rounded = radius.sm,
}: {
  width?: DimensionValue;
  height?: number;
  rounded?: number;
}) {
  const { colors } = useTheme();
  const [pulse] = useState(() => new Animated.Value(0.55));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.55, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width, height, borderRadius: rounded, backgroundColor: colors.surfaceSunken, opacity: pulse }}
    />
  );
}

export function SkeletonRows({ count = 3 }: { count?: number }) {
  return (
    <View accessibilityLabel="Loading" accessibilityRole="progressbar" style={{ gap: space[4] }}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: space[3], alignItems: 'center' }}>
          <Skeleton width={40} height={40} rounded={radius.md} />
          <View style={{ flex: 1, gap: space[2] }}>
            <Skeleton width="60%" height={14} />
            <Skeleton width="35%" height={12} />
          </View>
        </View>
      ))}
    </View>
  );
}
