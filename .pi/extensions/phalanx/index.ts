/**
 * phalanx extension — implements the phalanx multi-agent architecture for pi.
 *
 * Read order mirrors `phalanx-architecture.yaml`: roles -> rules -> models -> extend.
 *
 * Registered surface:
 *   tools:
 *     agora            shared memory + message bus (single_state)
 *     phalanx_dispatch dispatch a role with chain-of-command enforcement,
 *                      shield_wall retry (with an optional escalation model),
 *                      and consult_the_oracle escalation
 *     phalanx_status   inspect roles, rules, agents, and agora state
 *   commands:
 *     /phalanx-muster    summary: roles, agora state, token cost, elapsed time
 *     /phalanx-reform    clear agora runtime state
 *     /phalanx-arrange   self-extend: read YAML and create missing agent files
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import {
  isLochagosAgent,
  loadArchitecture,
  mayDispatch,
  resolveRole,
  type PhalanxArchitecture,
} from "./architecture.ts";
import { AgoraStore } from "./agora.ts";
import { discoverAgents, findAgent, formatAgentList, type AgentConfig } from "./agents.ts";
import { runSubagent, type DispatchResult } from "./dispatch.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function text(s: string) {
  return { content: [{ type: "text", text: s }], details: {} };
}

function parseValue(s: string): unknown {
  const t = s.trim();
  if (t === "") return null;
  try {
    return JSON.parse(t);
  } catch {
    return s;
  }
}

function truncate(s: string, max = 2000): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + `… (truncated ${s.length - max} chars)`;
}

function listValidRoles(arch: PhalanxArchitecture): string {
  const parts = ["psiloi"];
  for (const inst of arch.roles.lochagos?.instances ?? []) parts.push(`lochagos-${inst}`);
  return parts.join(", ");
}

function chainOfCommandError(arch: PhalanxArchitecture, agentName: string): string {
  const domains = (arch.roles.lochagos?.instances ?? []).join("/");
  return (
    `chain_of_command: strategos may not dispatch "${agentName}" directly. ` +
    `strategos dispatches psiloi and lochagos (${domains}). Lochagoi work directly in their domain — they don't dispatch further.`
  );
}

/**
 * Build the agora context injected into a dispatched subagent's task. Per
 * single_state, the whole store is never broadcast: with no `contextKeys`,
 * only key *names* (+ inbox) are surfaced; pass `contextKeys` to inline the
 * specific values a task actually needs.
 */
function buildAgoraContext(agora: AgoraStore, role: string, contextKeys?: string[]): string {
  const snap = agora.snapshot();
  const inbox = snap.messages.filter((m) => m.to === role || m.to === "*").slice(-5);
  const parts: string[] = [];

  if (contextKeys && contextKeys.length > 0) {
    const values: Record<string, unknown> = {};
    const missing: string[] = [];
    for (const k of contextKeys) {
      if (Object.prototype.hasOwnProperty.call(snap.keys, k)) values[k] = snap.keys[k];
      else missing.push(k);
    }
    if (Object.keys(values).length) parts.push("keys: " + truncate(JSON.stringify(values), 3000));
    if (missing.length) parts.push("missing keys (not in agora): " + missing.join(", "));
  } else {
    const available = Object.keys(snap.keys);
    if (available.length) {
      parts.push(
        "available agora keys (not inlined — pass contextKeys on phalanx_dispatch to include one): " +
          available.join(", "),
      );
    }
  }

  if (inbox.length) parts.push("inbox: " + JSON.stringify(inbox.map((m) => ({ from: m.from, content: m.content }))));
  if (parts.length === 0) return "";
  return "[agora context — shared state]\n" + parts.join("\n");
}

function buildRulesFragment(arch: PhalanxArchitecture): string {
  const lines = ["# Phalanx operating rules (enforced)", ""];
  for (const r of arch.rules) {
    lines.push(`- ${r.id}: ${r.statement}`);
  }
  return lines.join("\n");
}

function sumUsage(ctx: ExtensionContext): { cost: number; tokens: number } {
  let cost = 0;
  let tokens = 0;
  for (const entry of ctx.sessionManager.getEntries()) {
    if (entry.type === "message") {
      const msg = (entry as any).message;
      if (msg?.usage?.cost?.total) cost += msg.usage.cost.total;
      if (msg?.usage) tokens += (msg.usage.input ?? 0) + (msg.usage.output ?? 0);
    }
  }
  return { cost, tokens };
}

