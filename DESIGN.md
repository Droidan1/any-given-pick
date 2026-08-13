---
name: "Any Given Pick"
description: "A trustworthy football pick'em system that turns weekly choices into decisive calls."
colors:
  field-950: "oklch(21% 0.052 163)"
  field-900: "oklch(27% 0.066 162)"
  field-800: "oklch(34% 0.068 162)"
  paper-100: "oklch(96% 0.021 92)"
  paper-200: "oklch(91% 0.028 90)"
  ink: "oklch(25% 0.055 163)"
  ink-soft: "oklch(42% 0.046 160)"
  maize: "oklch(84% 0.168 94)"
  maize-deep: "oklch(76% 0.166 85)"
  clay: "oklch(56% 0.145 42)"
  clay-deep: "oklch(46% 0.13 38)"
  sage: "oklch(69% 0.045 92)"
  focus: "oklch(86% 0.17 94)"
typography:
  display:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "clamp(3.35rem, 7vw, 5rem)"
    fontWeight: 700
    lineHeight: 0.9
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.02em"
  title:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "1.55rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.045em"
  body:
    fontFamily: "Atkinson Hyperlegible, Verdana, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
  label:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.06em"
  brand-small:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "0.82rem"
    fontWeight: 600
    lineHeight: 0.8
    letterSpacing: "0.08em"
  brand-large:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "1.65rem"
    fontWeight: 700
    lineHeight: 0.8
    letterSpacing: "0.08em"
spacing:
  xs: "0.4rem"
  sm: "0.75rem"
  md: "1rem"
  lg: "1.25rem"
  xl: "2rem"
components:
  button-primary:
    backgroundColor: "{colors.maize}"
    textColor: "{colors.field-950}"
    typography: "{typography.title}"
    padding: "0.85rem 2.6rem 0.85rem 1.35rem"
    height: "4.9rem"
  button-primary-hover:
    backgroundColor: "{colors.maize-deep}"
    textColor: "{colors.field-950}"
  button-text:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    height: "2.75rem"
  team-choice:
    backgroundColor: "{colors.paper-100}"
    textColor: "{colors.ink}"
    typography: "{typography.display}"
    padding: "0.75rem"
    height: "5.5rem"
  team-choice-selected:
    backgroundColor: "{colors.maize}"
    textColor: "{colors.field-950}"
    typography: "{typography.display}"
    padding: "0.75rem"
    height: "5.5rem"
  number-input:
    backgroundColor: "{colors.paper-100}"
    textColor: "{colors.ink}"
    typography: "{typography.display}"
  navigation-item:
    backgroundColor: "transparent"
    textColor: "{colors.sage}"
    typography: "{typography.label}"
    padding: "0.75rem 0.35rem"
    height: "5.25rem"
  sheet-card:
    backgroundColor: "{colors.paper-100}"
    textColor: "{colors.ink}"
    padding: "1.25rem"
  brand-signature:
    backgroundColor: "{colors.field-950}"
    textColor: "{colors.maize}"
    typography: "{typography.label}"
    padding: "0.45rem 1rem"
---

# Design System: Any Given Pick

## Overview

**Creative North Star: "Coach's Call Sheet"**

Any Given Pick turns weekly choices into the feeling of calling a game plan: decisive, legible, tactile, and accountable. Deep field-green framing holds warm paper surfaces, while maize commitments and clay deadline cues make the user's next action unmistakable. The voice is energetic without becoming a sportsbook, and competitive without borrowing official team marks.

The visual hierarchy behaves like a working sideline document rather than a generic dashboard. Condensed uppercase type carries calls, counts, and headings; hyperlegible body text carries explanations and status. Yard-scale measurement, route-diagram linework, clipped tabs, ruled dividers, and check marks provide the football character. These motifs are a reusable vocabulary, not a mandate to repeat the Week 1 composition on every screen.

**Key Characteristics:**

- Deep field-green framing around warm, paper-like task surfaces.
- Condensed, uppercase command typography paired with accessible body copy.
- Maize reserved for selections, progress, active navigation, and primary actions.
- Clay reserved for deadlines, timed drills, and urgent operational cues.
- Flat ruled layouts with clipped call-sheet geometry and sparse ambient shadow.
- Football energy communicated through abstract play-diagram marks, never licensed team artwork.

## Colors

The palette feels like stadium field paint meeting a warm paper play sheet: dark greens establish trust, pale neutrals support long scanning, and two warm accents separate commitment from urgency.

### Primary

- **Commitment Maize** (`maize`): Marks selected teams, filled progress, active navigation, check fields, and the main action. Its deeper companion (`maize-deep`) is the hover-state response.

### Secondary

- **Deadline Clay** (`clay`): Signals lock times, timed-drill labels, and attention that is urgent but not erroneous. Use `clay-deep` for readable clay-toned text on paper.

### Neutral

