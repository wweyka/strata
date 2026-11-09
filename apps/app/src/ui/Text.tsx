import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { useTheme } from './theme';
import { type as typeScale, type Colors, type TypeVariant } from './tokens';

export type TextProps = RNTextProps & {
  variant?: TypeVariant;
  color?: keyof Colors;
  align?: 'left' | 'center' | 'right';
};

export function Text({ variant = 'body', color = 'text', align, style, ...props }: TextProps) {
  const { colors } = useTheme();
  const role =
    variant === 'display' || variant === 'title' || variant === 'heading' ? { role: 'heading' as const } : null;
  return (
    <RNText
      {...role}
      {...props}
      style={[typeScale[variant], { color: colors[color] }, align ? { textAlign: align } : null, style]}
    />
  );
}
