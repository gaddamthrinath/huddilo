# Huddilo

Huddilo is an in-progress, self-hosted video-meeting application. It uses Next.js for the frontend, Express and MongoDB for the application backend, Socket.IO for meeting signalling, mediasoup as the SFU, and coturn for STUN/TURN connectivity.

> **Development status — not complete or production-ready.** The project is actively being built. Do not use it for private, business-critical, or public meetings yet.

## What works today

- Create short public meeting links and private host links.
- Verify host links and establish a host-only browser cookie.
- Join a room as a host or request entry as a guest.
- Host waiting-room list and guest admission over Socket.IO.
- Local camera and microphone preview before joining.
- MongoDB-backed meeting records and Swagger API documentation.
- mediasoup worker pool, per-meeting routers, transport, Producer, and Consumer signalling foundations.
- coturn configuration with temporary, server-issued TURN credentials.

## Still in development

- Browser `mediasoup-client` transport connection and actual audio/video publishing.
- Remote video/audio tiles and participant controls.
- Meeting leave/end controls, reconnection, and robust room persistence.
- Authentication, authorization, rate limiting, audit logging, moderation, and production monitoring.
- Production media networking, TLS, firewall configuration, scaling, and deployment hardening.

## Project structure

```text
FE/                 Next.js frontend
BE/                 Express, MongoDB, Socket.IO, and mediasoup backend
infra/coturn/       Local coturn Docker configuration and setup guide
```

## Prerequisites

- Node.js 20 or newer.
- npm.
- MongoDB Atlas or a local MongoDB instance.
- Linux build tools for mediasoup (`gcc`, `gcc-c++`, `make`, and Python).
- Docker Engine if you want to run coturn locally.

## Local setup

### 1. Configure the backend

```bash
cd BE
cp .env.example .env
npm install
```

Edit `BE/.env`:

- Set `MONGODB_URI` to your MongoDB connection string.
- Set `TURN_SHARED_SECRET` to a long random value.
- Keep `MEDIA_ANNOUNCED_ADDRESS=127.0.0.1` for same-computer development.

Never commit `BE/.env`.

### 2. Configure the frontend

```bash
cd FE
cp .env.local.example .env.local
npm install
```

For local development, `FE/.env.local` should contain:

```env
NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
```

The frontend automatically derives `http://localhost:4000` from that URL for Socket.IO.

### 3. Configure coturn (recommended for WebRTC work)

```bash
cd infra/coturn
cp .env.example .env
```

Set `TURN_SHARED_SECRET` in `infra/coturn/.env` to **the exact same value** used in `BE/.env`, then start coturn:

```bash
docker compose up -d
docker compose ps
```

Read [the coturn setup guide](infra/coturn/SETUP.md) before trying a non-local deployment.

## Run locally

Start each service in its own terminal.

```bash
# Terminal 1: backend
cd BE
npm run dev
```

```bash
# Terminal 2: frontend
cd FE
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Useful backend URLs:

- Health: [http://localhost:4000/api/v1/health](http://localhost:4000/api/v1/health)
- Swagger UI: [http://localhost:4000/api/docs](http://localhost:4000/api/docs)
- OpenAPI JSON: [http://localhost:4000/api/docs.json](http://localhost:4000/api/docs.json)

## Test the current waiting room

1. Create a meeting from the frontend home page.
2. Open the private host link in one browser window.
3. Verify host access, continue to the meeting, enter a name, and select **Ask to join**.
4. Open the public link in an incognito/private window.
5. Enter a different name and select **Ask to join**.
6. The guest appears in the host waiting room; select **Admit**.

The guest should change from **Waiting for host** to **Admitted**. This confirms the current Socket.IO waiting-room flow; it does not yet start a video call.

## Verification commands

```bash
cd BE
npm run typecheck
npm run lint
npm test
npm run build
```

```bash
cd FE
npx tsc --noEmit
npm run lint
```

## Security notes

- Keep host links private; they establish the host browser session.
- Keep MongoDB and TURN secrets out of Git.
- The local coturn setup intentionally has no TLS and uses host networking. It is for development only.
- Production deployment needs HTTPS, secure TURN (`turns:`), a reachable media address, appropriate firewall rules, and proper authentication.

## License

Licensed under the [Apache License 2.0](LICENSE).
