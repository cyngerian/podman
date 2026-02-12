---
title: AI Agent Collaboration Workflow
status: active
last_verified: 2026-02-10
primary_reference: true
---

# AI Agent Collaboration Workflow

This document defines how AI agents should interact with the podman codebase and collaborate with the user. Following these patterns ensures consistent, traceable, and productive sessions.

---

## Quick Reference

| Phase | Artifacts | Key Actions |
|-------|-----------|-------------|
| PLANNING | `implementation_plan.md`, `task.md` | Read docs, research code, propose plan, get approval |
| EXECUTION | Update `task.md` | Implement changes, update checklist |
| VERIFICATION | `walkthrough.md` | Run tests, document results |

**First Actions**: Read `README.md` → `ai_developer_guide.md` → Verify against code → Propose plan

---

## Session Intake (When Task Is Unclear)

> [!IMPORTANT]
> **AI Agent Directive**: If a user points you to this document without a specific task, run the intake questionnaire below to gather requirements.

### Step 1: Determine Task Type

Ask the user:

> "What type of work are you looking to do today?
>
> 1. **Add a Feature** - Build something new
> 2. **Fix an Issue** - Debug or repair something broken
> 3. **Refactor/Change** - Modify existing code structure
> 4. **Research/Investigate** - Understand how something works
> 5. **Documentation** - Update or create docs
> 6. **Other** - Something else"

### Step 2: Gather Task-Specific Details

Based on their answer, ask the relevant follow-up questions:

#### If "Add a Feature":
1. What should this feature do? (specific behaviors)
2. Where should it appear in the app? (page/location)
3. Is there a similar feature I can reference for patterns?
4. Any constraints? (deadline, must work with existing X, etc.)

#### If "Fix an Issue":
1. What's the symptom? (what do you observe?)
2. What's the expected behavior?
3. Steps to reproduce? (if known)
4. Any suspected files or areas?

#### If "Refactor/Change":
1. What's the current state? (how it works now)
2. What's the desired state? (how it should work after)
3. What must NOT break? (constraints)
4. Why make this change? (context helps prioritization)

#### If "Research/Investigate":
1. What area/topic do you want to understand?
2. Why do you need this info? (context for depth)
3. Any specific questions I should answer?

#### If "Documentation":
1. What needs documenting? (feature, API, process?)
2. Is this new docs or updating existing?
3. Who is the audience? (developers, users, AI agents?)

### Step 3: Confirm Understanding

After gathering details, summarize back:

