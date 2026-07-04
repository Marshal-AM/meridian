# Meridian — Full Phase-Wise Implementation Plan (Consolidated, Single Source of Truth)

This plan sequences every feature, contract, service, and UI surface in the PRD into nine engineering phases. Each phase is additive — nothing built in an earlier phase is a "mock" that gets replaced later; it is the real, production-shaped component, later phases attach to it. Phase gates ("Exit Criteria") are the actual Definition-of-Done for that phase, tied directly back to the PRD sections that specify the requirement. No phase ships a feature whose privacy or settlement guarantee is weaker than what §3.3 and §13 require — where a guarantee can't yet be delivered (e.g., cross-synchronizer atomicity before Phase 5 exists), the product must say so explicitly rather than fake it, exactly per §3.3 "No silent degradation."

---

## 0.0 Environment Reality Check (read before Phase 0)

**What we actually have today:** Access to a single shared validator node — 5North's **"Seaport" DevNet sandbox** — reachable via:
- Ledger REST endpoint: `https://ledger-api.validator.devnet.sandbox.fivenorth.io/`
- Ledger WebSocket endpoint: `wss://ledger-api.validator.devnet.sandbox.fivenorth.io`
- OIDC client-credentials auth (`validator-devnet-m2m`), producing a JWT `access_token` (8-hour expiry) used as a Bearer token against the Ledger API's REST/WS surface (`/v2/state/ledger-end`, `/v2/state/active-contracts`, party allocation, command submission, etc.)

**What this means concretely:** This is genuinely **DevNet** — real decentralized Global Synchronizer infrastructure, not LocalNet — but it is a **shared validator**, not one dedicated node per Meridian persona. Every persona party we allocate (Supplier, Buyer, Financier A/B, Registry, Oracle, Platform Operator, Regulator) is, for now, hosted on this same validator node, distinguished only by distinct Party IDs (and a shared namespace fingerprint), not distinct infrastructure.

**Why this doesn't break the PRD's privacy requirements — but does limit what Phase 0 can claim:** Canton's privacy model (§3.3, §8.3) is enforced by `signatory`/`observer` declarations at the ledger/synchronizer level, not by which physical validator hosts a party. Sealed-bid privacy, interface-view scoping, and all Daml-level visibility guarantees (Phases 1–4) are **fully real and fully testable** on a shared validator — a financier party genuinely cannot query another financier's `Bid` contract, regardless of whether they share a validator. What a shared validator does **not** let us prove is institutional-grade infrastructure separation (i.e., "no shared trust root between organizations' off-ledger services," per the original Phase 0 exit criterion) — that specific guarantee is deferred and re-scoped below.

**Resulting decision:** Phase 0 runs in two tracks:
- **Track A (now, on Seaport):** all persona parties allocated on the shared 5North validator; full Daml contract/privacy logic built and tested here through Phase 4.
- **Track B (deferred to Phase 5 prep):** genuine separate validator nodes per organization — via self-hosted infrastructure, additional sandbox allocations, or standard DevNet sponsorship (SV sponsor → IP whitelisting, 2–7 days) — stood up specifically for the cross-synchronizer work in Phase 5, where a second, independently-operated synchronizer is a hard technical requirement, not a nice-to-have.

This is not a shortcut on the product's guarantees — it is a shortcut on *infrastructure realism* during early development, explicitly flagged per §3.3's "no silent degradation" principle rather than left implicit.

