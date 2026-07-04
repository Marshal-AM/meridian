# Meridian
## Product Requirements Document & Idea Document

**A Privacy-Native Invoice Financing & Syndication Exchange on Canton Network**

---

### Document control

| Field | Detail |
|---|---|
| Product name | Meridian |
| Document type | PRD + Idea Document (combined, standalone) |
| Target network | Canton Network (TestNet → MainNet path) |
| Primary track | TradFi, RWA & Tokenized Assets |
| Secondary track alignment | Private DeFi & Capital Markets (sealed-bid pricing mechanism) |
| Status | Pre-build, fully specified, ready for engineering scoping |

---

## 1. Introduction

### 1.1 What this document is

This document is the single source of truth for Meridian — what it is, why it exists, who it is
for, exactly what it does, how it is built, and what "done" looks like for a production-ready,
fully testnet-deployable decentralized application on Canton Network. It consolidates every
product decision, architectural choice, and enhancement made through the full research and design
process, from the initial reading of Canton's documentation and ecosystem through four rounds of
technical deepening. Nothing from that process has been left out: the original sealed-bid
financing mechanism, the CIP-56-aligned cash leg, the interface-view privacy model, the
syndication secondary market, oracle-anchored pricing, and cross-synchronizer settlement are all
first-class, fully specified parts of this single product — not a base version plus optional
add-ons.

### 1.2 What Meridian is, in one paragraph

Meridian is a private invoice financing and syndication exchange built natively on Canton
Network. A supplier holding an unpaid invoice can convert it into immediate cash by running a
sealed-bid financing round among invited financiers — with pricing anchored to live, verified
market-reference rates — and the winning financier can subsequently sell down participation in
that funded position to other financiers on a private secondary market. Every step settles with
Canton's atomic multi-party commit, and every piece of commercially sensitive data — competing
bids, financing economics, the identity of a buyer who needed financing at all — is visible only
to the parties who have a genuine right to see it, enforced by the ledger itself rather than by
an access-control layer bolted on top of a transparent database.

### 1.3 Why this document exists

