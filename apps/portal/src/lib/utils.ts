import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function truncateParty(partyId: string, head = 20): string {
  if (partyId.length <= head + 3) return partyId;
  return `${partyId.slice(0, head)}…`;
}

/** Milliseconds since epoch for sorting proposals (createdAt, else ID suffix). */
export function proposalSortTime(proposal: { proposalId: string; createdAt?: string }): number {
  if (proposal.createdAt) {
    const t = Date.parse(proposal.createdAt);
    if (!Number.isNaN(t)) return t;
  }
  const match = proposal.proposalId.match(/-(\d{10,})$/);
  return match ? Number(match[1]) : 0;
}

export function formatProposalCreatedAt(proposal: {
  proposalId: string;
  createdAt?: string;
}): string {
  const ms = proposalSortTime(proposal);
  if (!ms) return "—";
  return new Date(ms).toLocaleString();
}

/** Extract trailing numeric timestamp from ledger/UI ids (e.g. SYN-UI-1783…, STACK-1783…). */
export function idSortTime(id: string): number {
  const match = id.match(/-(\d{10,})$/);
  return match ? Number(match[1]) : 0;
}

export function formatIdTimestamp(id: string): string {
  const ms = idSortTime(id);
  if (!ms) return "—";
  return new Date(ms).toLocaleString();
}

export function sortByIdTimeDesc<T>(items: T[], getId: (item: T) => string): T[] {
  return [...items].sort((a, b) => idSortTime(getId(b)) - idSortTime(getId(a)));
}

export function sortByLedgerTimeDesc<T>(
  items: T[],
  getTime: (item: T) => string | undefined
): T[] {
  return [...items].sort((a, b) => {
    const ta = Date.parse(getTime(a) ?? "") || 0;
    const tb = Date.parse(getTime(b) ?? "") || 0;
    return tb - ta;
  });
}

/** Turn raw API / proxy errors into something readable in the UI. */
export function formatApiError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  let message = raw;
  try {
    const parsed = JSON.parse(raw) as { error?: string };
    if (parsed.error) message = parsed.error;
  } catch {
    // keep raw
  }
  if (message.includes("fetch failed")) {
    return "Backend indexer unreachable. Start the stack: pnpm indexer:platform and pnpm indexer:regulator (with .env sourced).";
  }
  return message;
}
