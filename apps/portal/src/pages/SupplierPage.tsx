import { useCallback, useEffect, useState } from "react";
import { api, useNotifications, type SupplierReceivable } from "../api";

export function SupplierPage() {
  const [receivables, setReceivables] = useState<SupplierReceivable[]>([]);
  const [proofs, setProofs] = useState<
    Array<{ receivableId: string; amount: string; settlementRef: string }>
  >([]);
  const [policies, setPolicies] = useState<unknown[]>([]);
  const [error, setError] = useState("");
  const [faceValue, setFaceValue] = useState("5000");
  const [currency, setCurrency] = useState("USD");
  const [dueDate, setDueDate] = useState("2026-12-31");
  const [consentGranted, setConsentGranted] = useState(true);
  const [maId, setMaId] = useState("MA-DEMO-001");

  const refresh = useCallback(async () => {
    try {
      const [r, p, portfolio] = await Promise.all([
        api.getSupplierReceivables(),
        api.getConsentPolicies(),
        api.getSupplierPortfolio().catch(() => ({ receivables: [], repaymentProofs: [] })),
      ]);
      setReceivables(r.receivables);
      setPolicies(p.policies);
      setProofs(portfolio.repaymentProofs ?? []);
      setError("");
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useNotifications("meridian-supplier", refresh);
  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handlePropose(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.proposeInvoice({ faceValue, currency, dueDate, consentGranted });
      await refresh();
    } catch (err) {
      setError(String(err));
    }
  }

  async function handleConsent(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.createConsentPolicy({
        masterAgreementId: maId,
        allowsAssignment: true,
      });
      await refresh();
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <div>
      <h1>Supplier Portal</h1>
      {error && <p className="error">{error}</p>}

      <h2>Issue Invoice</h2>
      <form onSubmit={handlePropose}>
        <label>
          Face Value
          <input value={faceValue} onChange={(e) => setFaceValue(e.target.value)} />
        </label>
        <label>
          Currency
          <input value={currency} onChange={(e) => setCurrency(e.target.value)} />
        </label>
        <label>
          Due Date
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </label>
        <label>
          <input
            type="checkbox"
            checked={consentGranted}
            onChange={(e) => setConsentGranted(e.target.checked)}
          />
          Grant assignment consent inline
        </label>
        <button type="submit">Propose Invoice to Buyer</button>
      </form>

      <h2>Standing Consent Policy</h2>
      <form onSubmit={handleConsent}>
        <label>
          Master Agreement ID
          <input value={maId} onChange={(e) => setMaId(e.target.value)} />
        </label>
        <button type="submit" className="secondary">
          Create Assignment Consent Policy
        </button>
      </form>

      <h2>Receivables ({receivables.length})</h2>
      {receivables.map((r) => (
        <div key={r.contractId} className="card">
          <strong>{r.receivableId}</strong>{" "}
          <span className="badge">{r.state}</span>
          <p>
            Buyer: {r.buyer.slice(0, 24)}… · {r.faceValue} {r.currency} · due {r.dueDate}
          </p>
          <ul>
            {r.lineItems.map((li, i) => (
              <li key={i}>
                {li.description}: {li.quantity} × {li.unitPrice}
              </li>
            ))}
          </ul>
        </div>
      ))}

      <h2>Repayment proofs ({proofs.length})</h2>
      {proofs.map((p) => (
        <div key={p.receivableId + p.settlementRef} className="card">
          <strong>{p.receivableId}</strong> — {p.amount} · ref {p.settlementRef}
        </div>
      ))}

      <h2>Consent Policies ({policies.length})</h2>
      <pre>{JSON.stringify(policies, null, 2)}</pre>
    </div>
  );
}
