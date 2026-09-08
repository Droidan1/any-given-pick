# Paid Contest Implementation Plan

Saved August 12, 2026 for future implementation after written regulatory and payment-provider approval.

## Proposed contest model

- Each approved player pays **$10** for one official weekly card.
- **$9 per valid paid card (90%)** funds that week's prize.
- **$1 per valid paid card (10%)** is the administration fee.
- The weekly winner is the eligible player with the most correct picks.
- The existing Monday-night combined-score prediction resolves a tie.
- If players remain exactly tied, the recommended rule is to divide the prize equally and allocate any leftover cents using a published deterministic rule.
- Edits to an already-paid card before the deadline do not require another payment.
- Tuesday settlement occurs only after every required game is final, the approved score-correction window has passed, and all financial and eligibility checks are complete.

### Example prize calculations

| Paid cards | Collected | Prize pool (90%) | Administration (10%) |
|---:|---:|---:|---:|
| 10 | $100 | $90 | $10 |
| 25 | $250 | $225 | $25 |
| 50 | $500 | $450 | $50 |
| 100 | $1,000 | $900 | $100 |

Payment processing, chargebacks, compliance, licensing, taxes, and operating expenses should come from the administration portion rather than silently reducing the advertised prize. The economics must be reviewed because $1 per paid card may not cover those costs.

## Regulatory checkpoint

Do not enable real-money entry or payouts based only on a general business approval. Obtain written confirmation from the Indiana Gaming Commission for the exact Any Given Pick rules and scoring format.

The current game awards points for selecting winning teams. Indiana's paid-fantasy definition requires outcomes based predominantly on accumulated individual-athlete statistics and excludes outcomes based on a single team or combination of teams. The current format may therefore be classified as sports wagering rather than paid fantasy sports. This is a legal classification question for the Indiana Gaming Commission and qualified gaming counsel—not an engineering assumption.

Before development begins, obtain written answers covering:

1. The classification of this exact professional-football pick'em format.
2. The license, licensed-operator relationship, or casino partnership required.
3. Whether the 90% player pool and 10% administration fee are approved.
4. Required age, identity, geolocation, responsible-gaming, reserve, reporting, audit, complaint, tax, and payout controls.
5. Whether users must be Indiana residents, physically present in Indiana when entering, or both.
6. Required rules for ties, refunds, cancellations, postponed games, score corrections, chargebacks, abandoned contests, and minimum participation.
7. Whether preseason contests may accept paid entries.

Current reference points as of August 12, 2026:

- Indiana requests that interested operators first submit a Gaming Entity Inquiry Form so the Commission can determine the required license.
- The Indiana paid-fantasy operator page currently lists a $50,000 nonrefundable application fee, possible additional investigation costs, and a $5,000 annual renewal.
- Indiana sports-wagering vendor licensing currently lists a $100,000 nonrefundable application fee, a $50,000 annual renewal, suitability reviews, and generally an agreement or letter of intent with a certificate holder.
- Ordinary Stripe is not an eligible processor for this model. Stripe's prohibited-business policy explicitly includes entry fees connected to monetary prizes, fantasy sports, sports forecasting, and paid games of skill.

Never disguise these payments as software purchases, subscriptions, donations, or ordinary service fees. The payment and payout providers must knowingly underwrite and approve the regulated activity.

## Phase 1: Licensing, business, and provider approval

- Submit the exact rules, scoring logic, screenshots, money flow, and fee model to the Indiana Gaming Commission.
- Obtain a written opinion from qualified Indiana gaming counsel.
- Form and license the operating business as required.
- Obtain any required licensed-operator or casino relationship.
- Select a gaming-compatible payment acquirer with written authorization for this product.
- Select an approved payout, identity, tax, and compliance provider or use the licensed partner's player-wallet system.
- Establish a segregated player-funds account or required reserve structure.
- Obtain approval for official rules, internal controls, refund policy, payout policy, complaint process, responsible-gaming controls, and system architecture.
- Assign responsibility for financial reconciliation, regulatory reporting, taxes, disputes, security, and incident response.

## Phase 2: Final official rules

Publish unambiguous rules for:

- One paid card per approved person per week.
- The entry deadline and the requirement that payment settle before the deadline.
- Which games count and how postponed, suspended, canceled, or stat-corrected games are handled.
- Minimum paid participation and what happens when it is not met.
- Refund and chargeback conditions.
- The official data source and score-correction window.
- The exact winner and tie-breaking sequence.
- Split-prize and leftover-cent handling.
- Eligibility, age, location, identity, exclusion, employee, athlete, official, and household restrictions.
- Prize calculation, administration fee, processing costs, taxes, and withholding.
- Complaints, appeals, errors, outages, force majeure, and regulator-required changes.

