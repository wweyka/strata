import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from './Text';
import { useTheme } from './theme';
import { breakpoints, contentMaxWidth, space } from './tokens';

export function Screen({
  title,
  subtitle,
  actions,
  children,
  scroll = true,
  refreshing,
  onRefresh,
  maxWidth = contentMaxWidth,
  edges = ['top'],
}: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  maxWidth?: number;
  edges?: ('top' | 'bottom')[];
}) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const wide = width >= breakpoints.wide;
  const horizontal = wide ? space[10] : space[5];
  const header = title ? (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: space[4],
        paddingTop: wide ? space[10] : space[4],
        paddingBottom: space[6],
      }}
    >
      <View style={{ flex: 1, gap: space[1] }}>
        <Text variant="title">{title}</Text>
        {subtitle ? (
          <Text variant="body" color="textMuted">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {actions ? <View style={{ flexDirection: 'row', gap: space[2] }}>{actions}</View> : null}
    </View>
  ) : null;
  const inner = (
    <View style={{ width: '100%', maxWidth, alignSelf: 'center', paddingHorizontal: horizontal, paddingBottom: space[12] }}>
      {header}
      {children}
    </View>
  );
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: colors.background }}>
      {scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ flexGrow: 1 }}
          refreshControl={
            onRefresh ? (
              <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.textMuted} />
            ) : undefined
          }
        >
          {inner}
        </ScrollView>
      ) : (
        inner
      )}
    </SafeAreaView>
  );
}
