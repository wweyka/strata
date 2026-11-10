import { Ellipsis, FolderOpen, Pencil, Trash2, Upload, X } from 'lucide-react-native';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { describeError } from '@/data/errors';
import { useDeleteMaterial, useMaterials, useRenameMaterial } from '@/data/materials';
import type { Material } from '@/data/types';
import { MaterialIcon } from '@/features/library/MaterialIcon';
import { formatBytes, stageLabel, statusTone } from '@/features/library/status';
import { useUploadFlow } from '@/features/library/useUploadFlow';
import {
  Button,
  Card,
  Dialog,
  Divider,
  EmptyState,
  ErrorState,
  IconButton,
  ListRow,
  Notice,
  Pill,
  ProgressBar,
  Screen,
  SkeletonRows,
  Text,
  TextField,
  radius,
  space,
  useTheme,
} from '@/ui';

export default function LibraryScreen() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const materials = useMaterials();
  const upload = useUploadFlow();
  const rename = useRenameMaterial();
  const remove = useDeleteMaterial();
  const [menuFor, setMenuFor] = useState<Material | null>(null);
  const [renaming, setRenaming] = useState<Material | null>(null);
  const [title, setTitle] = useState('');
  const [deleting, setDeleting] = useState<Material | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const date = new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' });
  const list = materials.data ?? [];

  const uploadButton = (
    <Button
      icon={Upload}
      label={upload.busy ? t(`library.stage.${upload.stage ?? 'preparing'}`) : t('library.add')}
      disabled={upload.busy}
      onPress={upload.pick}
    />
  );

  return (
    <Screen
      title={t('library.title')}
      subtitle={list.length ? t('library.count', { count: list.length }) : t('library.subtitle')}
      actions={list.length ? uploadButton : undefined}
      refreshing={materials.isRefetching}
      onRefresh={() => void materials.refetch()}
    >
      <View style={{ gap: space[4] }}>
        {upload.busy ? (
          <Card style={{ gap: space[3] }}>
            <Text variant="smallMedium" numberOfLines={1}>
              {upload.fileName}
            </Text>
            <ProgressBar
              value={upload.stage === 'preparing' ? 0.15 : upload.stage === 'uploading' ? 0.55 : 0.9}
              label={t(`library.stage.${upload.stage ?? 'preparing'}`)}
            />
            <Text variant="small" color="textMuted">
              {t(`library.stage.${upload.stage ?? 'preparing'}`)}
            </Text>
          </Card>
        ) : null}
        {upload.error ? (
          <Notice tone="danger">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
              <Text variant="small" style={{ flex: 1 }}>
                {upload.error}
              </Text>
              <IconButton icon={X} size={28} label={t('common.dismiss')} onPress={upload.clearError} />
            </View>
          </Notice>
        ) : null}
        {actionError ? <Notice tone="danger">{actionError}</Notice> : null}

        {materials.isPending ? (
          <SkeletonRows count={4} />
        ) : materials.isError ? (
          <ErrorState message={describeError(materials.error, t)} onRetry={() => void materials.refetch()} />
        ) : list.length === 0 ? (
          <Card>
            <EmptyState
              icon={FolderOpen}
              title={t('library.emptyTitle')}
              body={t('library.emptyBody', { mb: upload.maxMb })}
              action={uploadButton}
            />
          </Card>
        ) : (
          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: radius.lg,
              borderWidth: 1,
              borderColor: colors.border,
              overflow: 'hidden',
            }}
          >
            {list.map((m, i) => (
              <View key={m.id}>
                {i > 0 ? <Divider inset={space[4] + 40 + space[3]} /> : null}
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space[3], padding: space[4] }}>
                  <Pressable
                    accessibilityRole="link"
                    accessibilityLabel={t('library.openMaterial', { title: m.title })}
                    onPress={() => router.push(`/library/${m.id}`)}
                    style={({ pressed }) => ({
                      flex: 1,
                      minWidth: 0,
                      flexDirection: 'row',
                      gap: space[3],
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <MaterialIcon kind={m.kind} />
                    <View style={{ flex: 1, minWidth: 0, gap: space[1] }}>
                      <Text variant="bodyMedium" numberOfLines={2}>
                        {m.title}
                      </Text>
                      <Text variant="small" color="textMuted" numberOfLines={1}>
                        {[t(`library.kind.${m.kind}`), formatBytes(m.size_bytes, i18n.language), date.format(new Date(m.created_at))].join(' · ')}
                      </Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2], marginTop: space[1] }}>
                        <Pill label={t(`library.status.${m.status}`)} tone={statusTone[m.status]} />
                        {m.status === 'awaiting_credentials' ? (
                          <Text variant="caption" color="textMuted">
                            {t('library.awaitingHint')}
                          </Text>
                        ) : null}
                        {m.status === 'failed' ? (
                          <Text variant="caption" color="danger">
                            {t('library.failedHint')}
                          </Text>
                        ) : null}
                      </View>
                      {m.status === 'processing' ? (
                        <>
                          <ProgressBar value={m.progress} label={stageLabel(m.stage, t)} />
                          <Text variant="caption" color="textMuted">
                            {stageLabel(m.stage, t)}
                          </Text>
                        </>
                      ) : null}
                    </View>
                  </Pressable>
                  <IconButton
                    icon={Ellipsis}
                    label={t('library.actionsFor', { title: m.title })}
                    tone="muted"
                    onPress={() => setMenuFor(m)}
                  />
                </View>
              </View>
            ))}
          </View>
        )}
        {list.length ? (
          <Text variant="small" color="textFaint">
            {t('library.privacy')}
          </Text>
        ) : null}
      </View>

      <Dialog visible={!!menuFor} onClose={() => setMenuFor(null)} title={menuFor?.title ?? ''}>
        <View style={{ marginHorizontal: -space[4] }}>
          <ListRow
            icon={Pencil}
            title={t('library.rename')}
            chevron={false}
            onPress={() => {
              setTitle(menuFor!.title);
              setRenaming(menuFor);
              setMenuFor(null);
            }}
          />
          <ListRow
            icon={Trash2}
            title={t('library.delete')}
            destructive
            chevron={false}
            onPress={() => {
              setDeleting(menuFor);
              setMenuFor(null);
            }}
          />
        </View>
      </Dialog>

      <Dialog
        visible={!!renaming}
        onClose={() => setRenaming(null)}
        title={t('library.renameTitle')}
        actions={
          <>
            <Button variant="ghost" label={t('common.cancel')} onPress={() => setRenaming(null)} />
            <Button
              label={t('common.save')}
              loading={rename.isPending}
              disabled={!title.trim() || title.trim().length > 200}
              onPress={async () => {
                setActionError(null);
                try {
                  await rename.mutateAsync({ id: renaming!.id, title });
                  setRenaming(null);
                } catch (e) {
                  setActionError(describeError(e, t));
                  setRenaming(null);
                }
              }}
            />
          </>
        }
      >
        <TextField label={t('library.titleLabel')} value={title} onChangeText={setTitle} maxLength={200} autoFocus />
      </Dialog>

      <Dialog
        visible={!!deleting}
        onClose={() => setDeleting(null)}
        title={t('library.deleteTitle')}
        description={t('library.deleteBody', { title: deleting?.title ?? '' })}
        actions={
          <>
            <Button variant="ghost" label={t('common.cancel')} onPress={() => setDeleting(null)} />
            <Button
              variant="danger"
              label={t('library.delete')}
              loading={remove.isPending}
              onPress={async () => {
                setActionError(null);
                try {
                  await remove.mutateAsync(deleting!);
                } catch (e) {
                  setActionError(describeError(e, t));
                } finally {
                  setDeleting(null);
                }
              }}
            />
          </>
        }
      />
    </Screen>
  );
}
