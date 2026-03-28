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

## Required environment variables

Copy `.env.example` to `.env` and fill in the values (or define the same keys in Vercel for production).

**Core (required)**

- `PORT` — optional on Vercel (platform sets it); used for local `dev:express`
- `X_ELEVENLABS_SECRET`
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
5. Deploy, then set your ElevenLabs tool URLs to `https://<your-project>.vercel.app/api/...` with header `x-elevenlabs-secret`.

Secrets should live in Vercel (or your secret manager), not in the repo. `.env` is gitignored; use `.env.example` as the checklist.

## Smoke test (local)

With a valid `.env`, start the app (`npm run dev`) in one terminal, then:

```bash
npm run smoke
```

Optional: `SMOKE_BASE_URL`, `SMOKE_COMPANY_ID`, `SMOKE_SKIP_LOG_CALL=1`, `SMOKE_SKIP_SEND_SMS=1`, `SMOKE_SMS_TO`, `SMOKE_SMS_TEMPLATE_ID`.

## Endpoints

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

Sends an SMS using Twilio after resolving the template from the `SMS` tab. Returns `503` if Twilio env vars are not set.

Body example:

```json
{
  "companyId": "rapidflow_london",
  "to": "+447700900123",
  "templateId": "SMS01",
  "callId": "call_123",
  "name": "Jordan",
  "issueSummary": "Burst pipe under sink",
  "postcode": "N19 3AB"
}
```

Template text may use placeholders: `{{name}}`, `{{issueSummary}}`, `{{issue}}`, `{{postcode}}`, `{{callId}}`, `{{companyName}}`, `{{bookingLink}}`.

### `POST /api/escalate-human`

Notifies an on-call system via webhook and/or returns a transfer number. Returns `503` if neither `ESCALATION_WEBHOOK_URL` nor `ESCALATION_TRANSFER_NUMBER` is configured.

Body example:

```json
{
  "companyId": "rapidflow_london",
  "callId": "call_123",
  "reason": "Active flooding, caller requests human",
  "priority": "P1",
  "callerPhone": "+447700900123",
  "issueSummary": "Water through ceiling",
  "name": "Jordan"
}
```

Response includes `webhookDelivered`, `webhookStatus` (when a webhook URL is set), and `transferNumber`.

### `POST /api/log-call`

Appends a row into the `CallLogs` sheet.

Body example:

```json
{
  "companyId": "rapidflow_london",
  "callId": "call_123",
  "intent": "plumbing_emergency",
  "priority": "P1",
  "emergencyFlag": "Yes",
  "name": "Jordan Yussuf",
  "phone": "07400111222",
  "postcode": "N19 3AB",
  "issueSummary": "Burst pipe under sink with active flooding",
  "actionTaken": "Urgent callback and dispatch",
  "smsSent": "SMS01",
  "escalatedTo": "on_call_plumber",
  "status": "open"
}
```

## ElevenLabs tool mapping

Create these server tools:

### 1. Company context
- Method: `GET`
- URL: `https://your-domain.com/api/company-context?companyId=rapidflow_london`
- Header: `x-elevenlabs-secret: {{YOUR_SECRET}}`
- Use: approved facts only

### 2. Service search
- Method: `GET`
- URL: `https://your-domain.com/api/services-search?companyId=rapidflow_london&query={{issue_summary}}`
- Header: `x-elevenlabs-secret: {{YOUR_SECRET}}`
- Use: likely service matching

### 3. Rules applicable
- Method: `POST`
- URL: `https://your-domain.com/api/rules-applicable`
- Header: `x-elevenlabs-secret: {{YOUR_SECRET}}`
- Content type: JSON
- Use: main emergency triage

### 4. Log call
- Method: `POST`
- URL: `https://your-domain.com/api/log-call`
- Header: `x-elevenlabs-secret: {{YOUR_SECRET}}`
- Content type: JSON
- Use: end of call logging

### 5. Intake flow
- Method: `GET`
- URL: `https://your-domain.com/api/intake-flow?companyId=rapidflow_london`
- Header: `x-elevenlabs-secret: {{YOUR_SECRET}}`
- Use: structured questions from the sheet

### 6. Send SMS
- Method: `POST`
- URL: `https://your-domain.com/api/send-sms`
- Header: `x-elevenlabs-secret: {{YOUR_SECRET}}`
- Content type: JSON
- Use: send the approved template after triage

### 7. Escalate human
- Method: `POST`
- URL: `https://your-domain.com/api/escalate-human`
- Header: `x-elevenlabs-secret: {{YOUR_SECRET}}`
- Content type: JSON
- Use: webhook + optional transfer number for genuine emergencies

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
- all protected by `x-elevenlabs-secret`

This plumbing version keeps the same shape, but swaps restaurant context and menu logic for:

- plumbing company context
- service matching
- emergency triage rules
- call logging

## Possible next additions

- `GET /api/check-service-area` — thin wrapper if you want a dedicated postcode-only tool (coverage is already included in `rules-applicable`).
