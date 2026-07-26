import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * Mirrors what `PushSubscription.toJSON()` produces in the browser, so the
 * frontend can post the subscription object through unchanged.
 */
export const createPushSubscriptionSchema = z.object({
  endpoint: z.url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

const endpointSchema = z.object({
  endpoint: z.url(),
});

export class CreatePushSubscriptionDto extends createZodDto(
  createPushSubscriptionSchema,
) {}
export class DeletePushSubscriptionDto extends createZodDto(endpointSchema) {}
