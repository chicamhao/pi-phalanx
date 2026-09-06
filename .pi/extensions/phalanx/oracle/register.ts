/**
 * oracle/register.ts — factory that registers the consult_the_oracle tool.
 * Imported by index.ts so the tool block stays clean and separate.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Box, TruncatedText } from "@earendil-works/pi-tui";
import { OracleComponent } from "./component.ts";
import { InputSchema, type Question, type Result } from "./schema.ts";

export function registerConsultTheOracle(pi: ExtensionAPI) {
  pi.registerTool({
    name: "consult_the_oracle",
    label: "Consult the Oracle",
    description:
      "Ask the user 1–4 structured clarifying questions before proceeding. " +
     "Use when: (1) the objective is ambiguous, (2) you need a preference between " +
     "valid approaches, (3) a shield_wall escalation has reached you and there is " +
     "nothing new to try, or (4) a subagent has exhausted its retries. " +
     "Each question has 2–4 options. Set multiSelect: true when multiple choices apply. " +
     "The header field is a short label (max 16 chars) shown in the tab bar. " +
     "Never add 'Other' or 'Type something' options  the free-text row is appended automatically.",
    promptSnippet:"Ask the user structured questions — use when ambiguous or retries exhausted",
    promptGuidelines: [
     "consult_the_oracle: ask via this tool; do not re-dispatch the same failing scope.",
     "Keep interruptions rare: resolve everything resolvable first, then ask once with clear, decision-ready questions.",
     "Group related decisions into one call (up to 4 questions).",
    ],
    parameters: InputSchema,

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (!ctx.hasUI) {
        return {
          content: [{
            type:"text",
            text:"consult_the_oracle requires an interactive session.",
          }],
          details: { questions: params.questions, answers: {}, cancelled: true } satisfies Result,
        };
      }

      const result = await ctx.ui.custom<Result | null>(
        (tui, theme, _kb, done) =>
          new OracleComponent(params.questions, tui, theme, done),
      );

      if (result === null || result.cancelled) {
        return {
          content: [{ type:"text", text:"Oracle cancelled — no answers."}],
          details: {
            questions: params.questions,
            answers: {},
            cancelled: true,
          } satisfies Result,
        };
      }

      const summaryLines = result.questions.map(
        (q) =>
          `"${q.question}" = "${result.answers[q.question] ?? "(no answer)"}"`,
      );

      return {
        content: [{ type:"text", text: summaryLines.join("\n") }],
        details: result satisfies Result,
      };
    },

    renderCall(args, theme) {
      const questions = (args.questions ?? []) as Question[];
      const topics = questions.map((q) => q.header).join(",");
      return new TruncatedText(
        theme.fg("toolTitle", theme.bold("ask oracle ")) +
          theme.fg("muted", topics),
        0,
        0,
      );
    },

    renderResult(result, _options, theme) {
      const details = result.details as Result | undefined;
      if (!details) {
        const t = result.content[0];
        return new TruncatedText(t?.type ==="text" ? t.text :"",0,0);
      }
      if (details.cancelled) {
        return new TruncatedText(theme.fg("warning", "Cancelled"),0,0);
      }
      const box = new Box(0,0);
      for (const q of details.questions) {
        const answer = details.answers[q.question] ?? "(no answer)";
        box.addChild(
          new TruncatedText(
            theme.fg("success","✓") +
              theme.fg("accent", `${q.header}: `) +
              theme.fg("text", answer),
            0,
            0,
          ),
        );
      }
      return box;
    },
  });
}