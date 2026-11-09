import type { ContentType } from '@strata/shared';
import type { TFunction } from 'i18next';
import {
  AlignLeft,
  Clapperboard,
  Layers,
  ListChecks,
  MessageCircleQuestion,
  PencilLine,
  Shapes,
  type LucideIcon,
} from 'lucide-react-native';

import type { LearningMode } from '@/data/types';

export const CONTENT_TYPE_ICONS: Record<ContentType, LucideIcon> = {
  video: Clapperboard,
  question_card: MessageCircleQuestion,
  flashcard: Layers,
  quiz: ListChecks,
  visual_explainer: Shapes,
  exercise: PencilLine,
  summary: AlignLeft,
};

/** Preset modes have no stored name so they read naturally in every interface language. */
export function modeName(mode: Pick<LearningMode, 'name' | 'preset'>, t: TFunction): string {
  return mode.name ?? t(`modes.presets.${mode.preset}.name`);
}

export function modeDescription(mode: Pick<LearningMode, 'description' | 'preset'>, t: TFunction): string {
  if (mode.description) return mode.description;
  return mode.preset === 'custom' ? '' : t(`modes.presets.${mode.preset}.description`);
}

export function mixSummary(mode: LearningMode, t: TFunction): string {
  return [
    t('modes.mixShort.new', { value: mode.mix_new }),
    t('modes.mixShort.review', { value: mode.mix_review }),
    t('modes.mixShort.weak', { value: mode.mix_weak }),
    t('modes.mixShort.practice', { value: mode.mix_practice }),
  ].join(' · ');
}
