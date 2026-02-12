---
title: Session Handover
status: active
last_verified: 2026-02-11
---

# Session Handover — 2026-02-11

## What Was Accomplished

### 1. Git Remote + Push
- Updated git remote from `cyngerian/draftime` → `cyngerian/podman`
- Configured `gh auth setup-git` for HTTPS credential helper
- Committed and pushed the full codebase (46 files, ~13,500 lines) to GitHub

### 2. Supabase Key Model Update
- Researched Supabase's new API key model (as of late 2025):
  - `anon` key → **publishable key** (`sb_publishable_...`)
  - `service_role` key → **secret key** (`sb_secret_...`)
- Updated all references across the codebase:
  - `src/lib/supabase.ts` — `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  - `src/lib/supabase-server.ts` — `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  - `.env.example` — new variable names
  - `.env.local` — new variable names (values unchanged)
  - `docs/plans/deployment_strategy.md` — full rewrite

### 3. Supabase Projects Created
- **Production**: `podman` (`mvqdejniqbaiishumezl`)
- **Staging**: `podman-staging` (`gotytvqikkwmrsztojgf`)
- Both under `skydude_lair` org, East US region
- Schema (8 tables, indexes, RLS) pushed to both via CLI
- CLI linked to production as default
- Branching was evaluated ($35/month) and rejected in favor of two free projects

### 4. Vercel Deployed
- Connected to `cyngerian/podman` GitHub repo
- Production environment variables configured:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  - `SUPABASE_SECRET_KEY`
- First deploy succeeded
- **Still TODO**: Add staging env vars scoped to Preview deployments

### 5. MCP Servers Configured
- `.mcp.json` at project root with Supabase + Vercel MCP servers
- Requires session restart to activate
- Will prompt for OAuth approval on first use

---

## What Remains

### Immediate Next Steps
1. **Restart Claude Code session** to activate MCP servers
2. **Vercel staging env vars** — go to Project Settings → Environment Variables:
   - Add staging Supabase values with scope **Preview**
   - Edit production values to scope **Production** only
3. **Implement Supabase Auth** (task #5):
   - Sign-up page with invite code validation
   - Login page
   - Next.js middleware for auth session management
   - Protected routes
   - Profile creation trigger (already in schema)
4. **Configure Supabase Auth URLs** per environment:
   - Production: Site URL = Vercel production URL
   - Staging: Site URL = Vercel staging preview URL
   - Local: already defaults to localhost:3000

### Reference: Supabase CLI Auth
The CLI requires an access token. Set before running commands:
```bash
export SUPABASE_ACCESS_TOKEN=<token>
```
Token name in Supabase dashboard: `claude_1`

### Reference: Project IDs

| Project | Ref ID | URL |
|---------|--------|-----|
| podman (prod) | `mvqdejniqbaiishumezl` | `https://mvqdejniqbaiishumezl.supabase.co` |
| podman-staging | `gotytvqikkwmrsztojgf` | `https://gotytvqikkwmrsztojgf.supabase.co` |

---

**End of Session Handover**
