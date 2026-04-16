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

## Vercel Deployment

This repo is configured for Vercel with:

- Static frontend output from `artifacts/aqary/dist/public`
- Serverless API entry at `api/[...all].ts` (Express app)

In the Vercel project **Settings → General → Root Directory**, leave the root as the **repository root** (`.`).  
In **Framework Preset**, choose **Other** (or leave auto-detect off). The repo `vercel.json` sets `"framework": null` so Vercel treats the build output as a **static site** (HTML/JS/CSS from Vite), not a Node server entry in that folder.

If you see **“No entrypoint found in output directory”**, it usually means Vercel was treating the output like a server app. Using **Framework: Other** / `framework: null` and the `build:web` script fixes that.

Set these Environment Variables in Vercel Project Settings:

- `MONGODB_URI` (or `DATABASE_URL`)
- `MONGODB_DB_NAME` (optional, defaults to `aqary`)
- `JWT_SECRET` (or `SESSION_SECRET`)
- `OLLAMA_BASE_URL` (or `LLM_BASE_URL`) for chatbot model endpoint

Optional notes:

- Keep API calls relative (`/api/...`) from the frontend.
- If chatbot provider is not configured, chat returns a friendly "service not configured" message.
