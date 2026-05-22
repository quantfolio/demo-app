// Create an investor account via POST /v1/investor/{investor_id}/accounts.
// Builds a randomized AccountPayload, then sends it with DeepAlphaClient.

import { DeepAlphaClient, type AccountPayload } from "./client.ts";

/** Largest amount the API should ever see (inclusive). */
const MAX_AMOUNT = 100_000_000;

/** Random multiple of 100, from 0 up to and including MAX_AMOUNT. */
function randomAmount(): number {
  const steps = MAX_AMOUNT / 100; // 1_000_000 possible values, plus 0
  return Math.floor(Math.random() * (steps + 1)) * 100;
}

/** Random 8-digit account number (10000000–99999999). */
function randomAccountNumber(): string {
  return String(Math.floor(10_000_000 + Math.random() * 90_000_000));
}

/** Build a randomized account payload for the given investor. */
export function buildAccountPayload(investorId: string): AccountPayload {
  return {
    accountName: "Test Account",
    accountNumber: randomAccountNumber(),
    externalId: "externalId",
    cashAmount: randomAmount(),
    country: "NO",
    currency: "NOK",
    investorId,
    monthlyDeposit: randomAmount(),
    positions: [
      { isin: "NO0012445404", name: "KLP Global", amount: randomAmount(), shares: 500, type: "fund" },
      { isin: "NO0010072937", name: "Holberg Likviditet", amount: randomAmount(), shares: 500, type: "fund" },
      { isin: "NO0012443664", name: "KLP Fremvoksende Markeder", amount: randomAmount(), shares: 250, type: "fund" },
    ],
    type: "ACCOUNT",
    vendor: "vendor",
    vendorId: "vendorID",
  };
}

/**
 * Build a randomized account payload for `investorId` and POST it to
 * /v1/investor/{investor_id}/accounts. Pass an existing client to reuse its
 * token; otherwise one is created from CLIENT_ID / CLIENT_SECRET in .env.
 */
export function createInvestorAccount(
  investorId: string,
  client?: DeepAlphaClient,
): Promise<unknown> {
  const api = client ?? defaultClient();
  return api.createInvestorAccount(investorId, buildAccountPayload(investorId));
}

/** Construct a DeepAlphaClient from environment credentials. */
function defaultClient(): DeepAlphaClient {
  const clientId = Bun.env.CLIENT_ID;
  const clientSecret = Bun.env.CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Missing CLIENT_ID / CLIENT_SECRET in .env");
  }
  return new DeepAlphaClient({ clientId, clientSecret });
}

// Run directly: `bun public_api/create-account.ts <investor_id>`
if (import.meta.main) {
  const investorId = Bun.argv[2];
  if (!investorId) {
    console.error("Usage: bun public_api/create-account.ts <investor_id>");
    process.exit(1);
  }
  const result = await createInvestorAccount(investorId);
  console.log(JSON.stringify(result, null, 2));
}
