// DeepAlpha Public API client
// Source: https://api.test.deepalpha.dev/openapi.json (v1.30.0)
// Generated for Bun + TypeScript using native fetch.

export const DEFAULT_BASE_URL = "https://api.test.deepalpha.dev";

export interface DeepAlphaClientOptions {
  baseUrl?: string;
  /** Pre-obtained bearer token. If absent, supply clientId/clientSecret to auto-fetch. */
  accessToken?: string;
  /** OAuth2 client_credentials. Used to fetch an access token on demand. */
  clientId?: string;
  clientSecret?: string;
  /** Inject a custom fetch (e.g. for testing). Defaults to globalThis.fetch. */
  fetch?: typeof fetch;
}

export interface RequestOptions {
  /** Extra headers merged on top of defaults. */
  headers?: Record<string, string>;
  /** AbortSignal forwarded to fetch. */
  signal?: AbortSignal;
}

export class DeepAlphaApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = "DeepAlphaApiError";
    this.status = status;
    this.body = body;
  }
}

type Json = unknown;
type QueryValue = string | number | boolean | null | undefined | Array<string | number | boolean>;
type QueryParams = Record<string, QueryValue>;

const RISK_PATTERN = /^R(0[1-9]|[1-3][0-9]|40)$/;

export type RiskTolerance = string; // matches /^R(0[1-9]|[1-3][0-9]|40)$/
export type SessionStatus = "open" | "complete" | "cancelled" | "rejected";
export type SignatureStatus = "waiting" | "signed" | "declined";
export type Language = "no" | "da" | "de" | "en" | "fi" | "nl" | "sv";

// Request-body payloads. Kept as `unknown`-friendly aliases — see the OpenAPI
// component schema referenced in each comment for the full shape.
export type AssetClassAllocationSchema = Record<string, Json>;
export type CostPayload = Record<string, Json>;
export type ForecastV1Payload = Record<string, Json>;
export type OrderSummaryPayload = Record<string, Json>;
export type SimplePortfolioSchema = Record<string, Json>;
export type ScoringPayload = Record<string, Json>;
export type HistoricalReturnV2Payload = Record<string, Json>;
export type ForecastDepositsInputSchema = {
  currency_iso: string;
  start_year_month: string;
  end_year_month: string;
  deposit_end_year_month?: string;
  expected_return_annual_pct: number;
  initial_deposit_amount: number;
  monthly_deposit_amount?: number;
  quarterly_deposit_amount?: number;
  yearly_deposit_amount?: number;
  [key: string]: Json;
};
export type CustomDataAndMetaSchema = Record<string, Json>;
export type CustomDataAndMetaUpdateSchema = Record<string, Json>;
export type StateInvestorPayload = Record<string, Json>;
export type UpdateStateInvestorPayload = Record<string, Json>;
export type AccountPayload = Record<string, Json>;
export type InvestorSearchPayload = Record<string, Json>;
export type CreateStateSessionPayload = Record<string, Json>;
export type UpdateSessionStatusPayload = Record<string, Json>;
export type DownloadReportInputSchema = Record<string, Json>;
export type BulkStateInvestorsPayload = Record<string, Json>;
export type BulkStateSessionPayload = Record<string, Json>;
export type WebhookCreateSchema = Record<string, Json>;
export type WebhookUpdateSchema = Record<string, Json>;
export type SessionPatchRequestSchema = Record<string, Json>;
export type ClientAuthenticationResponse = { access_token?: string };

function buildQueryString(params?: QueryParams): string {
  if (!params) return "";
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const v of value) sp.append(key, String(v));
    } else {
      sp.append(key, String(value));
    }
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

function fillPath(template: string, params: Record<string, string>): string {
  return template.replace(/\{([^}]+)\}/g, (_, name) => {
    const v = params[name];
    if (v === undefined || v === null || v === "") {
      throw new Error(`Missing path parameter "${name}" for ${template}`);
    }
    return encodeURIComponent(v);
  });
}

