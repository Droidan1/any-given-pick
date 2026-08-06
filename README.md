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
- Interactive eight-game picks flow
- Monday combined-score tiebreaker
- Local draft persistence
- Inline review and prototype receipt states
- Sample home, standings, groups, and profile surfaces
- Web app manifest, generated PWA icons, and offline service worker shell
- Any Given Pick wordmark, route-mark icon, social-sharing image, and install identity
- Original visual system with no NFL or team marks
- Clerk email/password and Google authentication surfaces
- Internal Postgres user IDs mapped to verified Clerk identities
- Unique case-normalized player names with 30-day history enforcement
- Server-calculated age eligibility and session-time Indiana verification
- Read-only fallbacks for denied, unavailable, stale, outside-state, or indeterminate location
- Postgres roles, eligibility history, and append-only application audit events
- Drizzle schema, committed migrations, seed task, and eligibility unit tests

## Not connected yet

Sports-data ingestion, real deadlines, contest joins and entry submission, scoring, notifications, prizes, moderation, and admin tools remain future milestones. Draft picks are still stored only on the current device and the UI does not claim a contest submission.

Product truth is recorded in [PRODUCT.md](./PRODUCT.md). Design references are stored under `design/`.
