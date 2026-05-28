import { z } from 'zod';
import { Envelope } from './envelope.js';

const SEMVER = /^\d+\.\d+\.\d+(-[\w.]+)?(\+[\w.]+)?$/;

export const LifecycleType = z.enum([
  'install',
  'upgrade',
  'feature_enabled',
  'feature_disabled',
  'uninstall',
]);

export const LifecycleEvent = Envelope.extend({
  event: z.literal('instance.lifecycle'),
  lifecycle: z.object({
    type: LifecycleType,
    from_version: z.string().regex(SEMVER).nullable(),
    to_version: z.string().regex(SEMVER).nullable(),
    feature: z.string().max(64).nullable(),
  }),
});

export type LifecycleEvent = z.infer<typeof LifecycleEvent>;
