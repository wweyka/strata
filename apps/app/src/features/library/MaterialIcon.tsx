import type { MaterialKind } from '@strata/shared';
import { FileImage, FileText, FileType2, NotebookPen, Presentation, File as FileIcon, BookText } from 'lucide-react-native';
import { View } from 'react-native';

import { radius, useTheme } from '@/ui';

const ICONS = {
  pdf: BookText,
  document: FileType2,
  presentation: Presentation,
  image: FileImage,
  text: FileText,
  note: NotebookPen,
  other: FileIcon,
} as const;

export function MaterialIcon({ kind }: { kind: MaterialKind }) {
  const { colors } = useTheme();
  const Icon = ICONS[kind] ?? FileIcon;
  return (
    <View
      style={{
        width: 40,
        height: 40,
        borderRadius: radius.md,
        backgroundColor: colors.surfaceMuted,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon size={20} color={colors.text} strokeWidth={1.75} />
    </View>
  );
}
