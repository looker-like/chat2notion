---
name: andrej_karpathy_rules
description: Follows the Andrej Karpathy guidelines for AI coding agents to reduce common LLM coding mistakes. Use when writing, reviewing, or refactoring code.
---

# Andrej Karpathy Behavioral Guidelines

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding
**Don't assume. Don't hide confusion. Surface tradeoffs.**
Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First
**Minimum code that solves the problem. Nothing speculative.**
- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.
Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes
**Touch only what you must. Clean up only your own mess.**
When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.
When your changes are done, don't leave unused variables or imports behind.

## 4. Goal-Driven Execution
**Define clear, verifiable success criteria before starting. Loop until the specific criteria are met.**
- Never start coding before the definition of "done" is clear.
- Do not add "extra" checks or outputs not specified in the goal.
- Stop immediately when the goal is met.
