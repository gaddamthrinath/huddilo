import { Router, type Router as ExpressRouter } from "express";

import type { HealthController } from "./health.controller";

export class HealthRoutes {
  public readonly router: ExpressRouter;

  public constructor(private readonly healthController: HealthController) {
    this.router = Router();
    this.registerRoutes();
  }

  private registerRoutes(): void {
    this.router.get("/", this.healthController.get);
  }
}
