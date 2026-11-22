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
  MEDIA_LISTEN_IP: z.string().regex(/^\d{1,3}(?:\.\d{1,3}){3}$/).default("0.0.0.0"),
  MEDIA_ANNOUNCED_ADDRESS: z.string().min(1).default("127.0.0.1"),
  TURN_SHARED_SECRET: z.string().min(32),
  TURN_URLS: z.string().min(1).default(
    "stun:localhost:3478,turn:localhost:3478?transport=udp,turn:localhost:3478?transport=tcp",
  ),
});

const parsedEnvironment = environmentSchema.safeParse(process.env);

if (!parsedEnvironment.success) {
  console.error("Invalid environment configuration", parsedEnvironment.error.flatten().fieldErrors);
  throw new Error("Environment validation failed");
}

export const env = parsedEnvironment.data;