export class DeepAlphaClient {
  readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly clientId?: string;
  private readonly clientSecret?: string;
  private accessToken?: string;
  private tokenPromise?: Promise<string>;

  constructor(options: DeepAlphaClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.accessToken = options.accessToken;
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  /** Replace the bearer token used for subsequent requests. */
  setAccessToken(token: string | undefined): void {
    this.accessToken = token;
    this.tokenPromise = undefined;
  }

  /** Validate a Risk Tolerance string matches the API's R01–R40 pattern. */
  static isValidRiskTolerance(value: string): value is RiskTolerance {
    return RISK_PATTERN.test(value);
  }

  // ---------------------------------------------------------------------------
  // Internal request plumbing
  // ---------------------------------------------------------------------------

  private async ensureAccessToken(): Promise<string> {
    if (this.accessToken) return this.accessToken;
    if (!this.clientId || !this.clientSecret) {
      throw new Error(
        "DeepAlphaClient: no accessToken set and clientId/clientSecret not provided",
      );
    }
    if (!this.tokenPromise) {
      this.tokenPromise = (async () => {
        const res = await this.getAccessToken({
          client_id: this.clientId!,
          client_secret: this.clientSecret!,
          grant_type: "client_credentials",
        });
        const token = res?.access_token;
        if (!token) throw new Error("DeepAlphaClient: auth response missing access_token");
        this.accessToken = token;
        return token;
      })();
    }
    return this.tokenPromise;
  }

  private async request<T = unknown>(
    method: string,
    path: string,
    opts: {
      query?: QueryParams;
      body?: Json;
      multipart?: FormData;
      auth?: boolean;
      reqOpts?: RequestOptions;
    } = {},
  ): Promise<T> {
    const url = `${this.baseUrl}${path}${buildQueryString(opts.query)}`;
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...(opts.reqOpts?.headers ?? {}),
    };

    let body: string | FormData | undefined;
    if (opts.multipart) {
      body = opts.multipart;
    } else if (opts.body !== undefined) {
      headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
      body = JSON.stringify(opts.body);
    }

    if (opts.auth !== false) {
      const token = await this.ensureAccessToken();
      headers.Authorization = `Bearer ${token}`;
    }

    const res = await this.fetchImpl(url, {
      method,
      headers,
      body,
      signal: opts.reqOpts?.signal,
    });

    const contentType = res.headers.get("content-type") ?? "";
    let parsed: unknown;
    if (contentType.includes("application/json")) {
      parsed = await res.json().catch(() => undefined);
    } else if (res.status === 204) {
      parsed = undefined;
    } else {
      parsed = await res.text().catch(() => undefined);
    }

    if (!res.ok) {
      throw new DeepAlphaApiError(
        res.status,
        `${method} ${path} failed: ${res.status} ${res.statusText}`,
        parsed,
      );
    }
    return parsed as T;
  }

  // ===========================================================================
  // Auth
  // ===========================================================================

  /** POST /v1/auth/token — exchange client credentials for an access token. */
  getAccessToken(
    body: { client_id: string; client_secret: string; grant_type: "client_credentials" },
    reqOpts?: RequestOptions,
  ): Promise<ClientAuthenticationResponse> {
    return this.request<ClientAuthenticationResponse>("POST", "/v1/auth/token", {
      body,
      auth: false,
      reqOpts,
    });
  }

  // ===========================================================================
  // Analyze (v1)
  // ===========================================================================

  /** POST /v1/analyze/asset-class-allocation */
  analyzeAssetClassAllocation(
    body: AssetClassAllocationSchema,
    query?: { namespace_id?: number | null; language?: string | null },
    reqOpts?: RequestOptions,
  ) {
    return this.request("POST", "/v1/analyze/asset-class-allocation", { body, query, reqOpts });
  }

