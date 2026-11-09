import { View } from 'react-native';

import { Text } from './Text';
import { useTheme } from './theme';

export function initialsOf(name: string | null | undefined, fallback: string | null | undefined): string {
  const source = (name || fallback || '?').trim();
  const words = source.split(/[\s@._-]+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[1][0] : source.slice(0, 2);
  return letters.toUpperCase();
}

export function Avatar({ name, email, size = 56 }: { name?: string | null; email?: string | null; size?: number }) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.accentSoft,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text variant={size >= 56 ? 'heading' : 'smallMedium'} style={{ color: colors.text }}>
        {initialsOf(name, email)}
      </Text>
    </View>
  );
}
