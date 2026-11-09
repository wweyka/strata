// Row shapes for the tables the app reads. Kept by hand next to supabase/migrations;
// `supabase gen types typescript` can replace this file once a project is linked.
import type {
  Appearance,
  ContentType,
  MaterialKind,
  MaterialStatus,
  ModePreset,
} from '@strata/shared';

export type Profile = {
  id: string;
  display_name: string | null;
  interface_language: string;
  learning_languages: string[];
  interests: string[];
  appearance: Appearance;
  timezone: string;
  onboarding_completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ProfileUpdate = Partial<
  Pick<
    Profile,
    | 'display_name'
    | 'interface_language'
    | 'learning_languages'
    | 'interests'
    | 'appearance'
    | 'timezone'
    | 'onboarding_completed_at'
  >
>;

export type LearningMode = {
  id: string;
  user_id: string;
  name: string | null;
  preset: ModePreset;
  description: string | null;
  content_types: ContentType[];
  mix_new: number;
  mix_review: number;
  mix_weak: number;
  mix_practice: number;
  difficulty_bias: number;
  target_retention: number;
  exam_date: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type LearningModeUpdate = Partial<
  Pick<
    LearningMode,
    | 'name'
    | 'description'
    | 'content_types'
    | 'mix_new'
    | 'mix_review'
    | 'mix_weak'
    | 'mix_practice'
    | 'difficulty_bias'
    | 'target_retention'
    | 'exam_date'
    | 'sort_order'
  >
>;

export type FeedPreferences = {
  user_id: string;
  active_mode_id: string | null;
  autoplay: boolean;
  captions_enabled: boolean;
  playback_rate: number;
  daily_goal_minutes: number;
  updated_at: string;
};

export type FeedPreferencesUpdate = Partial<
  Pick<FeedPreferences, 'active_mode_id' | 'autoplay' | 'captions_enabled' | 'playback_rate' | 'daily_goal_minutes'>
>;

export type Material = {
  id: string;
  user_id: string;
  folder_id: string | null;
  title: string;
  kind: MaterialKind;
  original_filename: string | null;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  checksum_sha256: string | null;
  language: string | null;
  page_count: number | null;
  status: MaterialStatus;
  stage: string | null;
  progress: number;
  error: { reason?: string; capabilities?: string[]; configure?: string[]; message?: string } | null;
  created_at: string;
  updated_at: string;
};

export type PlanLimits = {
  materials_per_month: number;
  pages_per_month: number;
  max_file_mb: number;
  storage_mb: number;
  videos_per_month: number;
  tutor_messages_per_day: number;
  generated_clips: boolean;
  avatar_instructor: boolean;
};

export type Subscription = {
  plan_id: string;
  status: 'active' | 'trialing' | 'past_due' | 'cancelled';
  current_period_end: string | null;
  plans: { name: string; limits: PlanLimits } | null;
};