**On funding (Canton Coin / gas):** Every party needs Canton Coin (CC) to pay for network traffic/bandwidth before it can submit any transaction. Three real paths exist, in order of preference:
1. **Tap** — Canton's built-in DevNet/LocalNet faucet mechanism, callable directly via the Wallet SDK (`sdk.amulet.tap(partyId, amount)`) if enabled on the validator — self-serve, instant, no external dependency.
2. **Public faucets** — third-party services (e.g., Stakely's Canton DevNet faucet, `cbtc-faucet.bitsafe.finance`) that send CC to any valid Party ID, independent of validator-operator involvement — useful as a fallback if Tap isn't enabled on a given sandbox.
3. **Manual funding by the validator operator** — where the above aren't available/working, request funding directly from the sandbox operator, then internally transfer CC from one funded party (e.g. Platform Operator) to the remaining personas rather than requesting funding for all of them individually.

**On onboarding to a shared sandbox:** Because Seaport is operated by a third party (5North, via the Canton Foundation/Encode hackathon program), each persona Party ID must also be explicitly **registered/allowlisted** by the validator operators before it's fully operational — this is a manual step done via the support channel, separate from party allocation itself, and is a hard blocker (no allowlisting → cannot submit the mid-hackathon checkpoint or any real transaction).

---

## Phase 0 — Foundations, Topology, and Environment

**Objective:** Get every Meridian persona provisioned with a real Party ID on real DevNet infrastructure, funded and allowlisted, and get the Daml package/CI pipeline running against that real Ledger API — before any business logic is written.

**Deliverables**

- **Auth/session handling service**: a small internal utility that exchanges the 5North OIDC client credentials for a JWT, caches it, and transparently refreshes it before the 8-hour expiry — every subsequent service (indexer, notification service, later the oracle relay) depends on this rather than each hand-rolling token refresh.
  ```
  POST https://auth.sandbox.fivenorth.io/application/o/token/
  grant_type=client_credentials
  client_id=validator-devnet-m2m
  client_secret=<secret>
  audience=validator-devnet-m2m
  scope=daml_ledger_api
  ```
- **Party allocation for every persona**, via the Ledger API's party endpoint against the Seaport validator, one call per persona:
  - `meridian-supplier-1`
  - `meridian-buyer-1`
  - `meridian-financier-a`, `meridian-financier-b` (minimum two — needed from Phase 2 onward to prove sealed-bid privacy between competing financiers)
  - `meridian-registry-1` (cash-leg token issuer, needed Phase 3)
  - `meridian-oracle-1` (Chainlink verifier party, needed Phase 2)
  - `meridian-platform-operator-1`
  - `meridian-regulator-1` (allocated now per the "define the interface home at design time" principle, dormant until Phase 7)

  Each allocation call:
  ```
  POST https://ledger-api.validator.devnet.sandbox.fivenorth.io/v2/parties
  Authorization: Bearer <token>
  { "partyIdHint": "meridian-supplier-1", "displayName": "Meridian Supplier" }
  ```
  Resulting Party IDs (format `hint::fingerprint`) are recorded in a shared, version-controlled `parties.devnet.json` config — this file becomes the single source of truth every Daml Script test and off-ledger service reads party references from, so no party ID is ever hand-copied into contract code. (All 8 will share one namespace fingerprint since they're allocated under one validator session — this is expected and does not affect privacy enforcement, which happens at the Daml `signatory`/`observer` level.)

- **Allowlisting request**: submit all 8 full Party IDs (or the shared-namespace + hint-list shorthand) to the Seaport/Encode support channel, requesting both operational allowlisting and DevNet CC funding for each persona.
- **CC funding**: attempt Tap first (`sdk.amulet.tap`); fall back to public faucets (Stakely, bitsafe) per-party if Tap is unavailable; once one party is funded, use it to internally distribute CC to the remaining 7 rather than requesting external funding for all.
- Daml SDK project scaffolding, versioned as Canton Smart Contract Upgrade (SCU)-compliant packages from the first commit (§8.1) — package IDs, upgrade annotations, and semantic versioning discipline established now, not retrofitted later. DAR deployment target for this phase is the Seaport validator's package-upload endpoint.
- Synchronizer topology note: the Seaport validator connects to a single DevNet synchronizer domain — sufficient for all Phase 1–4 work. **The second, independently-operated synchronizer required for Phase 5 is explicitly deferred**, not stood up in this phase — flagged here rather than silently dropped.
- Party allocation pipeline wired to an off-ledger KYB/AML gateway **stub** contract boundary (real gateway logic lands Phase 7) — the gating hook exists in code now even though, on this shared sandbox, all personas are being allocated directly by us rather than through a real onboarding flow.
- Ledger API client libraries (REST + WebSocket) and the base off-ledger indexer skeleton, consuming `/v2/state/active-contracts` and `/v2/updates` per-party — event-stream replay only, no independent state (§8.1's rebuildability rule).
- CI pipeline running Daml Script tests on every commit, plus a smoke-test job that authenticates against Seaport and confirms `/v2/state/ledger-end` responds — catching sandbox outages/credential rotation before they silently break later test runs.

**Exit Criteria:**
- Every persona above has a confirmed, resolvable, **allowlisted and CC-funded** Party ID on the Seaport DevNet validator (verified via `GET /v2/parties` and a successful trivial transaction), recorded in `parties.devnet.json`.
- Auth service reliably refreshes tokens with zero manual intervention across an 8-hour+ CI run.
- CI enforces SCU package versioning and successfully deploys a trivial DAR to Seaport.
- **Explicitly documented, not silently deferred:** true infrastructure-level separation (distinct validators per organization, no shared trust root) is **not yet achieved** and is scheduled as a Phase 5 prerequisite — this line item is carried forward openly rather than marked done.

---

## Phase 1 — Invoice Tokenization & Interface-View Privacy Core

**Objective:** Implement the foundational `Receivable` contract and its interface-view privacy architecture (§7.1, §7.5, §8.2, §8.3) on the Seaport DevNet validator, using the Phase 0 party set. This is the privacy spine every later feature attaches to — it must be right before anything else is built on top of it.

**Daml contract model**

- `Receivable` template: signed by Supplier and Buyer jointly at issuance (`meridian-supplier-1` + `meridian-buyer-1`). Fields: line items, face value, currency, due date, standing assignment-consent flag (per-invoice or inherited from a master-agreement-level `AssignmentConsentPolicy` contract for large buyers, §7.1).
- Lifecycle state machine on `Receivable`: `Issued → PostedForBid → Funded → PartiallySyndicated → Repaid | Defaulted` (§8.2), implemented as explicit state fields plus choices that only fire from valid prior states (rejected at contract level otherwise).
- Four Daml **interfaces**, each a distinct typed, party-scoped view over the same underlying `Receivable` (§7.5, §8.3):
  - `IBuyerView` — payee, amount, due date only.
  - `ISupplierView` — full economics, full bid history once bidding exists.
  - `IFinancierView` — parametrized per financier; each financier instance only ever exposes that financier's own data.
  - `IRegulatorView` — jurisdiction + aggregate exposure fields only (activated Phase 7, but the interface contract is defined now so future fields have a home at design time, per §7.5's rule that "every new data field... must be explicitly assigned to exactly one of these views at design time").
- `AssignmentConsentPolicy` template — master-agreement-level standing consent, signed by Buyer, observed by Supplier, referenced by `Receivable.consentSource`.

**Off-ledger services**

- Indexer extended to project each party's own interface-view stream, reading from Seaport's `/v2/updates` endpoint filtered per party — never merging across parties, even though all parties are on the same physical validator. (This is the concrete proof point that Daml's privacy model, not infrastructure separation, is what's doing the work.)
- Notification service (event-driven, off-ledger, no ledger authority), subscribing to the per-party WebSocket stream, for issuance/co-signature events.

**Frontend**

- **Supplier Portal**: Invoice issuance module (§10.1) — create/co-sign invoices, manage per-buyer standing consent.
- **Buyer Portal**: Obligations dashboard (amount/due date/payee only) and Co-signature/consent module (§10.2).

**Testing (§14.3)**

- Daml Script unit tests for `Receivable` issuance choice, consent-policy inheritance, and every state transition.
- Negative-authorization tests: authenticate as `meridian-financier-a`'s token, attempt to query the `Receivable` before any invitation exists — must fail against the real Ledger API, not a mocked one.
- **Full visibility-matrix coverage for the rows that exist at this phase** ("Invoice line items/face value," "Buyer identity") — both positive (a party sees what it should) and negative (a party genuinely cannot see what it should not) cases, asserted via real `/v2/state/active-contracts` responses per party token, against the ledger itself per §8.3's closing requirement.

**Exit Criteria:** A supplier and buyer can jointly issue a receivable; the buyer's portal never renders anything beyond its `IBuyerView`; a financier party (even with no invitation yet) cannot query the contract at all — proven by a failing query against the live Seaport Ledger API, not a hidden UI element. Every visibility-matrix cell touched by this phase has an automated on-ledger assertion.

---

## Phase 2 — Sealed-Bid Primary Financing & Oracle-Anchored Pricing

**Objective:** Implement the core competitive financing mechanism (§7.2, §7.3, §7.4, §9.1, §9.3) — the product's primary value proposition — fully oracle-anchored, with atomic award, on the single shared synchronizer. This is the phase where having two distinct financier parties (per Phase 0) becomes essential.

**Daml contract model**

- `FinancingRequest` template (§8.2): created by Supplier from a `PostedForBid` receivable. Signed by Supplier, observed only by explicitly invited Financier parties (invitation-scoping enforced by observer list, not by application filtering — no uninvited financier's participant node ever receives this contract's transaction view). Carries the oracle-anchored pricing band and a time-boxed deadline enforced as a contract-level precondition, not client-side.
- `Bid` template: signed by one Financier, observed only by that Financier and the Supplier — never by other financiers, before or after round close (§7.2, §11.3). References the specific oracle report ID its pricing was anchored against. Each financier constrained to exactly one active `Bid` per round via a uniqueness choice guard.
- **Oracle verifier contract**: consumes Chainlink Data Streams reports on Canton (§12), validates report freshness/provenance on-chain. `Bid` creation choice has a hard precondition requiring a fresh, valid oracle report reference; a stale or missing report causes contract-level rejection (§7.3, §11.3) — not an application-layer check.
- Explicit **non-silent fallback state** on `FinancingRequest`: if the oracle feed is unavailable, the round transitions to `Paused` or to a clearly labeled `StaticReferenceFallback` mode — both states are terminal-visible to the supplier and all invited financiers, never silent (§7.3, §3.3).
- `AwardChoice` on `FinancingRequest`: exercised by Supplier, consumes the winning `Bid`, and in the **same atomic transaction** creates the `Funded Receivable` state and reassigns payee-of-record — no intermediate state exists (§7.4, §9.1 step 4). Authorized without live buyer participation via the standing consent recorded at issuance (§7.4).
- `FundedReceivable` — post-award state carrying zero pricing fields visible to buyer (§7.8 groundwork), tracking the (still-empty until Phase 4) syndication cap table field.

**Environment-specific note:** The Chainlink oracle integration (§12) requires providing `meridian-oracle-1`'s Party ID to Chainlink's onboarding team so they can issue a `VerifierConfig` contract granting observer access — this is now a concrete, executable step since we have a real, stable, funded, allowlisted Party ID for that persona from Phase 0.

**Off-ledger services**

- Oracle relay service: subscribes to Chainlink Data Streams, submits reports to the on-Canton verifier contract, exposes freshness/deviation metrics (feeds the Phase 7 Ops console). Authenticates to Seaport via the Phase 0 auth service.
- Bid-comparison read model: per-supplier, oracle-normalized effective-rate ranking (§9.1 step 3) computed off-ledger from the supplier's own `ISupplierView` stream only.

**Frontend**

- **Supplier Portal**: Financing round configuration module, Bid comparison dashboard with normalized effective-rate ranking and per-bid oracle reference/timestamp audit trail, Award & settlement module (§10.1).
- **Financier Desk**: Deal flow inbox (invitations + anonymized buyer credit profile), Bid submission module (manual path only — agentic path is Phase 6) (§10.3).

**Testing (§14.3)**

- Boundary tests: round-deadline edges, oracle-freshness window edges, run against real Seaport ledger time via `/v2/state/ledger-end`.
- Negative-authorization tests: an uninvited financier's token genuinely cannot see the `FinancingRequest`'s existence — testable adversarially against a real party-scoped auth token, not a mocked one.
- **Full visibility-matrix rows**: "Own bid terms," "Other financiers' bid terms," "Funded receivable pricing," "Oracle report reference" — positive and negative, on-ledger.
- Oracle fault-injection tests: stale report, missing report, extreme deviation, full feed outage — verifying the `Paused`/`StaticReferenceFallback` transitions fire correctly and visibly (§14.3).
- Atomicity test: forcibly interrupt an award transaction mid-flight in a test harness and confirm no partial state (bid consumed without reassignment, or vice versa) is ever observable.

**Exit Criteria:** A full round — invite, bid, oracle-anchored pricing, award — executes as one atomic transaction on the shared synchronizer; a financier can prove (via failed query against the live API, not UI absence) it cannot see a competitor's bid; an oracle outage produces a visibly labeled paused/fallback state, never a silently-degraded price.

---

## Phase 3 — CIP-56 Cash Leg & Repayment/Default Lifecycle

**Objective:** Implement the real settlement asset and the repayment/default half of the lifecycle (§7.8, §7.10, §9.1 step 5–6, §9.2 step 4, §12), making the financing round produce actual cash movement rather than a bookkeeping entry.

**Daml contract model**

- `Cash Token / Holding` implementing Canton's Token Standard interfaces in full: `Holding`, `TransferFactory`, `TransferInstruction`, `Allocation` (§7.10, §8.2), issued by `meridian-registry-1`. Built to the actual CIP-56 interface specification — not a look-alike template — so any compliant external wallet can discover and move it without bespoke integration, per §7.10's explicit requirement.
- Award choice (Phase 2) extended: the atomic award transaction now also executes the `Allocation`/`TransferInstruction` pattern to move the advance from financier to supplier in the same commit (§9.1 step 4–5) — genuinely atomic DvP, not a two-step "assign then hope payment follows."
- `RepaymentChoice` on `FundedReceivable`: buyer pays current payee-of-record; funded-invoice contract carries no pricing fields the buyer can ever see (§7.8). Produces a cryptographic proof-of-payoff artifact the supplier's portal can display without contacting the buyer (§9.1 step 6, §11.1).
- `OverdueTransition`: automatic state transition when due date passes without repayment, notifying current payee-of-record holder(s); deliberately does **not** model collections or dispute-resolution logic beyond this state transition (§7.8's explicit scope boundary — do not over-build here).

**Environment note:** CIP-56 compliance testing against "a reference wallet/tooling implementation" (§14.3) is meaningfully easier on Seaport — the shared validator already exposes standard Registry API endpoints (Transfer Factory, etc.) used by external token-transfer tooling, matching the documented pattern for the Canton Network Token Standard generally. This lets Phase 3 testing use realistic external-wallet-shaped calls rather than only internal round-trips.

**Off-ledger services**

- Holding-merge routine groundwork (full implementation Phase 8) — the interface contract for merge is established now since `Holding` exists from this phase forward.

**Frontend**

- **Supplier Portal**: Portfolio & repayment tracker with proof-of-payoff display (§10.1).
- **Buyer Portal**: Repayment initiation module (§10.2).
- **Financier Desk**: Position management dashboard — accrual tracking, repayment status (§10.3).

**Testing (§14.3)**

- CIP-56 interface-compliance tests against a reference wallet/tooling implementation, not just internal round-trips.
- Repayment tests confirming buyer's view genuinely never surfaces discount rate at any point, including in event-stream/API responses, not just UI.
- Default/overdue boundary tests.

**Exit Criteria:** Real tokenized cash moves atomically as part of award; a CIP-56-compliant external tool can discover and display the Holding correctly; repayment produces verifiable cryptographic proof; overdue transition fires correctly with no collections logic bolted on.

---

## Phase 4 — Syndication Secondary Market

**Objective:** Implement the full syndication mechanism (§7.6, §9.4, §11.4) as true participation interest — legally and architecturally distinct from receivable reassignment — reusing the sealed-bid, oracle-anchored engine built in Phase 2 rather than inventing a second mechanism.

**Daml contract model**

- `ParticipationInterest` template (§8.2): a pass-through economic right to proceeds, explicitly **not** a change of payee-of-record (§7.6). Carries explicit legal-nature metadata at the token-metadata layer so compliant wallets render it correctly as pass-through rather than ownership (§7.10, §17 risk mitigation table).
- `SyndicationOffering`: created by the lead Financier (e.g. `meridian-financier-a`) from a `FundedReceivable`, structurally reusing the `FinancingRequest`/`Bid` sealed-bid machinery from Phase 2 — same non-silent oracle-fallback behavior, same one-active-bid-per-participant constraint, same atomicity-on-award pattern — but scoped to syndicate-participant observers only (e.g. `meridian-financier-b`), with **no observer relationship to the original Buyer or Supplier at all** (not filtered out — never added as an observer in the first place, per §7.6, §9.4).
- Cap table: a field visible only via the lead financier's own interface view (`ILeadFinancierView`), never to participants (who see only their own slice via `IParticipantView`) — extending the same interface-view discipline from Phase 1 (§7.6, §8.3).
- Repayment-proceeds **waterfall logic**: a contract-enforced distribution choice, triggered on each repayment/accrual event, computing and transferring pro-rata shares to each participant automatically — explicitly not a manual process dependent on the lead financier's discretion (§9.4 step 3, §11.4).
- `RepaymentChoice` (Phase 3) extended: on execution, if the receivable is `PartiallySyndicated`, the same atomic transaction now also fires the waterfall distribution — proceeds split and paid out to lead + participants in one commit.

**Frontend**

- **Financier Desk — Syndication module**: for lead financiers — create offerings, manage cap table, administer waterfall; for participants — browse invitations, submit sealed interest, track owned participation interests (§10.3).
- **Supplier Portal**: confirm portfolio tracker continues showing only "funded," with zero syndication visibility (§10.1, §7.6 — regression-tested, not just built-once).

**Testing (§14.3)**

- Full visibility-matrix rows: "Syndication cap table" (positive: lead sees all; negative: participant sees only own slice; negative: buyer/supplier see nothing).
- Syndication waterfall tests: multiple participants, partial repayment, default scenarios, proceeds-distribution correctness under rounding (§14.3 — rounding correctness explicitly called out, must be tested with adversarial fraction cases).
- Regression suite confirming the Phase 1–3 buyer/supplier views are provably unchanged by syndication activity — a syndication event must produce zero new observable facts on the buyer's or supplier's participant node, runnable as a real adversarial query against Seaport rather than a simulated one.

**Exit Criteria:** A lead financier can syndicate part of a funded position through a full sealed-bid round; participants never see each other's entry price; buyer and original supplier's ledger views are provably (via failed query) unaffected by syndication occurring; a CIP-56-compliant wallet renders the participation interest as pass-through, not ownership.

---

## Phase 5 — Cross-Synchronizer Settlement

**Objective:** Implement the full "network of networks" settlement model (§7.7, §8.4, §9.5) — this is the phase that proves Meridian works honestly at real institutional topology, not just on one convenient shared domain.

**New environment prerequisite before any contract work begins:** Unlike Phases 1–4, this phase's entire purpose — proving settlement across genuinely separate synchronizers — **cannot be satisfied by the Seaport shared validator alone**, because all Phase 0–4 parties live on one synchronizer domain by construction. Before Phase 5 contract work starts:

- Stand up **Track B** from §0.0: either (a) request a second party/validator allocation from 5North specifically hosted on a distinct synchronizer if their sandbox supports it, or (b) pursue genuine DevNet sponsorship (SV sponsor → IP whitelisting, 2–7 days) for a second, independently-operated validator, per the standard Canton DevNet onboarding path.
- Allocate a **second buyer party** (e.g. `meridian-buyer-institutional-1`) on this second synchronizer specifically to play the "buyer on a private synchronizer" role from §9.5 — the original `meridian-buyer-1` on Seaport continues to serve the Topology 1 (single shared synchronizer) baseline case.
- Allocate a **second registry party** on a third domain if available, or reuse the second synchronizer, to exercise Topology 3's cash-leg-on-distinct-synchronizer case.
- Fund and allowlist these new parties following the same Phase 0 process (Tap/faucet/manual funding, operator allowlisting request).

**Daml contract model / protocol work**

- **Topology 1 (single shared synchronizer)** — already the default from Phase 1–4; formally confirmed as the baseline path, no new work, but now explicitly labeled `atomic` in a new `SettlementFinality` field added to every settling transaction's audit record (§8.4).
- **Topology 2 (buyer on private synchronizer)**: implement Canton's native cross-domain contract reassignment (unassign/assign) for the assignment notice reaching the buyer's domain, preserving full authorization history rather than a wrapped-asset bridge pattern (§8.4 point 2, §9.5). Financing round + award among supplier/financiers remains atomic on the Global Synchronizer as before; only the buyer-facing notice traverses domains. Buyer's dashboard is updated to explicitly label the trade `reassignment-mediated` (§9.5 step 4, §10.2).
- **Topology 3 (cash-leg registry on distinct synchronizer)**: implement settlement via the Token Standard `Allocation` pattern against a common domain wherever reachable; where no common domain exists, implement a **bounded, auditable, explicitly-labeled escrow fallback with automatic timeout unlock** (§8.4 point 3, §7.7). This is a real, fully specified fallback mechanism — not a placeholder: bounded time window, automatic unlock on timeout, immutable audit record, and mandatory UI labeling as `escrow-fallback` wherever it triggers (§13's "no feature may present a weaker guarantee as if it were the strongest").
- `SettlementFinality` classification (`atomic` / `reassignment-mediated` / `escrow-fallback`) recorded **immutably** on every trade and surfaced everywhere a trade is displayed — Supplier Portal, Buyer Portal, Financier Desk, and Phase 7's Ops console (§8.4 closing paragraph, §13).

**Frontend**

- Buyer Portal: Assignment notice history audit trail (§10.2), settlement-finality labeling on Repayment initiation module.
- Supplier Portal: settlement-finality classification surfaced in Award & settlement module.
- Financier Desk: settlement-finality visible per position.

**Testing (§14.3)**

- **Cross-synchronizer integration test environment** — now concretely "Seaport domain + newly acquired second domain," standing up at minimum a Global Synchronizer-equivalent domain, an independent bank-operated synchronizer hosting a buyer party, and a distinct registry domain for the cash leg — run on every release candidate from this phase forward, exactly as §14.3 mandates.
- Reassignment authorization-history preservation test: confirm the reassigned contract's full authorization chain survives the domain move, not just its current state.
- Escrow-fallback timeout tests: confirm automatic unlock fires correctly and the auditable record is immutable.
- Full visibility-matrix row "Settlement domain / finality status" (positive/negative) across all three topologies.

**Exit Criteria:** All three topologies are live and testable in the integration environment; a trade's settlement-finality classification is immutable, accurate, and visibly surfaced to every legitimate party to that trade; no trade is ever presented as more final than it actually is.

---

## Phase 6 — Agentic Bidding (Mandate-Constrained)

**Objective:** Implement automated bidding with on-ledger-enforced mandates (§7.9, §11.3), so that risk limits are enforced by the ledger itself, not by trusting an agent's code.

**Daml contract model**

- `BiddingMandate` template (§8.2): signed by the Financier, defining maximum exposure, minimum acceptable spread, and eligible counterparty profiles as structured, machine-checkable fields.
- `Bid` creation choice (Phase 2) extended with a **hard precondition**: any bid submitted by a registered agent identity must satisfy the referenced `BiddingMandate`'s constraints, checked at the contract level — a bid outside the mandate is rejected by the ledger regardless of what the agent's off-ledger code intended to do (§7.9, §11.3, §14.1's explicit requirement that this never be an off-ledger risk check).

**Off-ledger services**

- Agent runtime: fetches oracle rates, evaluates deal-flow inbox, submits bids — but carries zero authority beyond what the mandate precondition allows, authenticating via the Phase 0 auth-token pattern, verified by adversarial test agents deliberately trying to submit out-of-mandate bids.

**Frontend**

- Financier Desk: agent configuration and monitoring UI within the Bid submission module (§10.3).

**Testing (§14.1, §14.3)**

- Adversarial test: a deliberately misconfigured/malicious agent attempting an out-of-mandate bid — must fail at the ledger, proven by a failed transaction, not by the agent "choosing" not to submit it.

**Exit Criteria:** An automated agent operating with a compromised or buggy off-ledger implementation still cannot get an out-of-mandate bid accepted — proven adversarially, not asserted.

---

## Phase 7 — Compliance, Regulator Views & Full Ops Console

**Objective:** Activate the previously-scaffolded regulator interface view and stand up the real Ops & Compliance Console (§7.5's regulator view, §10.4, §11.7, §14.2), and wire the real KYB/AML gateway deferred from Phase 0.

**Daml contract model**

- `IRegulatorView` (defined Phase 1, dormant) activated for `meridian-regulator-1` (allocated back in Phase 0): jurisdiction-scoped compliance observer parties added strictly as **observers** on the dedicated compliance interface view — never granted controller rights over any choice, unless a specific deployment contractually requires a separately-scoped halt capability, which must be its own explicitly-scoped choice, never bundled into general observer rights (§14.2).
- Aggregate-only exposure rollups computed for regulator consumption without ever exposing per-bid or per-trade commercial pricing (§8.3 matrix — "Aggregate only" cells across four rows).

**Off-ledger services**

- Real KYB/AML gateway, integrated with participant topology-management so new party allocation is gated on off-ledger verification completing first (§14.2) — replacing the Phase 0 boundary stub with the real check; this matters more once Meridian moves beyond the shared Seaport sandbox toward real institutional onboarding.
- Settlement-finality monitor, Oracle health monitor, and Regulator-view administration panel — all reading only from the Platform Operator's own already-minimal on-ledger footprint (§10.4), explicitly excluding any individual bid or syndication pricing visibility, matching the "never a custodian of trust" positioning (§10.4 closing bullet, §11.8).

**Frontend**

- Full **Ops & Compliance Console** (§10.4): Settlement-finality monitor, Oracle health monitor, Regulator-view administration.

**Testing (§14.2, §14.3)**

- Full visibility-matrix rows for "Regulator (optional)" column across all data types, positive and negative.
- Test that a regulator observer party, even if compromised, cannot exercise any choice — controller-rights absence proven adversarially.
- KYB/AML gate test: party allocation genuinely blocked until off-ledger verification completes.

**Exit Criteria:** A jurisdiction-scoped regulator party sees exactly aggregate exposure and jurisdiction data and nothing else, provably; the Ops console gives the Platform Operator real-time settlement and oracle health visibility with zero individual pricing access; KYB/AML gating is real, not cosmetic.

---

## Phase 8 — Security Hardening, Full Test Suite, and Scalability

**Objective:** Close every remaining requirement in §13 and §14 that spans the whole system rather than one feature, and validate the product under realistic load before any MainNet conversation.

**Work**

- **Mandatory security review** of every choice body across all packages for authority-smuggling risk and unconstrained-delegation patterns (§14.1) — a structured, documented pass, not an informal read-through, covering every choice added in Phases 1–7.
- **Holding-merge tooling**, fully implemented and continuously monitored via the Ops console, targeting low active-holding counts per party to control validator storage/traffic cost at scale (§13, §17).
- **Load and performance testing** simulating realistic per-party holding counts and bid volumes, validating sub-10-second perceived latency for bid submission and award actions under realistic testnet-equivalent load (§13) — measured against Seaport's and any additional validators' real network conditions rather than LocalNet's local-loopback speed, a materially more honest test.
- **Complete §8.3 visibility matrix**, now fully populated across every column and row from every phase, re-verified end-to-end as one regression suite — every cell has a positive and negative on-ledger assertion, per §8.3's closing paragraph, now checked as a whole rather than piecemeal per phase.
- KPI instrumentation (§16) wired into the Ops console and indexer: rounds completed, time-to-award, bidders-per-round, % funded positions syndicated within 30 days, oracle-deviation-incidents-accepted (target zero, enforced structurally and now measured), cross-synchronizer success rate vs. escrow-fallback rate trend, buyer-side friction metrics.

**Exit Criteria:** Documented security review complete with all findings resolved; holding-merge tooling operating continuously in the test environment; load tests meet the sub-10-second latency target; the full visibility matrix passes as a single regression suite; all six KPI families are live and observable on the Ops console.

---

## Phase 9 — TestNet Hardening → MainNet Readiness

**Objective:** Final integration across all phases as one coherent product, and the actual path from Canton TestNet to MainNet.

**Work**

- Full end-to-end journey testing of all five user journeys in §9 (supplier financing, buyer fulfillment, financier bid/win, financier syndication, cross-synchronizer institutional buyer) run back-to-back on TestNet as one continuous scenario, not as isolated feature tests.
- Risk-register closure pass against every row in §17 — confirm each mitigation is actually implemented and tested, not just designed (cross-synchronizer complexity phased correctly and independently valuable at Phase 1–4 stage; oracle fallback non-silent; syndication metadata correctly labeled; holding-merge live; security review complete; frontend mirrors familiar mental models for non-financier personas).
- SCU package-versioning dry run: introduce a genuine new field via the interface-view extension mechanism established in Phase 1, confirm existing counterparty integrations do not break (§8.1).
- Final settlement-finality audit: confirm every trade type across all three topologies (Phase 5) is correctly and immutably labeled with no ambiguous cases remaining, per §13's transparency-of-guarantees requirement.
- **Sandbox-to-self-hosted-infrastructure cutover**: since Phase 0–4 development happened on a third-party-operated sandbox (5North's Seaport), the MainNet migration runbook must explicitly confirm that no part of the production topology continues to depend on Seaport once real institutional participants (their own validators) come online.
- MainNet migration runbook: participant node cutover sequencing per organization (including the Seaport dependency-removal step above), synchronizer connection order, data-residency/private-synchronizer decisions finalized per real deploying institution (§14.2 — genuine topology decision, not a config toggle).

**Exit Criteria:** All five §9 journeys pass end-to-end on TestNet in one continuous run; every §17 risk is closed with evidence, not assertion; no part of the production topology depends on the Seaport sandbox; the product is demonstrably a single coherent system — sealed-bid financing, interface-view privacy, oracle anchoring, syndication, and cross-synchronizer settlement all operating together on real receivables — ready for MainNet cutover per institution.