# Huddilo Backend

Node.js, Express, TypeScript, MongoDB, and Mongoose backend for Huddilo.

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

MongoDB must be available at the configured `MONGODB_URI`. The default API URL is `http://localhost:4000/api/v1`.

## Commands

```bash
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
npm start
```

## Architecture

- `modules` — feature modules containing class-based MVC layers
- `common` — shared middleware, errors, schemas, types, and utilities
- `config` — environment and database configuration
- `docs` — generated OpenAPI document and Swagger UI setup
- `routes` — API composition root
- `tests` — unit and integration tests

Each feature module keeps its model, repository, service, controller, routes, Zod schemas, and OpenAPI registration together. Controllers, services, and repositories use constructor injection.

## API documentation

- Swagger UI: `GET /api/docs`
- OpenAPI JSON: `GET /api/docs.json`

The OpenAPI 3.1 document is generated from Zod schemas with `@asteasolutions/zod-to-openapi`.

## Current endpoints

- `GET /api/v1/health`
- `POST /api/v1/meetings` — creates and stores a meeting link

Meeting join behavior will be added in a later implementation phase.
