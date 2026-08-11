# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary user is an Indiana adult age 21 or older who wants to make one complete set of weekly professional-football winner picks before a fixed deadline, then follow transparent scoring and standings. Approved signed-in users can review official weekly results after lock. Admins approve players, configure schedules, publish weeks, monitor score health, and enter fallback results without gaining visibility or scoring advantages.

## Product Purpose

Provide a simple, trustworthy, free-entry weekly pick'em experience. A successful weekly loop lets an eligible user understand the rules, select every required Thursday-through-Sunday winner, predict the designated Monday combined score, submit before the server-enforced deadline, receive a timestamped confirmation, and later see picks, scoring, standings, and prize status.

## Positioning

The product treats pick submission as an auditable weekly commitment rather than a wagering slip: one complete entry, a clearly visible deadline, transparent post-lock reveal, provider-owned scoring, and non-cash digital prizes.

## Operating Context

Most user activity happens on a phone around the weekly NFL schedule. The central task is scanning matchups, choosing one team per game, completing the Monday-total tiebreaker, reviewing the full entry, and committing it before Wednesday at 6:00 PM in America/Indiana/Indianapolis. After locking, the same product shifts from entry mode to public comparison and standings.

## Capabilities and Constraints

- Responsive PWA-oriented web application; no native iOS or Android app in the prototype.
- Passwordless email-code authentication in the first release.
- Participation requires a verified sign-in method, self-attested age 21+, active account, and server-verified Indiana location.
- One shared contest per NFL week; every approved player uses the same published call sheet.
- Every required pick and one whole-number Monday combined-score prediction are required for submission.
- The server controls deadlines, eligibility, locking, reveal, and scoring authority.
- Free entry only. No payments, entry fees, cash balances, cash prizes, withdrawals, odds, or wagering language.
- NFL/team mark licensing and the sports-data provider remain open decisions. Concepts must not depend on official logos or protected team artwork.
- The approved product name is Any Given Pick and the primary domain is `anygivenpick.app`.
- The current route mark and Coach's Call Sheet wordmark are the prototype identity; formal trademark review and a final production logo package are not recorded yet.

## Brand Commitments

Any Given Pick is the approved product name. The brand must communicate clarity, trust, weekly sports energy, and deadline integrity without resembling a sportsbook or generic fantasy dashboard. The product name is written in title case in prose and set as a condensed uppercase wordmark in the interface.

## Evidence on Hand

- Developer-handoff PRD: `/Users/brianhoward/Downloads/Brian_Howard_NFL_Pickem_Prototype_PRD.docx`
- Confirmed workflows, requirements, acceptance criteria, risks, and screen inventory are documented there.
- Product owner selected Any Given Pick and registered `anygivenpick.app` on Vercel.
- No official team marks, customer claims, or production data are available and none should be fabricated.

## Product Principles

- Deadline integrity: the server, not the browser, decides whether an entry is open or locked.
- Transparent competition: submitted picks become visible after the deadline according to contest visibility rules.
- Conservative eligibility: uncertain age, location, verification, or account state means read-only participation.
- Provider authority: official schedules and results come from an approved sports-data provider.
- Prototype discipline: the public weekly contest loop comes before optional channels, groups, moderation depth, or monetization.

## Accessibility & Inclusion

Target WCAG 2.2 AA. Controls must remain touch-friendly from 360px mobile width upward, selected states cannot rely on color alone, deadline and eligibility states require plain-language labels, and all core actions must work with keyboard and assistive technology.
