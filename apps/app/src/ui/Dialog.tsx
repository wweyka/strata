import type { ReactNode } from 'react';
import { Modal, Pressable, View, useWindowDimensions } from 'react-native';

import { Text } from './Text';
import { useTheme } from './theme';
import { radius, space } from './tokens';

/** Centred dialog on wide screens, bottom sheet on phones. */
export function Dialog({
  visible,
  onClose,
  title,
  description,
  children,
  actions,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const sheet = width < 600;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: sheet ? 'flex-end' : 'center', alignItems: 'center' }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.overlay }}
        />
        <View
          role="dialog"
          aria-modal
          aria-label={title}
          style={{
            width: sheet ? '100%' : 440,
            maxWidth: '100%',
            backgroundColor: colors.surface,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            borderBottomLeftRadius: sheet ? 0 : radius.xl,
            borderBottomRightRadius: sheet ? 0 : radius.xl,
            padding: space[6],
            paddingBottom: sheet ? space[10] : space[6],
            gap: space[4],
          }}
        >
          <View style={{ gap: space[2] }}>
            <Text variant="heading">{title}</Text>
            {description ? (
              <Text variant="body" color="textMuted">
                {description}
              </Text>
            ) : null}
          </View>
          {children}
          {actions ? (
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: space[2], flexWrap: 'wrap' }}>
              {actions}
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
