import { z } from 'zod';

import { CONTENT_TYPES } from './enums';

export const MIX_KEYS = ['mix_new', 'mix_review', 'mix_weak', 'mix_practice'] as const;
export type MixKey = (typeof MIX_KEYS)[number];
export type Mix = Record<MixKey, number>;

/**
 * Change one share of the feed mix and rebalance the others proportionally so the total
 * stays exactly 100 (the database enforces it).
 */
export function rebalanceMix(mix: Mix, key: MixKey, value: number): Mix {
  const target = Math.max(0, Math.min(100, Math.round(value)));
  const others = MIX_KEYS.filter((k) => k !== key);
  const remaining = 100 - target;
  const currentOthers = others.reduce((sum, k) => sum + mix[k], 0);
  const next = { ...mix, [key]: target } as Mix;
  if (currentOthers === 0) {
    const share = Math.floor(remaining / others.length);
    others.forEach((k, i) => {
      next[k] = share + (i < remaining - share * others.length ? 1 : 0);
    });
    return next;
  }
  let assigned = 0;
  const raw = others.map((k) => (mix[k] / currentOthers) * remaining);
  others.forEach((k, i) => {
    next[k] = Math.floor(raw[i]);
    assigned += next[k];
  });
  // Hand out the rounding remainder to the largest fractional parts.
  const order = others
    .map((k, i) => ({ k, frac: raw[i] - Math.floor(raw[i]) }))
    .sort((a, b) => b.frac - a.frac);
  for (let i = 0; i < remaining - assigned; i++) next[order[i % order.length].k] += 1;
  return next;
}

export const learningModeInput = z
  .object({
    name: z.string().trim().min(1).max(40),
    description: z.string().trim().max(200).optional(),
    content_types: z.array(z.enum(CONTENT_TYPES)).min(1).max(CONTENT_TYPES.length),
    mix_new: z.number().int().min(0).max(100),
    mix_review: z.number().int().min(0).max(100),
    mix_weak: z.number().int().min(0).max(100),
    mix_practice: z.number().int().min(0).max(100),
    difficulty_bias: z.number().int().min(-2).max(2),
    target_retention: z.number().min(0.7).max(0.97),
    exam_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  })
  .refine((m) => m.mix_new + m.mix_review + m.mix_weak + m.mix_practice === 100, {
    message: 'mix_total',
    path: ['mix_new'],
  });
export type LearningModeInput = z.infer<typeof learningModeInput>;
