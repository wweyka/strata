import { router, type Href } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { Button } from './Button';

export function BackButton({ fallback }: { fallback: Href }) {
  const { t } = useTranslation();
  return (
    <Button
      variant="ghost"
      size="sm"
      icon={ArrowLeft}
      label={t('common.back')}
      style={{ marginLeft: -12, marginTop: 16 }}
      onPress={() => (router.canGoBack() ? router.back() : router.replace(fallback))}
    />
  );
}
