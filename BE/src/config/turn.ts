import { env } from "./env";

const urls = env.TURN_URLS.split(",")
  .map((url) => url.trim())
  .filter(Boolean);

if (urls.length === 0) {
  throw new Error("TURN_URLS must include at least one STUN or TURN URL");
}

export const turnConfig = {
  sharedSecret: env.TURN_SHARED_SECRET,
  urls,
};
