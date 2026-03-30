# Plumbing Tools API

A small ElevenLabs-ready API for an emergency plumbing voice agent.

It uses a Google Sheet as the source of truth and exposes focused tool endpoints so the agent can:

- read company context
- search service types
- apply emergency triage rules
- log calls back into the sheet

## Architecture

Google Sheet tabs:

- Company
- ServiceAreas
- Services
- EmergencyRules
- IntakeFlow
- FAQs
- SMS
- CallLogs

Runtime flow:

1. ElevenLabs agent calls one of your server tools
2. This API reads the relevant Google Sheet tabs using a service account
3. The API returns structured JSON for the agent
4. The agent uses the result to respond, send the right SMS, or escalate
5. At the end of the call the agent calls `log-call`

## Convention: POST tool routes (normalisation standard)

**Default for all new `POST /api/*` routes** that are invoked as **agent tools** (ElevenLabs or similar): use the same pattern as `escalate-human`, `send-sms`, and `log-call`, **unless** there is a strong reason to skip it (document that reason next to the route).

1. **`normalize…Input(raw: unknown)`** in `src/tool-payload-normalize.ts` — trim strings; treat empty strings as absent for optional fields where it helps callers; map legacy / alias field names; generate ids (e.g. `callId`) when omitted.
2. **Canonical Zod schema** (e.g. in `src/logic.ts`) — validate **after** normalisation only.
3. **`parseCanonical(schema, normalized)`** from `src/tool-validation.ts` — throws **`HttpValidationError`** → HTTP **400** with `{ "error": "Validation failed", "fields": { … } }` (handled in `src/lib/route-error.ts` and Express).
4. **Handler** in `src/api-handlers.ts`; the App Router `route.ts` should stay thin (call handler + `jsonError`).

**Exceptions today (intentional):**

| Route | Why |
|--------|-----|
| `POST /api/rules-applicable` | Historical: validates raw body with Zod only; can be migrated to this pattern when touched. |
| `POST /api/escalation-webhook-demo` | Outbound webhook target / demo sink, not an ElevenLabs tool body. |
| `POST /api/debug/*` | Debugging only. |

New POST tools should **not** be added to the exceptions list without a short rationale in code or README.

## Required environment variables

Copy `.env.example` to `.env` and fill in the values (or define the same keys in Vercel for production).

**Core (required)**

- `PORT` — optional on Vercel (platform sets it); used for local `dev:express`
- `X_ELEVENLABS_SECRET_PLUMBINGPRO` (preferred) or legacy `X_ELEVENLABS_SECRET`
- `GOOGLE_SHEET_ID`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_PRIVATE_KEY`

**Optional**

- `SHEET_DATA_CACHE_TTL_SECONDS` — if greater than `0`, sheet reads are cached for that many seconds (reduces Google API calls under load).
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` — required for `POST /api/send-sms` to send real SMS.
- `ESCALATION_WEBHOOK_URL` — JSON POST target for `POST /api/escalate-human`.
- `ESCALATION_WEBHOOK_SECRET` — if set, sent as header `x-escalation-secret` on the webhook request.
- `ESCALATION_TRANSFER_NUMBER` — returned to the agent as a PSTN hint (e.g. on-call mobile).

## Local setup

```bash
npm install
npm run dev
```

This runs **Next.js** (site + `/api/*` on the same origin). The homepage documents endpoints and checks `/api/health`.

Optional: run the original Express server only (no website):

```bash
npm run dev:express
```

## Deploy on Vercel