  /** POST /v1/analyze/cost */
  analyzeCost(body: CostPayload, query?: { namespace_id?: number | null }, reqOpts?: RequestOptions) {
    return this.request("POST", "/v1/analyze/cost", { body, query, reqOpts });
  }

  /** POST /v1/analyze/forecast */
  analyzeForecast(
    body: ForecastV1Payload,
    query?: { namespace_id?: number | null },
    reqOpts?: RequestOptions,
  ) {
    return this.request("POST", "/v1/analyze/forecast", { body, query, reqOpts });
  }

  /** GET /v1/analyze/frontier */
  analyzeFrontier(
    query?: { namespace_id?: number | null; risk?: string | null; return?: string | null },
    reqOpts?: RequestOptions,
  ) {
    return this.request("GET", "/v1/analyze/frontier", { query, reqOpts });
  }

  /** POST /v1/analyze/order-summary */
  analyzeOrderSummary(
    body: OrderSummaryPayload,
    query?: { namespace_id?: number | null; language?: string | null },
    reqOpts?: RequestOptions,
  ) {
    return this.request("POST", "/v1/analyze/order-summary", { body, query, reqOpts });
  }

  /** POST /v1/analyze/risk-return */
  analyzeRiskReturn(
    body: SimplePortfolioSchema,
    query?: { namespace_id?: number | null },
    reqOpts?: RequestOptions,
  ) {
    return this.request("POST", "/v1/analyze/risk-return", { body, query, reqOpts });
  }

  /** POST /v1/analyze/scoring */
  analyzeScoring(
    body: ScoringPayload,
    query?: { namespace_id?: number | null },
    reqOpts?: RequestOptions,
  ) {
    return this.request("POST", "/v1/analyze/scoring", { body, query, reqOpts });
  }

  // ===========================================================================
  // Analyze (v2)
  // ===========================================================================

  /** POST /v2/analyze/historical-return */
  analyzeHistoricalReturnV2(
    body: HistoricalReturnV2Payload,
    query?: { namespace_id?: number | null },
    reqOpts?: RequestOptions,
  ) {
    return this.request("POST", "/v2/analyze/historical-return", { body, query, reqOpts });
  }

  // ===========================================================================
  // Information / Products / Categories
  // ===========================================================================

  /** GET /v1/products */
  listProducts(
    query?: { namespace_id?: number | null; language?: string | null; filter?: number | null },
    reqOpts?: RequestOptions,
  ) {
    return this.request("GET", "/v1/products", { query, reqOpts });
  }

  /** GET /v2/categories */
  listCategories(query?: { namespace_id?: number | null }, reqOpts?: RequestOptions) {
    return this.request("GET", "/v2/categories", { query, reqOpts });
  }

  /** GET /v2/categories/{category_id} */
  getCategory(
    categoryId: string,
    query?: { namespace_id?: number | null },
    reqOpts?: RequestOptions,
  ) {
    const path = fillPath("/v2/categories/{category_id}", { category_id: categoryId });
    return this.request("GET", path, { query, reqOpts });
  }

  // ===========================================================================
  // Risk
  // ===========================================================================

  /** GET /v1/risk/generic */
  getGenericRisk(
    query: { horizon: number; risk1: number; risk2?: number | null; experience?: number | null },
    reqOpts?: RequestOptions,
  ) {
    return this.request("GET", "/v1/risk/generic", { query, reqOpts });
  }

  /** GET /v1/risk/generic/config */
  getGenericRiskConfig(reqOpts?: RequestOptions) {
    return this.request("GET", "/v1/risk/generic/config", { reqOpts });
  }

  /** GET /v1/risk/generic/meta */
  getGenericRiskMeta(reqOpts?: RequestOptions) {
    return this.request("GET", "/v1/risk/generic/meta", { reqOpts });
  }

  // ===========================================================================
  // Robo (portfolio construction)
  // ===========================================================================

