import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../../src/app";

describe("GET /api/v1/health", () => {
  it("returns the service health status", async () => {
    const response = await request(createApp()).get("/api/v1/health");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        status: "ok",
        service: "huddilo-backend",
      },
    });
    expect(response.headers["x-request-id"]).toBeTypeOf("string");
  });

  it("includes SFU readiness when the app receives a worker-pool status provider", async () => {
    const app = createApp({
      mediaWorkerPool: {
        getStatus: () => ({ status: "ready" as const, workerCount: 1 }),
      },
    });

    const response = await request(app).get("/api/v1/health");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: { media: { status: "ready", workerCount: 1 } },
    });
  });

  it("returns a consistent error for an unknown route", async () => {
    const response = await request(createApp()).get("/api/v1/unknown");

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      success: false,
      error: { code: "ROUTE_NOT_FOUND" },
    });
  });
});
