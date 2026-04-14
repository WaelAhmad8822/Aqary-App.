# Aqary - Arabic Real Estate Platform

## Overview

Aqary (عقاري) is a complete Arabic-first (RTL) real estate web platform for the Egyptian market. Built as a graduation project featuring AI-powered property search, hybrid recommendation engine, and role-based dashboards.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite (artifacts/aqary), full Arabic RTL UI
- **API framework**: Express 5 (artifacts/api-server)
- **Database**: PostgreSQL + Drizzle ORM
- **Authentication**: JWT + bcryptjs
- **AI Chatbot**: Google Gemini API (gemini-2.0-flash)
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Architecture

### Database Schema (lib/db/src/schema/)
- **users**: id, name, email, passwordHash, phone, role (buyer/seller/admin)
- **properties**: id, title, description, price, location, area, rooms, propertyType, features[], imageUrl, sellerId, status, views/saves/contacts
- **interactions**: id, userId, propertyId, interactionType (view/save/contact/scroll/time_spent), weight, seconds
- **feedback**: id, userId, message, criteria, resolved
- **user_preferences**: id, userId, preferredLocation, maxBudget, preferredType, preferredFeatures[]

### Recommendation Engine (artifacts/api-server/src/lib/cosineSimilarity.ts)
- Hybrid: Final Score = (Content_Score x 0.6) + (Behavior_Score x 0.4)
- Content scoring uses cosine similarity between user preference vector and property vector
- Behavior scoring uses weighted interactions: view=1, save=3, contact=5, scroll=0.5, time_spent=0.1/sec
- Returns matchScore (0-100) and matchReasons in Arabic

### API Routes (artifacts/api-server/src/routes/)
- **auth.ts**: POST /auth/register, POST /auth/login, GET /auth/me
- **properties.ts**: CRUD + listing with filters, seller's own listings
- **recommendations.ts**: GET /recommendations (personalized with hybrid scoring)
- **interactions.ts**: POST /track (view/save/contact/scroll/time_spent)
- **chat.ts**: POST /chat (Gemini AI chatbot with conversation flow)
- **admin.ts**: Users, properties approval, feedback management, analytics
- **user.ts**: Preferences, saved properties, account deletion

### Frontend Pages (artifacts/aqary/src/pages/)
- Home (/): Hero, search, recommendations, new listings
- Login/Register: Auth forms with role selection
- Properties (/properties): Browse with filters
- Property Detail (/property/:id): Full info with interaction tracking
- Dashboard (/dashboard): Seller listings management
- Admin (/admin): Analytics, user/property/feedback management
- Saved (/saved): User's saved properties

### Chat Flow
- Role detection first (buyer/seller)
- Buyer: payment method -> budget -> location -> type -> features -> show properties
- Complaint keywords auto-create feedback for admin

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas
- `pnpm --filter @workspace/db run push` — push DB schema changes
- `pnpm --filter @workspace/scripts run seed` — seed database with sample data

## Test Accounts
- Admin: admin@aqary.com / admin123
- Seller: seller@aqary.com / seller123
- Buyer: buyer@aqary.com / buyer123

## Security Notes
- GEMINI_API_KEY stored as Replit Secret only (not in shared env or code)
- JWT_SECRET / SESSION_SECRET: Required at startup; server fails fast if missing
- Chat widget only renders for authenticated users (requires valid JWT token)
- Seller role enforced on property creation
- Non-approved properties visible only to owner/admin

## Environment Variables
- DATABASE_URL: PostgreSQL connection string (runtime-managed)
- GEMINI_API_KEY: Google Gemini API key for chatbot (Replit Secret)
- JWT_SECRET / SESSION_SECRET: JWT signing secret (Replit Secret)