function buildRosterFragment(arch: PhalanxArchitecture, agents: AgentConfig[]): string {
  const lines = ["# Phalanx roster (dispatchable roles)", ""];
  lines.push(
    "- dispatch, don't do — you are a planner and reporter; delegate via phalanx_dispatch. Only act directly for trivial one-step lookups (a single read, a one-line fact)",
  );
  lines.push("- psiloi (scout): fast, cheap recon when the target location is unknown (scout_first)");
  for (const inst of arch.roles.lochagos?.instances ?? []) {
    lines.push(`- lochagos-${inst} (coordinator): breaks the objective into tasks for the ${inst} domain`);
  }
  lines.push("");
  lines.push(
    "Dispatch with the phalanx_dispatch tool. Keep all shared state in agora (single_state) — pass contextKeys for what a dispatch needs.",
  );
  lines.push(
    "On failure, retry at the narrowest scope once, then the escalation model if configured, then escalate (shield_wall).",
  );
  lines.push("If ambiguous or retries exhausted, ask the user (consult_the_oracle).");
  const available = agents.map((a) => a.name).join(", ");
  lines.push(`Loaded agents: ${available || "none"}`);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Agent file templates (for extend commands)
// ---------------------------------------------------------------------------

function generateLochagosAgentFile(domain: string): string {
  const descMap: Record<string, string> = {
    work: "Generalist coordinator for a small or medium objective — investigate, implement, and verify in one pass.",
    research: "Coordinator for the research domain — investigate, locate, and understand code and assets, as the first pass of a research/build/verify split.",
    build: "Coordinator for the build domain — implement changes in code and scripts, as one pass of a research/build/verify split.",
    verify: "Coordinator for the verify domain — check, test, and confirm work is correct, as the final pass of a research/build/verify split.",
  };
  const toolsMap: Record<string, string> = {
    work: "read, edit, write, grep, find, ls, bash",
    research: "read, grep, find, ls, bash",
    build: "read, edit, write, bash",
    verify: "read, grep, bash",
  };
  const desc = descMap[domain] || `Coordinator for the ${domain} domain.`;
  const tools = toolsMap[domain] || "read, edit, write, grep, find, ls, bash";
  const conventions = domain === "work" || domain === "build" ? "\nconventions: CONVENTIONS.yaml" : "";
  const existingHint = domain === "work" ? "" : `\n\nYou exist for the large-effort case where a separate research pass and verify pass may precede or follow you.`;

  return `---
name: lochagos-${domain}
description: ${desc}
tools: ${tools}${conventions}
---

You are a **lochagos** (coordinator) for the **${domain}** domain. You report to the strategos.

Your job: handle work in the ${domain} domain. Return what changed and how it was verified.

**Project conventions:** load and follow \`CONVENTIONS.yaml\` from the project root.${existingHint}

Rules:
- chain_of_command: escalate failure to the strategos, never sideways.
- shield_wall: on failure, retry at the narrowest scope once, then escalate.
- single_state: no private state; shared state belongs in agora.
`;
}

const PSILOI_AGENT_TEMPLATE = `---
name: psiloi
description: Scout — fast, cheap recon of the codebase when the target location is unknown
tools: read, grep, find, ls
---

You are a **psiloi** (scout) in the phalanx. You report to the strategos.

Your job: fast, cheap reconnaissance. Probe the codebase and return a compressed,
precise answer — file paths, line references, and the minimum context a lochagos
needs to act. Do NOT modify anything; you are read-only.

Rules:
- scout_first: opt-in — you run when the target is unknown, not as a mandatory first step.
- single_state: do not keep private state; report findings back so they can be
  recorded in agora.
- If you cannot answer with certainty, say so plainly and suggest what to probe next.
`;

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
  let agora: AgoraStore | null = null;
  const getAgora = (cwd: string): AgoraStore => {
    if (!agora) agora = new AgoraStore(cwd);
    return agora;
  };

  // ---- roles/agents discovered fresh on each use (picks up extend edits) ----

  // -------------------------------------------------------------------------
  // agora tool
  // -------------------------------------------------------------------------
  pi.registerTool({
    name: "agora",
    label: "Agora",
    description:
      "Phalanx shared memory and message bus (the single source of state). " +
      "Actions: get, put (value is a JSON string), del, list, post (from/to/content), " +
      "inbox (to), mark_read (id), log (event/from/content), attempts (scope).",
    promptSnippet: "Read/write phalanx shared memory (agora) and the message bus",
    promptGuidelines: [
      "Use agora for ALL shared state (single_state rule) — never keep private state in the conversation.",
    ],
    parameters: Type.Object({
      action: StringEnum(
        ["get", "put", "del", "list", "post", "inbox", "mark_read", "log", "attempts"] as const,
        { description: "Which agora operation to perform" },
      ),
      key: Type.Optional(Type.String({ description: "Key for get/put/del" })),
      value: Type.Optional(Type.String({ description: "Value for put, as a JSON string" })),
      from: Type.Optional(Type.String({ description: "Sender role for post/log (default strategos)" })),
      to: Type.Optional(Type.String({ description: "Recipient role for post/inbox ('*' = broadcast)" })),
      content: Type.Optional(Type.String({ description: "Content for post/log" })),
      id: Type.Optional(Type.String({ description: "Message id for mark_read" })),
      scope: Type.Optional(Type.String({ description: "Retry scope for attempts" })),
      event: Type.Optional(Type.String({ description: "Event name for log" })),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const agora = getAgora(ctx.cwd);
      switch (params.action) {
        case "get":
          return text(`${agora.get(params.key ?? "") ?? "(not set)"}`);
        case "put": {
          const v = parseValue(params.value ?? "");
          await agora.put(params.key ?? "", v);
          return text(`agora.put("${params.key}") = ${JSON.stringify(v)}`);
        }
        case "del": {
          const had = await agora.del(params.key ?? "");
          return text(had ? `deleted "${params.key}"` : `no such key: "${params.key}"`);
        }
        case "list":
          return text(agora.listKeys().join("\n") || "(empty)");
        case "post": {
          const m = await agora.post(params.from ?? "strategos", params.to ?? "*", params.content ?? "");
          return text(`posted ${m.id} from ${m.from} -> ${m.to}`);
        }
        case "inbox": {
          const msgs = agora.inbox(params.to ?? "strategos");
          return text(
            msgs.length
              ? msgs
                  .map((m) => `${m.id} [${m.from}->${m.to}]${m.read ? "" : " (unread)"} ${m.content}`)
                  .join("\n")
              : "(empty)",
          );
        }
        case "mark_read": {
          const ok = await agora.markRead(params.id ?? "");
          return text(ok ? "marked read" : "no such message id");
        }
        case "log": {
          await agora.log(params.event ?? "note", params.from ?? "strategos", params.content);
          return text("logged");
        }
        case "attempts":
          return text(String(agora.attemptsFor(params.scope ?? "")));
        default:
          return text("unknown action");
      }
    },
  });

  // -------------------------------------------------------------------------
  // phalanx_dispatch tool
  // -------------------------------------------------------------------------
  pi.registerTool({
    name: "phalanx_dispatch",
    label: "Phalanx Dispatch",
    description:
      "Dispatch a phalanx role to execute one task in an isolated context. " +
      "Roles: psiloi (scout), lochagos-<domain> (coordinator: work/research/build/verify). " +
      "The strategos is a planner and reporter — dispatch this for anything beyond a trivial one-step lookup. " +
      "Enforces chain_of_command, shield_wall (retry once, then an escalation model if configured, then escalate), and consult_the_oracle.",
    promptSnippet: "Dispatch a phalanx role (psiloi, lochagos-<domain>) to do the work — you plan and report, you don't do",
    promptGuidelines: [
      "Dispatch, don't do: delegate via phalanx_dispatch instead of acting directly. Only act directly for trivial one-step lookups. " +
        "Scout with psiloi first only when the target location is unknown (scout_first). Never dispatch sideways (chain_of_command).",
    ],
    parameters: Type.Object({
      role: Type.String({
        description: "Role to dispatch: psiloi, or lochagos-<domain> (work/research/build/verify)",
      }),
      task: Type.String({ description: "The single task for the role to execute" }),
      contextKeys: Type.Optional(
        Type.Array(Type.String(), {
          description:
            "Agora keys this dispatch needs inlined (single_state: request only what's relevant, not the whole store)",
        }),
      ),
      maxAttempts: Type.Optional(
        Type.Number({ description: "Maximum attempts on the primary model before escalation (default 2)", default: 2 }),
      ),
      escalationModel: Type.Optional(
        Type.String({
          description:
            "Stronger/pricier model to retry once on before consulting the oracle (default: models.escalation from phalanx-architecture.yaml, if set)",
        }),
      ),
      askOracleOnExhaust: Type.Optional(
        Type.Boolean({
          description: "Ask the user when retries (including the escalation model) are exhausted (default true)",
          default: true,
        }),
      ),
    }),

    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const arch = loadArchitecture(ctx.cwd);
      const agents = discoverAgents(ctx.cwd);
      const agora = getAgora(ctx.cwd);

      const roleName = params.role.trim();
      const resolved = resolveRole(arch, roleName);
      if (!resolved) {
        return {
          content: [{ type: "text", text: `Unknown role "${roleName}". Valid roles: ${listValidRoles(arch)}` }],
          details: { error: "unknown_role" },
        };
      }
      if (resolved.role === "strategos") {
        return {
          content: [{ type: "text", text: "The main session is already the strategos; dispatch a subordinate role instead." }],
          details: { error: "cannot_dispatch_strategos" },
        };
      }

      const agentName = roleName; // canonical agent name (psiloi / lochagos-X)

      if (!mayDispatch(arch, "strategos", agentName)) {
        return {
          content: [{ type: "text", text: chainOfCommandError(arch, agentName) }],
          details: { error: "chain_of_command" },
        };
      }

      const agent = findAgent(agents, agentName);
      if (!agent) {
        const hint = isLochagosAgent(agentName)
          ? " Specify a domain, e.g. " + (arch.roles.lochagos?.instances ?? []).map((i) => `lochagos-${i}`).join(", ") + "."
          : "";
        return {
          content: [
            { type: "text", text: `No agent file for role "${agentName}".${hint}\n\nLoaded agents:\n${formatAgentList(agents)}` },
          ],
          details: { error: "no_agent" },
        };
      }

      const tools = agent.tools ? [...agent.tools] : undefined;

      const maxAttempts = Math.max(1, Math.min(Math.round(params.maxAttempts ?? 2), 5));
      const scope = `dispatch:${agentName}`;
      const model = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined;
      const escalationModel = params.escalationModel || arch.models.escalation;

      const agoraContext = buildAgoraContext(agora, agentName, params.contextKeys);
      const task = agoraContext ? `${agoraContext}\n\n---\n\n${params.task}` : params.task;

      await agora.log("dispatch_start", agentName, params.task);

      const runOnce = (modelOverride?: string) =>
        runSubagent({
          cwd: ctx.cwd,
          agentName,
          systemPrompt: agent.systemPrompt,
          task,
          tools,
          model: modelOverride ?? model,
          signal,
          onUpdate: (partial) =>
            onUpdate?.({ content: [{ type: "text", text: `[${agentName}] ${partial || "(running...)"}` }] }),
        });

      let lastResult: DispatchResult | undefined;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        await agora.bumpAttempt(scope);
        const r = await runOnce();
        lastResult = r;

        if (!r.isError) {
          await agora.resetAttempt(scope);
          await agora.log("dispatch_ok", agentName, `attempt ${attempt}`);
          return {
            content: [{ type: "text", text: r.output || "(no output)" }],
            details: { agentName, task: params.task, attempts: attempt, exitCode: r.exitCode, model: r.model, turns: r.turns },
          };
        }

        await agora.log(
          "dispatch_fail",
          agentName,
          `attempt ${attempt}: ${r.stopReason ?? r.errorMessage ?? truncate(r.stderr, 200)}`,
        );
        if (attempt < maxAttempts) continue;

        // shield_wall: primary model exhausted -> one retry on the escalation model, if configured
        if (escalationModel && escalationModel !== model) {
          await agora.log("dispatch_escalate_model", agentName, `retrying on ${escalationModel}`);
          const rEsc = await runOnce(escalationModel);
          lastResult = rEsc;
          if (!rEsc.isError) {
            await agora.resetAttempt(scope);
            await agora.log("dispatch_ok", agentName, `after escalation model (${escalationModel})`);
            return {
              content: [{ type: "text", text: rEsc.output || "(no output)" }],
              details: { agentName, task: params.task, attempts: maxAttempts + 1, exitCode: rEsc.exitCode, model: rEsc.model },
            };
          }
          await agora.log("dispatch_fail", agentName, `escalation model (${escalationModel}) also failed`);
        }

        // shield_wall (+ escalation model) exhausted -> consult the oracle
        const exhaustedMsg =
          `shield_wall exhausted for "${agentName}" after ${maxAttempts} attempt(s)` +
          `${escalationModel ? ` plus a retry on ${escalationModel}` : ""}. ` +
          `Last error: ${lastResult?.stopReason ?? lastResult?.errorMessage ?? "(none)"}.`;
        if (params.askOracleOnExhaust !== false && ctx.hasUI) {
          const retry = await ctx.ui.confirm(
            "Consult the oracle (user)",
            `${exhaustedMsg}\n\nRetry one more time, or stop and escalate to strategos (you)?`,
          );
          if (retry) {
            const r2 = await runOnce(escalationModel || undefined);
            lastResult = r2;
            if (!r2.isError) {
              await agora.resetAttempt(scope);
              await agora.log("dispatch_ok", agentName, "after oracle retry");
              return {
                content: [{ type: "text", text: r2.output || "(no output)" }],
                details: { agentName, task: params.task, attempts: maxAttempts + 1, exitCode: r2.exitCode, model: r2.model },
              };
            }
            await agora.log("dispatch_fail", agentName, "oracle retry failed");
          }
        }

        await agora.log("dispatch_escalate", agentName, exhaustedMsg);
        return {
          content: [
            {
              type: "text",
              text: `${exhaustedMsg}\n\nconsult_the_oracle: stop and ask the user — do not re-dispatch the same scope.`,
            },
          ],
          details: {
            agentName,
            task: params.task,
            attempts: maxAttempts,
            exitCode: lastResult?.exitCode,
            isError: true,
          },
        };
      }

      return { content: [{ type: "text", text: "dispatch failed" }], details: { isError: true } };
    },
  });

  // -------------------------------------------------------------------------
  // phalanx_status tool
  // -------------------------------------------------------------------------
  pi.registerTool({
    name: "phalanx_status",
    label: "Phalanx Status",
    description: "Report the current phalanx state: roles, rules, loaded agents, and agora summary.",
    promptSnippet: "Report phalanx roles, rules, agents, and agora state",
    parameters: Type.Object({}),

    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const arch = loadArchitecture(ctx.cwd);
      const agents = discoverAgents(ctx.cwd);
      const agora = getAgora(ctx.cwd);
      const snap = agora.snapshot();

      const domains = (arch.roles.lochagos?.instances ?? []).join(", ");
      const rules = arch.rules.map((r) => r.id).join(", ");

      const lines = [
        "# phalanx status",
        "",
        `roles: strategos, psiloi, lochagos (${domains}), agora, oracle`,
        `rules: ${rules}`,
        `escalation model: ${arch.models.escalation || "(none configured — shield_wall skips straight to the oracle)"}`,
        `agents: ${formatAgentList(agents)}`,
        `agora: ${Object.keys(snap.keys).length} key(s), ${snap.messages.length} message(s), ${snap.log.length} log entry(ies)`,
        `agora path: ${agora.path}`,
      ];
      return text(lines.join("\n"));
    },
  });

  // -------------------------------------------------------------------------
  // commands
  // -------------------------------------------------------------------------
  pi.registerCommand("phalanx-muster", {
    description: "Show phalanx status with token cost and elapsed time (since last start)",
    handler: async (_args, ctx) => {
      const a = getAgora(ctx.cwd);
      const snap = a.snapshot();

      // cost/tokens since last session_start (getEntries() is the whole append-only
      // file, so subtract the baseline snapshotted at startup/new/resume/fork)
      const { cost, tokens } = sumUsage(ctx);
      const costBaseline = (a.get("cost_baseline") as number | undefined) ?? 0;
      const tokensBaseline = (a.get("tokens_baseline") as number | undefined) ?? 0;
      const totalCost = Math.max(0, cost - costBaseline);
      const totalTokens = Math.max(0, tokens - tokensBaseline);

      // timer: elapsed since session_start
      const startedAt = a.get("session_started_at") as number | undefined;
      const elapsed = startedAt ? Date.now() - startedAt : 0;
      const mins = Math.floor(elapsed / 60000);
      const secs = Math.floor((elapsed % 60000) / 1000);
      const timer = startedAt ? `${mins}m ${secs}s` : "—";

      ctx.ui.notify(
        `agora: ${Object.keys(snap.keys).length}k ${snap.log.length}log` +
        ` | \$${totalCost.toFixed(4)} | ${totalTokens.toLocaleString()}tok | ${timer}`,
        "info",
      );
    },
  });



  // single-word command — pi only parses the first word after / as the command name
  pi.registerCommand("phalanx-reform", {
    description: "Clear the agora shared memory (keys, messages, log, attempts)",
    handler: async (_args, ctx) => {
      const agora = getAgora(ctx.cwd);
      await agora.clear();
      ctx.ui.notify("agora cleared", "info");
    },
  });

  // -------------------------------------------------------------------------
  // /phalanx-arrange — self-extend: read YAML and create missing agent files
  // -------------------------------------------------------------------------
  pi.registerCommand("phalanx-arrange", {
    description: "Read phalanx-architecture.yaml and create missing agent files for any new roles",
    handler: async (_args, ctx) => {
      const arch = loadArchitecture(ctx.cwd);
      const agentsDir = path.join(ctx.cwd, ".pi", "agents");
      fs.mkdirSync(agentsDir, { recursive: true });

      const created: string[] = [];
      const existed: string[] = [];
      const removed: string[] = [];

      const check = (filename: string, template: string) => {
        const filePath = path.join(agentsDir, filename);
        if (fs.existsSync(filePath)) {
          existed.push(filename);
        } else {
          fs.writeFileSync(filePath, template, "utf-8");
          created.push(filename);
        }
      };

      check("psiloi.md", PSILOI_AGENT_TEMPLATE);

      const instances = arch.roles.lochagos?.instances ?? [];
      const instSet = new Set(instances);
      for (const inst of instances) {
        check(`lochagos-${inst}.md`, generateLochagosAgentFile(inst));
      }

      // clean up agent files for instances removed from the YAML
      if (fs.existsSync(agentsDir)) {
        for (const entry of fs.readdirSync(agentsDir, { withFileTypes: true })) {
          if (!entry.isFile() || !entry.name.startsWith("lochagos-") || !entry.name.endsWith(".md")) continue;
          const domain = entry.name.slice("lochagos-".length, -".md".length);
          if (!instSet.has(domain)) {
            fs.unlinkSync(path.join(agentsDir, entry.name));
            removed.push(entry.name);
          }
        }
      }

      const parts: string[] = [];
      if (created.length) parts.push(`created ${created.join(", ")}`);
      if (existed.length) parts.push(`existing ${existed.join(", ")}`);
      if (removed.length) parts.push(`removed ${removed.join(", ")}`);
      const msg = parts.length ? `arranged: ${parts.join("; ")}` : "arranged: nothing to do";
      ctx.ui.notify(msg, "info");
    },
  });

  // -------------------------------------------------------------------------
  // auto-clear agora on session_start with reason "new"
  // -------------------------------------------------------------------------
  pi.on("session_start", async (event, ctx: ExtensionContext) => {
    const a = getAgora(ctx.cwd);
    if (event.reason === "new") {
      await a.clear();
    }
    // store start time + cost/token baseline for /phalanx-muster (updates on startup/new/resume/fork)
    // so "cumulative" means since this start, not since the session file began
    await a.put("session_started_at", Date.now());
    const { cost, tokens } = sumUsage(ctx);
    await a.put("cost_baseline", cost);
    await a.put("tokens_baseline", tokens);
  });

  // -------------------------------------------------------------------------
  // rules injection (roles -> rules, per the architecture read order)
  // -------------------------------------------------------------------------
  pi.on("before_agent_start", async (event, ctx: ExtensionContext) => {
    const arch = loadArchitecture(ctx.cwd);
    const agents = discoverAgents(ctx.cwd);
    const fragment = buildRulesFragment(arch) + "\n\n" + buildRosterFragment(arch, agents);
    return { systemPrompt: event.systemPrompt + "\n\n" + fragment };
  });
}