Canton Network is built around a proposition that no other public chain makes credibly: privacy
and interoperability are not in tension, because privacy is expressed in the data model itself
(Daml's `signatory`/`observer`/interface-view system enforced by the synchronizer), not layered on
afterward. Most blockchain products either give up privacy for composability (public chains) or
give up composability for privacy (private, siloed databases). Meridian exists to prove — with a
real, production-shaped financial workflow — that Canton lets an institution have both, at a point
in the market (SME and mid-market receivables financing) that is presently stuck running over
email, PDF invoices, and manually reconciled spreadsheets despite being a multi-trillion-dollar
global market.

---

## 2. Background & Research Context

### 2.1 What Canton Network is

Canton is a privacy-enabled, public Layer 1 blockchain where transactions are visible only to
their genuine stakeholders and multi-party workflows settle atomically. Its core technical
properties, as established through direct research of the network's documentation and ecosystem:

- **Parties, not addresses.** Every actor on Canton is a `Party` — a durable, hosted identity
  bound to a participant node — not an anonymous, ephemeral wallet address. This maps naturally
  onto real institutional relationships: one supplier, one buyer, one financier, one registry.
- **Sub-transaction privacy by construction.** In Daml (Canton's smart contract language), a
  contract's `signatory` and `observer` declarations *are* its visibility rules. The synchronizer
  distributes encrypted transaction views only to the participant nodes of parties who are
  genuine stakeholders of that specific view. Two contracts created in the same transaction can
  have entirely disjoint audiences.
- **Atomic multi-party settlement.** A single Daml transaction can fetch, exercise, and create
  contracts spanning multiple parties' authority in one indivisible, all-or-nothing commit. This
  is what allows delivery-versus-payment, novation, and assignment to happen without sagas,
  reconciliation jobs, or a window of inconsistent state.
- **The Canton Network Token Standard (CIP-56).** Canton's answer to a universal asset interface:
  `Holding`, `TransferFactory`, `TransferInstruction`, and `Allocation` interfaces let any
  compliant wallet or application discover and move any compliant asset — tokenized deposits,
  regulated stablecoins, Canton Coin — without bespoke point-to-point integration, while natively
  supporting atomic DvP.
- **A network of networks.** Canton is explicitly designed to let an organization operate its own
  private synchronizer for sensitive internal workflows while still transacting atomically with
  counterparties on the shared Global Synchronizer — a materially different model from a single
  shared chain that every participant must fully trust.
- **Governance and ecosystem.** The network is stewarded in part by the Global Synchronizer
  Foundation under the Linux Foundation umbrella, with the Canton Foundation supporting ecosystem
  growth (including hackathon tracks such as this one).

### 2.2 Who is already building on Canton

Research into recent, dated network activity surfaced a consistent pattern: regulated financial
institutions moving real receivables, deposits, and securities where counterparty and pricing
privacy is a legal or commercial necessity, not a preference.

- **DTCC × Digital Asset** — tokenizing a subset of DTC-custodied U.S. Treasuries on Canton via
  DTCC's ComposerX, targeted for 2026.
- **HSBC** — completed a tokenized-deposit pilot on Canton.
- **S&P** — tokenized a Treasurys index on Canton.
- **Tradeweb** — executed on-chain U.S. Treasury repo trades on Canton using CIP-56, with real
  capital and real counterparties.
- Canton's own stated flagship use cases: **24x7 on-chain financing**, **crypto derivatives**,
  and **private stablecoin payments**.

Meridian is designed to sit directly beneath this layer: the receivables that ultimately back
corporate balance sheets, financed and syndicated with the same privacy guarantees the
institutional-scale deployments above rely on, but accessible to the mid-market and SME suppliers
who today have no equivalent infrastructure at all.

### 2.3 The problem, precisely stated

Invoice financing (factoring, receivables discounting) is one of the largest and oldest forms of
trade finance, and it is still run almost entirely over email, PDF attachments, and manually
reconciled spreadsheets. The reasons it hasn't moved on-chain are structural, not merely a lack of
tooling:

1. **Suppliers** cannot get honest price discovery if competing financiers can see each other's
   bids — bidders shade toward whatever the last visible bid was, destroying the auction dynamic
   that should benefit the supplier.
2. **Buyers** do not want their supplier relationships, payment terms, or the mere fact that a
   supplier needed financing exposed to anyone — including their own other suppliers, who might
   infer negotiating leverage from it.
3. **Financiers** will not disclose their discount-rate books to competitors, but do need *some*
   buyer credit signal to price a bid responsibly — full anonymity is as unworkable as full
   transparency.
4. **Everyone** needs settlement finality: the moment a financier funds an invoice, the
   receivable's assignment and the payment obligation must change together, atomically — a world
   where cash moved but the assignment didn't (or vice versa) is unacceptable operational risk.
5. Once a position is funded, **financiers** often want to lay off part of their exposure
   (syndicate it) for risk-management reasons — without ever involving the buyer or supplier in
   that secondary transaction, and without other syndicate participants seeing each other's entry
   pricing.

A fully public, transparent ledger makes every one of these worse. A private, siloed database
(today's status quo) makes trust-minimization and interoperability worse. Canton is the only
environment researched that credibly offers both properties simultaneously — which is the entire
reason this product is being built where it is being built.

---

## 3. Vision & Mission

### 3.1 Vision

A world where a supplier can turn any legitimate receivable into working capital within hours,
at a price set by genuine competition rather than relationship or opacity — without a single
counterparty in the transaction ever learning more about the deal than they have a legitimate
right to know.

### 3.2 Mission

Build the reference implementation of privacy-preserving, institution-grade receivables financing
on Canton Network: a system where every privacy guarantee is enforced by the ledger itself, every
price is anchored to verifiable market data, every settlement is atomic wherever the network
topology allows it, and every architectural choice mirrors how real trade finance and loan
syndication already work legally — just without the operational friction, trust assumptions, and
information leakage of the status quo.

### 3.3 Product principles

- **Privacy is structural, not cosmetic.** No feature ships if its confidentiality guarantee is
  enforced only by UI filtering rather than by the ledger's own authorization and visibility
  rules.
- **Composability without leakage.** Layering a secondary market, an oracle feed, or a
  cross-domain settlement path onto the core workflow must never widen who can see what in the
  primary transaction.
- **No silent degradation.** Any time the system cannot deliver its strongest guarantee (e.g.,
  single-transaction atomicity across synchronizers, or oracle-verified pricing), it must say so
  explicitly to the user rather than quietly falling back.
- **Model real legal and commercial structures, not blockchain-native shortcuts.** Syndication is
  modeled as true participation interest, mirroring real loan syndication law, precisely because
  the shortcut (reassigning the receivable to many small holders) would break the buyer-privacy
  guarantee.

---

## 4. Product Overview

### 4.1 The core idea

A supplier tokenizes an invoice jointly with their buyer. When the supplier wants early payment,
they open a **sealed-bid financing round**, inviting a specific set of financiers. Each invited
financier can see that a round exists and can see an anonymized buyer credit profile, but cannot
see any other financier's bid — ever, not even after the round closes. Bids are priced relative to
a live, cryptographically verified reference rate rather than an arbitrary number, so every bid is
auditable against real market conditions at the moment it was placed. The supplier awards the
round; award and receivable reassignment happen in a single atomic transaction. The buyer is told
only who to pay and how much — never who financed the invoice, at what discount, or that a
competitive round happened at all, unless the buyer itself is the party choosing to disclose that.

After funding, the winning ("lead") financier can **syndicate** part of their position — selling
participation interests to other financiers through another sealed-bid round — without the buyer
or original supplier ever seeing that this secondary transaction occurred, and without one
syndicate participant seeing another's entry price.

Wherever supplier, buyer, financiers, and the registry issuing the cash-leg asset are not all
hosted on the same Canton synchronizer — a common, expected situation for real banks and
corporates who require infrastructure under their own control — Meridian settles atomically where
the topology allows it, and uses Canton's native cross-domain reassignment or an explicit,
clearly-labeled escrow fallback where it does not, always surfacing which settlement guarantee
applies to a given trade.

### 4.2 Product pillars

1. **Sealed-bid primary financing** — competitive, private price discovery on receivables.
2. **Interface-view privacy architecture** — one underlying receivable, many typed, party-scoped
   views, matching how Canton's own Token Standard is built.
3. **Oracle-anchored pricing** — every bid and every syndication trade priced relative to a
   verified, timestamped reference rate, not an arbitrary figure.
4. **Syndication secondary market** — financiers can lay off risk without breaking the primary
   market's privacy guarantees.
5. **Cross-synchronizer settlement** — the workflow works honestly across Canton's "network of
   networks" topology, not just within a single shared domain.

---

## 5. Target Users & Personas

| Persona | Who they are | What they need from Meridian |
|---|---|---|
| **Supplier** | SME or mid-market corporate with outstanding receivables from creditworthy buyers | Fast, competitively-priced access to working capital without damaging buyer relationships or revealing financing needs publicly |
| **Buyer** | The corporate or institutional counterparty obligated to pay an invoice | Zero operational burden beyond "pay the right party, the right amount, by the right date"; no visibility into or involvement with their suppliers' financing arrangements |
| **Financier (Primary bidder)** | Bank, credit fund, or specialty lender bidding to fund receivables | Fair, private access to deal flow; ability to price competitively without revealing strategy to rivals; confidence that anchoring data is real and current |
| **Financier (Syndicate participant)** | A financier buying a slice of another financier's already-funded position | Access to risk-adjusted yield without direct sourcing relationships; confidentiality of their own entry price from other participants |
| **Registry/Token Issuer** | Bank or regulated entity issuing the tokenized cash instrument (tokenized deposit, stablecoin, Canton Coin) used to settle trades | A settlement counterpart that correctly implements CIP-56 so their instrument is natively usable without custom integration |
| **Oracle Provider (Chainlink)** | Publisher of verified reference-rate data on Canton | A consuming application that correctly validates freshness and provenance of its reports |
| **Compliance / Regulator (optional per deployment)** | An oversight party in jurisdictions requiring it | Scoped, read-only visibility into aggregate exposure and counterparty jurisdictions, without commercial pricing detail |
| **Platform Operator (Meridian)** | The entity operating discovery/UX infrastructure and app-provider functions | The ability to run a viable business without ever becoming a custodian of trust — deliberately minimal on-ledger footprint |

---

## 6. Core Value Propositions

- **For suppliers:** same-week cash on receivables, priced by genuine competition, with zero
  disclosure of financing activity to buyers or the broader market.
- **For buyers:** no operational or reputational change whatsoever from a supplier financing an
  invoice — they simply learn who to pay.
- **For financiers:** access to deal flow priced against real market data, with cast-iron
  assurance that competitors cannot see their bids, and a path to risk-manage funded positions
  through syndication.
- **For the Canton ecosystem:** a concrete, production-shaped demonstration that a chain can be
  simultaneously private, atomic, and interoperable — the exact narrative institutional partners
  like DTCC, HSBC, and Tradeweb are already proving at securities scale, shown here at the
  receivables-financing layer that sits underneath their balance sheets.

---

## 7. Feature Set (Complete)

### 7.1 Invoice tokenization & issuance
A supplier and buyer jointly create a tokenized receivable carrying line items, face value,
currency, due date, and a standing consent flag governing whether the receivable may later be
assigned to a financier. Large buyers may pre-authorize assignment at a master-agreement level to
remove per-invoice friction.

### 7.2 Sealed-bid financing rounds
The supplier selects an eligible invoice, chooses which financiers to invite, sets an
oracle-anchored pricing band, and opens a time-boxed round. Only invited financiers know the round
exists at all. Each financier can privately submit exactly one active bid at a time; no financier
can ever see another's bid, before or after the round closes.

### 7.3 Oracle-anchored pricing
Every financing round's pricing band, and every bid submitted against it, is expressed relative to
a live, cryptographically verified reference rate (via Chainlink Data Streams on Canton) rather
than an absolute number. Bids referencing a stale or missing rate report are rejected at the
contract level. If the oracle feed is unavailable, the round explicitly pauses or falls back to a
clearly labeled, non-oracle-verified static reference — never silently.

### 7.4 Atomic award & assignment
The supplier accepts a winning bid; the receivable's reassignment to that financier and the bid's
acceptance happen in one indivisible transaction. There is no intermediate state where one has
happened without the other. The buyer's original standing consent (given at issuance) is what
authorizes this without requiring the buyer's live participation in the award transaction.

### 7.5 Interface-view privacy model
The receivable is a single underlying contract exposing multiple distinct, typed views to
different classes of stakeholder: a buyer sees only payee, amount, and due date; the supplier sees
full bid history and economics; each financier sees only their own bid and, if they win, their own
position; an optional regulator view sees jurisdiction and aggregate exposure without commercial
pricing. Every new data field the product ever adds must be explicitly assigned to exactly one of
these views at design time.

### 7.6 Syndication / secondary market
After winning a round, a financier may offer part or all of their funded position to other
financiers as a **participation interest** — a pass-through economic right to repayment proceeds,
distinct from legal ownership of the receivable (payee-of-record does not change, preserving the
buyer's single-payee experience). Syndication itself runs through the same sealed-bid,
oracle-anchored mechanism as the primary market. Neither the buyer nor the original supplier can
see that syndication occurred; syndicate participants cannot see each other's entry pricing;
only the lead financier sees the full participation cap table.

### 7.7 Cross-synchronizer settlement
Where supplier, buyer, financiers, and the cash-leg registry are not all hosted on the same
Canton synchronizer — an expected, common situation for institutions requiring infrastructure
under their own control — Meridian settles using the strongest guarantee the topology allows:
single-transaction atomicity where a common synchronizer exists, native Canton contract
reassignment where a buyer sits on their own private domain, or an explicit, bounded, auditable
escrow fallback where no common domain exists for the cash leg. Every trade is labeled with its
actual settlement-finality classification so institutional users can correctly assess risk.

### 7.8 Repayment & default handling
At maturity, the buyer pays the current payee of record (the lead financier, if the invoice was
funded) directly. The funded-invoice contract deliberately carries no pricing fields, so the buyer
never learns the discount rate applied. If a due date passes without repayment, the receivable
transitions to an overdue state, notifying the party or parties currently holding the payment
right, without the product attempting to model collections or dispute-resolution logic beyond that
state transition.

### 7.9 Agentic bidding (mandate-constrained)
Financiers may register an automated bidding agent whose behavior is bounded by an
on-ledger-enforced mandate (maximum exposure, minimum acceptable spread, eligible counterparty
profiles). The mandate is enforced as a contract precondition the agent's bids must satisfy —
meaning the ledger itself, not the agent's code, is what prevents a bid outside the mandate from
ever being accepted.

### 7.10 CIP-56 native interoperability
Every asset Meridian issues or moves — the cash leg, and participation interests — is shaped to
implement or closely mirror Canton's Token Standard interfaces (`Holding`, `TransferFactory`,
`TransferInstruction`, `Allocation`), with participation interests carrying explicit legal-nature
metadata so any compliant wallet renders them correctly as a pass-through interest rather than
outright ownership.

---

## 8. System Architecture & Components

### 8.1 Layered architecture

- **Daml smart contract layer** — the canonical, on-ledger source of truth for every business
  rule in this document: invoice issuance, financing rounds, bidding, award, syndication,
  repayment, and mandate enforcement. Deployed as versioned packages following Canton's Smart
  Contract Upgrade discipline so that new fields or interface views can be added without breaking
  existing counterparties' integrations.
- **Participant nodes** — one per organization: the supplier's bank or validator, the buyer's
  treasury infrastructure, each financier's desk, the oracle provider, and each registry issuing a
  settlement asset. Meridian does not operate participant nodes on behalf of counterparties in
  production; each organization runs or contracts its own validator, consistent with how real
  institutions maintain control of their own infrastructure.
- **Synchronizer layer** — the Global Synchronizer as the default, lowest-friction shared domain,
  plus optional bank-operated private synchronizers for counterparties with data-residency or
  bilateral-only requirements.
- **Off-ledger services** — an indexer/read layer, a notification service, an oracle relay, an
  identity/KYC gateway, and the web application backends for each persona surface. None of these
  services hold ledger authority; each only reads what its operating party is already entitled to
  see via the Ledger API, meaning every off-ledger service is rebuildable purely by replaying its
  own party's event stream.

### 8.2 Domain model (conceptual)

- **Receivable** — the tokenized invoice, implementing distinct interface views for buyer,
  supplier, financier, and (optionally) regulator audiences; carries lifecycle state from
  `Issued` through `PostedForBid`, `Funded`, `PartiallySyndicated`, to `Repaid` or `Defaulted`.
- **Financing Request** — the private, invitation-scoped auction room for a single receivable,
  carrying an oracle-anchored pricing band and a time-boxed deadline.
- **Bid** — a sealed offer from one invited financier, visible only to that financier and the
  supplier, referencing the specific oracle report its pricing was anchored against.
- **Funded Receivable** — the post-award state, carrying no pricing information visible to the
  buyer, and tracking any syndication activity through a cap table visible only to the lead
  financier.
- **Participation Interest** — a pass-through economic right sold by a lead financier to a
  syndicate participant, distinct in legal nature from direct receivable ownership, sold through
  the same sealed-bid, oracle-anchored mechanism as the primary market.
- **Cash Token / Holding** — the tokenized settlement asset (tokenized deposit, regulated
  stablecoin, or Canton Coin) implementing Canton's Token Standard interfaces, issued by a
  registry party.
- **Bidding Mandate** — an on-ledger, contract-enforced constraint set an agentic bidder's
  submissions must satisfy.

### 8.3 Privacy & visibility matrix

| Data | Supplier | Buyer | Bidding Financier (own bid) | Other Financiers | Lead Financier (post-award) | Syndicate Participant (own slice) | Oracle Provider | Regulator (optional) |
|---|---|---|---|---|---|---|---|---|
| Invoice line items / face value | Yes | Yes | Yes, once invited | No | Yes | No | No | Aggregate only |
| Buyer identity | Yes | Yes | No pre-award (anonymized profile only); yes if winner | No | Yes | No | No | Jurisdiction only |
| Own bid terms | Yes (sees all bids) | No | Yes | No | n/a | n/a | No | No |
| Other financiers' bid terms | Yes | No | No | No | n/a | n/a | No | No |
| Funded receivable pricing | Yes | No | n/a | No | Yes | No | No | Aggregate only |
| Syndication cap table | No (sees "funded" only) | No | n/a | No | Yes, in full | No, own slice only | No | Aggregate only |
| Oracle report reference | Yes | No | Yes, own bid's reference | No | Yes | Yes, own trade's reference | Yes, publishes | Yes |
| Settlement domain / finality status | Yes | Yes, payee and finality only | Yes | No | Yes | Yes | No | Yes |

Every cell in this matrix must correspond to an automated, on-ledger test assertion before
release — both the positive case (a party can see what it should) and the negative case (a party
genuinely cannot see what it should not), verified against the ledger itself rather than inferred
from application-layer behavior.

### 8.4 Cross-synchronizer settlement model

Three settlement topologies are explicitly supported and disclosed:

1. **Single shared synchronizer** — supplier, buyer, and financiers all connected to the Global
   Synchronizer. Settlement is one atomic transaction. This is the default onboarding path.
2. **Buyer on a private/bank-operated synchronizer** — the financing round and award among
   supplier and financiers settle atomically as above; the assignment notice reaching the buyer's
   domain uses Canton's native cross-domain contract reassignment (unassign from one synchronizer,
   assign to the other), preserving full authorization history rather than bridging through a
   wrapped-asset pattern.
3. **Cash-leg registry on a distinct synchronizer** — where the tokenized cash asset's issuing
   registry does not share a synchronizer with the receivable, the funding payment settles via the
   Token Standard's Allocation pattern against a common domain wherever one is reachable, or via a
   bounded, auditable, explicitly-labeled escrow fallback with automatic timeout unlock where no
   common domain exists.

Every trade's actual settlement-finality classification (atomic / reassignment-mediated /
escrow-fallback) is recorded immutably and surfaced to users — this determines real settlement
risk and must never be presented ambiguously.

---

## 9. End-to-End User Journeys

### 9.1 Journey — Supplier obtains financing

1. Supplier issues an invoice; buyer co-signs, setting standing assignment consent.
2. Supplier opens a financing round, inviting selected financiers, setting an oracle-anchored
   pricing band and deadline.
3. Financiers privately submit bids anchored to the current reference rate; supplier sees all
   bids ranked by effective all-in rate, normalized against the reference rate at comparison time.
4. Supplier awards the round; award and reassignment settle atomically (or per the applicable
   cross-synchronizer path), with the settlement-finality classification recorded.
5. Supplier receives the advance in tokenized cash instantly upon settlement.
6. At maturity, supplier is notified the invoice has been repaid to the financier of record, with
   cryptographic proof of payoff, without needing to chase the buyer directly.

### 9.2 Journey — Buyer fulfills an obligation

1. Buyer co-signs a new invoice from a supplier, setting or relying on standing assignment
   consent.
2. Buyer's dashboard shows only outstanding obligations: amount, due date, current payee. No
   visibility into whether, or to whom, the invoice was financed or syndicated.
3. If the receivable was assigned to a financier, the buyer's dashboard updates the payee of
   record — via direct update (same synchronizer) or a cross-domain reassignment notice (different
   synchronizer) — with no economic detail disclosed either way.
4. At maturity, buyer initiates repayment to the current payee of record; repayment settles per
   the applicable settlement topology.

### 9.3 Journey — Financier bids and wins

1. Financier receives notification of an invitation to a financing round, including the
   anonymized buyer credit profile and the oracle-anchored pricing band.
2. Financier (manually or via a mandate-constrained bidding agent) fetches the current reference
   rate and submits a sealed bid.
3. Financier has no visibility into whether they won until the supplier's award transaction
   settles.
4. If awarded, financier becomes payee of record, receives the receivable in their portfolio
   view, and may subsequently open a syndication offering to lay off part of the position.

### 9.4 Journey — Financier participates in syndication

1. Syndicate participant is invited to a lead financier's syndication offering, seeing only the
   offered amount and an oracle-anchored yield band — never the buyer's or supplier's identity in
   detail beyond what the lead financier chooses to disclose.
2. Participant submits sealed interest; allocation and cash movement settle atomically.
3. At each repayment or accrual event, the participant receives their pro-rata share of proceeds,
   distributed by contract-enforced waterfall logic rather than a manual process dependent on the
   lead financier's discretion.
4. Participant's portfolio view shows only their own position; no visibility into other
   participants' entry pricing or share size.

### 9.5 Journey — Cross-synchronizer settlement (institutional buyer)

1. A large corporate buyer operates its own private, bank-hosted synchronizer for treasury
   obligations, connected to Meridian via its own participant node.
2. The financing round and award proceed exactly as in §9.1 among supplier and financiers, fully
   atomic on the Global Synchronizer.
3. The assignment notice reaching the buyer's private domain executes as a native Canton contract
   reassignment, not an off-chain message or custodial bridge.
4. The buyer's dashboard clearly labels this trade as "reassignment-mediated" rather than
   "single-transaction atomic," allowing the buyer's treasury operations team to correctly
   understand the settlement guarantee in effect.

---

## 10. Frontend / Application Modules

Meridian ships four distinct, persona-scoped application surfaces, each authenticating against the
Ledger API as a specific party and rendering only that party's permitted interface views. A single
shared design system underlies all four so the product feels like one coherent institutional
platform rather than four disconnected tools.

### 10.1 Supplier Portal
- **Invoice issuance module** — create and co-sign invoices with buyers; manage standing
  assignment consent per buyer relationship.
- **Financing round configuration module** — select eligible invoices, choose invited financiers,
  set oracle-anchored pricing bands and round deadlines.
- **Bid comparison dashboard** — view all submitted bids, ranked by oracle-normalized effective
  rate, with each bid's anchoring reference rate and timestamp visible for audit.
- **Award & settlement module** — select a winning bid, trigger atomic award, and see the
  resulting settlement-finality classification for that trade.
- **Portfolio & repayment tracker** — monitor outstanding, funded, and repaid invoices; view
  cryptographic proof of payoff on repayment, without visibility into any syndication activity
  downstream of the sale.

### 10.2 Buyer Portal
- **Obligations dashboard** — a clean list of outstanding invoices: amount, due date, current
  payee of record — nothing else.
- **Co-signature / consent module** — review and sign new invoices, set or review standing
  assignment consent policy.
- **Repayment initiation module** — pay the current payee of record; view settlement-finality
  labeling (atomic vs. cross-domain) for transparency without exposing pricing.
- **Assignment notice history** — an audit trail of payee-of-record changes over time, with zero
  economic detail.

### 10.3 Financier Desk
- **Deal flow inbox** — invitations to financing rounds, showing anonymized buyer credit profiles
  and oracle-anchored pricing bands.
- **Bid submission module** — manual bid entry, or configuration and monitoring of an automated,
  mandate-constrained bidding agent.
- **Position management dashboard** — awarded positions, accrual tracking, repayment status.
- **Syndication module** — for lead financiers: create syndication offerings, manage the
  participation cap table, and administer the repayment-proceeds waterfall; for participants:
  browse syndication invitations, submit sealed interest, and track owned participation interests.
- **P&L view** — scoped strictly to the viewing financier's own positions, never a competitor's.

### 10.4 Ops & Compliance Console (internal / operator-facing)
- **Settlement-finality monitor** — real-time view of atomic vs. reassignment-mediated vs.
  escrow-fallback trade rates across the platform.
- **Oracle health monitor** — feed freshness, deviation alerts, fallback-policy activation events.
- **Regulator-view administration** — provisioning of optional, jurisdiction-scoped compliance
  observer parties, strictly limited to aggregate exposure and jurisdiction data.
- **Explicitly excluded from this console:** any visibility into individual bid economics or
  syndication pricing — the platform operator's on-ledger footprint is deliberately minimized to
  match Meridian's "never a custodian of trust" positioning.

---

## 11. Complete User Stories

### 11.1 Supplier stories
- As a supplier, I want to jointly issue a tokenized invoice with my buyer, so that the receivable
  is a verifiable, mutually-agreed asset from the moment it exists.
- As a supplier, I want to choose exactly which financiers are invited to bid on my invoice, so
  that I control who even knows I am seeking financing.
- As a supplier, I want every bid I receive to be anchored to a live, verified reference rate, so
  that I can trust the pricing is grounded in real market conditions rather than an arbitrary
  number a financier chose.
- As a supplier, I want to compare bids on a normalized, oracle-adjusted basis, so that bids
  submitted at different times within a multi-day round remain fairly comparable.
- As a supplier, I want the award and reassignment of my receivable to happen in a single,
  indivisible transaction, so that there is never a moment where my invoice is assigned without
  the financier's payment obligation being equally locked in.
- As a supplier, I want to know, for every financed invoice, whether settlement was fully atomic
  or required a cross-domain fallback, so that I understand the actual finality guarantee I am
  relying on.
- As a supplier, I want cryptographic proof that my buyer repaid the financier, so that I can
  close my books on the receivable with confidence, without needing to contact my buyer directly.
- As a supplier, I want zero visibility requirement into what happens to my receivable after it is
  funded, so that a financier's decision to syndicate the position never becomes my operational
  concern.

### 11.2 Buyer stories
- As a buyer, I want to co-sign invoices from my suppliers with a simple, low-friction process, so
  that I am not burdened by the financing mechanics happening on the other side of the
  transaction.
- As a buyer, I want to set standing consent for receivables assignment once, at a master-agreement
  level, so that I don't need to review and approve every individual invoice's financing.
- As a buyer, I want my outstanding obligations dashboard to show only who to pay, how much, and
  by when, so that I never see — and am never burdened by — pricing or bidder information that is
  none of my business.
- As a buyer, I want to know clearly whether a payment I'm making settles atomically or via a
  cross-domain path, so that my treasury team can correctly plan around the settlement guarantee.
- As a buyer, I want assurance that no other party — including my own other suppliers — can see
  that I have used receivables financing at all, so that my negotiating position is never
  compromised by a financing decision made entirely by my supplier.

### 11.3 Financier (primary bidder) stories
- As a financier, I want to see an anonymized buyer credit profile before bidding, so that I can
  price risk responsibly without needing the buyer's full identity pre-award.
- As a financier, I want absolute certainty that no competing financier can see my bid — before,
  during, or after the round — so that I never have to shade my pricing defensively.
- As a financier, I want my bid to be automatically rejected by the contract itself if it
  references a stale or missing oracle rate, so that I cannot accidentally submit an unanchored
  bid that would be indefensible on audit.
- As a financier, I want to configure an automated bidding agent constrained by an on-ledger
  mandate, so that I can participate in high-volume deal flow without manual intervention, while
  being certain the ledger itself — not my agent's code — enforces my risk limits.
- As a financier, I want to become the clear, single payee of record immediately upon winning a
  round, so that my position is unambiguous and enforceable from the moment of award.

### 11.4 Financier (syndicate participant) stories
- As a syndicate participant, I want to browse syndication offerings from lead financiers I trust,
  so that I can access risk-adjusted receivables yield without needing my own origination
  relationships.
- As a syndicate participant, I want my entry price to remain invisible to other participants in
  the same syndication round, so that my strategy is never exposed to competitors I might face in
  future rounds.
- As a syndicate participant, I want my participation interest to be clearly labeled, in any
  wallet I use, as a pass-through economic interest rather than direct receivable ownership, so
  that I never misunderstand my legal position relative to the buyer.
- As a syndicate participant, I want repayment proceeds distributed to me automatically via
  contract-enforced logic, so that I am not exposed to the lead financier's discretion or
  operational reliability for something the ledger itself can guarantee.

### 11.5 Registry / token issuer stories
- As a registry operator, I want my tokenized cash instrument to implement Canton's Token Standard
  interfaces correctly, so that Meridian and any other compliant application can use it without
  custom integration work on my part.

### 11.6 Oracle provider stories
- As the oracle provider, I want Meridian to correctly validate the freshness and provenance of
  every reference-rate report it consumes, so that bids and trades genuinely reflect verified
  market data rather than stale or forged figures.

### 11.7 Compliance / regulator stories
- As a compliance observer, I want scoped, read-only visibility into aggregate exposure and
  counterparty jurisdictions for my remit, so that I can fulfill oversight obligations without
  gaining access to commercially sensitive pricing that is none of my concern.

### 11.8 Platform operator stories
- As the platform operator, I want my own on-ledger footprint minimized by design, so that
  Meridian's core trust proposition — that the platform itself is never a custodian of anyone's
  sensitive data — remains true even as the product scales.
- As the platform operator, I want a real-time view of settlement-finality classifications across
  all trades, so that I can monitor the health of cross-synchronizer settlement paths and
  proactively address any rise in escrow-fallback usage.

---

## 12. Technology Stack

| Layer | Technology | Rationale |
|---|---|---|
| Smart contracts | Daml, deployed as versioned packages under Canton's Smart Contract Upgrade discipline | Native language of Canton; `signatory`/`observer`/interface-view constructs are the actual privacy primitive, not a layer on top of it |
| Asset interoperability | Canton Network Token Standard (CIP-56): `Holding`, `TransferFactory`, `TransferInstruction`, `Allocation` interfaces | Ensures cash legs and participation interests are usable by any compliant wallet without bespoke integration |
| Oracle data | Chainlink Data Streams, consumed via an on-Canton verifier contract | Provides cryptographically verified, timestamped reference-rate data for anchoring bid pricing |
| Synchronization / settlement | Global Synchronizer (default shared domain) plus optional bank-operated private synchronizers, connected via Canton's native contract reassignment protocol | Enables the cross-synchronizer settlement model described in §8.4 |
| Participant infrastructure | One validator/participant node per organization (self-hosted or via a supported validator-as-a-service partner) | Matches real institutional requirements for infrastructure control and data residency |
| Off-ledger indexer & read layer | Rebuildable purely from each operating party's own Ledger API event stream | Ensures no off-ledger service is ever a source of truth, preserving the integrity of the on-ledger privacy model |
| Identity / KYC | Off-ledger KYC/KYB gateway integrated with participant topology management | Keeps identity verification separate from, but properly gating, on-ledger party allocation |
| Frontend applications | Four persona-scoped web applications (Supplier Portal, Buyer Portal, Financier Desk, Ops & Compliance Console) sharing one design system, authenticating per-party against the Ledger API | Ensures each user only ever renders the interface views their own party is entitled to |

---

## 13. Non-Functional Requirements

- **Latency:** sub-10-second perceived latency for bid submission and award actions under
  realistic testnet-equivalent load.
- **Availability:** 99.9% target for off-ledger services (indexer, notifications, oracle relay),
  with the explicit understanding that the ledger layer's correctness never depends on these
  services' uptime.
- **Auditability:** every bid, award, and syndication trade stores an immutable reference to the
  oracle report it was anchored against and the settlement-finality classification it achieved.
- **Scalability:** UTXO/holding hygiene (holding-merge routines targeting low active-holding
  counts per party) to control validator storage and network traffic costs at production scale.
- **Transparency of guarantees:** no feature may present a weaker settlement or privacy guarantee
  as if it were the strongest available guarantee; every trade's actual classification must be
  visible to its counterparties.

---

## 14. Security, Compliance & Testing Requirements

### 14.1 Security
- Mandatory security review of every choice body for authority-smuggling risk (a choice creating
  contracts under a signatory's authority beyond what its controller should be able to trigger)
  and unconstrained-delegation patterns before each release.
- Mandate-constrained agentic bidding (§7.9) must be enforced as an on-ledger contract
  precondition, never as an off-ledger risk check that could be bypassed by a compromised or
  buggy agent.

### 14.2 Compliance
- KYB/AML performed off-ledger prior to any new party's topology transaction being submitted.
- Optional, strictly-scoped regulator/compliance observer parties per jurisdiction, added only as
  observers on a dedicated compliance interface view — never granted controller rights over any
  choice, unless a specific deployment contractually requires a separately-scoped halt capability.
- Data residency requirements are met via the bank-operated private synchronizer path, not via a
  configuration toggle on the shared path — this must be a genuine topology decision, not a
  cosmetic setting.

### 14.3 Testing
- **Unit-level Daml Script tests** for every choice, including negative-authorization tests (a
  non-stakeholder or wrong-party attempting to exercise a choice must fail), boundary tests
  (round deadlines, oracle-freshness window edges), and full visibility-matrix coverage per §8.3.
- **Cross-synchronizer integration test environment**, standing up at minimum a Global
  Synchronizer-equivalent domain, an independent bank-operated synchronizer hosting a buyer party,
  and a distinct registry domain for the cash leg — run on every release candidate.
- **Oracle fault-injection tests:** stale report, missing report, extreme deviation, full feed
  outage, verifying the non-silent fallback policy activates correctly in each case.
- **Syndication waterfall tests:** multiple participants, partial repayment, default scenarios,
  and proceeds-distribution correctness under rounding.
- **Load and performance tests** simulating realistic per-party holding counts to validate
  holding-merge tooling under production-like volume.

---

## 16. Success Metrics (KPIs)

- Number of financing rounds completed; average time from round open to award; average number of
  bidders per round (a proxy for genuine price-discovery health).
- Percentage of funded positions syndicated within 30 days (secondary-market health indicator).
- Oracle-deviation incidents where a bid was accepted outside its verified rate band — target:
  zero, enforced structurally rather than aspirationally.
- Cross-synchronizer settlement success rate (single-transaction atomic and reassignment-mediated)
  versus escrow-fallback rate — a declining fallback rate over time indicates improving network
  topology coverage.
- Buyer-side friction metrics: time from invoice co-signature to repayment initiation, confirming
  that financing activity genuinely never surfaces as operational burden to buyers.

---

## 17. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Cross-synchronizer settlement complexity delays initial launch | Explicitly phased to Phase 4; the baseline product (Phase 1) is fully usable and valuable on a single shared synchronizer alone |
| Oracle feed outage halts financing rounds | Documented, non-silent fallback policy; rounds pause or clearly relabel rather than silently degrading pricing integrity |
| Syndication participation interests misread by wallets as direct receivable ownership | Explicit legal-nature metadata enforced at the token metadata layer, so compliant wallets render the distinction correctly |
| Validator storage/traffic cost growth at scale | Mandated holding-merge tooling, continuously monitored via the Ops & Compliance Console |
| Authority-smuggling or delegation bugs in contract choice logic | Mandatory, structured security review pass before every release |
| Buyer or supplier reluctance to adopt due to unfamiliarity with tokenized workflows | Frontend design deliberately mirrors familiar invoice/payment mental models (§10.1, §10.2) rather than exposing raw ledger concepts to non-financier personas |

---

## 18. Glossary

- **Canton / Canton Network** — a privacy-enabled, public Layer 1 blockchain where transactions
  are visible only to genuine stakeholders and multi-party workflows settle atomically.
- **Daml** — Canton's native smart contract language, in which `signatory`, `observer`, and
  interface-view constructs directly express a contract's privacy rules.
- **Synchronizer** — Canton's transaction-coordination layer, sometimes referred to as a "domain."
- **Global Synchronizer** — the shared, default synchronizer most Canton participants connect to.
- **Reassignment** — Canton's native mechanism for moving a contract's domain assignment between
  synchronizers while fully preserving its authorization history.
- **CIP-56 / Token Standard** — Canton's standardized set of interfaces (`Holding`,
  `TransferFactory`, `TransferInstruction`, `Allocation`) for representing and moving assets
  interoperably across compliant applications and wallets.
- **Interface view** — a typed, partial projection of a contract's underlying data, exposed via a
  Daml interface to a specific class of stakeholder, distinct from the contract's full data.
- **DvP (Delivery-versus-Payment)** — the atomic exchange of an asset leg and a payment leg such
  that either both occur or neither does.
- **Sealed-bid auction** — a competitive bidding process in which no bidder can see any other
  bidder's offer, before or after the auction closes.
- **True sale vs. participation** — two distinct legal structures for transferring credit
  exposure; a true sale changes the legal payee of record, while a participation interest creates
  a pass-through economic right to proceeds without changing who the underlying obligor pays.
- **Bidding mandate** — an on-ledger, contract-enforced constraint set that bounds what an
  automated bidding agent is permitted to submit, enforced by the ledger rather than the agent's
  own code.

---

## 19. Closing Statement

Meridian is deliberately not a generic "tokenize an invoice" demo. Every architectural decision in
this document — the interface-view privacy model, the true-sale-versus-participation distinction
in syndication, the non-silent oracle fallback policy, and the honestly-labeled cross-synchronizer
settlement topology — exists because a real institutional counterparty would ask about it, and a
real institutional counterparty would refuse to use a product that hand-waved the answer. This
document is written to be buildable exactly as specified, end to end, into a production-ready
decentralized application on Canton Network, with no functionality assumed, deferred, or left
implicit anywhere in the workflow it describes.