  /** GET /v1/robo/portfolio */
  getRoboPortfolio(
    query: {
      risk_tolerance: RiskTolerance;
      namespace_id?: number | null;
      optionals?: string[] | null;
      precision?: number;
    },
    reqOpts?: RequestOptions,
  ) {
    return this.request("GET", "/v1/robo/portfolio", { query, reqOpts });
  }

  /** GET /v1/robo/portfolio/meta */
  getRoboPortfolioMeta(query?: { namespace_id?: number | null }, reqOpts?: RequestOptions) {
    return this.request("GET", "/v1/robo/portfolio/meta", { query, reqOpts });
  }

  /** GET /v1/robo/selection */
  getRoboSelection(
    query?: {
      namespace_id?: number | null;
      categories?: string[] | null;
      filter?: number[] | null;
      no_instruments?: number;
    },
    reqOpts?: RequestOptions,
  ) {
    return this.request("GET", "/v1/robo/selection", { query, reqOpts });
  }

  /** GET /v1/robo/selection/meta */
  getRoboSelectionMeta(query?: { namespace_id?: number | null }, reqOpts?: RequestOptions) {
    return this.request("GET", "/v1/robo/selection/meta", { query, reqOpts });
  }

  // ===========================================================================
  // Documents (attachments)
  // ===========================================================================

  /** GET /v1/products/attachment */
  getAttachment(reqOpts?: RequestOptions) {
    return this.request("GET", "/v1/products/attachment", { reqOpts });
  }

  /** POST /v1/products/attachment — multipart/form-data upload. */
  uploadAttachment(form: FormData, reqOpts?: RequestOptions) {
    return this.request("POST", "/v1/products/attachment", { multipart: form, reqOpts });
  }

  // ===========================================================================
  // Calculations
  // ===========================================================================

  /** POST /v1/calculation/forecast_deposit */
  forecastDeposit(body: ForecastDepositsInputSchema, reqOpts?: RequestOptions) {
    return this.request("POST", "/v1/calculation/forecast_deposit", { body, reqOpts });
  }

  // ===========================================================================
  // Time series
  // ===========================================================================

  /** GET /v1/products/timeseries */
  listTimeseries(reqOpts?: RequestOptions) {
    return this.request("GET", "/v1/products/timeseries", { reqOpts });
  }

  /** POST /v1/products/timeseries */
  createTimeseries(body: CustomDataAndMetaSchema, reqOpts?: RequestOptions) {
    return this.request("POST", "/v1/products/timeseries", { body, reqOpts });
  }

  /** GET /v1/products/timeseries/{ticker} */
  getTimeseries(ticker: string, reqOpts?: RequestOptions) {
    const path = fillPath("/v1/products/timeseries/{ticker}", { ticker });
    return this.request("GET", path, { reqOpts });
  }

  /** PATCH /v1/products/timeseries/{ticker} */
  updateTimeseries(ticker: string, body: CustomDataAndMetaUpdateSchema, reqOpts?: RequestOptions) {
    const path = fillPath("/v1/products/timeseries/{ticker}", { ticker });
    return this.request("PATCH", path, { body, reqOpts });
  }

  // ===========================================================================
  // Events / Webhooks
  // ===========================================================================

  /** GET /v1/event/ */
  listEvents(reqOpts?: RequestOptions) {
    return this.request("GET", "/v1/event/", { reqOpts });
  }

  /** GET /v1/webhook */
  listWebhooks(
    query?: { "page[number]"?: number; "page[size]"?: number },
    reqOpts?: RequestOptions,
  ) {
    return this.request("GET", "/v1/webhook", { query, reqOpts });
  }

  /** POST /v1/webhook */
  createWebhook(body: WebhookCreateSchema, reqOpts?: RequestOptions) {
    return this.request("POST", "/v1/webhook", { body, reqOpts });
  }