- **Sideline Field** (`field-950`, `field-900`, `field-800`): Creates the darkest shell, primary dark panels, and lighter time or hover blocks.
- **Warm Play Sheet** (`paper-100`, `paper-200`): Supports pick rows, forms, receipts, and secondary light detail without resorting to pure white.
- **Deep Green Ink** (`ink`, `ink-soft`): Carries primary and secondary copy on paper while keeping the system tonally unified.
- **Worn Sage Rule** (`sage`): Handles dividers, inactive navigation, scroll furniture, and route marks.
- **High-Visibility Focus** (`focus`): Provides the universal keyboard focus outline.

### Named Rules

**The Commitment Color Rule.** Maize means chosen, progressing, active, or ready to commit; do not spend it on passive decoration.

**The Clay Clock Rule.** Clay belongs to time pressure and operational emphasis, not selections or generic promotion.

**The Reference-Line Rule.** Provider-attributed moneylines and Monday over/under may appear as quiet ink-on-paper measurement data. Never introduce neon odds colors, financial red/green semantics, sportsbook links, dark trading-card chrome, or wagering calls to action.

## Typography

**Display Font:** Barlow Condensed (with Arial Narrow and sans-serif fallbacks)
**Body Font:** Atkinson Hyperlegible (with Verdana and sans-serif fallbacks)
**Label Font:** Barlow Condensed (with Arial Narrow and sans-serif fallbacks)

**Character:** Barlow Condensed reads like a confident field call and fits dense score-like information without feeling corporate. Atkinson Hyperlegible keeps instructions, statuses, and explanations calm and accessible, especially on small screens.

### Hierarchy

- **Display** (700, responsive `3.35rem`–`5rem`, 0.9 line-height): Short page commands and decisive outcomes, set uppercase and balanced at roughly 12–15 characters per line.
- **Headline** (600, `1.75rem`, 1 line-height): Panel headings, review titles, and empty-state titles, usually uppercase.
- **Title** (700, `1.55rem`, 1 line-height): Primary actions and compact operational statements, uppercase with modest tracking.
- **Body** (400, `1rem`, 1.55 line-height): Rules, supporting explanations, receipts, and status copy; keep explanatory lines near 55–70 characters.
- **Label** (600, `1rem`, `0.06em` tracking): Navigation, time labels, eligibility states, and measurement captions, normally uppercase.
- **Brand Signature** (600/700, `0.82rem` + `1.65rem`, `0.08em` tracking): The stacked “Any Given” and “Pick” wordmark in the desktop rail; mobile compresses both lines to the Label size.

### Named Rules

**The Call-and-Explain Rule.** Condensed type gives the call; hyperlegible type explains what it means.

**The Short Command Rule.** Display type is for short, forceful phrases. Never use the compressed uppercase face for paragraphs or legal detail.

## Layout

Desktop uses a bounded shell up to `100rem` wide with a sticky `8.75rem` navigation rail, a flexible play-sheet workspace, and a `20rem`–`25rem` control panel. The primary content is deliberately ruled into full-width bands and rows instead of floating dashboard cards. A minimum practical viewport of `20rem` supports the product requirement from 360px upward.

At `72rem`, headline and matchup density tighten. At `61.25rem`, the side rail becomes a fixed four-item bottom navigation, the multi-column task becomes one continuous vertical sheet, progress moves into the document flow, and nonessential rules copy is removed. At `40rem`, team rows compress, cities and exact kickoff times yield to abbreviations and day labels, and controls remain at least roughly `4.25rem` high.

Use the observed spacing rhythm from compact `xs` gaps through `xl` section padding. Favor edge-to-edge ruled bands for task sequences, with generous paper around page-level headings. Keep persistent review actions thumb-reachable on mobile and keep server-controlled deadlines visually close to the task they govern.

**The One Sheet Rule.** A primary workflow should read as one ordered, scannable sheet; do not fragment it into a mosaic of unrelated cards.

**The Responsive Subtraction Rule.** On narrow screens, remove secondary detail before shrinking core labels or touch targets.

## Elevation & Depth

The system is flat by default. Depth comes primarily from tonal contrast, 1px sage rules, and strong panel adjacency. Shadows are sparse and ambient: the bounded application shell uses a broad low shadow, while transient receipts and PWA utilities use smaller lifts. Selected controls do not float; their color and clipped silhouette establish state.

### Shadow Vocabulary

- **Shell Ambient** (`0 18px 50px var(--shadow)`): Separates the bounded desktop application from the browser canvas.
- **Paper Lift** (`0 8px 22px var(--shadow)`): Lifts receipts and review panels when they replace an action state.
- **Utility Lift** (`0 6px 18px var(--shadow)`): Supports install and offline utilities above the working surface.

### Named Rules

**The Ruled-First Rule.** Establish hierarchy with tone, borders, and adjacency before adding a shadow.

## Shapes

