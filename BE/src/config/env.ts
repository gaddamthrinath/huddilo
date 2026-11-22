import "dotenv/config";
import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().max(65_535).default(4000),
  MONGODB_URI: z
    .string()
    .min(1)
    .default("mongodb://127.0.0.1:27017/huddilo"),
  FRONTEND_ORIGIN: z.url().default("http://localhost:3000"),
  APP_BASE_URL: z.url().default("http://localhost:3000"),
  API_PUBLIC_URL: z.url().default("http://localhost:4000"),
  MEDIA_WORKER_COUNT: z.coerce.number().int().positive().max(32).default(1),
  MEDIA_LOG_LEVEL: z.enum(["debug", "warn", "error", "none"]).default("warn"),
});

const parsedEnvironment = environmentSchema.safeParse(process.env);

if (!parsedEnvironment.success) {
  console.error("Invalid environment configuration", parsedEnvironment.error.flatten().fieldErrors);
  throw new Error("Environment validation failed");
}

export const env = parsedEnvironment.data;
