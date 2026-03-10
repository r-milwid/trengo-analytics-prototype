---
name: update-docs
description: Procedure for maintaining living documentation files. Enforces read-first-then-rewrite pattern to prevent stale content.
argument-hint: [filename]
disable-model-invocation: true
allowed-tools: Read, Edit, Write, Grep, Glob
---

## Update Documentation Procedure

Target file: $ARGUMENTS

If no file specified, ask which file to update: `ARCHITECTURE.md`, `GUIDELINES.md`, or `~/.claude/CLAUDE.md`.

### Step 1 — Read Current State

Read the entire target file. Before making any changes, understand what's there now.

### Step 2 — Identify What's Stale

Compare the current file contents against the actual codebase:

- **For ARCHITECTURE.md**: Verify directory structure still matches, data flow is accurate, patterns described still exist. Use Glob and Grep to spot-check.
- **For GUIDELINES.md**: Check that listed conventions and decisions are still followed. Remove any that were reversed or superseded.
- **For CLAUDE.md**: Verify meta-rules still reflect the user's working style. Remove anything redundant with built-in behavior.

List what's stale or inaccurate before proceeding.

### Step 3 — Rewrite (Don't Append)

Rewrite affected sections to reflect current state. Rules:

- **Remove** anything no longer accurate — don't comment it out, delete it
- **Update** sections where facts changed — don't add a new section saying "actually..."
- **Add** genuinely new content in the appropriate existing section
- **Never** append to the bottom like a log entry
- **Keep** the file concise — if adding content, check if something else can be consolidated

### Step 4 — Verify Consistency

After rewriting, check:

- [ ] No contradictions between ARCHITECTURE.md, GUIDELINES.md, and CLAUDE.md
- [ ] File length hasn't grown significantly (if it has, consolidate)
- [ ] Every line passes: "would removing this cause mistakes?"
- [ ] No duplicate information across files