The dominant form language is square and ruled. Paper rows, panels, input blocks, and navigation controls keep hard corners. Directional urgency appears through clipped right-pointing ends on deadlines, selected choices, and primary actions. Circular marks are reserved for diagram endpoints, checks, and icon geometry rather than used as generic pill containers.

Thin sage borders organize content; heavier ink rules may anchor tables or access summaries. Route sketches stay low-contrast, line-based, and secondary to content. The source defines a `14px` radius token but the implemented system does not use it as a recurring component shape, so it is not normative.

**The Clipped Direction Rule.** Use the angled call-sheet edge only for a choice, deadline, or forward action with clear directionality.

**The No Soft Card Rule.** Do not introduce rounded, floating SaaS cards into the core workflow.

## Components

### Brand Signature

The Any Given Pick signature pairs an abstract route mark with a two-line condensed wordmark. The route stays maize, “Any Given” uses worn sage, and “Pick” carries maize emphasis. On desktop it anchors the navigation rail; on mobile it compresses into a horizontal field-green brand bar above the current surface. Preserve the complete accessible name even when space requires the short PWA label “AGP.”

### Buttons

- **Shape:** Primary actions are broad call-sheet tabs with a clipped right edge and a minimum height of `4.9rem`; they are not rounded pills.
- **Primary:** Commitment Maize with Field text, condensed uppercase type, an optional leading football-line icon, and a trailing direction arrow.
- **Hover / Focus:** Hover deepens to `maize-deep`; active presses translate downward by `2px`; keyboard focus uses a `3px` Focus outline with `3px` offset.
- **Text:** Paper-state actions remain transparent, bold, and underlined in clay so they read as edits rather than competing calls to action.
- **Disabled:** Retain the shape and reduce opacity to `0.58`; never communicate disabled state through color alone.

### Cards / Containers

- **Corner Style:** Square, paper-edged, and ruled.
- **Background:** Warm Play Sheet for task and receipt surfaces; Sideline Field for shells and control panels.
- **Shadow Strategy:** Flat in the normal flow; apply Paper Lift only to a review or receipt that changes interaction state.
- **Border:** Use single-pixel sage separators instead of boxing every region.
- **Internal Padding:** Compact panels use `lg`; explanatory regions may expand to `xl`.

### Inputs / Fields

- **Style:** Paper background, one-pixel clay border, Deep Green Ink, centered condensed numerals, and square corners.
- **Focus:** Use the global high-visibility Focus outline; do not replace it with a subtle color shift.
- **Stepper Controls:** Keep increment and decrement actions visually attached to the value, with clay glyphs and paper-toned hover feedback.

### Navigation

- **Desktop:** A sticky dark-green side rail uses icon-over-label items, sage defaults, subtle field hover blocks, and maize active state with a narrow edge marker.
- **Mobile:** A fixed safe-area-aware bottom bar shows the four primary destinations. Preserve icon plus text; do not rely on icon recognition alone.
- **State:** Active destinations use both maize color and persistent page semantics (`aria-current`), while all items retain large touch targets.

### Team Choice

Each team option is an unrounded paper cell with a large condensed abbreviation and optional smaller city. Selection switches the whole cell to maize, adds a check mark, and clips the forward edge. This redundant treatment makes the choice legible without color alone. The pressed state compresses slightly; hover warms the paper or deepens the selected maize.

### Progress Measure

Progress combines a numeric fraction with a yard-scale rail, visible tick marks, and a maize fill that grows from the left. The count must remain readable without interpreting the graphic. Animate only the fill transform over `220ms ease-out`, and collapse the transition under reduced-motion preferences.

### Deadline Marker

Deadlines use a clay banner with a clock icon, concise uppercase copy, and a clipped directional end. Keep the wording explicit about lock status and timezone; visual urgency never substitutes for plain language.

## Do's and Don'ts

### Do:

- **Do** use Maize only for commitments, active state, progress, and primary actions.
- **Do** pair every selected color state with a check, shape change, label, or other non-color cue.
- **Do** use abstract route lines, yard ticks, whistles, shields, and rule marks to create football character.
- **Do** keep deadlines, eligibility, review, and receipt status in direct, plain language.
- **Do** preserve generous touch targets and visible focus outlines from 360px upward.
- **Do** honor reduced motion by collapsing transitions and disabling smooth scrolling.

### Don't:

- **Don't** resemble a sportsbook: no spreads, betting slips, monetary balances, casino glow, promotional odds links, or red/green win-loss trading semantics.
- **Don't** depend on NFL logos, team crests, jerseys, or protected team artwork.
- **Don't** scatter the core workflow across rounded floating cards.
- **Don't** use clipped tabs or clay accents as decoration without semantic purpose.
- **Don't** place paragraphs in condensed uppercase type.
- **Don't** shrink essential labels or touch targets to preserve desktop detail on mobile.
