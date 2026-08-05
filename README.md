# Any Given Pick

A free-entry weekly professional-football pick'em PWA built around the Coach's Call Sheet visual direction.

Production domain: [anygivenpick.app](https://anygivenpick.app)

Source repository: [github.com/Droidan1/any-given-pick](https://github.com/Droidan1/any-given-pick)

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deployment and environments

The GitHub repository is connected directly to the Vercel `any-given-pick` project. Pushes to `main` create Production deployments, while pushes to other branches and pull requests create isolated Preview deployments.

The prototype currently requires no application-specific environment variables. Keep future secrets in Vercel with separate Production, Preview, and Development scopes; local secrets belong in `.env.local`, which is ignored by Git.

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

## Not connected yet

Authentication, server-side eligibility, sports-data ingestion, real deadlines, server submission, scoring, notifications, prizes, moderation, and admin tools remain future milestones. The UI labels illustrative data explicitly and does not claim a server submission.

Product truth is recorded in [PRODUCT.md](./PRODUCT.md). Design references are stored under `design/`.
