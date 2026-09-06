# Phalanx 

Multi-agent subagent architecture for [Pi](https://pi.dev) — shared memory via
agora, role dispatch with chain-of-command, shield_wall retry, and
consult-the-oracle escalation.

```
pi install npm:@chicamhao/pi-phalanx
```

<img width="1402" height="1122" alt="image" src="https://github.com/user-attachments/assets/967b7081-c0ce-4fc2-8b31-a9d36276d807" />


## Rules

| Rule | Meaning |
|------|---------|
| `chain_of_command` | A lochagos escalates to the strategos, never sideways |
| `scout_first` | Probe with psiloi when the target is unknown; skip it when already known |
| `shield_wall` | Retry once at narrowest scope, once more on an escalation model if configured, then escalate |
| `consult_the_oracle` | If ambiguous or retries exhausted, ask the oracle |
| `single_state` | No private state; all reads/writes go through agora |
| `concise_output` | Extremely concise output — no preamble or narration |

## Commands

- `/phalanx-muster` — one-line status: agora key/log count, token cost & usage since the last start, and elapsed time
- `/phalanx-reform` — reset agora runtime state (keys, messages, log, attempts)
- `/phalanx-arrange` — read `phalanx-architecture.yaml` and auto-create missing agent (`.pi/agents/*.md`) files

## How to use

1. (Optional) **update `phalanx-architecture.yaml`** to define new custom roles, rules, deployment scope.
2. (Optional) **Create `conventions.yaml`** in your project root — code style (see this repo's copy as a template)
3. **Copy `.pi/`** into your project root
4. **Start a Pi session** -> `/phalanx-arrange` -> `/reload`. The strategos loads automatically and the phalanx handles the rest

## How it works

The **extension** provides the infrastructure — the `agora`, `phalanx_dispatch`,
and `phalanx_status` tools, plus `/phalanx` commands.

**Skills** are not loaded automatically. They are referenced by name in the
strategos prompt and read on demand when the task matches their description.
Each skill file teaches the agent how to handle a specific job:

| Skill | When to use |
|-------|------------|
| `phalanx-strategos` | Planning an objective and reporting outcomes — the strategos's default mode |
| `phalanx-psiloi` | Fast codebase reconnaissance when the target location is unknown |
| `phalanx-lochagos` | Getting work done — one generalist pass or a large multi-domain split |
| `phalanx-agora` | Sharing state across dispatches via the memory bus |
| `phalanx-oracle` | Escalating to the user when stuck or ambiguous |

The **strategos** (the main session) loads these skill files as needed and
applies their instructions. You never install or enable skills — they are just
markdown files that describe how to use the extension's tools.

## Use in your own project

1. **Install the package in your project dir:**

   ```
   pi install npm:@chicamhao/pi-phalanx
   ```

2. (Optional) **update `phalanx-architecture.yaml`** to define new custom roles, rules, deployment scope.
3. (Optional) **Create `conventions.yaml`** in your project root — code style (see this repo's copy as a template)
4. **Start a Pi session** → `/phalanx-arrange` → `/reload`. The strategos loads automatically and the phalanx handles the rest

## File layout

```
├── package.json                     # Pi package manifest
├── conventions.yaml                 # Code style, git, file conventions (loaded by lochagos-work/build)
├── phalanx-architecture.yaml        # Roles, tiers, rules, extend templates
├── .pi/
│   ├── agent/AGENTS.md              # Strategos system prompt (overrides global)
│   ├── agents/                      # Subagent system prompts (psiloi, lochagos-*)
│   ├── extensions/phalanx/          # Extension source code (TypeScript)
│   ├── skills/phalanx-*/SKILL.md    # Skill instructions (loaded on demand)
│   └── phalanx/agora.json           # Runtime shared memory (gitignored)
```

⚠️ The content and scripts in this project are AI-generated and may contain errors or inaccuracies.
