# Aqary - Arabic Real Estate Platform

## Overview

Aqary (عقاري) is an Arabic-first (RTL) real estate platform with role-based dashboards for buyers, sellers, and admins.  
The project is organized as a pnpm monorepo with separate frontend and backend apps.

## Project Structure

- `artifacts/aqary`: Frontend (React + Vite)
- `artifacts/api-server`: Backend API (Express + TypeScript)
- `lib/api-spec`: OpenAPI specification
- `lib/api-zod`: Shared request/response validation schemas
- `lib/api-client-react`: Generated React API client/hooks

## Tech Stack

- **Monorepo**: pnpm workspaces
- **Frontend**: React, Vite, React Query, Tailwind, RTL Arabic UI
- **Backend**: Express 5, TypeScript, esbuild build script
- **Database**: MongoDB (Mongoose models in backend)
- **Auth**: JWT + bcryptjs
- **Chatbot**: LLM chat integration via backend route (`/chat`) and external model endpoint
- **Validation/Contracts**: OpenAPI + Zod + generated client

## Run Locally

### 1) API server

From `artifacts/api-server`:

- `corepack pnpm dev`

Default API port in current setup: `5001`.

### 2) Frontend app

From `artifacts/aqary`:

- `corepack pnpm dev`

Then open the local Vite URL shown in terminal.

## Useful Commands

From repo root:

- `pnpm run typecheck` - typecheck workspace packages
- `pnpm run build` - build workspace packages
- `pnpm --filter @workspace/api-spec run codegen` - regenerate API client/schemas from OpenAPI

## Main Features

- Authentication and role-based access (`buyer`, `seller`, `admin`)
- Property CRUD and moderation workflow
- User interaction tracking (views, saves, contacts, etc.)
- Recommendation engine and match reasons
- AI chat assistant flow for property discovery and complaint capture
- Seller dashboard for property management

## Notes

- Keep `.env` values configured for backend runtime (DB connection, JWT secrets, and any chat provider settings).

### Production API URL (frontend)

Production builds default the API base to **Railway**: `https://workspaceapi-server-production-e3b4.up.railway.app` (see `artifacts/aqary/src/main.tsx`). Override at build time with `VITE_API_BASE_URL`. For a same-origin Vercel app that serves both SPA and `/api`, set `VITE_API_RELATIVE=true` so the client keeps using relative `/api/...` paths.

On Railway, set **`CORS_ORIGIN`** to your frontend origin (e.g. `https://your-app.vercel.app`) so the browser can call the API from another domain.

## Vercel Deployment

This repo is configured for Vercel with:

- Static frontend output from `artifacts/aqary/dist/public`
- Serverless API entry at `api/[...all].ts` (Express app)

In the Vercel project **Settings → General → Root Directory**, use the **repository root** (`.`). The root `vercel.json` build runs **API server esbuild first**, then the Vite frontend:

`pnpm -C artifacts/api-server run build && pnpm -C artifacts/aqary run build:web`

That produces `artifacts/api-server/dist/app.mjs`, which `api/[...all].ts` imports so Vercel does not type-check raw `artifacts/api-server/src/**/*.ts` with Node16 rules (which previously failed the deploy).

If you still see **`ERR_PNPM_NO_SCRIPT` for `build:web`**, open **Project → Settings → General → Build & Development Settings** and remove any **custom Build Command** that overrides `vercel.json` (leave it empty to use the file), or set **Root Directory** to the repository root.

If you must set Root Directory to **`artifacts/aqary`**, override in the Vercel UI: **Build Command** `pnpm run build`, **Output Directory** `dist/public`, and keep **`api/`** at the repo root by using a monorepo setup or moving the API — simplest is to keep Root Directory at the repo root.

In **Framework Preset**, choose **Other** (or leave auto-detect off). The repo `vercel.json` sets `"framework": null` so Vercel treats the build output as a **static site** (HTML/JS/CSS from Vite), not a Node server entry in that folder.

If you see **“No entrypoint found in output directory”**, it usually means Vercel was treating the output like a server app. Using **Framework: Other** / `framework: null` fixes that.

If the build step fails, open the full log on Vercel. Common causes:

- **Install failed** (before build): run `pnpm install` locally with the same lockfile; if `minimumReleaseAge` in `pnpm-workspace.yaml` blocks a new package, you may need to wait or adjust the allowlist.
- **`ERR_PNPM_NO_SCRIPT` for `build:web`**: clear the dashboard **Build Command** override, or ensure `build:web` exists in the `package.json` for your chosen Root Directory (this repo defines it in both places).

Set these Environment Variables in Vercel Project Settings:

- `MONGODB_URI` (or `DATABASE_URL`) — **required** for any route that uses the database (without it, those requests fail).
- `MONGODB_DB_NAME` (optional, defaults to `aqary`)
- `JWT_SECRET` (or `SESSION_SECRET`) — **required** for login/register and any authenticated route.
- `OLLAMA_BASE_URL` (or `LLM_BASE_URL`) for chatbot model endpoint

If the serverless function returns **500 / FUNCTION_INVOCATION_FAILED**, open **Vercel → Project → Logs** and check for missing env or Mongo connection errors. **`GET /api/healthz`** should respond with JSON even when only part of the stack is configured, so you can confirm the function is running.

Optional notes:

- If the API is on the **same host** as the SPA, use `VITE_API_RELATIVE=true` instead of the default Railway base URL.
- If chatbot provider is not configured, chat returns a friendly "service not configured" message.