The UI must show the price, prize formula or guaranteed prize, administration fee, rules, and refund terms before payment.

## Phase 3: Financial database foundation

Add a migration with an immutable double-entry-style financial ledger and supporting records such as:

### `contest_financials`

- Contest week
- Currency
- Entry price
- Prize contribution per entry
- Administration fee per entry
- Minimum/maximum entrants
- Financial status
- Rules version

### `entry_payments`

- User and contest entry
- Week
- Provider customer, checkout, payment, and charge IDs
- Amount and currency
- Payment, refund, dispute, and settlement status
- Idempotency keys and timestamps

### `financial_ledger`

- Immutable credits and debits
- Entry receipts
- Player-fund liability
- Prize liability
- Administration revenue
- Provider fees
- Refunds
- Chargebacks
- Withholding
- Payouts
- Reconciliation references

### `payment_webhook_events`

- Unique provider event ID
- Event type and object reference
- Signature-verification result
- Processing state, attempts, timestamps, and safe error details

### `weekly_settlements`

- Immutable entrant and result snapshot
- Gross receipts
- Refunds and disputes
- Prize pool
- Administration fee
- Winner calculation and tie details
- Review, approval, and completion timestamps

### `winner_payouts`

- Recipient and settlement
- Gross prize
- Withholding
- Net payout
- Provider payout ID
- Tax-document status
- Payout state and timestamps

### `responsible_gaming_restrictions`

- Self-exclusion
- Regulatory exclusion
- Cool-off periods
- Deposit or entry limits
- Restriction reason and effective dates

Store provider tokens and external transaction IDs only. Never store card numbers, bank credentials, raw Social Security numbers, or unencrypted tax documents in the application database.

## Phase 4: Paid-card player flow

1. The user signs in.
2. The server confirms approval, minimum age, verified identity, Indiana eligibility, non-exclusion, and any payment limits.
3. The user completes every pick and the tiebreaker.
4. The submit action becomes **Pay $10 & Submit**.
5. The server creates one idempotent provider checkout session tied to the user, week, rules version, and draft fingerprint.
6. Hosted checkout collects payment outside the app's PCI scope.
7. A signed provider webhook—not a browser redirect—confirms settled payment.
8. The server rechecks the deadline and eligibility.
9. Only then does the server create the official paid entry and ledger entries.
10. The player receives a receipt showing:
    - $10 charged
    - $9 contributed to the weekly prize
    - $1 administration fee
    - Week and entry reference
    - Transaction reference
    - Refund and support links
11. The player may edit and resubmit until lock without paying again.

If payment settles after the deadline, the system must reject the entry and automatically initiate the approved refund workflow. A failed, incomplete, disputed, refunded, or reversed payment cannot produce a valid paid card.

## Phase 5: Administration and financial controls

Add **Admin settings → Contest finances** with:

- Paid entrants and payment states
- Gross amount collected
- Prize liability
- Administration fee
- Processing fees
- Refunds and disputes
- Ledger balance versus provider/segregated-account balance
- Score completeness and data-provider health
- Provisional winner and tiebreaker explanation
- Winner identity, location, exclusion, payout, and tax readiness
- Settlement approval
- Payout status and failure recovery
- Downloadable transaction, settlement, and reconciliation reports

Use separation of duties where required. No administrator should be able to change a winner, amount, or financial status without a reason, immutable audit event, before/after values, and any required second approval.

## Phase 6: Tuesday settlement and payout

1. Confirm every required game is final or handled under the published cancellation rule.
2. Wait through the regulator-approved score-correction period.
3. Freeze an immutable official game/result snapshot.
4. Recalculate every valid paid card from that snapshot.
5. Apply the published winner and tie-breaking rules.
6. Reconcile:
   - Valid paid-entry count against settled payments
   - Gross receipts against the provider and segregated account
   - Prize pool against $9 multiplied by valid paid cards
   - Administration fee against $1 multiplied by valid paid cards
   - Refunds, disputes, chargebacks, and withholding
7. Reconfirm the winner's identity, location requirements, exclusion status, tax readiness, and payout eligibility.
8. Initially require administrator approval and any mandated second approval.
9. Send the payout through the approved provider.
10. Mark the week settled only after provider confirmation.
11. Send:
    - Winner email with prize, withholding, and payout status
    - Participant email with results and winning score
    - Administrator reconciliation report

