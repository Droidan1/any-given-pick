# Any Given Pick

A free-entry weekly professional-football pick'em PWA built around the Coach's Call Sheet visual direction.

Production domain: [anygivenpick.app](https://anygivenpick.app)

Source repository: [github.com/Droidan1/any-given-pick](https://github.com/Droidan1/any-given-pick)

## Run locally

```bash
npm install
npx vercel env pull .env.local
npm run db:migrate
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deployment and environments

The GitHub repository is connected directly to the Vercel `any-given-pick` project. Pushes to `main` create Production deployments, while pushes to other branches and pull requests create isolated Preview deployments.

The Vercel project has Clerk Hobby and Neon Free resources connected to Production, Preview, and Development. Pull their environment variables into `.env.local`; never commit the generated file. Variable names are documented in `.env.example`.

## Included in this milestone

- Responsive mobile and desktop app shell
- Commissioner-published weekly schedule feeding the player call sheet
- Separate preseason and regular-season week numbering, including preseason weeks 1–4
- Variable-size weekly picks flow using imported matchup data
- Monday combined-score tiebreaker
- Local recovery plus authenticated server-side draft sync
- Authenticated live scoreboard showing every active player's autosaved team selections
- Explicit submit/edit flow with immutable version history and timestamped receipts
- Database-time deadline enforcement for drafts and submissions
- Home, picks, standings, weekly results, activity archive, and profile surfaces
- Web app manifest, generated PWA icons, and a static-asset-only offline service worker shell
- Device-aware mobile installation with first-login, Home, Profile, and persistent fallback entry points
- Any Given Pick wordmark, route-mark icon, social-sharing image, and install identity
- Original visual system with no NFL or team marks
- Clerk passwordless email-code authentication surfaces
- Internal Postgres user IDs mapped to verified Clerk identities
- Unique case-normalized player names with 30-day history enforcement
- Server-calculated age eligibility and administrator-controlled participation access
- Postgres roles, eligibility history, and append-only application audit events
- Provider-neutral CSV/JSON schedule importer and admin week operations
- Admin-only settings hub with direct links to week management and full-season import
- Pending-first user approval roster with reversible access removal and audit history
- Server-owned ESPN score checks with administrator-visible health and manual final-score fallback
- Post-lock weekly card reveal using only each player's latest official submitted version
- Full-season CSV/TSV import that groups preseason and regular-season games into private week drafts
- Drizzle schema, committed migrations, seed task, and eligibility/entry rule tests
- Public beta rules, privacy disclosure, and direct support pages
- Authenticated account deletion/anonymization requests with administrator completion
- Database-backed rate limits for sensitive and write-heavy actions
- Structured server-error and score-sync alerts with an administrator operations panel
- Player email reminders for published weeks, approaching deadlines, submitted picks, and completed results
- Transactional approval-queue alerts for administrators and approval confirmations for players
- Per-player email preferences and idempotent delivery receipts without storing recipient addresses
- Provider-attributed informational moneylines on matchups and over/under only on Monday games

## Not connected yet

A licensed long-term sports-data provider, PWA push notifications, prizes, private groups, and moderation remain future milestones. Schedule importing stays provider-neutral so an approved source can replace the current provider without rebuilding the contest engine. The beta reads moneylines and totals already present in the ESPN scoreboard response, stores no sportsbook links or promotional payloads, and treats those lines as replaceable informational data.

Product truth is recorded in [PRODUCT.md](./PRODUCT.md). Design references are stored under `design/`.

## Production score scheduler

The score updater runs behind `GET /api/cron/scores` and requires `Authorization: Bearer <CRON_SECRET>`. Store the same high-entropy value in:

- Vercel Production as `CRON_SECRET`
- GitHub Actions as the repository secret `SCORE_SYNC_CRON_SECRET`

The committed score workflow requests a sync every ten minutes during typical Thursday-through-Monday game windows, runs one daily catch-up, and can also be run manually. A separate hourly GitHub workflow calls `/api/cron/emails` so deadline and results mail stays timely; publishing and submitting also trigger immediate delivery attempts. Two once-daily Vercel Crons in `vercel.json` independently backstop score and email processing if GitHub scheduling is interrupted. Both protected routes use the same `CRON_SECRET`, and the email workflow reuses the existing `SCORE_SYNC_CRON_SECRET` repository secret. The health watchdog treats a sync older than 40 minutes as stale during live windows and 30 hours outside them. This bounded schedule stays within the intended beta operations budget while deterministic delivery keys keep overlapping runs safe. Scheduled jobs can be delayed, so the Admin settings health panel records the latest score attempt, success, provider warning, and update count. Commissioners can always enter a final score manually under **Admin settings → Manage contest weeks**.

## Temporary player approval gate

New Clerk accounts start in a pending state by default. An administrator must approve the verified identity from **Admin settings → Player access** before that person can create a player card, make picks, or submit an entry. The configured support administrator receives a deduplicated approval-queue email for each new pending account, and the player receives a transactional confirmation after approval. Removing access is reversible and preserves the player’s account and historical records.

Set `USER_APPROVAL_REQUIRED=false` and redeploy when manual approval is no longer needed. Existing pending accounts still require an administrator to approve them.

## Beta operations and privacy

Public trust pages are available at `/rules`, `/privacy`, and `/support`. Direct support links email `brian@Droidan1.dev`. Player reminders, account-status messages, privacy-request alerts, and operations alerts use Resend only when `RESEND_API_KEY` and `EMAIL_FROM` are configured. Delivery attempts are recorded without copying Clerk email addresses into Postgres. Users can manage each optional contest-reminder category from Profile; account approval messages are transactional and cannot be disabled there.

Set a separate high-entropy `RATE_LIMIT_SECRET` in Preview and Production. Rate limits are stored in Postgres so they apply across serverless instances. Vercel Firewall rules remain the recommended outer layer for broad IP- and bot-level abuse controls.

The administrator operations panel shows active server and score-sync alerts. The public `/api/health` endpoint returns a minimal health result without credentials, user data, provider payloads, or database details.

Checkly polls the production health endpoint every ten minutes from `us-east-2` and emails failure/recovery alerts to `brian@Droidan1.dev`. The endpoint itself switches to the stricter score-sync freshness threshold during game windows, so the external poll can run continuously without maintaining a second schedule. Preview monitoring changes with `npm run monitor:preview` before deploying them with `npm run monitor:deploy`.

Before a database migration or beta release, review and rehearse [the database recovery procedure](./docs/DATABASE_RECOVERY.md).
