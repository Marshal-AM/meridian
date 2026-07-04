# Meridian — Full Phase-Wise Implementation Plan (v2)

**Revision note:** This version supersedes the original plan by grounding Phase 0 in the actual, concrete DevNet access Meridian now has — the 5North "Seaport" validator sandbox — instead of an abstract "provision participant nodes" deliverable. Every later phase's environment references have been updated to reflect what's real and available today versus what still requires separate infrastructure. Nothing about the product's feature scope, contract model, or privacy guarantees has changed — only how and where Phase 0–4 actually get built is now concrete.

---

## 0.0 Environment Reality Check (read this before Phase 0)

Before restating the phases, it's important to be explicit about what kind of environment we now have, because it changes *how* Phase 0 is executed without changing *what* it must deliver.

**What we have:** Access to a single shared validator node — 5North's "Seaport" DevNet sandbox — reachable via:
- Ledger REST endpoint: `https://ledger-api.validator.devnet.sandbox.fivenorth.io/`
- Ledger WebSocket endpoint: `wss://ledger-api.validator.devnet.sandbox.fivenorth.io`
- OIDC client-credentials auth (`validator-devnet-m2m`), producing a JWT `access_token` (8-hour expiry) used as a Bearer token against the Ledger API's REST/WS surface (`/v2/state/ledger-end`, `/v2/state/active-contracts`, party allocation, command submission, etc.)

**What this means concretely:** This is genuinely **DevNet** — real decentralized Global Synchronizer infrastructure, not LocalNet — but it is a **shared validator**, not one dedicated node per Meridian persona. Every persona party we allocate (Supplier, Buyer, Financier A/B, Registry, Oracle, Platform Operator) will, for now, be hosted on this same validator node, distinguished only by distinct Party IDs, not distinct infrastructure.

**Why this doesn't break the PRD's privacy requirements — but does limit what Phase 0 can claim:** Canton's privacy model (§3.3, §8.3) is enforced by `signatory`/`observer` declarations at the ledger/synchronizer level, not by which physical validator hosts a party. So sealed-bid privacy, interface-view scoping, and all Daml-level visibility guarantees (Phases 1–4) are **fully real and fully testable** on a shared validator — a financier party genuinely cannot query another financier's `Bid` contract, regardless of whether they share a validator. What a shared validator does **not** let us prove is institutional-grade infrastructure separation (i.e., "no shared trust root between organizations' off-ledger services," per the original Phase 0 exit criteria) — that specific guarantee is deferred and re-scoped below.

**Resulting decision (resolves the earlier LocalNet-topology question):** Phase 0 now runs in two tracks:
- **Track A (now, on Seaport):** all persona parties allocated on the shared 5North validator, full Daml contract/privacy logic built and tested here through Phase 4.
- **Track B (deferred to Phase 5 prep):** genuine separate validator nodes per organization — via self-hosted infrastructure or additional sandbox/sponsor allocations — stood up specifically for the cross-synchronizer work in Phase 5, where a second, independently-operated synchronizer is a hard technical requirement, not a nice-to-have.

This is not a shortcut on the product's guarantees — it is a shortcut on *infrastructure realism* during early development, explicitly flagged per §3.3's "no silent degradation" principle rather than left implicit.

---

## Phase 0 — Foundations, Topology, and Environment (Revised)

