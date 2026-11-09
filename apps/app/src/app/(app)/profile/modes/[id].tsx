import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { describeError } from '@/data/errors';
import {
  useCreateLearningMode,
  useDeleteLearningMode,
  useLearningModes,
  useUpdateLearningMode,
} from '@/data/modes';
import type { LearningMode } from '@/data/types';
import { ModeEditor, draftFrom, validateDraft, type ModeDraft } from '@/features/modes/ModeEditor';
import { modeDescription, modeName } from '@/features/modes/labels';
import { SearchX } from 'lucide-react-native';

import { BackButton, Button, Dialog, EmptyState, Notice, Screen, SkeletonRows, Text, space } from '@/ui';

export default function ModeScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const modes = useLearningModes();
  const mode = modes.data?.find((m) => m.id === id);

  if (!isNew && modes.isPending) {
    return (
      <Screen>
        <BackButton fallback="/profile/modes" />
        <SkeletonRows count={5} />
      </Screen>
    );
  }
  if (!isNew && !mode) {
    return (
      <Screen>
        <BackButton fallback="/profile/modes" />
        <EmptyState icon={SearchX} title={t('modes.notFound')} />
      </Screen>
    );
  }
  return <ModeForm key={mode?.id ?? 'new'} mode={mode} canDelete={!isNew && (modes.data?.length ?? 0) > 1} />;
}

function ModeForm({ mode, canDelete }: { mode?: LearningMode; canDelete: boolean }) {
  const { t } = useTranslation();
  const isNew = !mode;
  const id = mode?.id;
  const create = useCreateLearningMode();
  const update = useUpdateLearningMode();
  const remove = useDeleteLearningMode();
  const [draft, setDraft] = useState<ModeDraft>(() => draftFrom(mode));
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isCustom = isNew || mode.preset === 'custom';
  const saving = create.isPending || update.isPending;

  const save = async () => {
    setError(null);
    const result = validateDraft(draft, isCustom, t);
    if (!result.ok) return setError(result.error);
    try {
      if (isNew) await create.mutateAsync({ ...result.patch, name: draft.name.trim(), content_types: draft.content_types });
      else await update.mutateAsync({ id: id!, patch: result.patch });
      router.back();
    } catch (e) {
      setError(describeError(e, t));
    }
  };

  return (
    <Screen>
      <BackButton fallback="/profile/modes" />
      <View style={{ gap: space[8], paddingTop: space[4] }}>
        <View style={{ gap: space[1] }}>
          <Text variant="title">{isNew ? t('modes.new') : modeName(mode!, t)}</Text>
          {!isNew && !isCustom ? (
            <Text variant="body" color="textMuted">
              {modeDescription(mode!, t)}
            </Text>
          ) : null}
        </View>
        <ModeEditor draft={draft} onChange={setDraft} showName={isCustom} />
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space[3], flexWrap: 'wrap' }}>
          {canDelete ? (
            <Button variant="ghost" label={t('modes.delete')} onPress={() => setConfirmDelete(true)} />
          ) : (
            <View />
          )}
          <Button label={isNew ? t('modes.create') : t('common.save')} loading={saving} onPress={save} />
        </View>
      </View>

      <Dialog
        visible={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t('modes.deleteTitle')}
        description={t('modes.deleteBody')}
        actions={
          <>
            <Button variant="ghost" label={t('common.cancel')} onPress={() => setConfirmDelete(false)} />
            <Button
              variant="danger"
              label={t('modes.delete')}
              loading={remove.isPending}
              onPress={async () => {
                try {
                  await remove.mutateAsync(id!);
                  setConfirmDelete(false);
                  router.back();
                } catch (e) {
                  setConfirmDelete(false);
                  setError(describeError(e, t));
                }
              }}
            />
          </>
        }
      />
    </Screen>
  );
}
