import { INTERFACE_LANGUAGES, LEARNING_LANGUAGES } from '@strata/shared';
import { ArrowLeft, BookOpen, CircleCheck, Network, SlidersHorizontal, Upload, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { describeError } from '@/data/errors';
import { useProfile, useUpdateProfile } from '@/data/profile';
import type { ProfileUpdate } from '@/data/types';
import { Wordmark } from '@/features/auth/AuthShell';
import { useUploadFlow } from '@/features/library/useUploadFlow';
import { setInterfaceLanguage } from '@/i18n';
import { Button, Card, Chip, IconButton, Notice, Screen, Text, TextField, radius, space, useTheme } from '@/ui';

const STEPS = ['concept', 'language', 'learning', 'interests', 'material'] as const;
const INTEREST_KEYS = [
  'mathematics', 'physics', 'chemistry', 'biology', 'medicine', 'history', 'literature', 'philosophy',
  'psychology', 'economics', 'law', 'programming', 'engineering', 'languages', 'art', 'music',
] as const;
const LANGUAGE_NAMES: Record<string, string> = { en: 'English', es: 'Español', ru: 'Русский' };

export default function Onboarding() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { data: profile } = useProfile();
  const update = useUpdateProfile();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(profile?.display_name ?? '');
  const [learning, setLearning] = useState<string[]>(profile?.learning_languages ?? ['en']);
  const [interests, setInterests] = useState<string[]>(profile?.interests ?? []);
  const [custom, setCustom] = useState('');
  const [error, setError] = useState<string | null>(null);
  const uploadFlow = useUploadFlow();

  const save = async (patch: ProfileUpdate, next?: number) => {
    setError(null);
    try {
      await update.mutateAsync(patch);
      if (next !== undefined) setStep(next);
    } catch (e) {
      setError(describeError(e, t));
    }
  };

  const finish = () =>
    save({
      onboarding_completed_at: new Date().toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone?.slice(0, 64) || 'UTC',
    });

  const suggestions = useMemo(() => INTEREST_KEYS.map((k) => t(`onboarding.interestOptions.${k}`)), [t]);
  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const addCustom = () => {
    const value = custom.trim().slice(0, 40);
    if (!value || interests.length >= 30) return;
    if (!interests.some((i) => i.toLowerCase() === value.toLowerCase())) setInterests([...interests, value]);
    setCustom('');
  };

  const current = STEPS[step];

  return (
    <Screen maxWidth={560}>
      <View style={{ paddingTop: space[6], gap: space[8] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Wordmark size={22} />
          <Text variant="caption" color="textFaint" accessibilityLabel={t('onboarding.progress', { step: step + 1, total: STEPS.length })}>
            {step + 1} / {STEPS.length}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: space[1] }} accessibilityElementsHidden>
          {STEPS.map((s, i) => (
            <View
              key={s}
              style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: i <= step ? colors.ink : colors.border }}
            />
          ))}
        </View>

        {current === 'concept' ? (
          <View style={{ gap: space[6] }}>
            <View style={{ gap: space[3] }}>
              <Text variant="display">{t('onboarding.conceptTitle')}</Text>
              <Text variant="body" color="textMuted">
                {t('onboarding.conceptBody')}
              </Text>
            </View>
            {[
              { icon: BookOpen, title: t('welcome.step1Title'), body: t('onboarding.concept1') },
              { icon: Network, title: t('welcome.step2Title'), body: t('onboarding.concept2') },
              { icon: SlidersHorizontal, title: t('welcome.step3Title'), body: t('onboarding.concept3') },
            ].map(({ icon: Icon, title, body }) => (
              <Card key={title} style={{ flexDirection: 'row', gap: space[4] }}>
                <Icon size={22} color={colors.accent} strokeWidth={1.75} />
                <View style={{ flex: 1, gap: space[1] }}>
                  <Text variant="subheading">{title}</Text>
                  <Text variant="small" color="textMuted">
                    {body}
                  </Text>
                </View>
              </Card>
            ))}
            <Notice title={t('onboarding.privacyTitle')}>{t('onboarding.privacyBody')}</Notice>
            <Button label={t('common.continue')} fullWidth onPress={() => setStep(1)} />
          </View>
        ) : null}

        {current === 'language' ? (
          <View style={{ gap: space[6] }}>
            <StepHeader title={t('onboarding.languageTitle')} body={t('onboarding.languageBody')} />
            <View style={{ gap: space[2] }}>
              {INTERFACE_LANGUAGES.map((lang) => {
                const selected = (profile?.interface_language ?? 'en') === lang;
                return (
                  <Pressable
                    key={lang}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    onPress={() => {
                      setInterfaceLanguage(lang);
                      void save({ interface_language: lang });
                    }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: space[4],
                      borderRadius: radius.md,
                      borderWidth: 1,
                      borderColor: selected ? colors.ink : colors.border,
                      backgroundColor: colors.surface,
                    }}
                  >
                    <Text variant="bodyMedium">{LANGUAGE_NAMES[lang]}</Text>
                    {selected ? <CircleCheck size={20} color={colors.text} /> : null}
                  </Pressable>
                );
              })}
            </View>
            <TextField
              label={t('onboarding.nameLabel')}
              value={name}
              onChangeText={setName}
              autoComplete="name"
              maxLength={80}
              hint={t('onboarding.nameHint')}
            />
            <StepActions
              onBack={() => setStep(0)}
              loading={update.isPending}
              onNext={() => save({ display_name: name.trim() || null }, 2)}
            />
          </View>
        ) : null}

        {current === 'learning' ? (
          <View style={{ gap: space[6] }}>
            <StepHeader title={t('onboarding.learningTitle')} body={t('onboarding.learningBody')} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
              {LEARNING_LANGUAGES.map((lang) => (
                <Chip
                  key={lang.tag}
                  label={lang.name}
                  tone="soft"
                  selected={learning.includes(lang.tag)}
                  onPress={() => {
                    const next = toggle(learning, lang.tag);
                    if (next.length > 0 && next.length <= 10) setLearning(next);
                  }}
                />
              ))}
            </View>
            <Text variant="small" color="textFaint">
              {t('onboarding.learningHint')}
            </Text>
            <StepActions
              onBack={() => setStep(1)}
              loading={update.isPending}
              onNext={() => save({ learning_languages: learning }, 3)}
            />
          </View>
        ) : null}

        {current === 'interests' ? (
          <View style={{ gap: space[6] }}>
            <StepHeader title={t('onboarding.interestsTitle')} body={t('onboarding.interestsBody')} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
              {[...suggestions, ...interests.filter((i) => !suggestions.includes(i))].map((label) => (
                <Chip
                  key={label}
                  label={label}
                  tone="soft"
                  selected={interests.includes(label)}
                  onPress={() => {
                    const next = toggle(interests, label);
                    if (next.length <= 30) setInterests(next);
                  }}
                />
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: space[2], alignItems: 'flex-end' }}>
              <View style={{ flex: 1 }}>
                <TextField
                  label={t('onboarding.addInterest')}
                  value={custom}
                  onChangeText={setCustom}
                  maxLength={40}
                  returnKeyType="done"
                  onSubmitEditing={addCustom}
                />
              </View>
              <Button variant="secondary" label={t('common.add')} onPress={addCustom} disabled={!custom.trim()} />
            </View>
            <StepActions
              onBack={() => setStep(2)}
              loading={update.isPending}
              onNext={() => save({ interests }, 4)}
            />
          </View>
        ) : null}

        {current === 'material' ? (
          <View style={{ gap: space[6] }}>
            <StepHeader title={t('onboarding.materialTitle')} body={t('onboarding.materialBody')} />
            <Card style={{ alignItems: 'center', gap: space[4], paddingVertical: space[8] }}>
              {uploadFlow.lastUploaded ? (
                <>
                  <CircleCheck size={28} color={colors.success} />
                  <View style={{ gap: space[1], alignItems: 'center' }}>
                    <Text variant="subheading" align="center">
                      {uploadFlow.lastUploaded.title}
                    </Text>
                    <Text variant="small" color="textMuted" align="center">
                      {t('onboarding.materialAdded')}
                    </Text>
                  </View>
                </>
              ) : (
                <>
                  <Upload size={28} color={colors.textMuted} strokeWidth={1.75} />
                  <Text variant="small" color="textMuted" align="center">
                    {t('library.acceptedTypes', { mb: uploadFlow.maxMb })}
                  </Text>
                  <Button
                    icon={Upload}
                    label={uploadFlow.busy ? t(`library.stage.${uploadFlow.stage ?? 'preparing'}`) : t('library.chooseFile')}
                    loading={false}
                    disabled={uploadFlow.busy}
                    onPress={uploadFlow.pick}
                  />
                </>
              )}
            </Card>
            {uploadFlow.error ? (
              <Notice tone="danger">
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
                  <Text variant="small" style={{ flex: 1 }}>
                    {uploadFlow.error}
                  </Text>
                  <IconButton icon={X} size={28} label={t('common.dismiss')} onPress={uploadFlow.clearError} />
                </View>
              </Notice>
            ) : null}
            {error ? <Notice tone="danger">{error}</Notice> : null}
            <View style={{ gap: space[2] }}>
              <Button
                label={uploadFlow.lastUploaded ? t('onboarding.finish') : t('onboarding.finishWithout')}
                variant={uploadFlow.lastUploaded ? 'primary' : 'secondary'}
                fullWidth
                loading={update.isPending}
                disabled={uploadFlow.busy}
                onPress={finish}
              />
              <Button variant="ghost" icon={ArrowLeft} label={t('common.back')} onPress={() => setStep(3)} />
            </View>
          </View>
        ) : null}

        {error && current !== 'material' ? <Notice tone="danger">{error}</Notice> : null}
      </View>
    </Screen>
  );
}

function StepHeader({ title, body }: { title: string; body: string }) {
  return (
    <View style={{ gap: space[2] }}>
      <Text variant="title">{title}</Text>
      <Text variant="body" color="textMuted">
        {body}
      </Text>
    </View>
  );
}

function StepActions({ onBack, onNext, loading }: { onBack: () => void; onNext: () => void; loading: boolean }) {
  const { t } = useTranslation();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space[3] }}>
      <Button variant="ghost" icon={ArrowLeft} label={t('common.back')} onPress={onBack} />
      <Button label={t('common.continue')} loading={loading} onPress={onNext} />
    </View>
  );
}
