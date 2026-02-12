---
title: Deployment Strategy
status: draft
last_verified: 2026-02-11
---

# Deployment Strategy

## Overview

Three-environment setup: **local dev** → **staging** → **production**, using two free Supabase projects, deployed via Vercel.

| Environment | Frontend | Database | Purpose |
|-------------|----------|----------|---------|
| Local dev | `next dev` on localhost:3000 | Local Supabase (Docker) | Day-to-day development |
| Staging | Vercel preview deployment | `podman-staging` Supabase project | Test on the web before production |
| Production | Vercel production deployment | `podman` Supabase project | Live app |

---

## Cost Breakdown

| Service | Tier | Cost | Limits |
|---------|------|------|--------|
| Vercel | Hobby | Free | Unlimited preview deploys, 1 production domain, serverless functions |
| Supabase | Free | Free | 500 MB database, 1 GB storage, 50k monthly active users |
| GitHub | Free | Free | Private repos, Actions minutes (2,000/month) |

**Total: $0/month** for the foreseeable future.

> [!NOTE]
> Supabase branching requires a Pro plan ($25/month + ~$10/month per branch). Using two free-tier projects ($0/month) achieves the same staging/production separation at no cost.

---

## 1. Initial Setup

### 1.1 Supabase Projects

Two projects under the `skydude_lair` org:

| Project | Reference ID | Purpose |
|---------|-------------|---------|
| `podman` | `mvqdejniqbaiishumezl` | Production |
| `podman-staging` | `gotytvqikkwmrsztojgf` | Staging |

For each project, go to **Settings → API** and copy:
- Project URL (`https://xxxx.supabase.co`)
- Publishable key (`sb_publishable_...`) — client-safe, respects RLS
- Secret key (`sb_secret_...`) — server-only, bypasses RLS

> [!IMPORTANT]
> Supabase now uses **publishable keys** (replaces the old `anon` key) and **secret keys** (replaces the old `service_role` key). New projects only have these key types. Secret keys can be revoked and rotated independently.

### 1.2 Vercel Project

