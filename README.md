# demo_App

A Bun scratchpad for exploring the **DeepAlpha / Quantfolio Advisory Platform (QAP) API**.

It runs a single merged server that combines:

- A **mock OAuth/SSO provider** (via `oauth2-mock-server`) with switchable advisor accounts.
- A **two-pane dashboard** — pick an advisor on the left, watch a live communication log of API calls on the right.
- Demo flows for advisor lookup, investor + advice-session creation, and a webhook listener that downloads session report PDFs.

## Requirements

- [Bun](https://bun.sh) (v1+)
- DeepAlpha API credentials (`CLIENT_ID` / `CLIENT_SECRET`)

## Installation

```sh
# 1. Install dependencies
bun install

# 2. Configure environment
cp .env.example .env
# then edit .env and fill in CLIENT_ID, CLIENT_SECRET, PUBLIC_ISSUER_URL

# 3. Start the server
bun select_and_lookup.ts
```

The server listens on **http://localhost:9090** (mock OAuth on `9091`). Open the dashboard at the root URL.

## Routes

| Route | Purpose |
|-------|---------|
| `GET /` | Two-pane dashboard |
| `GET /pick?user=N` | Select an advisor and run lookup |
| `POST /session` | Create an investor + advice session |
| `POST /listener` | Webhook receiver (downloads report PDFs) |
| `GET /log`, `GET /events` | Communication log + live SSE feed |
| `GET /report?session=ID` | Report PDF download |
| `GET /login`, `/authorize`, `/debug` | Mock SSO flow |

## Tests

```sh
bun test
```
