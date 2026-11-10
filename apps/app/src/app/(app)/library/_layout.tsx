import { Stack } from 'expo-router';

import { useTheme } from '@/ui';

export default function LibraryLayout() {
  const { colors } = useTheme();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }} />;
}
