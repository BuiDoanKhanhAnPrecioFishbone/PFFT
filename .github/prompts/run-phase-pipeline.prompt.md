---
description: Full end-to-end pipeline for a single phase - plan, implement, review, validate. Invokes execution-plan-reviewer, schema-infrastructure-prep, nextjs-react-developer, code-quality-guardian, and phase-validator in sequence.
argument-hint: Which phase to implement? (0, 1, 2, 3, or 4)
agents: ['execution-plan-reviewer', 'schema-infrastructure-prep', 'nextjs-react-developer', 'code-quality-guardian', 'phase-validator']

[vscode, execute, read, agent, 'figma/*', edit, search, web, 'gitkraken/*', vscode.mermaid-chat-features/renderMermaidDiagram, todo]
---

# Full Phase Pipeline

You are orchestrating a complete, gate-based implementation pipeline for **Phase $input** of the Code-to-Figma plugin project.

Read `code-to-figma-plan.md` and `.github/copilot-instructions.md` before doing anything else. These are the authoritative sources of scope, architecture rules, and Figma API constraints. Do NOT skip this step.

---

## Pipeline Overview

Execute the four stages below **in strict order**. Do not advance to the next stage until the current one is complete and its exit criteria are met.

```
Stage 1 ─ PLAN        →  execution-plan-reviewer
Stage 2 ─ IMPLEMENT   →  schema-infrastructure-prep  +  nextjs-react-developer  (parallel)
Stage 3 ─ REVIEW      →  code-quality-guardian
Stage 4 ─ VALIDATE    →  phase-validator
```

---

## Stage 1 — Plan (execution-plan-reviewer)

**Agent:** `execution-plan-reviewer`

**Your job in this stage:**

1. Extract the Phase ${input:phase} scope from `code-to-figma-plan.md` and the phase-specific playbook in `.github/prompts/phase-orchestrator.prompt.md`.
2. Construct a phase execution plan with clearly named work items, the agent type assigned to each, explicit dependencies, and acceptance criteria.
3. Invoke the `execution-plan-reviewer` agent to audit the plan you just constructed. Provide it with:
   - The full list of work items and their descriptions
   - Which agent handles each item
   - The dependency ordering
   - Success criteria per item
4. Resolve any CRITICAL ISSUES the reviewer raises before continuing. If the plan gets a NEEDS REVISION verdict, fix it and re-submit.

**Exit criteria:** The execution plan receives an APPROVED verdict from `execution-plan-reviewer` with no unresolved critical issues.

---

## Stage 2 — Implement (schema-infrastructure-prep + nextjs-react-developer)

**Agents:** `schema-infrastructure-prep` AND `nextjs-react-developer` — run in parallel where their work items are independent.

**Your job in this stage:**

### schema-infrastructure-prep tasks (run first or in parallel with UI work)

Invoke the `schema-infrastructure-prep` agent for any Phase ${input:phase} work items that involve:
- Supabase table creation, migrations, or schema changes
- RLS policy definitions
- Index design
- Database-level constraints and triggers

Provide this agent with:
- The specific entities and relationships required by Phase ${input:phase}
- The access patterns expected (who reads/writes what)
- Any existing schema context from `/web/supabase/migrations/`

Do not let the `nextjs-react-developer` agent begin work that depends on these tables until migrations are written.

### nextjs-react-developer tasks

Invoke the `nextjs-react-developer` agent for all React, Next.js, TypeScript, and plugin UI implementation tasks in Phase ${input:phase}. Provide it with:
- The approved plan from Stage 1 (full work item list and acceptance criteria)
- Relevant file paths from the codebase it needs to read or extend
- All Figma Plugin API constraints from `.github/copilot-instructions.md` (font loading order, async IIFE requirement, color format, Auto Layout rules)
- Output from `schema-infrastructure-prep` (table names, column types) so it can write correct Supabase queries

Key implementation rules the developer agent MUST follow:
- Figma plugin code: always wrap in `(async () => { })()` — no exceptions
- Always load fonts with `figma.loadFontAsync` before creating any node
- Always set `node.fontName` before `node.characters`
- Colors: RGB 0–1 range only — never hex, never 0–255
- Always set both `primaryAxisSizingMode` and `counterAxisSizingMode` on Auto Layout frames
- Two-pass Claude pipeline is non-negotiable: Pass 1 → JSON → Pass 2 → Figma JS

**Exit criteria:** All work items from Stage 1 plan are implemented. No TypeScript errors (`npm run typecheck`). No build errors (`npm run build`).

---

## Stage 3 — Review & Fix (code-quality-guardian)

**Agent:** `code-quality-guardian`

**Your job in this stage:**

1. Collect all files created or modified during Stage 2.
2. Invoke the `code-quality-guardian` agent with those files and the following context:
   - This is a Figma Plugin (TypeScript + React + Vite)
   - The Figma Plugin API has strict ordering requirements documented in `.github/copilot-instructions.md`
   - Code quality issues that cause Figma runtime crashes are CRITICAL (e.g., setting `characters` before `fontName`, missing `async` wrapper)
3. For every **Critical Issue** the guardian raises, fix it immediately before continuing.
4. For every **Quality Concern** (should address), fix it.
5. Re-invoke `code-quality-guardian` on any changed files after fixes to confirm issues are resolved.

**Exit criteria:** `code-quality-guardian` gives a GREEN or YELLOW (no Critical Issues) verdict on all Phase ${input:phase} files. All previous TypeScript and build checks still pass.

---

## Stage 4 — Validate (phase-validator)

**Agent:** `phase-validator`

**Your job in this stage:**

1. Provide the `phase-validator` agent with:
   - The approved execution plan from Stage 1
   - The complete list of files implemented in Stage 2
   - The `code-quality-guardian` final verdict from Stage 3
   - The "Done when" checklist for Phase ${input:phase} from `code-to-figma-plan.md`
2. The validator will check every criterion — both explicit and implicit — and issue a PASS/FAIL per item.
3. For any criterion with FAIL status:
   - Fix the deficiency
   - Re-run the relevant stage (Stage 2 or 3) as needed
   - Re-invoke `phase-validator` on the corrected deliverables
4. Repeat until all criteria are PASS and the validator issues: **"Phase ${input:phase} is READY to progress."**

**Exit criteria:** `phase-validator` declares Phase ${input:phase} complete with no blocking issues.

---

## Completion Report

Once all four stages pass, output a concise completion report:

```
✅ Phase [N] Pipeline Complete

Stage 1 — Plan:      APPROVED ([N] work items)
Stage 2 — Implement: DONE ([N] files created/modified)
Stage 3 — Review:    [GREEN/YELLOW] (0 critical issues)
Stage 4 — Validate:  READY TO PROGRESS

Files changed:
- [list all created/modified files]

Next phase prerequisite: Phase [N] ✅
```

---

## Hard Rules (apply throughout all stages)

- Never skip the two-pass Claude pipeline — Pass 1 JSON must be validated before Pass 2 runs.
- Never write to Figma via the REST API — all node creation must happen in `code.ts`.
- Never set `node.characters` before `node.fontName` — this crashes Figma with no recovery.
- All generated Figma plugin code must use `(async () => { })()` — no top-level await.
- Font style names must use spaces: `"Semi Bold"` not `"SemiBold"`, `"Extra Bold"` not `"ExtraBold"`.
- Default unknown fonts to Inter Regular — never guess a font family.
- Do not advance any stage until its exit criteria are fully met.