1. Go to [vercel.com](https://vercel.com) → **Add New Project**
2. Import the `cyngerian/podman` GitHub repo
3. Framework preset: **Next.js** (auto-detected)
4. Configure environment variables (see section 2)
5. Deploy settings:
   - **Production branch**: `main`
   - **Preview branches**: all other branches (automatic)

### 1.3 Git Branching Strategy

```
main (production)
 └── staging
      └── feature/your-feature-name
```

| Branch | Deploys To | Supabase Instance |
|--------|-----------|-------------------|
| `main` | Vercel production | `podman` (production) |
| `staging` | Vercel preview (persistent URL) | `podman-staging` |
| `feature/*` | Vercel preview (ephemeral URL) | `podman-staging` |

**Workflow**:
1. Create feature branch from `staging`
2. Develop locally against local Supabase (Docker)
3. Push → Vercel creates preview deployment
4. When feature is ready, PR into `staging` → test on staging URL
5. When staging is stable, PR `staging` → `main` → deploys to production

---

## 2. Environment Variables

### 2.1 Variable Reference

| Variable | Where Used | Secret? |
|----------|-----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Client + Server | No (public) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Client + Server | No (public, safe with RLS) |
| `SUPABASE_SECRET_KEY` | Server only | **Yes** — bypasses RLS |

### 2.2 Per-Environment Values

#### Local Dev (`.env.local` — already exists, gitignored)
```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<local publishable key from `supabase start` output>
SUPABASE_SECRET_KEY=<local secret key from `supabase start` output>
```

> [!NOTE]
> Local Supabase may still output keys with the legacy names (`anon key`, `service_role key`). Use those values but assign them to the new variable names above.

#### Staging (Vercel environment variables)
Set in Vercel dashboard → Project Settings → Environment Variables:
- Scope: **Preview**

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co       (staging branch URL)
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_... (staging branch key)
SUPABASE_SECRET_KEY=sb_secret_...                        (staging branch secret)
```

#### Production (Vercel environment variables)
- Scope: **Production**

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co       (main branch URL)
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_... (production key)
SUPABASE_SECRET_KEY=sb_secret_...                        (production secret)
```

> [!CAUTION]
> Never commit real keys to git. Vercel injects environment variables at build time. The `.env.local` file is gitignored and only used for local dev.

### 2.3 `.env.example` (committed to repo)

A template file for developers to copy:

```env
# Copy this to .env.local and fill in values
# Local dev: run `npx supabase start` and use the output values
# Staging/Production: get from Supabase dashboard → Settings → API

NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
```

---

## 3. Database Migrations

### 3.1 How Migrations Work

Migrations live in `supabase/migrations/` and are applied in filename order. The Supabase CLI tracks which migrations have been applied.

| Environment | How migrations are applied |
|-------------|--------------------------|
| Local dev | `npx supabase db reset` (drops and recreates everything) |
| Remote | `npx supabase db push` (applies new migrations to linked project) |

### 3.2 Migration Workflow

1. **Write migration locally**:
   ```bash
   # Create a new migration file
   npx supabase migration new <description>
   # Edit the generated file in supabase/migrations/
   ```

2. **Test locally**:
   ```bash
   npx supabase db reset    # Drops and recreates all tables
   ```

3. **Push to remote**:
   ```bash
   npx supabase link --project-ref <project-id>
   npx supabase db push
   ```

> [!WARNING]
> `db push` applies migrations that haven't been applied yet. It does **not** drop tables. Destructive schema changes require careful migration scripts with data preservation.

With branching enabled, Supabase can also automatically run migrations when branches are merged via the dashboard or GitHub integration.

---

## 4. Development Workflow

### 4.1 Daily Development

```bash
# 1. Start local Supabase (if not already running)
npx supabase start

# 2. Start Next.js dev server
npm run dev

# 3. Open app at http://localhost:3000
# 4. Open Supabase Studio at http://127.0.0.1:54323

# 5. When done for the day
npx supabase stop    # Optional — containers persist
```

### 4.2 Feature Development

```bash
# 1. Create feature branch from staging
git checkout staging
git pull origin staging
git checkout -b feature/auth-flow

# 2. Develop locally (see 4.1)

# 3. Commit and push
git add <files>
git commit -m "Add auth flow"
git push -u origin feature/auth-flow

# 4. Vercel auto-deploys a preview URL

# 5. When ready, create PR: feature/auth-flow → staging
# 6. Merge PR → staging preview URL updates

# 7. When staging is verified, create PR: staging → main
# 8. Merge PR → production deploys
```

### 4.3 Testing Checklist

Before merging to staging:

- [ ] `npm run build` passes locally
- [ ] `npm run lint` passes
- [ ] Tested against local Supabase
- [ ] No hardcoded URLs or keys

Before merging to production:

- [ ] Tested on Vercel staging preview URL
- [ ] Database migrations applied to staging successfully
- [ ] Auth flows work end-to-end on staging
- [ ] No console errors in browser

---

## 5. Vercel Configuration

### 5.1 Build Settings (auto-detected)

| Setting | Value |
|---------|-------|
| Framework | Next.js |
| Build command | `next build` |
| Output directory | `.next` |
| Install command | `npm install` |
| Node.js version | 20.x (or latest LTS) |

### 5.2 Domain Setup

| Environment | URL |
|-------------|-----|
| Production | `podman.vercel.app` (free) or custom domain |
| Staging | `podman-git-staging-<user>.vercel.app` (auto-generated) |
| Feature previews | `podman-<hash>-<user>.vercel.app` (auto-generated) |

> [!TIP]
> For a stable staging URL, you can assign a custom domain alias (e.g. `staging.podman.app`) to the `staging` branch in Vercel dashboard → Domains.

### 5.3 Scryfall Image Domain

Add to `next.config.ts` when using `next/image` for card images:

```typescript
const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cards.scryfall.io",
      },
    ],
  },
};
```

---

## 6. Supabase Auth Configuration

### 6.1 Per-Environment Auth Settings

Configure in **Authentication → URL Configuration**:

| Setting | Local | Staging | Production |
|---------|-------|---------|------------|
| Site URL | `http://localhost:3000` | `https://<staging>.vercel.app` | `https://podman.vercel.app` |
| Redirect URLs | `http://localhost:3000/**` | `https://*-podman.vercel.app/**` | `https://podman.vercel.app/**` |

> [!IMPORTANT]
> The redirect URL wildcards for staging allow all Vercel preview URLs to work with OAuth and magic links.

### 6.2 Auth Providers (start simple)

| Provider | Priority | Notes |
|----------|----------|-------|
| Email/password | Phase 1 | Simplest, works immediately |
| Magic links (email) | Phase 2 | Better UX, no passwords |
| Discord OAuth | Phase 3 | Natural fit for gaming groups |
| Google OAuth | Phase 3 | Broad reach |

---

## 7. CI/CD (Optional, Future)

For now, Vercel handles all deployments automatically on push. If you want automated checks before merge, add a GitHub Actions workflow:

```yaml
# .github/workflows/ci.yml
name: CI
on:
  pull_request:
    branches: [staging, main]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run build
```

This is free within GitHub's 2,000 minutes/month for private repos.

---

## 8. Quick Reference

### Commands

| Task | Command |
|------|---------|
| Start local Supabase | `npx supabase start` |
| Stop local Supabase | `npx supabase stop` |
| Reset local DB (re-run all migrations) | `npx supabase db reset` |
| Create new migration | `npx supabase migration new <name>` |
| Push migrations to production | `npx supabase link --project-ref mvqdejniqbaiishumezl && npx supabase db push` |
| Push migrations to staging | `npx supabase link --project-ref gotytvqikkwmrsztojgf && npx supabase db push` |
| Generate TypeScript types | `npx supabase gen types typescript --local > src/lib/database.types.ts` |
| Start dev server | `npm run dev` |
| Build | `npm run build` |
| Lint | `npm run lint` |

### URLs (Local Dev)

| Service | URL |
|---------|-----|
| App | http://localhost:3000 |
| Supabase API | http://127.0.0.1:54321 |
| Supabase Studio | http://127.0.0.1:54323 |
| Mailpit (email testing) | http://127.0.0.1:54324 |

---

**End of Deployment Strategy**
