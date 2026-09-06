/**
 * oracle/schema.ts — TypeBox schemas for the consult_the_oracle tool.
 *
 * Shape mirrors the native `ask_user_question` questionnaire so the strategos
 * gets one consistent interface for consulting the oracle.
 */

import { Type, type Static } from "typebox";

// ── Input (what the strategos sends) ───────────────────────────────────────

export const OptionSchema = Type.Object({
  label: Type.String({
    description: "Display label shown to the user and returned as the answer value (1–5 words)",
  }),
  description: Type.Optional(
    Type.String({
      description: "Optional clarifying text shown below the label",
    }),
  ),
});

export const QuestionSchema = Type.Object({
  question: Type.String({
    description: "Full question text displayed to the user",
  }),
  header: Type.String({
    description: "Short label used in the tab bar when multiple questions are shown. Max 16 characters.",
  }),
  options: Type.Array(OptionSchema, {
    minItems: 2,
    maxItems: 4,
    description: "Between 2 and 4 choices for the user to select from",
  }),
  multiSelect: Type.Boolean({
    description: "When true the user may select multiple options. Answers are joined with ', '.",
  }),
});

export const InputSchema = Type.Object({
  questions: Type.Array(QuestionSchema, {
    minItems: 1,
    maxItems: 4,
    description: "1 to 4 questions to ask the oracle",
  }),
});

export type Option = Static<typeof OptionSchema>;
export type Question = Static<typeof QuestionSchema>;
export type Input = Static<typeof InputSchema>;

// ── Output (answers returned to the strategos) ─────────────────────────────

export const ResultSchema = Type.Object({
  // Pass-through so renderResult has headers + option descriptions
  questions: Type.Array(QuestionSchema),

  // Maps question text → selected label(s).
  // Multi-select: labels joined with ", " e.g. "Option A, Option C"
  // Free-text: the user's typed string verbatim
  // Cancelled question: key absent (see cancelled flag)
  answers: Type.Record(Type.String(), Type.String()),

  // True when the user pressed Esc before submitting
  cancelled: Type.Boolean(),
});

export type Result = Static<typeof ResultSchema>;

/** Appended to every question's option list — never authored by the strategos. */
export const FREETEXT_LABEL = "Type something...";
