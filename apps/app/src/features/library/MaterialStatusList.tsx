import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { Material } from '@/data/types';
import { Pill, ProgressBar, Text, space } from '@/ui';

import { MaterialIcon } from './MaterialIcon';
import { statusTone } from './status';

/** Compact list of materials with their live processing state. */
export function MaterialStatusList({ materials }: { materials: Material[] }) {
  const { t } = useTranslation();
  return (
    <View style={{ gap: space[4] }}>
      {materials.map((m) => (
        <View key={m.id} style={{ flexDirection: 'row', gap: space[3], alignItems: 'flex-start' }}>
          <MaterialIcon kind={m.kind} />
          <View style={{ flex: 1, minWidth: 0, gap: space[1] }}>
            <Text variant="bodyMedium" numberOfLines={1}>
              {m.title}
            </Text>
            <Pill label={t(`library.status.${m.status}`)} tone={statusTone[m.status]} />
            {m.status === 'processing' ? (
              <ProgressBar value={m.progress} label={t('library.status.processing')} />
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}
