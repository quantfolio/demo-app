// POST /api/v1/state/investor — create a new investor for the user's advisor.
//
// Run directly:    bun scripts/create-investor.ts
// Or import it:    import { createInvestor } from "./scripts/create-investor.ts";

export type CreateInvestorInput = {
  // required
  country: string; // ISO 3166-1 alpha-2
  investorType: "person" | "company";
  // optional
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  zipCode?: string;
  ssn?: string;
  externalId?: string;
  organizationNumber?: string;
  advisorId?: string;
  additionalData?: Record<string, unknown>;
  contacts?: Array<Record<string, unknown>>;
  kyc?: Record<string, unknown>;
};

export async function createInvestor(input: CreateInvestorInput) {
  const apiToken = Bun.env.API_TOKEN;
  if (!apiToken) {
    throw new Error("API_TOKEN is not set. Add it to .env");
  }

  const res = await fetch(
    "https://qap-api.test.deepalpha.dev/api/v1/state/investor",
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    },
  );

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(
      `createInvestor failed: ${res.status} ${res.statusText}\n${errBody}`,
    );
  }

  return res.json();
}

if (import.meta.main) {
  const result = await createInvestor({
    investorType: "person",
    country: "NO",
    name: "Scratch Investor 3",
    email: "scratch.investor.3@example.com",
    externalId: crypto.randomUUID(),
  });
  console.log(result);
}
