import type { ErrorRequestHandler } from "express";

import { env } from "../../config/env";
import { AppError } from "../errors/app-error";

export const errorHandler: ErrorRequestHandler = (error: unknown, request, response, _next) => {
  const knownError = error instanceof AppError;
  const statusCode = knownError ? error.statusCode : 500;

  if (!knownError) {
    console.error(`[${request.requestId}] Unhandled error`, error);
  }

  response.status(statusCode).json({
    success: false,
    error: {
      code: knownError ? error.code : "INTERNAL_SERVER_ERROR",
      message: knownError ? error.message : "An unexpected error occurred",
      ...(knownError && error.details !== undefined ? { details: error.details } : {}),
      ...(env.NODE_ENV !== "production" && error instanceof Error
        ? { stack: error.stack }
        : {}),
    },
    requestId: request.requestId,
  });
};
