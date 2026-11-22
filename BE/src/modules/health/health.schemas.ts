import "../../docs/zod-openapi";

import { z } from "zod";

export const HealthStatusSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("huddilo-backend"),
  timestamp: z.iso.datetime(),
  uptimeSeconds: z.number().int().nonnegative(),
  media: z
    .object({
      status: z.enum(["ready", "not_started"]),
      workerCount: z.number().int().nonnegative(),
    })
    .optional(),
});

export const HealthResponseSchema = z.object({
  success: z.literal(true),
  data: HealthStatusSchema,
});