  /** GET /v1/webhook/{webhook_id} */
  getWebhook(webhookId: string, reqOpts?: RequestOptions) {
    const path = fillPath("/v1/webhook/{webhook_id}", { webhook_id: webhookId });
    return this.request("GET", path, { reqOpts });
  }

  /** PATCH /v1/webhook/{webhook_id} */
  updateWebhook(webhookId: string, body: WebhookUpdateSchema, reqOpts?: RequestOptions) {
    const path = fillPath("/v1/webhook/{webhook_id}", { webhook_id: webhookId });
    return this.request("PATCH", path, { body, reqOpts });
  }

  /** DELETE /v1/webhook/{webhook_id} */
  deleteWebhook(webhookId: string, reqOpts?: RequestOptions) {
    const path = fillPath("/v1/webhook/{webhook_id}", { webhook_id: webhookId });
    return this.request("DELETE", path, { reqOpts });
  }

  /** POST /v1/webhook/{webhook_id}/test */
  testWebhook(webhookId: string, reqOpts?: RequestOptions) {
    const path = fillPath("/v1/webhook/{webhook_id}/test", { webhook_id: webhookId });
    return this.request("POST", path, { reqOpts });
  }

  // ===========================================================================
  // State: sessions (v1)
  // ===========================================================================

  /** GET /v1/session */
  listSessions(
    query?: {
      created_at_from?: string;
      created_at_to?: string;
      updated_at_from?: string;
      updated_at_to?: string;
      completed_at_from?: string;
      completed_at_to?: string;
      status?: SessionStatus;
      investor_id?: string;
      advisor_id?: string;
      page?: number;
      per_page?: number;
    },
    reqOpts?: RequestOptions,
  ) {
    return this.request("GET", "/v1/session", { query, reqOpts });
  }

  /** GET /v1/session/{advice_id} */
  getSession(adviceId: string, reqOpts?: RequestOptions) {
    const path = fillPath("/v1/session/{advice_id}", { advice_id: adviceId });
    return this.request("GET", path, { reqOpts });
  }

  /** PATCH /v1/session/{advice_id} */
  updateSession(adviceId: string, body: UpdateSessionStatusPayload, reqOpts?: RequestOptions) {
    const path = fillPath("/v1/session/{advice_id}", { advice_id: adviceId });
    return this.request("PATCH", path, { body, reqOpts });
  }

  /** POST /v1/state_session */
  createStateSession(body: CreateStateSessionPayload, reqOpts?: RequestOptions) {
    return this.request("POST", "/v1/state_session", { body, reqOpts });
  }

  /** DELETE /v1/session/{session_id} (soft delete) */
  deleteSession(sessionId: string, reqOpts?: RequestOptions) {
    const path = fillPath("/v1/session/{session_id}", { session_id: sessionId });
    return this.request("DELETE", path, { reqOpts });
  }

  /** PUT /v1/session/{session_id}/:cancel */
  cancelSession(sessionId: string, reqOpts?: RequestOptions) {
    const path = fillPath("/v1/session/{session_id}/:cancel", { session_id: sessionId });
    return this.request("PUT", path, { reqOpts });
  }

  /** POST /v1/session/{session_id}/copy */
  copySession(sessionId: string, reqOpts?: RequestOptions) {
    const path = fillPath("/v1/session/{session_id}/copy", { session_id: sessionId });
    return this.request("POST", path, { reqOpts });
  }

  // ===========================================================================
  // State: investors & accounts
  // ===========================================================================

  /** GET /v1/investor */
  listInvestors(
    query?: {
      externalId?: string;
      advisorId?: string;
      page?: number;
      pageSize?: number;
      queryName?: string;
    },
    reqOpts?: RequestOptions,
  ) {
    return this.request("GET", "/v1/investor", { query, reqOpts });
  }

  /** POST /v1/investor */
  createInvestor(body: StateInvestorPayload, reqOpts?: RequestOptions) {
    return this.request("POST", "/v1/investor", { body, reqOpts });
  }