1. Push the repo to GitHub/GitLab/Bitbucket and import the project in [Vercel](https://vercel.com/new).
2. Framework preset: **Next.js** (default). Build: `next build`, output: Next default.
3. In **Project → Settings → Environment Variables**, add every key from [Required environment variables](#required-environment-variables) (and any optional keys you use). Use **Production** (and Preview if you want preview deployments to work against a test sheet).
4. For `GOOGLE_PRIVATE_KEY`, paste the full PEM and replace real newlines with `\n` in the Vercel value field (same as local `.env`).
5. Deploy, then set your ElevenLabs tool URLs to `https://<your-project>.vercel.app/api/...` with header **`x-elevenlabs-secret-plumbingpro`** (same string as `X_ELEVENLABS_SECRET_PLUMBINGPRO` / legacy `X_ELEVENLABS_SECRET` in Vercel). Use a **literal** `https://…vercel.app/...` URL unless ElevenLabs explicitly supports variable interpolation in that field.

Secrets should live in Vercel (or your secret manager), not in the repo. `.env` is gitignored; use `.env.example` as the checklist.

## Smoke test (local)

With a valid `.env`, start the app (`npm run dev`) in one terminal, then:

```bash
npm run smoke
```

Optional: `SMOKE_BASE_URL`, `SMOKE_COMPANY_ID`, `SMOKE_SKIP_LOG_CALL=1`, `SMOKE_SKIP_SEND_SMS=1`, `SMOKE_SMS_TO`, `SMOKE_SMS_TEMPLATE_ID`.

## Verify ElevenLabs vs this API

1. **Tool creation vs runtime** — ElevenLabs usually **does not** call your server when you save a tool. If tools save but the agent fails, debug **runtime** (URL, headers, secret, sheet access), not “tool creation.”
2. **URL env / variable syntax** — If the tool URL field **does not** substitute secrets or env vars, you may get a bad host or 404. Use a **literal** `https://<project>.vercel.app/api/...` until you confirm their interpolation rules.
3. **Literal Vercel URL** — From a terminal:  
   `curl -sS -i -H "x-elevenlabs-secret-plumbingpro: <SECRET>" "https://<project>.vercel.app/api/company-context?companyId=rapidflow_london"`  
   Expect **200** + JSON if Google credentials and sheet access are correct; **401** if the header or secret is wrong.
4. **What the backend checks** — Header **`x-elevenlabs-secret-plumbingpro`** must equal **`X_ELEVENLABS_SECRET_PLUMBINGPRO`** (or legacy **`X_ELEVENLABS_SECRET`**).
5. **401 response** — Wrong/missing header or wrong secret → **401** with JSON: `error`, `reason: "missing_or_invalid_secret_header"`, and `header` set to the expected header name.

### Temporary auth debugging

Set **`DEBUG_PLUMBING_AUTH=1`** (Vercel env + redeploy). Then:

- Failed auth responses include a **`debug`** object: `hasHeader`, `hasEnv`, `headerLength`, `envLength`, `matches`, `expectedEnvKey`, `looksLikeUnresolvedPlaceholder` (true if the header still contains `{{secret:…}}` — ElevenLabs did not substitute the secret).
- Function logs include a JSON line `[plumbing-auth:next] …` (no secret values).
- **`GET /api/debug/auth-plumbing`** returns the same diagnostic shape for the incoming request (404 when the flag is off).

Remove the flag when finished.

**Manual check with real secret** (replace `YOUR_SECRET`):

```bash
curl -i "https://plumbing-tools-api.vercel.app/api/company-context?companyId=rapidflow_london" \
  -H "x-elevenlabs-secret-plumbingpro: YOUR_SECRET"
```

## Endpoints

### Agent-facing payloads (normalisation layer)

The routes below follow the project **[POST tool route convention](#convention-post-tool-routes-normalisation-standard)**:

- **`POST /api/escalate-human`**, **`POST /api/send-sms`**, **`POST /api/log-call`**

Behaviour:

- Trims all strings and treats **empty strings as missing** for optional fields (where each normaliser defines).
- **Generates `callId`** if missing or blank: `call_<timestamp>_<random>` (on those routes).
- Accepts **legacy field names** during transition (e.g. `callerPhone` or `phone`, `to` or `phone`, `templateId` or `messageType`).
- Validates with **Zod after** normalisation. On failure, returns **`400`** with:

```json
{ "error": "Validation failed", "fields": { "address": "Required for emergency escalation" } }
```

**`GET`** tools are unchanged. **`POST /api/rules-applicable`** is not yet on the shared normaliser (see exceptions table above).

### `GET /api/company-context`

Use when the agent needs approved company facts.

Query params:

- `companyId` optional

Returns:

- company name
- service area summary
- hours
- payment methods
- pricing policy
- gas policy
- safety disclaimer

### `GET /api/services-search`

Use when the caller describes an issue and you want likely service matches.

Query params:

- `companyId` optional
- `query` required

### `POST /api/rules-applicable`

This is the main triage tool.

Body example:

```json
{
  "companyId": "rapidflow_london",
  "issueSummary": "Water is pouring from a pipe under the kitchen sink",
  "postcode": "N19 3AB",
  "waterActive": true,
  "electricsRisk": false,
  "sewageRisk": false,
  "onlyToiletUnusable": false,
  "noWater": false,
  "vulnerablePerson": false
}
```

Returns:

- matched services
- priority
- emergency flag
- whether to transfer now
- immediate instruction
- recommended action
- service area result
- SMS template
- relevant approved FAQs

### `GET /api/intake-flow`

Returns ordered intake steps from the `IntakeFlow` tab for sheet-driven questioning.

Query params:

- `companyId` optional
- `askWhen` optional — when set, keeps rows where `ask_when` is empty, `always`, `all`, or matches (case-insensitive substring).

### `POST /api/send-sms`

Sends an SMS using Twilio. Returns `503` if Twilio env vars are not set.

**Preferred agent fields:** `companyId`, `callId` (optional — auto-generated if blank), `phone`, `messageType`, `name`, `bookingLink`, `issueSummary`, optional `postcode`.  
**Legacy:** `to` instead of `phone`, `templateId` instead of `messageType` (both still supported).

**`messageType` → sheet `templateId` mapping:**

| messageType | templateId |
|-------------|------------|
| `emergency_confirmation` | SMS01 |
| `callback_confirmation` | SMS02 |
| `booking_link` | SMS03 |
| `redirect_notice` | SMS04 |

If **`messageText`** is set, it is used as the message body (with the same `{{name}}`, `{{issueSummary}}`, etc. placeholders). Otherwise the body is built from the **`SMS`** tab template for `templateId`. **`bookingLink`** in the request overrides the company default from the sheet when substituting `{{bookingLink}}`.

**Required after normalisation:** `companyId`, `callId`, `to`, `templateId`.

Preferred body example:

```json
{
  "companyId": "rapidflow_london",
  "callId": "call_123",
  "phone": "+447700900123",
  "messageType": "emergency_confirmation",
  "name": "Jordan Yussuf",
  "bookingLink": "https://www.example.com/book",
  "issueSummary": "Burst pipe with water near electrics"
}
```

```bash
curl -sS -X POST "$BASE/api/send-sms" \
  -H "Content-Type: application/json" \
  -H "x-elevenlabs-secret-plumbingpro: $SECRET" \
  -d '{"companyId":"rapidflow_london","phone":"+447700900123","messageType":"emergency_confirmation","name":"Jordan","issueSummary":"Test"}'
```

Template text may use placeholders: `{{name}}`, `{{issueSummary}}`, `{{issue}}`, `{{postcode}}`, `{{callId}}`, `{{companyName}}`, `{{bookingLink}}`.

### `POST /api/escalate-human`

Notifies an on-call system via webhook and/or returns a transfer number. Returns `503` if neither `ESCALATION_WEBHOOK_URL` nor `ESCALATION_TRANSFER_NUMBER` is configured.

**Preferred agent fields:** `companyId`, `callId` (optional — auto-generated if blank), `name`, `phone`, `postcode`, **`address`** (required), `issueSummary`, `priority`, `reason`.  
**Legacy:** `callerPhone` instead of `phone`.

**Required after normalisation:** `companyId`, `callId`, `name`, `callerPhone` (from `phone` or `callerPhone`), `issueSummary`, `priority`, `reason`, **`address`** (full street address for emergency escalation).

The webhook payload includes **`postcode`** and **`address`** when set.

Preferred body example:

```json
{
  "companyId": "rapidflow_london",
  "callId": "call_123",
  "name": "Jordan Yussuf",
  "phone": "07476811532",
  "postcode": "N19 3NB",
  "address": "89 Hazelville Road, Islington",
  "issueSummary": "Active flooding with sewage and electrics at risk",
  "priority": "P1",
  "reason": "Flooding with sewage and vulnerable people present"
}
```

```bash
curl -sS -X POST "$BASE/api/escalate-human" \
  -H "Content-Type: application/json" \
  -H "x-elevenlabs-secret-plumbingpro: $SECRET" \
  -d '{"companyId":"rapidflow_london","name":"Jordan","phone":"+447700900123","address":"1 Test St","issueSummary":"Leak","priority":"P1","reason":"Emergency"}'
```

Response includes `webhookDelivered`, `webhookStatus` (when a webhook URL is set), `webhookResponsePreview` (first ~600 chars of the webhook response body when `webhookDelivered` is false — use this to debug 4xx/5xx from `ESCALATION_WEBHOOK_URL`), and `transferNumber`.

### Demo escalation webhook (same deployment)

Point **`ESCALATION_WEBHOOK_URL`** at this URL to log payloads into a new **`Escalations`** sheet tab (created automatically):

```text
ESCALATION_WEBHOOK_URL=https://plumbing-tools-api.vercel.app/api/escalation-webhook-demo
```

(Use your real Vercel hostname if different.)

- **`POST /api/escalation-webhook-demo`** — JSON body: `companyId`, `callId` (required); `name`, `callerPhone`, `postcode`, `address`, `issueSummary`, `priority`, `reason` (optional strings, default empty). Compatible with the JSON sent by `postEscalationWebhook` (`timestamp` allowed, ignored for the row; `receivedAt` is set server-side). If **`ESCALATION_WEBHOOK_SECRET`** is set, requests must include header **`x-escalation-secret`** with the same value (same as real `escalate-human` → webhook).
- **`GET /api/escalation-webhook-demo`** — Returns `{ ok, count, escalations }` with the newest rows first (up to 50). Unauthenticated for quick visual checks (keep URL obscure in production or remove later).

**If `escalate-human` shows `webhookStatus: 500` (not 404):** the demo URL was reached but failed inside the handler (usually Google Sheets). Check `webhookResponsePreview` for JSON `message`. The API auto-writes row 1 headers when column A is not `receivedAt` but **there is no real data in rows 2+** (e.g. wrong labels in row 1 only). If you still see an error, clear non-empty cells in row 1 or delete data rows below a bad header. **`webhookStatus: 404`** means the URL path is wrong or the deployment has no such route.

### `POST /api/log-call`

Appends a row into the `CallLogs` sheet.

**Preferred agent fields:** `companyId`, `callId` (optional — auto-generated if blank), `intent`, `priority`, `emergencyFlag`, `name`, `phone`, `postcode`, `issueSummary`, `actionTaken`, `smsSent`, `escalatedTo`, `status`.  
**Legacy:** `callerPhone` is accepted and mapped to `phone`.

**Required after normalisation:** `companyId`, `callId`, `issueSummary`, `actionTaken`, `status`. Other fields have defaults where noted below.

Preferred body example:

```json
{
  "companyId": "rapidflow_london",
  "callId": "call_123",
  "intent": "plumbing_emergency",
  "priority": "P1",
  "emergencyFlag": "Yes",
  "name": "Jordan Yussuf",
  "phone": "07476811532",
  "postcode": "N19 3NB",
  "issueSummary": "Burst pipe with water near electrics",
  "actionTaken": "Urgent callback arranged",
  "smsSent": "SMS01",
  "escalatedTo": "On call engineer",
  "status": "callback_pending"
}
```

```bash
curl -sS -X POST "$BASE/api/log-call" \
  -H "Content-Type: application/json" \
  -H "x-elevenlabs-secret-plumbingpro: $SECRET" \
  -d '{"companyId":"rapidflow_london","issueSummary":"Test issue","actionTaken":"none","status":"closed"}'
```

## ElevenLabs tool mapping

Create these server tools:

### 1. Company context
- Method: `GET`
- URL: `https://your-domain.com/api/company-context?companyId=rapidflow_london`
- Header: `x-elevenlabs-secret-plumbingpro: {{YOUR_SECRET}}`
- Use: approved facts only

### 2. Service search
- Method: `GET`
- URL: `https://your-domain.com/api/services-search?companyId=rapidflow_london&query={{issue_summary}}`
- Header: `x-elevenlabs-secret-plumbingpro: {{YOUR_SECRET}}`
- Use: likely service matching

### 3. Rules applicable
- Method: `POST`
- URL: `https://your-domain.com/api/rules-applicable`
- Header: `x-elevenlabs-secret-plumbingpro: {{YOUR_SECRET}}`
- Content type: JSON
- Use: main emergency triage

### 4. Log call
- Method: `POST`
- URL: `https://your-domain.com/api/log-call`
- Header: `x-elevenlabs-secret-plumbingpro: {{YOUR_SECRET}}`
- Content type: JSON
- Use: end of call logging
- Body: prefer shared fields `companyId`, `phone`, `issueSummary`, `actionTaken`, `status` (see [POST /api/log-call](#post-apilog-call)); `callId` optional (auto-generated if omitted)

### 5. Intake flow
- Method: `GET`
- URL: `https://your-domain.com/api/intake-flow?companyId=rapidflow_london`
- Header: `x-elevenlabs-secret-plumbingpro: {{YOUR_SECRET}}`
- Use: structured questions from the sheet

### 6. Send SMS
- Method: `POST`
- URL: `https://your-domain.com/api/send-sms`
- Header: `x-elevenlabs-secret-plumbingpro: {{YOUR_SECRET}}`
- Content type: JSON
- Use: send the approved template after triage
- Body: prefer `phone`, `messageType` (or legacy `to` / `templateId`); see [POST /api/send-sms](#post-apisend-sms)

### 7. Escalate human
- Method: `POST`
- URL: `https://your-domain.com/api/escalate-human`
- Header: `x-elevenlabs-secret-plumbingpro: {{YOUR_SECRET}}`
- Content type: JSON
- Use: webhook + optional transfer number for genuine emergencies
- Body: prefer `phone`, **`address`** (required), `postcode`; see [POST /api/escalate-human](#post-apiescalate-human)

## Recommended prompt rule

Use `rules-applicable` whenever the caller describes a plumbing issue, an emergency, a leak, blocked drain, no water, no hot water, or any safety concern. Do not guess urgency, coverage, or safety instructions if the tool can provide them.

Use `company-context` for hours, coverage summary, payment methods, pricing policy, warranty policy, gas leak redirects, and booking link details.

Use `services-search` when the customer issue is vague and you need likely service categories.

Always use `log-call` before ending a real customer call.

Use `intake-flow` when you want the sheet to drive which questions to ask and in what order.

Use `send-sms` after you know which `smsTemplateId` applies (often from `rules-applicable`).

Use `escalate-human` when `transferNow` is true or the caller needs an immediate human handoff.

## Why this mirrors HostAssist

Your current HostAssist pattern is:

- one focused endpoint per business memory bucket
- one endpoint for rules
- one endpoint for call logging
- all protected by `x-elevenlabs-secret-plumbingpro`

This plumbing version keeps the same shape, but swaps restaurant context and menu logic for:

- plumbing company context
- service matching
- emergency triage rules
- call logging

## Possible next additions

- `GET /api/check-service-area` — thin wrapper if you want a dedicated postcode-only tool (coverage is already included in `rules-applicable`).
