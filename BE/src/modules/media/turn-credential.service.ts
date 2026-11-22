import { createHmac } from "node:crypto";

const CREDENTIAL_LIFETIME_SECONDS = 60 * 60;

export class TurnCredentialService {
  public constructor(private readonly sharedSecret: string) {
    if (!sharedSecret.trim()) throw new Error("A TURN shared secret is required");
  }

  public createCredentials(participantId: string) {
    if (!participantId.trim()) throw new Error("A participant ID is required");

    const expiresAt = Math.floor(Date.now() / 1000) + CREDENTIAL_LIFETIME_SECONDS;
    const username = `${expiresAt}:${participantId}`;
    const credential = createHmac("sha1", this.sharedSecret)
      .update(username)
      .digest("base64");

    return { username, credential, expiresAt };
  }
}