  /** GET /v1/investor/{investor_id} */
  getInvestor(investorId: string, reqOpts?: RequestOptions) {
    const path = fillPath("/v1/investor/{investor_id}", { investor_id: investorId });
    return this.request("GET", path, { reqOpts });
  }

  /** PATCH /v1/investor/{investor_id} */
  updateInvestor(investorId: string, body: UpdateStateInvestorPayload, reqOpts?: RequestOptions) {
    const path = fillPath("/v1/investor/{investor_id}", { investor_id: investorId });
    return this.request("PATCH", path, { body, reqOpts });
  }

  /** DELETE /v1/investor/{investor_id} (soft delete) */
  deleteInvestor(investorId: string, reqOpts?: RequestOptions) {
    const path = fillPath("/v1/investor/{investor_id}", { investor_id: investorId });
    return this.request("DELETE", path, { reqOpts });
  }

  /** GET /v1/investor/deleted */
  listDeletedInvestors(reqOpts?: RequestOptions) {
    return this.request("GET", "/v1/investor/deleted", { reqOpts });
  }

  /** POST /v1/investor/search */
  searchInvestors(body: InvestorSearchPayload, reqOpts?: RequestOptions) {
    return this.request("POST", "/v1/investor/search", { body, reqOpts });
  }

  /** GET /v1/investor/{investor_id}/accounts */
  listInvestorAccounts(investorId: string, reqOpts?: RequestOptions) {
    const path = fillPath("/v1/investor/{investor_id}/accounts", { investor_id: investorId });
    return this.request("GET", path, { reqOpts });
  }

  /** POST /v1/investor/{investor_id}/accounts */
  createInvestorAccount(investorId: string, body: AccountPayload, reqOpts?: RequestOptions) {
    const path = fillPath("/v1/investor/{investor_id}/accounts", { investor_id: investorId });
    return this.request("POST", path, { body, reqOpts });
  }

  /** GET /v1/investor/{investor_id}/account/{account_id} */
  getInvestorAccount(investorId: string, accountId: string, reqOpts?: RequestOptions) {
    const path = fillPath("/v1/investor/{investor_id}/account/{account_id}", {
      investor_id: investorId,
      account_id: accountId,
    });
    return this.request("GET", path, { reqOpts });
  }

  /** PATCH /v1/investor/{investor_id}/account/{account_id} */
  updateInvestorAccount(
    investorId: string,
    accountId: string,
    body: AccountPayload,
    reqOpts?: RequestOptions,
  ) {
    const path = fillPath("/v1/investor/{investor_id}/account/{account_id}", {
      investor_id: investorId,
      account_id: accountId,
    });
    return this.request("PATCH", path, { body, reqOpts });
  }

  /** DELETE /v1/investor/{investor_id}/account/{account_id} */
  deleteInvestorAccount(investorId: string, accountId: string, reqOpts?: RequestOptions) {
    const path = fillPath("/v1/investor/{investor_id}/account/{account_id}", {
      investor_id: investorId,
      account_id: accountId,
    });
    return this.request("DELETE", path, { reqOpts });
  }

  // ===========================================================================
  // State: deleted (permanent removal)
  // ===========================================================================

  /** DELETE /v1/deleted/investor/{investor_id} */
  permanentlyDeleteInvestor(investorId: string, reqOpts?: RequestOptions) {
    const path = fillPath("/v1/deleted/investor/{investor_id}", { investor_id: investorId });
    return this.request("DELETE", path, { reqOpts });
  }

  /** DELETE /v1/deleted/investors/bulk_delete */
  bulkPermanentlyDeleteInvestors(body: BulkStateInvestorsPayload, reqOpts?: RequestOptions) {
    return this.request("DELETE", "/v1/deleted/investors/bulk_delete", { body, reqOpts });
  }

