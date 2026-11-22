import type { Request, Response } from "express";

import { successResponse } from "../../common/utils/api-response";
import type { HealthService } from "./health.service";

export class HealthController {
  public constructor(private readonly healthService: HealthService) {}

  public get = (_request: Request, response: Response): void => {
    response.status(200).json(successResponse(this.healthService.getStatus()));
  };
}
