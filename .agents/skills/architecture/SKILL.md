---
name: architecture
description: Load current project architecture and answer structural questions. Use when making design decisions, understanding component relationships, exploring data flow, or before any change that affects multiple files.
allowed-tools: Read, Grep, Glob
---

## Current Architecture

!`cat ARCHITECTURE.md`

## How to Use This Context

When this skill is invoked:

1. **Answer architectural questions** using the snapshot above — don't re-explore the codebase unless the snapshot seems stale
2. **Flag structural concerns** if a proposed change conflicts with the architecture (e.g., adding framework dependencies to a vanilla JS project)
3. **Identify affected components** when a change touches data flow, widget system, or config persistence
4. **Suggest where code belongs** based on the directory structure and existing patterns

If the architecture snapshot appears outdated (files mentioned don't exist, patterns don't match what you see), say so and suggest running `/update-docs ARCHITECTURE.md`.
