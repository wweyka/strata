import { Eye, EyeOff } from 'lucide-react-native';
import { forwardRef, useState, type ComponentRef } from 'react';
import { Pressable, TextInput, View, type TextInputProps } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Text } from './Text';
import { useTheme } from './theme';
import { fonts, radius, space } from './tokens';

export type TextFieldProps = TextInputProps & {
  label: string;
  error?: string | null;
  hint?: string;
  password?: boolean;
};

export type TextFieldRef = ComponentRef<typeof TextInput>;

export const TextField = forwardRef<TextFieldRef, TextFieldProps>(function TextField(
  { label, error, hint, password, style, onFocus, onBlur, ...props },
  ref,
) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const borderColor = error ? colors.danger : focused ? colors.text : colors.borderStrong;
  return (
    <View style={{ gap: space[2], alignSelf: 'stretch' }}>
      <Text variant="smallMedium" color="textMuted">
        {label}
      </Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          borderWidth: 1,
          borderColor,
          borderRadius: radius.md,
          backgroundColor: colors.surface,
          minHeight: 48,
        }}
      >
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          aria-invalid={!!error}
          placeholderTextColor={colors.textFaint}
          secureTextEntry={password && !revealed}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...props}
          style={[
            {
              flex: 1,
              paddingHorizontal: space[4],
              paddingVertical: space[3],
              fontFamily: fonts.regular,
              fontSize: 16,
              color: colors.text,
              outlineStyle: 'none',
            } as object,
            props.multiline ? { minHeight: 96, textAlignVertical: 'top' } : null,
            style,
          ]}
        />
        {password ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={revealed ? t('common.hidePassword') : t('common.showPassword')}
            onPress={() => setRevealed((v) => !v)}
            hitSlop={8}
            style={{ paddingHorizontal: space[3], height: 46, justifyContent: 'center' }}
          >
            {revealed ? <EyeOff size={18} color={colors.textMuted} /> : <Eye size={18} color={colors.textMuted} />}
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text variant="small" color="danger" accessibilityLiveRegion="polite" role="alert">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="small" color="textFaint">
          {hint}
        </Text>
      ) : null}
    </View>
  );
});
