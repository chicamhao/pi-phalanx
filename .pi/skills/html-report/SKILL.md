---
name: html-report
description: >
  Create standalone HTML reports, feature reports, architecture documents, and
  technical explainers using the user's default Claude-inspired dark theme.
  Use whenever asked to create or regenerate a report or document in HTML,
  including "report ABS feature in html", "HTML report", "export this analysis
  to HTML". Apply this theme without asking unless
  the user explicitly requests a different design. Not for application UI work
  or HTML email.
---

# Claude HTML report

Use this theme by default for new or regenerated standalone HTML reports and
technical documents. An explicit user design request takes precedence. Do not
restyle an existing application, email, or unrelated page as a side effect.

## Workflow

1. Read `assets/report-template.html` completely, resolving the path relative to
   this skill directory. It is the canonical theme and a reusable starting point,
   not a report about the original Entity Component feature.
2. Research the requested subject using the current project's instructions and
   permitted search scope. Reuse relevant project memory, then verify important
   claims against source. Do not guess what an ambiguous acronym means when the
   repository does not resolve it; ask the user instead.
3. Copy the template into the output document. Preserve its inline CSS, palette,
   typography, and layout; replace its content and adapt its sections to the task.
   Do not recreate an approximate theme from memory. No build step, package
   installation, CSS framework, or JavaScript is needed.
4. Write a complete UTF-8 HTML5 file. Use a requested output path first, otherwise
   follow an established project report location. If none exists, prefer
   `vault/<Descriptive Feature Name> - Report.html` when `vault/` already exists,
   otherwise `<feature-slug>-report.html` in the working directory. Do not
   overwrite unrelated existing files.
5. Check the result, then give the user the output path and a short summary.

## Default appearance

These values are defaults, not a reason to ask the user to choose colors again.

| Element | Default |
| --- | --- |
| Canvas / cards / inset | `#262624` / `#30302e` / `#1f1e1d` |
| Main / secondary / muted text | `#faf9f5` / `#c2c0b6` / `#9c9a92` |
| Accent / hover / borders | `#d97757` / `#e8906f` / `#3d3d3a` |
| Success / warning / error | `#8fa872` / `#d4b04a` / `#d4695e` |
| Headings | Source Serif 4, with Georgia fallback; regular-weight editorial style |
| Body | Inter, with system sans-serif fallback |
| Code | JetBrains Mono, with system monospace fallback |
| Layout | Centered 1080px container, generous spacing, 768px mobile breakpoint |
| Hero | Clay-colored spark, large serif title, muted subtitle |
| Navigation | Sticky rounded pill links to actual sections |
| Surfaces | Subtle borders, 12–16px corners, restrained semantic accents |

The template includes optional Google Fonts links, matching the reference page.
All content and styling must remain usable with no network connection through
its fallback fonts. If an offline-only or no-external-request document is asked
for, remove those links. Do not load external scripts, analytics, or frameworks.
Do not add light-mode toggles, neon gradients, dashboards, or ornamental widgets
unless requested.

## Content and components

Choose only sections that help the requested report; the template is not a
mandatory five-section form. Keep short reports short. For a feature report,
a useful starting structure is overview and scope, data/configuration,
architecture/runtime flow, source map, and relevant caveats or verification.
Add UI/network/lifecycle detail or migration phases only when the subject needs
it. Never carry over target-ticket claims from the reference document.

Use the bundled classes rather than inventing new component styling:

- `.card` with `.card-context`, `.card-architecture`, `.card-phase`,
  `.card-files`, `.card-risk`, or `.card-verification`; `.card-title` is a small
  uppercase label, not a replacement for a semantic heading.
- `.grid-2` for paired cards; it becomes one column on mobile.
- `.code-block` on `<pre>` with nested `<code>` for code or plain-text diagrams.
- `.table-scroll` around semantic tables with `<thead>`, `<tbody>`, and
  `<th scope="col">`. Keep the wrapper keyboard-focusable and labeled as in the
  template so wide tables remain accessible on mobile.
- `.risk-item`, `.risk-title`, `.risk-description` for actual risks;
  `.verification-item` for checks with explicit results or a "not run" status.
- `.badge` plus `.badge-phase`, `.badge-risk-high`, `.badge-risk-medium`, or
  `.badge-risk-low` for concise, text-labeled status. Never use color alone.
- `.highlight` for sparing inline emphasis; `.phase-header` only for real phases.

Use source paths and verified line references where useful. Distinguish observed
behavior, proposals, unknowns, and tests actually executed. Do not invent source
links, findings, severity, dates, or successful checks to fill a section.

## Before finishing

- Replace or remove every `__UPPERCASE_PLACEHOLDER__`, including the page title
  and footer. Remove example rows and empty/irrelevant sections.
- Keep one `<h1>` and logical heading levels, set the correct `lang` attribute,
  and give each retained section a unique ID. Update navigation links to match.
  Omit navigation for a very short single-section report.
- Navigation is ordinary anchor navigation, not interactive tabs. Do not hardcode
  `.active` or `aria-current` on a link that becomes incorrect after scrolling.
- Escape inserted text and code (`&`, `<`, `>`, and quotes in attributes). Treat
  source snippets as text, never executable markup. Do not embed secrets.
- Preserve keyboard focus styling, the skip link, readable contrast, reduced-motion
  behavior, and responsive layout. Make wide code regions keyboard-scrollable
  and labeled as in the template; keep wide content from overflowing the page.
- Confirm the report has inline CSS and no dependency on this skill's filesystem
  path or the original reference page. Internal anchors must resolve.
- If browser tools are available, inspect desktop and narrow/mobile layouts and
  check navigation and horizontal scrolling. Otherwise say visual rendering was
  not checked; do not claim a screenshot or browser test that did not happen.

## Examples

Natural request: `report ABS feature in html`

Explicit invocation: `/skill:html-report report ABC feature in html`

Another request: `Export this architecture analysis to HTML`

In each case, research the actual subject and produce the report with this theme
without asking the user to repeat their styling preferences.
