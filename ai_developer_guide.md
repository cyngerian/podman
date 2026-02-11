---
title: Draftime - Developer Guide
status: draft
last_verified: 2026-02-10
primary_entry_point: true
---

<!--
AI-AGENT-CONTEXT:
- This is the PRIMARY entry point for understanding the Draftime codebase.
- Status is DRAFT — sections will be filled in as the project is built.
- Refer to ai_agent_bootstrap.md for collaboration workflow.
-->

# Draftime - Developer Guide

**Last Updated**: February 10, 2026
**Status**: Pre-development

---

## 1. Executive Summary

**Draftime** is a web app for organizing and running Magic: The Gathering drafts within friend groups. It enables:
- Creating and managing user groups for recurring draft sessions
- Proposing, voting on, and scheduling drafts within groups
- Running live drafts with accurate pack generation per MTG set
- Browsing cards via live Scryfall image lookups (cached per session)
- Administrative tools for managing users, groups, and drafts

### Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js (App Router) |
| Language | TypeScript |
| Styling | TBD |
| Hosting | Vercel |
| Database | TBD |
| Auth | TBD |
| Card Data | Scryfall API (live image requests, session-cached) |
| Set/Card DB | TBD (set metadata + pack distribution rules) |

---

## 2. Architecture Overview

<!-- Fill in as architecture decisions are made -->

### 2.1 Core Pattern

```
TBD — Document the client ↔ API ↔ database flow once established.
```

**Key Files**:

| Role | File | Description |
|------|------|-------------|
| TBD | TBD | TBD |

### 2.2 Data Model

```
TBD — Document entities and relationships once designed.

Expected entities:
- User (id, name, email, auth fields)
- Group (id, name, members, admin)
- Draft (id, groupId, set, status, schedule, votes)
- DraftSession (id, draftId, participants, packs, picks)
- Set (id, code, name, pack distribution rules)
- Card (id, setCode, name, rarity, collectorNumber — minimal, references Scryfall)
```

---

## 3. Page Structure & UI

<!-- Fill in as pages are built -->

### 3.1 Pages (Planned)

| Page | Purpose | Status |
|------|---------|--------|
| Dashboard / Home | Group overview, upcoming drafts, quick actions | Planned |
| Group Page | Group members, draft proposals, voting, history | Planned |
| Draft Planning | Set selection, scheduling, RSVP | Planned |
| Live Draft | Pack display, card picking, timer | Planned |
| Draft Results | Pick summaries, deck lists | Planned |
| Admin Panel | User/group/draft management | Planned |
| Settings | User profile, preferences | Planned |

---

## 4. Core Domain Logic

<!-- Fill in as features are implemented -->

### 4.1 Pack Generation

```
TBD — Document how packs are generated per set.

Key considerations:
- Each MTG set has unique pack collation rules
- Common/Uncommon/Rare/Mythic distribution varies by set
- Special slots (showcase, foil, DFC, bonus sheet) differ per set
- Set metadata + distribution rules stored in DB
- Card data pulled from Scryfall at draft time
```

### 4.2 Draft Flow

```
TBD — Document the draft session lifecycle.

Expected flow:
- Draft proposed → voted on → scheduled → launched
- Packs generated from set distribution rules
- Players pick cards in rotation (left-right-left pattern)
- Session state managed in real-time
- Results saved after draft completion
```

### 4.3 Scryfall Integration

```
TBD — Document the caching and request strategy.

Key rules:
- Card images fetched live from Scryfall (no local image storage)
- Images cached locally during active draft sessions
- Rate limit: 50-100ms between API requests
- Use bulk data endpoints for full set card lists
- Handle split/DFC cards via card_faces array
```

---

## 5. API Reference

<!-- Fill in as API routes are created -->

### 5.1 Authentication

| Action / Endpoint | Auth Required | Description |
|-------------------|---------------|-------------|
| TBD | TBD | TBD |

### 5.2 Groups

| Action / Endpoint | Auth Required | Description |
|-------------------|---------------|-------------|
| TBD | TBD | TBD |

### 5.3 Drafts

| Action / Endpoint | Auth Required | Description |
|-------------------|---------------|-------------|
| TBD | TBD | TBD |

### 5.4 Cards / Sets

| Action / Endpoint | Auth Required | Description |
|-------------------|---------------|-------------|
| TBD | TBD | TBD |

---

## 6. Security Posture

<!-- Fill in as auth and security are implemented -->

### 6.1 Auth Model

| Aspect | Implementation |
|--------|----------------|
| Authentication method | TBD |
| Session duration | TBD |
| Password storage | TBD |
| Authorization model | TBD |

### 6.2 Data Sanitization

TBD — Document what is stripped before returning to clients.

---

## 7. Deployment Workflow

### 7.1 Environment Variables

| Variable | Purpose |
|----------|---------|
| TBD | TBD |

### 7.2 Branching Strategy

| Branch | Purpose | Deploys To |
|--------|---------|------------|
| TBD | TBD | TBD |

### 7.3 Deployment Steps

TBD — Document once Vercel project is configured.

---

## 8. AI Development Guidelines

### 8.1 Code Modification Patterns

<!-- Fill in as patterns emerge -->

#### Adding a New API Route
1. TBD

#### Adding a New Page
1. TBD

### 8.2 Testing Workflow

| Step | Action | Success Criteria |
|------|--------|------------------|
| 1 | `npm run build` | No TypeScript errors |
| 2 | TBD | TBD |

---

## 9. Known Limitations

### 9.1 Architectural

| Limitation | Impact | Mitigation / Plan |
|------------|--------|-------------------|
| TBD | TBD | TBD |

### 9.2 Feature Gaps

- TBD (will be populated as MVP scope is defined)

---

## 10. Quick Reference

### Key File Locations

| Component | Path |
|-----------|------|
| TBD | TBD |

### Documentation Index

| Document | Path |
|----------|------|
| AI Agent Workflow | `ai_agent_bootstrap.md` |
| This Guide | `ai_developer_guide.md` |

---

**End of Developer Guide**