Automatic Tuesday payouts should be considered only after successful regulated operation and explicit approval of the automated control.

## Phase 7: Tax and reporting

Design this workflow with a gaming CPA, counsel, and the selected provider.

- Securely collect W-9/TIN information through an approved identity/tax provider.
- Determine W-2G reporting and federal/state withholding per contest classification and payment.
- Support backup withholding when required.
- Produce player tax statements.
- Support Form 945 and other operator filings when applicable.
- Retain regulatory and tax records for the required period.
- Keep full tax identifiers and identity documents out of ordinary administrator views.

All gambling winnings may be taxable even when no W-2G is issued. The rules and receipts should tell players that they are responsible for tax reporting and should consult their own adviser.

## Phase 8: Security, integrity, and responsible gaming

- Strong identity verification and duplicate-account detection
- Approved high-confidence geolocation with proxy/VPN and tampering controls
- Server-controlled deadlines and database-time enforcement
- Immutable paid-entry and scoring snapshots
- Signed, replay-safe provider webhooks
- Idempotent checkout, refund, settlement, and payout commands
- Rate limits and bot/script detection
- Employee, athlete, official, household, and other prohibited-person controls
- Self-exclusion, regulator exclusion, cool-off, and limit enforcement
- Segregated player funds and reserve monitoring
- Encryption, secrets rotation, least-privilege access, and audit logging
- Incident response, financial recovery, reconciliation, complaint, and regulator-notification procedures

## Phase 9: Testing and controlled launch

- Keep `PAID_CONTESTS_ENABLED=false` by default.
- Use provider sandboxes and test identities.
- Replay duplicate, delayed, missing, and out-of-order webhooks.
- Test double-clicked checkout and submissions.
- Test payment settling after lock.
- Test failed, refunded, disputed, and charged-back payments.
- Test provider and database outages.
- Test canceled/postponed games and later score corrections.
- Test exact ties, split prizes, and leftover cents.
- Test underage, excluded, outside-Indiana, duplicate, identity-failure, and location-tampering cases.
- Reconcile every test transaction to the cent.
- Conduct a full no-money dress rehearsal.
- Complete penetration, accessibility, privacy, recovery, internal-control, and regulator/partner acceptance testing.
- Obtain written go-live authorization.
- Launch with regulator-approved player, entry, and prize limits.

## Recommended delivery sequence

1. Written Indiana classification
2. License and licensed-operator/casino relationship, if required
3. Gaming-approved payment, payout, identity, tax, and geolocation providers
4. Approved rules and internal controls
5. Immutable financial ledger and reconciliation
6. Identity, geolocation, exclusion, and responsible-gaming controls
7. Paid-card checkout and webhook fulfillment
8. Tuesday settlement and payout
9. Tax and regulatory reporting
10. Sandbox audit and limited paid beta

Once licensing, contracts, approved rules, and provider specifications are final, the engineering work is estimated at approximately **8–12 weeks**. Regulatory review, processor underwriting, partner certification, financial-account setup, independent testing, and go-live authorization may take substantially longer.

## Reference links

- [Indiana Gaming Commission — Sports Wagering and Paid Fantasy Sports](https://www.in.gov/igc/sports-wagering-and-paid-fantasy-sports/)
- [Indiana Gaming Commission — Paid Fantasy Sports Operators](https://www.in.gov/igc/sports-wagering-and-paid-fantasy-sports/pfso/)
- [Indiana Gaming Commission — Sports Wagering Licensing](https://secure.in.gov/igc/GamingEntityLicensing/sports-wagering-licensing/)
- [Indiana paid-fantasy definition, IC 4-33-24-9](https://law.justia.com/codes/indiana/title-4/article-33/chapter-24/section-4-33-24-9/)
- [Indiana paid-fantasy administrative rules, 68 IAC 26](https://www.law.cornell.edu/regulations/indiana/title-68/article-26)
- [Indiana paid-fantasy reporting deadlines](https://www.in.gov/igc/files/sportswagering/PFS-Reporting-Deadlines.pdf)
- [Stripe prohibited and restricted businesses](https://stripe.com/legal/restricted-businesses)
- [IRS Instructions for Forms W-2G and 5754](https://www.irs.gov/instructions/iw2g)
- [IRS Topic 419 — Gambling income and losses](https://www.irs.gov/taxtopics/tc419)

## Revalidation requirement

This document records a planning snapshot, not legal, tax, accounting, payment-provider, or regulatory advice. Laws, rules, fees, provider policies, tax thresholds, and the app's architecture may change. Revalidate every external requirement and update this plan before implementation.
