import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../../src/app";

describe("API documentation", () => {
  it("serves an OpenAPI 3.1 document", async () => {
    const response = await request(createApp()).get("/api/docs.json");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      openapi: "3.1.0",
      info: { title: "Huddilo API" },
    });
    expect(response.text).toContain('"/api/v1/health"');
    expect(response.text).toContain('"/api/v1/meetings"');
  });

  it("serves the interactive Swagger UI", async () => {
    const response = await request(createApp()).get("/api/docs/");

    expect(response.status).toBe(200);
    expect(response.text).toContain("Huddilo API Docs");
    expect(response.text).toContain('id="swagger-ui"');
  });
});
