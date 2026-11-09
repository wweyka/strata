import { TabList, TabSlot, TabTrigger, Tabs, type TabTriggerSlotProps } from 'expo-router/ui';
import { Compass, Dumbbell, Library, Route, UserRound, type LucideIcon } from 'lucide-react-native';
import { forwardRef, type ComponentRef } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { Wordmark } from '@/features/auth/AuthShell';
import { Text, breakpoints, radius, space, useTheme } from '@/ui';

type TabButtonProps = TabTriggerSlotProps & { icon: LucideIcon; label: string; wide: boolean };

const TabButton = forwardRef<ComponentRef<typeof Pressable>, TabButtonProps>(function TabButton(
  { icon: Icon, label, wide, isFocused, ...props },
  ref,
) {
  const { colors } = useTheme();
  const color = isFocused ? colors.text : colors.textFaint;
  return (
    <Pressable
      ref={ref}
      {...props}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!isFocused }}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) =>
        wide
          ? {
              flexDirection: 'row',
              alignItems: 'center',
              gap: space[3],
              paddingHorizontal: space[3],
              height: 44,
              borderRadius: radius.md,
              backgroundColor: isFocused ? colors.surfaceMuted : hovered || pressed ? colors.surfaceMuted : 'transparent',
            }
          : {
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              gap: 3,
              paddingVertical: space[2],
              opacity: pressed ? 0.7 : 1,
            }
      }
    >
      <Icon size={wide ? 20 : 22} color={color} strokeWidth={isFocused ? 2.1 : 1.75} />
      <Text
        variant={wide ? 'bodyMedium' : 'caption'}
        style={{ color: wide ? (isFocused ? colors.text : colors.textMuted) : color }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
});

export default function AppLayout() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const wide = width >= breakpoints.wide;

  const tabs = [
    { name: 'discover', href: '/discover', icon: Compass, label: t('nav.discover') },
    { name: 'library', href: '/library', icon: Library, label: t('nav.library') },
    { name: 'paths', href: '/paths', icon: Route, label: t('nav.paths') },
    { name: 'practice', href: '/practice', icon: Dumbbell, label: t('nav.practice') },
    { name: 'profile', href: '/profile', icon: UserRound, label: t('nav.profile') },
  ] as const;

  const triggers = tabs.map((tab) => (
    <TabTrigger key={tab.name} name={tab.name} href={tab.href} asChild>
      <TabButton icon={tab.icon} label={tab.label} wide={wide} />
    </TabTrigger>
  ));

  if (wide) {
    return (
      <Tabs style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.background }}>
        <TabList
          accessibilityRole="tablist"
          style={{
            width: 248,
            flexDirection: 'column',
            justifyContent: 'flex-start',
            gap: space[1],
            paddingTop: space[8] + insets.top,
            paddingHorizontal: space[4],
            borderRightWidth: 1,
            borderRightColor: colors.border,
            backgroundColor: colors.background,
          }}
        >
          <View style={{ paddingHorizontal: space[3], paddingBottom: space[8] }}>
            <Wordmark size={22} />
          </View>
          {triggers}
        </TabList>
        <View style={{ flex: 1 }}>
          <TabSlot />
        </View>
      </Tabs>
    );
  }

  return (
    <Tabs style={{ flex: 1, backgroundColor: colors.background }}>
      <TabSlot />
      <TabList
        accessibilityRole="tablist"
        style={{
          flexDirection: 'row',
          borderTopWidth: 1,
          borderTopColor: colors.border,
          backgroundColor: colors.background,
          paddingBottom: Math.max(insets.bottom, space[2]),
          paddingHorizontal: space[2],
        }}
      >
        {triggers}
      </TabList>
    </Tabs>
  );
}
