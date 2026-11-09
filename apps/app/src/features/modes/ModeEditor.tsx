import {
  CONTENT_TYPES,
  MIX_KEYS,
  learningModeInput,
  rebalanceMix,
  type ContentType,
  type Mix,
  type MixKey,
} from '@strata/shared';
import { Minus, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { LearningMode, LearningModeUpdate } from '@/data/types';
import { Chip, IconButton, Notice, SegmentedControl, Text, TextField, radius, space, useTheme } from '@/ui';

import { CONTENT_TYPE_ICONS } from './labels';

export type ModeDraft = Required<
  Pick<
    LearningModeUpdate,
    'content_types' | 'mix_new' | 'mix_review' | 'mix_weak' | 'mix_practice' | 'difficulty_bias' | 'target_retention'
  >
> & { name: string; description: string; exam_date: string };

export function draftFrom(mode?: LearningMode): ModeDraft {
  return {
    name: mode?.name ?? '',
    description: mode?.description ?? '',
    content_types: mode?.content_types ?? ['video', 'flashcard', 'quiz', 'summary'],
    mix_new: mode?.mix_new ?? 25,
    mix_review: mode?.mix_review ?? 25,
    mix_weak: mode?.mix_weak ?? 25,
    mix_practice: mode?.mix_practice ?? 25,
    difficulty_bias: mode?.difficulty_bias ?? 0,
    target_retention: mode?.target_retention ?? 0.9,
    exam_date: mode?.exam_date ?? '',
  };
}

/** Validates a draft; returns the database patch or a translated error. */
export function validateDraft(
  draft: ModeDraft,
  nameRequired: boolean,
  t: (key: string) => string,
): { ok: true; patch: LearningModeUpdate } | { ok: false; error: string } {
  const exam = draft.exam_date.trim();
  if (exam && (!/^\d{4}-\d{2}-\d{2}$/.test(exam) || Number.isNaN(Date.parse(exam)))) {
    return { ok: false, error: t('modes.invalidDate') };
  }
  const parsed = learningModeInput.safeParse({
    ...draft,
    name: nameRequired ? draft.name : draft.name || 'preset',
    description: draft.description || undefined,
    exam_date: exam || null,
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue?.path[0] === 'name') return { ok: false, error: t('modes.nameRequired') };
    if (issue?.path[0] === 'content_types') return { ok: false, error: t('modes.typesRequired') };
    return { ok: false, error: t('common.errorBody') };
  }
  const patch: LearningModeUpdate = {
    content_types: draft.content_types,
    mix_new: draft.mix_new,
    mix_review: draft.mix_review,
    mix_weak: draft.mix_weak,
    mix_practice: draft.mix_practice,
    difficulty_bias: draft.difficulty_bias,
    target_retention: draft.target_retention,
    exam_date: exam || null,
    description: draft.description.trim() || null,
  };
  if (nameRequired) patch.name = draft.name.trim();
  return { ok: true, patch };
}

const MIX_LABEL: Record<MixKey, string> = {
  mix_new: 'modes.mix.new',
  mix_review: 'modes.mix.review',
  mix_weak: 'modes.mix.weak',
  mix_practice: 'modes.mix.practice',
};

export function ModeEditor({
  draft,
  onChange,
  showName,
}: {
  draft: ModeDraft;
  onChange: (draft: ModeDraft) => void;
  showName: boolean;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [typeHint, setTypeHint] = useState(false);
  const mix: Mix = {
    mix_new: draft.mix_new,
    mix_review: draft.mix_review,
    mix_weak: draft.mix_weak,
    mix_practice: draft.mix_practice,
  };
  const setMix = (key: MixKey, value: number) => onChange({ ...draft, ...rebalanceMix(mix, key, value) });
  const toggleType = (type: ContentType) => {
    const on = draft.content_types.includes(type);
    if (on && draft.content_types.length === 1) {
      setTypeHint(true);
      return;
    }
    setTypeHint(false);
    onChange({
      ...draft,
      content_types: on ? draft.content_types.filter((c) => c !== type) : [...draft.content_types, type],
    });
  };
  const barColors = [colors.ink, colors.accent, colors.textMuted, colors.borderStrong];

  return (
    <View style={{ gap: space[8] }}>
      {showName ? (
        <View style={{ gap: space[4] }}>
          <TextField
            label={t('modes.name')}
            value={draft.name}
            onChangeText={(name) => onChange({ ...draft, name })}
            maxLength={40}
          />
          <TextField
            label={t('modes.description')}
            value={draft.description}
            onChangeText={(description) => onChange({ ...draft, description })}
            maxLength={200}
          />
        </View>
      ) : null}

      <View style={{ gap: space[3] }}>
        <Text variant="subheading">{t('modes.contentTypes')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
          {CONTENT_TYPES.map((type) => (
            <Chip
              key={type}
              label={t(`contentTypes.${type}`)}
              icon={CONTENT_TYPE_ICONS[type]}
              tone="soft"
              selected={draft.content_types.includes(type)}
              onPress={() => toggleType(type)}
            />
          ))}
        </View>
        {typeHint ? <Notice>{t('discover.lastType')}</Notice> : null}
      </View>

      <View style={{ gap: space[4] }}>
        <View style={{ gap: space[1] }}>
          <Text variant="subheading">{t('modes.mixTitle')}</Text>
          <Text variant="small" color="textMuted">
            {t('modes.mixHint')}
          </Text>
        </View>
        <View
          style={{ flexDirection: 'row', height: 10, borderRadius: radius.pill, overflow: 'hidden', gap: 2 }}
          accessibilityElementsHidden
        >
          {MIX_KEYS.map((key, i) =>
            mix[key] > 0 ? <View key={key} style={{ flex: mix[key], backgroundColor: barColors[i] }} /> : null,
          )}
        </View>
        {MIX_KEYS.map((key, i) => (
          <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: barColors[i] }} />
            <Text variant="body" style={{ flex: 1 }}>
              {t(MIX_LABEL[key])}
            </Text>
            <IconButton
              icon={Minus}
              label={t('modes.decrease', { name: t(MIX_LABEL[key]) })}
              disabled={mix[key] <= 0}
              onPress={() => setMix(key, mix[key] - 5)}
            />
            <Text
              variant="bodyMedium"
              style={{ width: 48, textAlign: 'center' }}
              accessibilityLabel={`${t(MIX_LABEL[key])} ${mix[key]}%`}
            >
              {mix[key]}%
            </Text>
            <IconButton
              icon={Plus}
              label={t('modes.increase', { name: t(MIX_LABEL[key]) })}
              disabled={mix[key] >= 100}
              onPress={() => setMix(key, mix[key] + 5)}
            />
          </View>
        ))}
      </View>

      <View style={{ gap: space[3] }}>
        <Text variant="subheading">{t('modes.difficulty')}</Text>
        <SegmentedControl
          label={t('modes.difficulty')}
          value={draft.difficulty_bias}
          onChange={(difficulty_bias) => onChange({ ...draft, difficulty_bias })}
          options={[-2, -1, 0, 1, 2].map((v) => ({ value: v, label: t(`modes.difficultyOptions.${v + 2}`) }))}
        />
      </View>

      <View style={{ gap: space[3] }}>
        <View style={{ gap: space[1] }}>
          <Text variant="subheading">{t('modes.retention')}</Text>
          <Text variant="small" color="textMuted">
            {t('modes.retentionHint')}
          </Text>
        </View>
        <SegmentedControl
          label={t('modes.retention')}
          value={draft.target_retention}
          onChange={(target_retention) => onChange({ ...draft, target_retention })}
          options={[0.85, 0.9, 0.95].map((v) => ({ value: v, label: `${Math.round(v * 100)}%` }))}
        />
      </View>

      <TextField
        label={t('modes.examDate')}
        hint={t('modes.examDateHint')}
        value={draft.exam_date}
        onChangeText={(exam_date) => onChange({ ...draft, exam_date })}
        placeholder="2027-01-31"
        maxLength={10}
        keyboardType="numbers-and-punctuation"
      />
    </View>
  );
}
