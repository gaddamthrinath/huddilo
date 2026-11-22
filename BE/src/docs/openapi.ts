import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
} from "@asteasolutions/zod-to-openapi";

import { ErrorResponseSchema } from "../common/schemas/api.schemas";
import { env } from "../config/env";
import { registerHealthDocs } from "../modules/health/health.docs";
import { registerMeetingDocs } from "../modules/meetings/meeting.docs";

export function generateOpenApiDocument() {
  const registry = new OpenAPIRegistry();
  const errorResponseSchema = registry.register("ErrorResponse", ErrorResponseSchema);

  registerHealthDocs(registry);
  registerMeetingDocs(registry, errorResponseSchema);

  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: "3.1.0",
    info: {
      title: "Huddilo API",
      version: "0.1.0",
      description:
        "Public API for creating and managing Huddilo meetings and collaboration sessions.",
      license: {
        name: "MIT",
      },
    },
    servers: [
      {
        url: env.API_PUBLIC_URL,
        description: env.NODE_ENV === "production" ? "Production" : "Local development",
      },
    ],
    tags: [
      { name: "Health", description: "Service health and readiness" },
      { name: "Meetings", description: "Meeting creation and lifecycle" },
    ],
  });
}