  /** DELETE /v1/deleted/session/{session_id} */
  permanentlyDeleteSession(sessionId: string, reqOpts?: RequestOptions) {
    const path = fillPath("/v1/deleted/session/{session_id}", { session_id: sessionId });
    return this.request("DELETE", path, { reqOpts });
  }

  /** DELETE /v1/deleted/sessions/bulk_delete */
  bulkPermanentlyDeleteSessions(body: BulkStateSessionPayload, reqOpts?: RequestOptions) {
    return this.request("DELETE", "/v1/deleted/sessions/bulk_delete", { body, reqOpts });
  }

  // ===========================================================================
  // Reports
  // ===========================================================================

  /** GET /v1/report/{investor_id}/{session_id} */
  getReport(investorId: string, sessionId: string, reqOpts?: RequestOptions) {
    const path = fillPath("/v1/report/{investor_id}/{session_id}", {
      investor_id: investorId,
      session_id: sessionId,
    });
    return this.request("GET", path, { reqOpts });
  }

  /** POST /v1/report/{investor_id}/{session_id}/download */
  downloadReport(
    investorId: string,
    sessionId: string,
    body: DownloadReportInputSchema,
    reqOpts?: RequestOptions,
  ) {
    const path = fillPath("/v1/report/{investor_id}/{session_id}/download", {
      investor_id: investorId,
      session_id: sessionId,
    });
    return this.request("POST", path, { body, reqOpts });
  }

