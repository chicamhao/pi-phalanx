---
name: phalanx-oracle
description: Escalate to the oracle (the user) when the objective is ambiguous or retries are exhausted. Uses ask_user_question to present structured, interactive TUI questionnaires — do not ask in plain text.
---

# Oracle (escalation)

The **oracle** is the user. It sits outside the chain of command. Only the strategos
(you) may consult it — and only when the system cannot resolve the situation.

## When to consult

- The objective is ambiguous and guessing would be costly.
- A `shield_wall` escalation has reached you and there is nothing new to try.
- A subagent has exhausted its retries — and, if an escalation model is
  configured, also failed on that model — and you have no better task to give it.
- You need a preference or decision between multiple valid approaches before
  dispatching work.

## How

Always use `ask_user_question` — never ask in plain text. It presents a structured
TUI and returns clean answers the strategos can feed into `agora` and subsequent
dispatches.

### Tool schema (what you send)

```typescript
{
  questions: [{
    question: string;       // Full question text
    header: string;         // Short tab label (max 12 chars)
    options: [{
      label: string;        // 1–5 words, returned as the answer
      description?: string; // Optional hint shown below label
    }];                     // 2–4 options
    multiSelect: boolean;   // true = checkboxes, false = single pick
  }];                       // 1–4 questions
}
```

### Usage guidelines

1. **Group related decisions** — ask up to 4 questions in one call instead of
   multiple round-trips. One `ask_user_question` beats three.
2. **Recommend a default** — make the first option "(Recommended)" when you
   have a clear preference.
3. **multiSelect: true** when multiple answers are valid simultaneously.
4. **Concise labels** — 1–5 words. Descriptions carry the nuance.
5. **Header ≤ 12 chars** — used in the tab bar for multi-question layouts.
6. **Never add "Other" or "Type something" options** — the tool appends a
   free-text row automatically on every question.

### Result shape (what you receive)

```typescript
{
  answers: {
    [questionText]: "Selected Label",        // single-select
    [questionText]: "Label A, Label B",      // multi-select (joined)
    [questionText]: "user typed text",       // free-text
  },
  cancelled: boolean
}
```

## Rules

- `consult_the_oracle` — ask via `ask_user_question`; do not re-dispatch the same
  failing scope.
- Keep interruptions rare: resolve everything resolvable first, then ask once
  with clear, decision-ready questions.
- Write the oracle's answers to `agora` so downstream dispatches inherit the
  decisions.
- If the user cancels (`cancelled: true`), treat it as a halt — do not re-ask
  the same questions.