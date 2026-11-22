import mongoose from "mongoose";

import { env } from "./env";

export async function connectDatabase(): Promise<void> {
  await mongoose.connect(env.MONGODB_URI);
  console.info("MongoDB connection established");
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}
