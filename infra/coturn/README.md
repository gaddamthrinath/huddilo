# Huddilo coturn

This service supplies STUN and TURN connectivity for browsers that cannot reach the mediasoup SFU directly because of NAT or firewall restrictions.

It uses coturn's shared-secret TURN REST authentication. The backend will later generate a short-lived `timestamp:participant-id` username and an HMAC password for each authenticated participant. The browser will receive those temporary credentials only when it is allowed to join a meeting.

## Local development

1. Copy `.env.example` to `.env`.
2. Generate a secret with `openssl rand -base64 48` and set `TURN_SHARED_SECRET`.
3. Start the service with `docker compose up -d` from this directory.
4. Check the status with `docker compose ps` and logs with `docker compose logs -f`.

This Compose file uses Linux host networking because Docker bridge networking can advertise a container-only relay address to a local browser. Do not use this exact network setting blindly on a public server; production needs a public IP, firewall rules, TLS certificates, and an explicit external-address configuration when the container is behind NAT.

## Ports

- `3478/UDP` and `3478/TCP`: STUN/TURN listener.
- `49160-49200/UDP` and `49160-49200/TCP`: relay allocation range.

TLS/DTLS is intentionally disabled for local development. Production will add `5349/TCP`, certificates, and `turns:` URLs.
