import type { Express, Request, Response } from "express";
import swaggerUi from "swagger-ui-express";

import { generateOpenApiDocument } from "./openapi";

export function setupApiDocs(app: Express): void {
  const openApiDocument = generateOpenApiDocument();

  app.get("/api/docs.json", (_request: Request, response: Response) => {
    response.status(200).json(openApiDocument);
  });

  app.use(
    "/api/docs",
    swaggerUi.serve,
    swaggerUi.setup(openApiDocument, {
      customSiteTitle: "Huddilo API Docs",
      swaggerOptions: {
        displayRequestDuration: true,
        persistAuthorization: true,
        tryItOutEnabled: true,
      },
    }),
  );
}
