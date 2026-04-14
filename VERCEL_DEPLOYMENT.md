# Vercel Deployment

This project is now configured to deploy as a single Vercel project:
- Frontend: static Vite build from `artifacts/aqary`
- API: serverless function from `api/[...all].ts` serving the Express app

## Required Environment Variables

Set these in your Vercel project settings:

- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - JWT signing secret
- `NODE_ENV` - set to `production`

## Build and Output

- Install command: `pnpm install --frozen-lockfile`
- Build command: `pnpm --filter @workspace/aqary run build`
- Output directory: `artifacts/aqary/dist/public`

## Notes

- API routes are available under `/api/*`.
- SPA routes are rewritten to `index.html`.
- The frontend already calls relative `/api/...` endpoints, so no client API URL changes are required for same-origin deployment.