**Objective:** Get every Meridian persona provisioned with a real Party ID on real DevNet infrastructure, and get the Daml package/CI pipeline running against that real Ledger API — before any business logic is written.

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
  - `meridian-financier-a`, `meridian-financier-b` (minimum two, per original Phase 0 spec — needed from Phase 2 onward to prove sealed-bid privacy between competing financiers)
  - `meridian-registry-1` (cash-leg token issuer, needed Phase 3)
  - `meridian-oracle-1` (Chainlink verifier party, needed Phase 2)
  - `meridian-platform-operator-1`
  - `meridian-regulator-1` (allocated now per original plan's "define the interface home at design time" principle, dormant until Phase 7)

  Each allocation call:
  ```
  POST https://ledger-api.validator.devnet.sandbox.fivenorth.io/v2/parties
  Authorization: Bearer <token>
  { "partyIdHint": "meridian-supplier-1", "displayName": "Meridian Supplier" }
  ```
  Resulting Party IDs (format `hint::fingerprint`) are recorded in a shared, version-controlled `parties.devnet.json` config — this file becomes the single source of truth every Daml Script test and off-ledger service reads party references from, so no party ID is ever hand-copied into contract code.

- Daml SDK project scaffolding, versioned as Canton Smart Contract Upgrade (SCU)-compliant packages from the first commit (§8.1) — package IDs, upgrade annotations, and semantic versioning discipline established now, not retrofitted later. DAR deployment target for this phase is the Seaport validator's package-upload endpoint.
- Synchronizer topology note: the Seaport validator connects to a single DevNet synchronizer domain — sufficient for all Phase 1–4 work. **The second, independently-operated synchronizer required for Phase 5 is explicitly deferred**, not stood up in this phase (see §0.0 above) — flagged here rather than silently dropped from the original plan.
- Party allocation pipeline wired to an off-ledger KYB/AML gateway **stub** contract boundary (real gateway logic lands Phase 7) — the gating hook exists in code now even though, on this shared sandbox, all personas are being allocated directly by us rather than through a real onboarding flow.
- Ledger API client libraries (REST + WebSocket, per the endpoints above) and the base off-ledger indexer skeleton, consuming `/v2/state/active-contracts` and `/v2/updates` per-party — event-stream replay only, no independent state (§8.1's rebuildability rule).
- CI pipeline running Daml Script tests on every commit, plus a smoke-test job that authenticates against Seaport and confirms `/v2/state/ledger-end` responds — catching sandbox outages/credential rotation before they silently break later test runs.

**Exit Criteria (revised):**
- Every persona above has a confirmed, resolvable Party ID on the Seaport DevNet validator (verified via `GET /v2/parties`), recorded in `parties.devnet.json`.
- Auth service reliably refreshes tokens with zero manual intervention across an 8-hour+ CI run.
- CI enforces SCU package versioning and successfully deploys a trivial DAR to Seaport.
- **Explicitly documented, not silently deferred:** true infrastructure-level separation (distinct validators per organization, no shared trust root) is **not yet achieved** and is scheduled as a Phase 5 prerequisite — this line item is carried forward openly rather than marked done.

---

## Phase 1 — Invoice Tokenization & Interface-View Privacy Core

*(Unchanged in scope from the original plan — §7.1, §7.5, §8.2, §8.3. Environment note only.)*

**Objective:** Implement the foundational `Receivable` contract and its interface-view privacy architecture on the Seaport DevNet validator, using the Phase 0 party set.

**Daml contract model** — identical to original spec:
- `Receivable` template, signed by Supplier and Buyer jointly (`meridian-supplier-1` + `meridian-buyer-1`), full lifecycle state machine (`Issued → PostedForBid → Funded → PartiallySyndicated → Repaid | Defaulted`).
- Four interfaces: `IBuyerView`, `ISupplierView`, `IFinancierView`, `IRegulatorView` — exactly as originally specified.
- `AssignmentConsentPolicy` template for master-agreement-level standing consent.

**Off-ledger services**
- Indexer extended to project each party's own interface-view stream, reading from Seaport's `/v2/updates` endpoint filtered per party — never merging across parties even though all parties are on the same physical validator (this is the concrete proof point that Daml's privacy model, not infrastructure separation, is what's doing the work here).
- Notification service, event-driven, subscribing to the same per-party WebSocket stream (`wss://ledger-api.validator.devnet.sandbox.fivenorth.io/v2/state/active-contracts` per persona's Bearer token).

**Frontend** — unchanged: Supplier Portal invoice issuance module; Buyer Portal obligations dashboard + co-signature module.

**Testing (§14.3)** — unchanged in substance, now executed against real DevNet rather than LocalNet:
- Daml Script unit tests for issuance, consent inheritance, state transitions.
- Negative-authorization tests: authenticate as `meridian-financier-a`'s token, attempt to query the `Receivable` before any invitation exists — must fail against the real Ledger API, not a mocked one.
- Full visibility-matrix coverage for "Invoice line items/face value" and "Buyer identity," asserted via real `/v2/state/active-contracts` responses per party token.

**Exit Criteria:** Same as original — supplier/buyer can jointly issue a receivable; buyer's portal renders only `IBuyerView`; a financier's query genuinely returns nothing pre-invitation, proven against the live Seaport Ledger API.

---

## Phase 2 — Sealed-Bid Primary Financing & Oracle-Anchored Pricing

*(Unchanged in scope — §7.2, §7.3, §7.4, §9.1, §9.3. This is the phase where having two distinct financier parties, per Phase 0, becomes essential.)*

**Daml contract model** — identical to original spec: `FinancingRequest`, `Bid` (one active per financier, uniqueness-guarded), oracle verifier contract consuming Chainlink Data Streams, non-silent `Paused`/`StaticReferenceFallback` states, atomic `AwardChoice`.

**Environment-specific note:** The Chainlink oracle integration (§12) requires providing `meridian-oracle-1`'s Party ID to Chainlink's onboarding team so they can issue a `VerifierConfig` contract granting observer access — this is now a concrete, executable step since we have a real, stable Party ID for that persona from Phase 0, rather than a placeholder.

**Off-ledger services** — Oracle relay service and bid-comparison read model, unchanged from original spec, both authenticating to Seaport via the Phase 0 auth service.

**Frontend** — unchanged: Supplier Portal round configuration/bid comparison/award modules; Financier Desk deal flow inbox and manual bid submission.

**Testing (§14.3)** — unchanged in substance:
- Boundary tests (deadline edges, oracle-freshness edges), run against real Seaport ledger time via `/v2/state/ledger-end`.
- Negative-authorization tests: an uninvited financier's token genuinely cannot see the `FinancingRequest` — this is now testable adversarially in a way LocalNet couldn't fully validate, since we're exercising real party-scoped auth tokens against a real API.
- Full visibility-matrix rows for bid terms, funded pricing, oracle reference.
- Oracle fault-injection and atomicity tests, unchanged.

**Exit Criteria:** Unchanged from original — full round executes atomically; competing financier's inability to see a bid is proven via failed query against the live API; oracle outage produces a visibly labeled fallback state.

---

## Phase 3 — CIP-56 Cash Leg & Repayment/Default Lifecycle

*(Unchanged in scope — §7.8, §7.10, §9.1 steps 5–6, §9.2 step 4, §12.)*

**Daml contract model** — identical to original spec: CIP-56-compliant `Holding`/`TransferFactory`/`TransferInstruction`/`Allocation`, issued by `meridian-registry-1`; award choice extended for atomic DvP; `RepaymentChoice` with cryptographic proof-of-payoff; `OverdueTransition`.

**Environment note:** CIP-56 compliance testing against "a reference wallet/tooling implementation" (per original §14.3 requirement) is now meaningfully easier — Seaport's shared validator already exposes the standard Registry API endpoints (Transfer Factory, etc.) used by external token-transfer tooling, matching the same pattern documented for the Canton Network Token Standard generally. This lets Phase 3 testing use realistic external-wallet-shaped calls rather than only internal round-trips.

**Off-ledger services, Frontend, Testing, Exit Criteria** — unchanged from original spec.

---

## Phase 4 — Syndication Secondary Market

*(Unchanged in scope — §7.6, §9.4, §11.4.)*

**Daml contract model** — identical to original spec: `ParticipationInterest`, `SyndicationOffering` (reusing Phase 2's sealed-bid machinery, scoped to syndicate participants only — a second financier party, e.g. `meridian-financier-b`, is required here as the syndicate participant), lead-only cap table via `ILeadFinancierView`, contract-enforced waterfall distribution.

**Frontend, Testing, Exit Criteria** — unchanged from original spec, including the regression suite proving buyer/supplier views are provably unaffected by syndication — now runnable as a real adversarial query against Seaport rather than a simulated one.

---

## Phase 5 — Cross-Synchronizer Settlement *(Environment prerequisite added)*

**New prerequisite before any contract work in this phase begins:** Unlike Phases 1–4, this phase's entire purpose — proving settlement across genuinely separate synchronizers — **cannot be satisfied by the Seaport shared validator alone**, because all Phase 0–4 parties live on one synchronizer domain by construction. Before Phase 5 contract work starts:

- Stand up **Track B** from §0.0: either (a) request a second party/validator allocation from 5North specifically hosted on a distinct synchronizer if their sandbox supports it, or (b) pursue genuine DevNet sponsorship (SV sponsor → IP whitelisting, 2–7 days) for a second, independently-operated validator, per the standard Canton DevNet onboarding path.
- Allocate a **second buyer party** (e.g. `meridian-buyer-institutional-1`) on this second synchronizer specifically to play the "buyer on a private synchronizer" role from §9.5 — the original `meridian-buyer-1` on Seaport continues to serve the Topology 1 (single shared synchronizer) baseline case.
- Allocate a **second registry party** on a third domain if available, or reuse the second synchronizer, to exercise Topology 3's cash-leg-on-distinct-synchronizer case.

**Daml contract model / protocol work** — otherwise identical to the original spec: `SettlementFinality` field (`atomic`/`reassignment-mediated`/`escrow-fallback`), native Canton cross-domain reassignment for Topology 2, bounded auditable escrow fallback with automatic timeout unlock for Topology 3.

**Frontend, Testing, Exit Criteria** — unchanged from original spec, with the cross-synchronizer integration test environment (§14.3) now concretely meaning "Seaport domain + newly acquired second domain," rather than an abstract placeholder.

---

## Phase 6 — Agentic Bidding (Mandate-Constrained)

*(Unchanged from original plan — §7.9, §11.3. No environment-specific changes; runs against whichever validator(s) are live by this point.)*

**Daml contract model:** `BiddingMandate` template; `Bid` creation choice extended with hard mandate precondition.

**Off-ledger services:** Agent runtime authenticating via the Phase 0 auth-token pattern, carrying zero authority beyond the mandate precondition.

**Testing, Exit Criteria:** Unchanged — adversarial out-of-mandate bid must fail at the ledger.

---

## Phase 7 — Compliance, Regulator Views & Full Ops Console

*(Unchanged from original plan — §7.5, §10.4, §11.7, §14.2.)*

**Daml contract model:** `IRegulatorView` activated for `meridian-regulator-1` (allocated back in Phase 0, dormant until now); aggregate-only exposure rollups.

**Off-ledger services:** Real KYB/AML gateway now replaces the Phase 0 stub boundary — genuinely gating new party allocation, which matters more once Meridian moves beyond the shared Seaport sandbox toward real institutional onboarding.

**Frontend, Testing, Exit Criteria:** Unchanged from original spec.

---

## Phase 8 — Security Hardening, Full Test Suite, and Scalability

*(Unchanged from original plan — §13, §14.1.)*

**Work:** Mandatory security review across all packages; holding-merge tooling; load/performance testing (sub-10-second latency target, now measured against Seaport's and any additional validators' real network conditions rather than LocalNet's local-loopback speed — a materially more honest test); full visibility-matrix regression suite; KPI instrumentation (§16).

**Exit Criteria:** Unchanged from original spec.

---

## Phase 9 — TestNet Hardening → MainNet Readiness

*(Unchanged from original plan — full §9 journey testing, §17 risk-register closure, SCU dry run, final settlement-finality audit, MainNet migration runbook.)*

**One added note:** Since Phase 0–4 development happened on a third-party-operated sandbox (5North's Seaport), the MainNet migration runbook (§14 of original Phase 9) must explicitly include a **sandbox-to-self-hosted-infrastructure cutover step** for each organization — i.e., confirming that no part of the production topology continues to depend on Seaport once real institutional participants (their own validators) come online. This is a new, concrete line item in the runbook that the original plan's abstract "participant node cutover sequencing" language now needs to name explicitly.

---

## Summary of what changed vs. the original plan

| Area | Original plan | This revision |
|---|---|---|
| Phase 0 environment | Abstract "provision participant nodes," LocalNet-vs-DevNet decision left open | Concrete: Seaport DevNet sandbox, real OIDC auth flow, real Party ID allocation for all 8 personas |
| Infrastructure separation | Claimed as a Phase 0 exit criterion | Explicitly deferred and flagged (not silently dropped) — real separation now scoped to Phase 5 prep |
| Phases 1–4 | Assumed dedicated per-persona nodes | Confirmed workable on a shared validator, since Daml's privacy model — not physical separation — is what's actually being tested |
| Phase 5 | Assumed a second synchronizer "already provisioned in Phase 0" | Now explicitly requires new environment acquisition before contract work starts, since Seaport alone can't satisfy it |
| Phase 9 | Generic MainNet cutover | Adds explicit sandbox-dependency removal as a named runbook step |

Everything else — every Daml template, every choice, every interface view, every frontend module, every test category, every exit criterion tied to the PRD's §7–§17 — is carried forward **unchanged**, since the 5North access affects *where* Meridian is built, not *what* Meridian is.