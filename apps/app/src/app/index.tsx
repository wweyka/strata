import { Redirect } from 'expo-router';

import { useProfile } from '@/data/profile';
import { useAuth } from '@/features/auth/AuthProvider';

/** Entry point: sends each visitor to the right place for their state. */
export default function Index() {
  const { session } = useAuth();
  const profile = useProfile();
  if (!session) return <Redirect href="/welcome" />;
  if (!profile.data?.onboarding_completed_at) return <Redirect href="/onboarding" />;
  return <Redirect href="/discover" />;
}
