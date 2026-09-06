/**
 * oracle/component.ts — TUI questionnaire component for consult_the_oracle.
 *
 * Renders an interactive question list inside a pi ctx.ui.custom() overlay.
 * Uses theme callbacks from the pi TUI for all styling.
 */

import { Key, matchesKey, truncateToWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import type { Component } from "@earendil-works/pi-tui";
import type { Question, Option, Result } from "./schema.ts";
import { FREETEXT_LABEL } from "./schema.ts";

// ── Theme interface (subset of what pi injects) ────────────────────────────

interface Theme {
  fg: (color: string, text: string) => string;
  bg: (color: string, text: string) => string;
  bold: (text: string) => string;
}

interface TUILike {
  requestRender(): void;
}

// ── Per-question mutable state ─────────────────────────────────────────────

interface QState {
  /** Index of the highlighted option (cursor), 0..allOptions.length-1 */
  cursor: number;
  /** Multi-select: indices of toggled-on options */
  selected: Set<number>;
  /** Whether the user has confirmed this question */
  confirmed: boolean;
  /** Free-text value (when user chose "Type something..."), null otherwise */
  freeText: string | null;
  /** Whether free-text capture mode is active */
  editing: boolean;
}

// ── Component ──────────────────────────────────────────────────────────────

export class OracleComponent implements Component {
  private questions: Question[];
  private theme: Theme;
  private tui: TUILike;
  private done: (result: Result | null) => void;

  private states: QState[];
  private activeTab: number; // 0..questions.length-1 = question tab, questions.length = Submit

  private cachedWidth?: number;
  private cachedLines?: string[];

  constructor(questions: Question[], tui: TUILike, theme: Theme, done: (r: Result | null) => void) {
    this.questions = questions;
    this.tui = tui;
    this.theme = theme;
    this.done = done;
    this.activeTab = 0;
    this.states = questions.map((q) => ({
      cursor: 0,
      selected: new Set<number>(),
      confirmed: false,
      freeText: null,
      editing: false,
    }));
  }

  // ── helpers ────────────────────────────────────────────────────────────

  private get isSingle(): boolean {
    return this.questions.length === 1;
  }

  private totalTabs(): number {
    return this.questions.length + 1; // + Submit
  }

  private allOptions(q: Question): Array<Option & { isFreetext?: boolean }> {
    return [...q.options, { label: FREETEXT_LABEL, isFreetext: true }];
  }

  private allConfirmed(): boolean {
    return this.states.every((s) => s.confirmed);
  }

  private invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }

  // ── answer collection ──────────────────────────────────────────────────

  private buildResult(): Result {
    const answers: Record<string, string> = {};
    for (let i = 0; i < this.questions.length; i++) {
      const q = this.questions[i];
      const s = this.states[i];
      if (!s.confirmed) continue;
      if (s.freeText !== null) {
        answers[q.question] = s.freeText;
      } else if (q.multiSelect) {
        const labels = [...s.selected]
          .sort((a, b) => a - b)
          .map((idx) => q.options[idx].label);
        answers[q.question] = labels.join(", ");
      } else {
        answers[q.question] = q.options[s.cursor].label;
      }
    }
    return { questions: this.questions, answers, cancelled: false };
  }

  private advance(): void {
    const current = this.activeTab;
    const q = this.questions[current];
    if (!q) return;

    // confirm current question
    const s = this.states[current];
    if (s.editing && s.freeText !== null) {
      s.confirmed = true;
      s.editing = false;
    } else if (q.multiSelect && s.selected.size === 0) {
      return; // must select at least one
    } else if (!q.multiSelect) {
      const opts = this.allOptions(q);
      if (opts[s.cursor]?.isFreetext) {
        // "Type something..." was highlighted — enter edit mode instead
        s.editing = true;
        s.freeText = "";
        this.invalidate();
        this.tui.requestRender();
        return;
      }
      s.confirmed = true;
    } else {
      s.confirmed = true;
    }

    this.invalidate();

    if (this.isSingle) {
      this.done(this.buildResult());
      return;
    }

    if (this.activeTab < this.questions.length - 1) {
      this.activeTab++;
    } else {
      // last question confirmed → move to Submit tab
      this.activeTab = this.questions.length;
    }
    this.tui.requestRender();
  }

  // ── Component API ──────────────────────────────────────────────────────

  handleInput(data: string): void {
    // ── free-text editing mode ───────────────────────────────────────────
    const current = this.activeTab;
    if (current < this.questions.length) {
      const s = this.states[current];
      if (s.editing) {
        if (matchesKey(data, Key.escape)) {
          s.editing = false;
          s.freeText = null;
          this.invalidate();
          this.tui.requestRender();
          return;
        }
        if (matchesKey(data, Key.enter)) {
          s.confirmed = true;
          s.editing = false;
          this.invalidate();
          if (this.isSingle) {
            this.done(this.buildResult());
          } else {
            this.advance(); // advance past the confirm step already done
          }
          this.tui.requestRender();
          return;
        }
        if (matchesKey(data, Key.backspace)) {
          if (s.freeText && s.freeText.length > 0) {
            s.freeText = s.freeText.slice(0, -1);
            this.invalidate();
            this.tui.requestRender();
          }
          return;
        }
        // printable character
        if (data.length === 1 && data >= " ") {
          s.freeText = (s.freeText ?? "") + data;
          this.invalidate();
          this.tui.requestRender();
        }
        return;
      }
    }

    // ── Submit tab (multi-question only) ─────────────────────────────────
    if (!this.isSingle && current === this.questions.length) {
      if (matchesKey(data, Key.enter)) {
        if (this.allConfirmed()) this.done(this.buildResult());
        return;
      }
      if (matchesKey(data, Key.escape)) {
        this.done({ questions: this.questions, answers: {}, cancelled: true });
        return;
      }
      if (matchesKey(data, Key.tab)) {
        this.activeTab = 0;
        this.invalidate();
        this.tui.requestRender();
        return;
      }
      if (matchesKey(data, Key.shift("tab"))) {
        this.activeTab = this.questions.length - 1;
        this.invalidate();
        this.tui.requestRender();
        return;
      }
      return;
    }

    // ── global keys ──────────────────────────────────────────────────────
    if (matchesKey(data, Key.escape)) {
      this.done(null);
      return;
    }

    const q = this.questions[current];
    const s = this.states[current];
    const opts = this.allOptions(q);

    // ── tab navigation ───────────────────────────────────────────────────
    if (!this.isSingle) {
      if (matchesKey(data, Key.tab)) {
        this.activeTab = current < this.questions.length - 1 ? current + 1 : this.questions.length;
        this.invalidate();
        this.tui.requestRender();
        return;
      }
      if (matchesKey(data, Key.shift("tab"))) {
        this.activeTab = current > 0 ? current - 1 : this.questions.length;
        this.invalidate();
        this.tui.requestRender();
        return;
      }
      if (matchesKey(data, Key.left) && current > 0) {
        this.activeTab--;
        this.invalidate();
        this.tui.requestRender();
        return;
      }
      if (matchesKey(data, Key.right) && current < this.questions.length - 1) {
        this.activeTab++;
        this.invalidate();
        this.tui.requestRender();
        return;
      }
    }

    // ── cursor movement ──────────────────────────────────────────────────
    if (matchesKey(data, Key.up)) {
      s.cursor = Math.max(0, s.cursor - 1);
      this.invalidate();
      this.tui.requestRender();
      return;
    }
    if (matchesKey(data, Key.down)) {
      s.cursor = Math.min(opts.length - 1, s.cursor + 1);
      this.invalidate();
      this.tui.requestRender();
      return;
    }

    // ── selection ────────────────────────────────────────────────────────
    if (q.multiSelect && matchesKey(data, Key.space)) {
      const sel = s.selected;
      if (sel.has(s.cursor)) sel.delete(s.cursor);
      else sel.add(s.cursor);
      this.invalidate();
      this.tui.requestRender();
      return;
    }

    if (matchesKey(data, Key.enter)) {
      this.advance();
      this.tui.requestRender();
      return;
    }
  }

  render(width: number): string[] {
    if (this.cachedWidth === width && this.cachedLines) return this.cachedLines;

    const lines: string[] = [];
    const t = this.theme;
    const sep = t.fg("accent", "─".repeat(width));
    lines.push(sep);

    const current = this.activeTab;

    // ── tab bar (multi-question only) ────────────────────────────────────
    if (!this.isSingle) {
      const tabParts: string[] = [];
      for (let i = 0; i < this.questions.length; i++) {
        const h = truncateToWidth(this.questions[i].header, 12);
        const confirmed = this.states[i].confirmed;
        let label: string;
        if (i === current) {
          label = t.bg("selectedBg", t.fg("text", ` ${h} `));
        } else if (confirmed) {
          label = t.fg("success", ` ■ ${h} `);
        } else {
          label = t.fg("muted", ` □ ${h} `);
        }
        tabParts.push(label);
      }
      // Submit tab
      const canSubmit = this.allConfirmed();
      const submitLabel =
        current === this.questions.length
          ? t.bg("selectedBg", t.fg("text", " ✓ Submit "))
          : canSubmit
            ? t.fg("success", " ✓ Submit ")
            : t.fg("muted", " ✓ Submit ");
      tabParts.push(submitLabel);
      lines.push(" " + tabParts.join(" "));
      lines.push("");
    }

    // ── question body ────────────────────────────────────────────────────
    if (current < this.questions.length) {
      const q = this.questions[current];
      const s = this.states[current];
      const opts = this.allOptions(q);

      // Question text, wrapped
      const qLines = wrapTextWithAnsi(
        t.bold(t.fg("text", q.question)),
        width - 2,
      );
      // add muted "?" if question doesn't end with punctuation
      if (q.question && !/[?!.]$/.test(q.question.trim())) {
        const last = qLines[qLines.length - 1];
        qLines[qLines.length - 1] = last + t.fg("muted", "?");
      }
      for (const l of qLines) lines.push(" " + l);
      lines.push("");

      // Options
      for (let i = 0; i < opts.length; i++) {
        const opt = opts[i];
        const isCursor = i === s.cursor;
        const prefix = isCursor ? t.fg("accent", ">") : " ";
        const num = t.fg("muted", `${i + 1}.`);
        let item: string;

        if (q.multiSelect && !opt.isFreetext) {
          const checked = s.selected.has(i);
          const box = checked ? t.fg("accent", "[✓]") : t.fg("muted", "[ ]");
          const label = isCursor
            ? t.bold(t.fg("text", opt.label))
            : t.fg("text", opt.label);
          item = `${prefix} ${box} ${num} ${label}`;
        } else if (opt.isFreetext && s.editing) {
          const label = t.fg("accent", `✎ ${opt.label}`);
          item = `${prefix}  ${num} ${label}`;
        } else {
          const label = isCursor
            ? t.bold(t.fg("text", opt.label))
            : t.fg("text", opt.label);
          item = `${prefix}  ${num} ${label}`;
        }

        // Truncate to width
        const truncated = truncateToWidth(item, width - 2);
        lines.push("  " + truncated);

        // Description
        if (opt.description && !opt.isFreetext) {
          const descLines = wrapTextWithAnsi(
            t.fg("muted", opt.description),
            Math.max(20, width - 6),
          );
          for (const dl of descLines) lines.push("     " + dl);
        }

        // Free-text editing: show typed text
        if (opt.isFreetext && s.editing) {
          lines.push("");
          const ft = s.freeText ?? "";
          lines.push(
            "     " + t.fg("muted", "Your answer: ") + t.fg("text", ft || t.fg("muted", "（start typing）")),
          );
        }
      }
    } else {
      // Submit tab
      lines.push(" " + t.bold(t.fg("text", "Review and submit")));
      lines.push("");
      for (let i = 0; i < this.questions.length; i++) {
        const q = this.questions[i];
        const s = this.states[i];
        const header = truncateToWidth(q.header, 12);
        let answer: string;
        if (s.freeText !== null) {
          answer = t.fg("accent", `"${truncateToWidth(s.freeText, 40)}"`);
        } else if (q.multiSelect) {
          answer = [...s.selected]
            .sort((a, b) => a - b)
            .map((idx) => q.options[idx].label)
            .join(", ");
          answer = t.fg("accent", truncateToWidth(answer, 50));
        } else {
          answer = t.fg("accent", q.options[s.cursor].label);
        }
        const check = s.confirmed ? t.fg("success", "✓") : t.fg("muted", "○");
        lines.push(`  ${check} ${t.fg("text", header + ":")} ${answer}`);
      }
    }

    // ── footer help ─────────────────────────────────────────────────────
    lines.push("");
    if (current < this.questions.length && this.states[current]?.editing) {
      lines.push(" " + t.fg("muted", "Enter to submit · Esc to cancel · Type to edit"));
    } else if (current === this.questions.length) {
      lines.push(" " + t.fg("muted", "Enter to submit · Esc to cancel · Tab to go back"));
    } else {
      const q = this.questions[current];
      const nav = this.isSingle ? "" : " · ←→/Tab switch";
      const multi = q?.multiSelect ? "Space toggle · " : "";
      lines.push(" " + t.fg("muted", `↑↓ navigate · ${multi}Enter confirm · Esc cancel${nav}`));
    }
    lines.push(sep);

    this.cachedWidth = width;
    this.cachedLines = lines;
    return lines;
  }
}