---
trigger: always_on
---

# Clarification & Agent Handover Rules

## 1. Interactive Clarification Invariant
* Whenever a user request, architectural requirement, or edge-case design is ambiguous or underspecified, the agent MUST invoke the `ask_question` tool with clear multiple-choice options (and default write-in enabled).
* Do not proceed with speculative assumptions on breaking/structural decisions without invoking `ask_question` or obtaining implementation plan review.

## 2. Agent Handover Standard
* At the conclusion of major tasks, the agent MUST provide a structured handover summary containing:
  1. **Architectural State**: Active directory structures and file locations.
  2. **Test & Verification Matrix**: Total passing test suites and assertion counts.
  3. **Git Release Status**: Latest commit hash, branch tracking status, and release tags.
  4. **Next Step Commands**: Exact shell commands for the user.