> "Here's my understanding:
> - **Task type**: [Feature/Bug/etc.]
> - **Goal**: [What we're trying to accomplish]
> - **Success criteria**: [How we'll know it's done]
> - **Constraints**: [What to preserve/avoid]
>
> Does this capture your intent? Any corrections?"

### Step 4: Proceed to Planning

Once confirmed, follow the Session Start Checklist below.

---

## Session Start Checklist

**Do these first, in order:**

1. Read this document (`ai_agent_bootstrap.md`)
2. Read `README.md` for documentation index
3. Read `ai_developer_guide.md` for architecture
4. **Verify docs match code** by viewing key files:
   - `src/lib/types.ts` → Confirm data model matches documentation
   - `src/app/api/` → Spot-check API routes exist
   - `src/lib/scryfall.ts` (or equivalent) → Confirm Scryfall integration patterns
5. Check if resuming work: look for existing `task.md` artifacts
6. Ask user for specific goals if the request is unclear

> [!TIP]
> If documentation and code don't match, note discrepancies and ask user which is correct before proceeding.

---

## 1. Session Structure

Every AI session follows a **three-phase flow**:

```
PLANNING → EXECUTION → VERIFICATION
```

### Phase 1: Planning

**Purpose**: Understand the task, research the codebase, design the approach.

**Artifacts Created**:
- `implementation_plan.md` - Technical plan with proposed changes
- `task.md` - Checklist of work items

**Key Actions**:
1. Read existing documentation starting with `README.md` → `ai_developer_guide.md`
2. Research relevant code files before proposing changes
3. Verify documentation accuracy by viewing actual code
4. Create implementation plan with clear sections:
   - Executive Summary
   - Findings (if reviewing existing work)
   - Proposed Changes (grouped by component)
   - Verification Plan
   - Questions for User (if blocking decisions exist)
5. Request user approval before proceeding

#### Phase Gate: Planning → Execution

Before proceeding to EXECUTION, confirm:
- [ ] Implementation plan created and reviewed by user
- [ ] All blocking questions answered
- [ ] task.md created with detailed checklist
- [ ] Code structure verified against documentation

### Phase 2: Execution

**Purpose**: Implement the approved plan.

**Artifacts Updated**:
- `task.md` - Mark items `[/]` in progress, `[x]` when complete

**Key Actions**:
1. Work through task.md checklist systematically
2. Make atomic, focused changes
3. Provide brief descriptions for each change
4. Update task.md as items complete

#### Phase Gate: Execution → Verification

Before proceeding to VERIFICATION, confirm:
- [ ] All task.md items marked complete
- [ ] `npm run build` passes (if code changes made)
- [ ] No unresolved errors or warnings

### Phase 3: Verification

**Purpose**: Validate changes and document what was done.

**Artifacts Created**:
- `walkthrough.md` - Summary of completed work

**Key Actions**:
1. Run verification commands (build, lint, tests)
2. Confirm changes are correct
3. Create walkthrough documenting:
   - What was changed
   - Why it was changed
   - How to verify

---

## 2. Artifact Templates

### implementation_plan.md

**Path**: `<agent-brain>/<conversation-id>/implementation_plan.md`

```markdown
# [Goal Description]

## Executive Summary
Brief description of the problem and proposed solution.

## Findings Summary (if reviewing/auditing)
| Aspect | Status |
|--------|--------|
| Item 1 | ✅ Good / ⚠️ Issue / ❌ Missing |

## Proposed Changes

### Component 1: [Name]

#### [MODIFY] [filename.ext](file:///absolute/path)
- Change 1
- Change 2

#### [NEW] [filename.ext](file:///absolute/path)
- Description

#### [DELETE] [filename.ext](file:///absolute/path)
- Reason

## Verification Plan

### Automated
- Commands to run

### Manual
- Steps to verify UI/behavior

## Questions for User
1. Numbered list of blocking questions (if any)
```

### task.md

**Path**: `<agent-brain>/<conversation-id>/task.md`

```markdown
# [Task Name]

## Tasks

- [ ] Uncompleted task
- [/] In-progress task
- [x] Completed task
  - [x] Sub-task
```

### walkthrough.md

**Path**: `<agent-brain>/<conversation-id>/walkthrough.md`

```markdown
# [Feature/Work] Walkthrough

## Summary
Brief description of what was accomplished.

## Changes Made

| File | Changes |
|------|---------|
| [file.ext](file:///path) | Description |

## Verification
- What was tested
- Results
```

---

## 3. Documentation Standards

All documentation files should include **YAML frontmatter**:

```yaml
---
title: Document Title
status: active | draft | historical | deprecated
last_verified: YYYY-MM-DD
---
```

### Status Definitions

| Status | Meaning |
|--------|---------|
| `active` | Current, accurate, maintained |
| `draft` | Proposed, not yet implemented |
| `historical` | Past record, may be outdated |
| `deprecated` | Superseded, do not use |

### AI-Agent Context Blocks

For index/entry-point documents, include:

```html
<!--
AI-AGENT-CONTEXT:
- Key information for AI agents
- File path conventions
- Important patterns to follow
-->
```

### Formatting Guidelines

| Element | Format |
|---------|--------|
| File references | `[basename](file:///absolute/path)` |
| Code references | Backticks: \`functionName\`, \`ClassName\` |
| Status indicators | ✅ done, ⚠️ partial/warning, ❌ blocked/missing |
| Tables | GitHub markdown tables for structured data |
| Alerts | `> [!IMPORTANT]`, `> [!WARNING]`, `> [!CAUTION]` |

---

## 4. Communication Patterns

### User Questions → Agent Responses

**Good patterns**:
- Ask clarifying questions upfront (batched, numbered)
- Present options with tradeoffs when decisions are needed
- Summarize understanding before executing

**Avoid**:
- Making assumptions about user intent
- Starting execution without plan approval
- Asking questions one at a time when they're independent

### Examples

#### Bad Pattern: Assuming Intent
```
User: "Add set selection to the draft page"
Agent: "I'll add a dropdown with all MTG sets and hook it up to
       Scryfall." [Starts executing immediately]
```
**Problem**: Agent assumed implementation approach without asking. Which sets? Filterable? How does it affect pack generation?

#### Good Pattern: Presenting Options
```
User: "Add set selection to the draft page"
Agent: "I see a couple approaches for set selection:

1. **Simple dropdown** (faster)
   - Static list from our sets database, grouped by format
   - Quick to implement, user picks one set

2. **Search + filter** (richer UX)
   - Searchable with format/year filters
   - Supports multi-set drafts (e.g., Chaos Draft)
   - More complex, but scales better

Also: should changing the set mid-draft be allowed, or only at creation?

Which direction do you prefer?"
```

#### Bad Pattern: One Question at a Time
```
Agent: "Which MTG sets should be supported?"
User: "All Standard-legal sets"
Agent: "Should we include supplemental sets too?"
User: "yes"
Agent: "Should the set list update automatically?"
```
**Problem**: Three separate interruptions when questions are independent.

#### Good Pattern: Batched Questions
```
Agent: "A few questions before I proceed:

1. Which sets should be included? (Standard-legal only, or all draftable sets?)
2. Should supplemental/Masters sets be supported?
3. Should the set database update automatically, or manually maintained?
4. Do we need to support multi-set drafts (Chaos Draft)?"
```

### Progress Updates

Use task boundaries to communicate:
- **TaskName**: Current objective (granular, corresponds to task.md items)
- **TaskStatus**: What you're about to do next
- **TaskSummary**: Cumulative progress on the current task

### Status Signaling

When starting work:
> "Starting PLANNING phase. Reading documentation..."

When transitioning:
> "Planning complete. Implementation plan ready for review."

When blocked:
> "Blocked: Need clarification on [specific question]"

When done:
> "VERIFICATION complete. Walkthrough created."

### Handoffs

Before ending a session or when blocking on user input:
1. Update `task.md` with current state
2. Create/update `walkthrough.md` if work was completed
3. Clearly state what's done and what remains

---

## 5. Documentation Maintenance Rules

### When Making Changes

Update these files after significant changes:
- `ai_developer_guide.md` — New features, API changes, architecture updates
- Relevant feature docs in `docs/features/` (if applicable)

### When Creating New Features

Create documentation in this order:
1. Feature plan in `docs/features/[feature_name].md`
2. Update `README.md` index with link
3. After implementation: update `ai_developer_guide.md`

### Verification Dates

When verifying documentation accuracy:
1. Update `last_verified` in frontmatter
2. Fix any inaccuracies found
3. Mark outdated docs as `status: historical`

---

## 6. File Organization

```
/
├── ai_agent_bootstrap.md      # This file — how to collaborate
├── ai_developer_guide.md      # Primary entry point for codebase understanding
├── README.md                  # Project README / documentation index
├── docs/
│   ├── features/              # Feature-specific documentation
│   │   └── [feature].md
│   └── plans/                 # Future/draft plans
│       └── [plan].md
├── src/
│   ├── app/                   # Next.js App Router pages and API routes
│   ├── components/            # React components
│   └── lib/                   # Shared logic, types, utilities
└── scripts/                   # Build/data/maintenance scripts
```

---

## 7. Build & Deploy Commands

```bash
# Build / verify
npm run build

# Run dev server
npm run dev

# Run tests (when tests exist)
npm test

# Deploy: push to appropriate branch, Vercel auto-deploys
git push origin [branch]
```

---

## 8. Common Mistakes to Avoid

| Mistake | Why It's Bad | Do This Instead |
|---------|--------------|-----------------|
| Edit without reading docs | Miss architectural patterns | Read `ai_developer_guide.md` first |
| Start executing without approval | Wasted effort if user disagrees | Create implementation plan, request review |
| Skip the build step | Broken code gets committed | Always run `npm run build` before commits |
| Store card images locally | Bloats database/storage unnecessarily | Use Scryfall URLs with local session caching |
| Hardcode set/card data | Breaks when new sets release | Use the sets database; Scryfall API for card data |
| Call Scryfall without rate limiting | API will throttle/block us | Respect 75ms delay between requests per Scryfall docs |

---

## 9. Troubleshooting

### Build Fails

1. Read the full error message carefully
2. Locate the failing file and line number
3. Check if the error is a TypeScript type issue or runtime issue
4. If stuck after 2 attempts, ask user for guidance with:
   - The exact error message
   - What you've tried
   - Your hypothesis about the cause

### Blocked on Information

When you need clarification:

1. **State what you know**: "I found that the Set model has X fields..."
2. **State what you need**: "I need to know if Y should be added to the card schema..."
3. **Ask specific questions**: Not "what should I do?" but "Should pack distribution use collation data from Scryfall, or a custom mapping per set?"

### Tests Fail

1. Check if your changes modified existing functionality
2. Run the specific failing test in isolation
3. Document the failure in task.md before attempting fixes
4. If the test is outdated, note this and ask user before modifying

### Documentation vs Code Mismatch

If documentation says one thing but code does another:

1. Note the specific discrepancy
2. Check git history if helpful (`git log --oneline -10 -- <file>`)
3. Ask user which is correct
4. Update whichever is wrong (with user approval)

### Scryfall API Issues

1. Check rate limits — Scryfall requires 50-100ms between requests
2. Use bulk data endpoints for large queries (full set card lists)
3. If images fail to load, verify the card's `image_uris` field exists (some cards use `card_faces` instead)
4. Cache responses during draft sessions to avoid redundant calls

---

**End of AI Agent Collaboration Workflow**
