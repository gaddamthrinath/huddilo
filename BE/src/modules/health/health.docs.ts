import type { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";

import { HealthResponseSchema } from "./health.schemas";

export function registerHealthDocs(registry: OpenAPIRegistry): void {
  registry.register("HealthResponse", HealthResponseSchema);

  registry.registerPath({
    method: "get",
    path: "/api/v1/health",
    tags: ["Health"],
    summary: "Check API and SFU worker health",
    responses: {
      200: {
        description: "The API is available",
        content: {
          "application/json": {
            schema: HealthResponseSchema,
          },
        },
      },
    },
  });
}
