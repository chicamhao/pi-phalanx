---
name: phalanx-oracle
description: Escalate to the oracle (the user) when the objective is ambiguous or retries are exhausted. Uses the native ask_user_question tool — no extension needed.
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

Always use the native `ask_user_question` tool — never ask in plain text. It opens
an interactive TUI questionnaire and returns structured answers.

### Tool schema (what you send)

```typescript
{
  questions: Array<{
    question: string;       // Full question text
    header: string;         // Short tab label (max 16 chars)
    options: Array<{
      label: string;        // 1–5 words, returned as the answer
      description?: string; // Optional hint shown below label
      preview?: string;     // Optional markdown rendered in side-by-side pane
    }>;                     // 2–4 options
    multiSelect: boolean;   // true = checkboxes, false = single pick
  }>;                       // 1–4 questions
}
```

### Result shape (what you receive)

```typescript
{
  answers: Record<string, string>,  // question text → selected label(s)
  cancelled: boolean
}
```

### Usage guidelines

1. **Group related decisions** — up to 4 questions in one call.
2. **Recommend a default** — first option with "(Recommended)" suffix.
3. **multiSelect: true** when multiple answers are valid simultaneously.
4. **Concise labels** — 1–5 words. Descriptions carry nuance.
5. **Header ≤ 16 chars** — tab bar label.
6. **Never add "Other" or "Type something" options** — the tool appends a
   free-text row automatically.
7. **Write answers to agora** — so downstream dispatches inherit the decisions.
8. **If cancelled**, treat as a halt — do not re-ask the same questions.

### Key bindings

| Key | Context | Effect |
|-----|---------|--------|
| `↑` `↓` | Options list | Move cursor |
| `Enter` | Single-select option | Confirm selection |
| `Space` | Checkbox option | Toggle selection |
| `Enter` | Multi-select (with selection) | Confirm |
| `Space` or `Tab` | "Type something..." row | Open inline editor |
| `Enter` | Editor (with text) | Save and close |
| `Esc` | Editor | Discard and close |
| `←` `→` | Multi-question tab bar | Switch tabs |
| `Enter` | Submit tab (all answered) | Submit all answers |
| `Esc` | Anywhere | Cancel entire questionnaire |

## Rules

- `consult_the_oracle` — ask via `ask_user_question`; do not re-dispatch the same
  failing scope.
- Keep interruptions rare: resolve everything resolvable first, then ask once
  with clear, decision-ready questions.
- No external extension required — `ask_user_question` is built into pi.