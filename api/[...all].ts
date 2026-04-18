// @ts-nocheck — `dist/app.mjs` is produced by `pnpm -C artifacts/api-server run build` (see vercel.json buildCommand).
/**
 * Vercel type-checks API routes with Node16-style rules on `.ts` sources, which breaks the api-server tree.
 * Import the pre-bundled ESM app instead.
 *
 * Serverless: this file must stay thin — the Express app in `app.mjs` is stateless per request;
 * Mongo is connected lazily via `ensureMongoConnection()` and cached on `globalThis` for warm invocations.
 * Do not import `src/index.ts` (that entry calls `listen()` and is for local `pnpm start` only).
 */
import app from "../artifacts/api-server/dist/app.mjs";

export default app;
