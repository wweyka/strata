// Mirrors the Postgres enums in supabase/migrations. `npm run check:enums` fails CI when the
// two drift apart, so change both together.

export const APPEARANCES = ['system', 'light', 'dark'] as const;
export type Appearance = (typeof APPEARANCES)[number];

export const CONTENT_TYPES = [
  'video',
  'question_card',
  'flashcard',
  'quiz',
  'visual_explainer',
  'exercise',
  'summary',
] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export const MODE_PRESETS = [
  'balanced',
  'quick_revision',
  'exam_preparation',
  'deep_learning',
  'new_knowledge',
  'language_practice',
  'custom',
] as const;
export type ModePreset = (typeof MODE_PRESETS)[number];

export const MATERIAL_KINDS = ['pdf', 'document', 'presentation', 'image', 'text', 'note', 'other'] as const;
export type MaterialKind = (typeof MATERIAL_KINDS)[number];

export const MATERIAL_STATUSES = [
  'uploading',
  'queued',
  'processing',
  'ready',
  'failed',
  'awaiting_credentials',
] as const;
export type MaterialStatus = (typeof MATERIAL_STATUSES)[number];

export const JOB_STATUSES = [
  'queued',
  'running',
  'waiting_external',
  'succeeded',
  'failed',
  'cancelled',
  'awaiting_credentials',
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const MASTERY_STATUSES = [
  'not_explored',
  'in_progress',
  'practiced',
  'mastered',
  'needs_revision',
] as const;
export type MasteryStatus = (typeof MASTERY_STATUSES)[number];
