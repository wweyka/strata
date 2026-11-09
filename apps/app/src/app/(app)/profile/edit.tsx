import { INTERFACE_LANGUAGES, LEARNING_LANGUAGES } from '@strata/shared';
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { describeError } from '@/data/errors';
import { useProfile, useUpdateProfile } from '@/data/profile';
import type { Profile } from '@/data/types';
import { setInterfaceLanguage } from '@/i18n';
import { BackButton, Button, Chip, Notice, Screen, SegmentedControl, SkeletonRows, Text, TextField, space } from '@/ui';

const LANGUAGE_NAMES: Record<string, string> = { en: 'English', es: 'Español', ru: 'Русский' };

export default function EditProfile() {
  const profile = useProfile();
  if (!profile.data) {
    return (
      <Screen>
        <BackButton fallback="/profile" />
        <SkeletonRows count={4} />
      </Screen>
    );
  }
  return <EditProfileForm profile={profile.data} />;
}

function EditProfileForm({ profile }: { profile: Profile }) {
  const { t } = useTranslation();
  const update = useUpdateProfile();
  const [name, setName] = useState(profile.display_name ?? '');
  const [learning, setLearning] = useState<string[]>(profile.learning_languages);
  const [interests, setInterests] = useState<string[]>(profile.interests);
  const [newInterest, setNewInterest] = useState('');
  const [saved, setSaved] = useState(false);

  const addInterest = () => {
    const value = newInterest.trim().slice(0, 40);
    if (!value || interests.length >= 30) return;
    if (!interests.some((i) => i.toLowerCase() === value.toLowerCase())) setInterests([...interests, value]);
    setNewInterest('');
  };

  const save = async () => {
    setSaved(false);
    await update.mutateAsync({ display_name: name.trim() || null, learning_languages: learning, interests });
    setSaved(true);
  };

  return (
    <Screen>
      <BackButton fallback="/profile" />
      <View style={{ gap: space[8], paddingTop: space[4] }}>
        <Text variant="title">{t('profile.editProfile')}</Text>

        <TextField label={t('auth.name')} value={name} onChangeText={setName} maxLength={80} autoComplete="name" />

        <View style={{ gap: space[3] }}>
          <Text variant="smallMedium" color="textMuted">
            {t('profile.interfaceLanguage')}
          </Text>
          <SegmentedControl
            label={t('profile.interfaceLanguage')}
            value={profile.interface_language}
            onChange={(lang) => {
              setInterfaceLanguage(lang);
              update.mutate({ interface_language: lang });
            }}
            options={INTERFACE_LANGUAGES.map((l) => ({ value: l, label: LANGUAGE_NAMES[l] }))}
          />
        </View>

        <View style={{ gap: space[3] }}>
          <Text variant="smallMedium" color="textMuted">
            {t('onboarding.learningTitle')}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
            {LEARNING_LANGUAGES.map((lang) => (
              <Chip
                key={lang.tag}
                label={lang.name}
                tone="soft"
                selected={learning.includes(lang.tag)}
                onPress={() => {
                  const next = learning.includes(lang.tag)
                    ? learning.filter((l) => l !== lang.tag)
                    : [...learning, lang.tag];
                  if (next.length >= 1 && next.length <= 10) setLearning(next);
                }}
              />
            ))}
          </View>
        </View>

        <View style={{ gap: space[3] }}>
          <Text variant="smallMedium" color="textMuted">
            {t('onboarding.interestsTitle')}
          </Text>
          {interests.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
              {interests.map((interest) => (
                <Chip
                  key={interest}
                  label={interest}
                  selected
                  tone="soft"
                  accessibilityHint={t('profile.removeInterest')}
                  onPress={() => setInterests(interests.filter((i) => i !== interest))}
                />
              ))}
            </View>
          ) : (
            <Text variant="small" color="textFaint">
              {t('profile.noInterests')}
            </Text>
          )}
          <View style={{ flexDirection: 'row', gap: space[2], alignItems: 'flex-end' }}>
            <View style={{ flex: 1 }}>
              <TextField
                label={t('onboarding.addInterest')}
                value={newInterest}
                onChangeText={setNewInterest}
                maxLength={40}
                onSubmitEditing={addInterest}
              />
            </View>
            <Button variant="secondary" label={t('common.add')} onPress={addInterest} disabled={!newInterest.trim()} />
          </View>
        </View>

        {update.isError ? <Notice tone="danger">{describeError(update.error, t)}</Notice> : null}
        {saved && !update.isPending ? <Notice tone="success">{t('common.saved')}</Notice> : null}
        <Button label={t('common.save')} loading={update.isPending} onPress={save} />
      </View>
    </Screen>
  );
}
