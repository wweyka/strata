import { ACCEPTED_MATERIAL_TYPES } from '@strata/shared';
import * as DocumentPicker from 'expo-document-picker';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { describeError } from '@/data/errors';
import { UploadError, useUploadMaterial, type UploadProgress } from '@/data/materials';
import { fromPickerAsset } from '@/data/picked-file';
import { useSubscription } from '@/data/profile';
import type { Material } from '@/data/types';

const PICKER_TYPES = [...Object.keys(ACCEPTED_MATERIAL_TYPES), 'text/x-markdown'];

/** Pick → validate against plan limits → upload → queue, with user-facing states. */
export function useUploadFlow(onUploaded?: (material: Material) => void) {
  const { t } = useTranslation();
  const subscription = useSubscription();
  const [stage, setStage] = useState<UploadProgress | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const upload = useUploadMaterial(setStage);

  const maxMb = subscription.data?.plans?.limits.max_file_mb ?? 100;

  const pick = async () => {
    setError(null);
    const result = await DocumentPicker.getDocumentAsync({
      type: PICKER_TYPES,
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = fromPickerAsset(result.assets[0]);
    if (asset.size && asset.size > maxMb * 1024 * 1024) {
      setError(t('library.tooLarge', { mb: maxMb }));
      return;
    }
    setFileName(asset.name);
    try {
      const material = await upload.mutateAsync(asset);
      onUploaded?.(material);
    } catch (e) {
      if (e instanceof UploadError) {
        setError(
          e.code === 'duplicate'
            ? t('library.duplicate', { title: e.message })
            : e.code === 'empty_file'
              ? t('library.emptyFile')
              : t('errors.unsupportedType'),
        );
      } else {
        setError(describeError(e, t));
      }
    } finally {
      setStage(null);
    }
  };

  return {
    pick,
    busy: upload.isPending,
    stage,
    fileName,
    error,
    clearError: () => setError(null),
    maxMb,
    lastUploaded: upload.data ?? null,
  };
}
