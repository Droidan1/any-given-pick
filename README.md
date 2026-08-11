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
- Explicit submit/edit flow with immutable version history and timestamped receipts
- Database-time deadline enforcement for drafts and submissions
- Home, picks, standings, weekly results, activity archive, and profile surfaces
- Web app manifest, generated PWA icons, and a static-asset-only offline service worker shell
- Any Given Pick wordmark, route-mark icon, social-sharing image, and install identity
- Original visual system with no NFL or team marks
- Clerk passwordless email-code authentication surfaces
- Internal Postgres user IDs mapped to verified Clerk identities
- Unique case-normalized player names with 30-day history enforcement
- Server-calculated age eligibility and session-time Indiana verification
- Read-only fallbacks for denied, unavailable, stale, outside-state, or indeterminate location
- Postgres roles, eligibility history, and append-only application audit events
- Provider-neutral CSV/JSON schedule importer and admin week operations
- Admin-only settings hub with direct links to week management and full-season import
- Pending-first user approval roster with reversible access removal and audit history
- Server-owned ESPN score checks with administrator-visible health and manual final-score fallback
- Post-lock weekly card reveal using only each player's latest official submitted version
- Full-season CSV/TSV import that groups preseason and regular-season games into private week drafts
- Drizzle schema, committed migrations, seed task, and eligibility/entry rule tests

## Not connected yet

A licensed long-term sports-data provider, notifications, prizes, private groups, and moderation remain future milestones. Schedule importing stays provider-neutral so an approved source can replace the current provider without rebuilding the contest engine.

Product truth is recorded in [PRODUCT.md](./PRODUCT.md). Design references are stored under `design/`.

## Production score scheduler

The score updater runs behind `GET /api/cron/scores` and requires `Authorization: Bearer <CRON_SECRET>`. Store the same high-entropy value in:

- Vercel Production as `CRON_SECRET`
- GitHub Actions as the repository secret `SCORE_SYNC_CRON_SECRET`

The committed GitHub Actions workflow requests a sync every ten minutes during typical Thursday-through-Monday game windows, runs one daily catch-up, and can also be run manually. This bounded schedule avoids spending private-repository Actions minutes around the clock. Scheduled GitHub workflows can be delayed during periods of high load, so the Admin settings health panel records the latest attempt, success, provider warning, and update count. Commissioners can always enter a final score manually under **Admin settings → Manage contest weeks**.

## Temporary player approval gate

New Clerk accounts start in a pending state by default. An administrator must approve the verified identity from **Admin settings → Player access** before that person can create a player card, verify location, make picks, or submit an entry. Removing access is reversible and preserves the player’s account and historical records.

Set `USER_APPROVAL_REQUIRED=false` and redeploy when manual approval is no longer needed. Existing pending accounts still require an administrator to approve them.
