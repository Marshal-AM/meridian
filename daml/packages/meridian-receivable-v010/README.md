# com-meridian-receivable v0.1.0 (Phase 1 baseline)

Frozen Phase 1 receivable templates (`Receivable`, `ReceivableProposal`) with `MarkFunded` and without financing modules.

Built alongside v0.2.0 in CI. Daml SCU `upgrades:` from v0.1.0 → v0.2.0 is **not** wired on the implementation package because interface view types live in the same package name and Canton rejects in-package interface upgrades. v0.2.0 adds Phase 2 fields with safe defaults; `testScuReceivableV010Compatibility` in `ReceivableTest.daml` asserts those defaults.

For SCU discipline on topology, see `meridian-core-v010` → `meridian-core` v0.2.0.

## v0.2.0 cash-leg upgrade (Phase 3)

Phase 3 bumps `com-meridian-receivable` to **0.2.0** with atomic DvP award (`AwardBid` + CIP-56 allocation), `RepayWithProof`, `RepaymentProof`, and `Overdue` state. Deploy **0.2.0 side-by-side** with this v0.1.0 baseline (no in-package SCU upgrade). Upload `com-meridian-cash` v0.1.0 and Splice CIP-56 API DARs before exercising cash settlement on DevNet.