  /**
   * POST /v1/report/{investor_id}/{session_id}/download — returns the raw
   * Response so the caller can stream binary (PDF) bytes to disk.
   * `request()` decodes non-JSON bodies as text, which corrupts binary.
   */
  async downloadReportPdf(
    investorId: string,
    sessionId: string,
    body: DownloadReportInputSchema,
    reqOpts?: RequestOptions,
  ): Promise<Response> {
    const path = fillPath("/v1/report/{investor_id}/{session_id}/download", {
      investor_id: investorId,
      session_id: sessionId,
    });
    const token = await this.ensureAccessToken();
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        Accept: "application/pdf",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(reqOpts?.headers ?? {}),
      },
      body: JSON.stringify(body),
      signal: reqOpts?.signal,
    });
    if (!res.ok) {
      const ct = res.headers.get("content-type") ?? "";
      const errBody = ct.includes("application/json")
        ? await res.json().catch(() => undefined)
        : await res.text().catch(() => undefined);
      throw new DeepAlphaApiError(
        res.status,
        `POST ${path} failed: ${res.status} ${res.statusText}`,
        errBody,
      );
    }
    return res;
  }

  // ===========================================================================
  // Advisors
  // ===========================================================================

  /** GET /v1/advisor */
  listAdvisors(query?: { email?: string; external_id?: string }, reqOpts?: RequestOptions) {
    return this.request("GET", "/v1/advisor", { query, reqOpts });
  }

  /** GET /v1/advisor/{advisor_id} */
  getAdvisor(advisorId: string, reqOpts?: RequestOptions) {
    const path = fillPath("/v1/advisor/{advisor_id}", { advisor_id: advisorId });
    return this.request("GET", path, { reqOpts });
  }

  // ===========================================================================
  // Advice sessions (v2)
  // ===========================================================================

  /** GET /v2/advice_session */
  listAdviceSessions(
    query?: {
      "filter[created_at][from]"?: string;
      "filter[created_at][to]"?: string;
      "filter[updated_at][from]"?: string;
      "filter[updated_at][to]"?: string;
      "filter[completed_at][from]"?: string;
      "filter[completed_at][to]"?: string;
      "filter[status]"?: SessionStatus;
      "filter[external_status]"?: string;
      "filter[signature_status]"?: SignatureStatus;
      "filter[investor_id]"?: string;
      "filter[advisor_id]"?: string;
      "page[number]"?: number;
      "page[size]"?: number;
    },
    reqOpts?: RequestOptions,
  ) {
    return this.request("GET", "/v2/advice_session", { query, reqOpts });
  }

  /** GET /v2/advice_session/{session_id} */
  getAdviceSession(sessionId: string, reqOpts?: RequestOptions) {
    const path = fillPath("/v2/advice_session/{session_id}", { session_id: sessionId });
    return this.request("GET", path, { reqOpts });
  }

  /** PATCH /v2/advice_session/{session_id} */
  updateAdviceSession(
    sessionId: string,
    body: SessionPatchRequestSchema,
    reqOpts?: RequestOptions,
  ) {
    const path = fillPath("/v2/advice_session/{session_id}", { session_id: sessionId });
    return this.request("PATCH", path, { body, reqOpts });
  }

  /** GET /v2/advice_session/{session_id}/advice_information */
  getAdviceInformation(
    sessionId: string,
    query?: { language?: Language },
    reqOpts?: RequestOptions,
  ) {
    const path = fillPath("/v2/advice_session/{session_id}/advice_information", {
      session_id: sessionId,
    });
    return this.request("GET", path, { query, reqOpts });
  }

  /** GET /v2/advice_session/{session_id}/goal */
  listAdviceGoals(sessionId: string, query?: { language?: Language }, reqOpts?: RequestOptions) {
    const path = fillPath("/v2/advice_session/{session_id}/goal", { session_id: sessionId });
    return this.request("GET", path, { query, reqOpts });
  }

  /** GET /v2/advice_session/{session_id}/goal/{goal_id} */
  getAdviceGoal(
    sessionId: string,
    goalId: string,
    query?: { language?: Language },
    reqOpts?: RequestOptions,
  ) {
    const path = fillPath("/v2/advice_session/{session_id}/goal/{goal_id}", {
      session_id: sessionId,
      goal_id: goalId,
    });
    return this.request("GET", path, { query, reqOpts });
  }

  /** GET /v2/advice_session/{session_id}/goal/{goal_id}/information */
  getGoalInformation(
    sessionId: string,
    goalId: string,
    query?: { language?: Language },
    reqOpts?: RequestOptions,
  ) {
    const path = fillPath("/v2/advice_session/{session_id}/goal/{goal_id}/information", {
      session_id: sessionId,
      goal_id: goalId,
    });
    return this.request("GET", path, { query, reqOpts });
  }

  /** GET /v2/advice_session/{session_id}/transactions */
  getAdviceTransactions(sessionId: string, reqOpts?: RequestOptions) {
    const path = fillPath("/v2/advice_session/{session_id}/transactions", {
      session_id: sessionId,
    });
    return this.request("GET", path, { reqOpts });
  }

  /** GET /v2/advice_session/{session_id}/financial_situation */
  getFinancialSituation(sessionId: string, reqOpts?: RequestOptions) {
    const path = fillPath("/v2/advice_session/{session_id}/financial_situation", {
      session_id: sessionId,
    });
    return this.request("GET", path, { reqOpts });
  }

  /** GET /v2/advice_session/{session_id}/risk_question */
  getRiskQuestion(sessionId: string, reqOpts?: RequestOptions) {
    const path = fillPath("/v2/advice_session/{session_id}/risk_question", {
      session_id: sessionId,
    });
    return this.request("GET", path, { reqOpts });
  }

  /** GET /v2/advice_session/{session_id}/sustainability */
  getSustainability(sessionId: string, reqOpts?: RequestOptions) {
    const path = fillPath("/v2/advice_session/{session_id}/sustainability", {
      session_id: sessionId,
    });
    return this.request("GET", path, { reqOpts });
  }

  /** GET /v2/advice_session/{session_id}/knowledge_and_experience */
  getKnowledgeAndExperience(sessionId: string, reqOpts?: RequestOptions) {
    const path = fillPath("/v2/advice_session/{session_id}/knowledge_and_experience", {
      session_id: sessionId,
    });
    return this.request("GET", path, { reqOpts });
  }
}

export default DeepAlphaClient;
