import { z } from "zod";

/** `Idempotency-Key` header: 16-128 URL-safe characters, enough for a UUID. Reused only with an identical payload. */
export const IdempotencyKeySchema = z
  .string()
  .min(16)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/);
