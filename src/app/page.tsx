import { HealthStatus } from '../components/HealthStatus';

const ENDPOINTS = [
  { method: 'GET' as const, path: '/api/company-context?companyId=…' },
  { method: 'GET' as const, path: '/api/services-search?companyId=…&query=…' },
  { method: 'GET' as const, path: '/api/intake-flow?companyId=…' },
  { method: 'POST' as const, path: '/api/rules-applicable' },
  { method: 'POST' as const, path: '/api/send-sms' },
  { method: 'POST' as const, path: '/api/escalate-human' },
  { method: 'POST' as const, path: '/api/log-call' }
];

const REQUIRED_ENV = [
  { name: 'X_ELEVENLABS_SECRET', note: 'Shared secret; send as header x-elevenlabs-secret' },
  { name: 'GOOGLE_SHEET_ID', note: 'Spreadsheet ID' },
  { name: 'GOOGLE_SERVICE_ACCOUNT_EMAIL', note: 'Service account client email' },
  { name: 'GOOGLE_PRIVATE_KEY', note: 'PEM private key; use \\n for newlines in Vercel' }
];

const OPTIONAL_ENV = [
  { name: 'SHEET_DATA_CACHE_TTL_SECONDS', note: 'Cache sheet reads (seconds)' },
  { name: 'TWILIO_ACCOUNT_SID', note: 'For POST /api/send-sms' },
  { name: 'TWILIO_AUTH_TOKEN', note: '' },
  { name: 'TWILIO_FROM_NUMBER', note: '' },
  { name: 'ESCALATION_WEBHOOK_URL', note: 'For POST /api/escalate-human' },
  { name: 'ESCALATION_WEBHOOK_SECRET', note: 'Optional webhook header' },
  { name: 'ESCALATION_TRANSFER_NUMBER', note: 'Optional PSTN hint' }
];

export default function HomePage() {
  return (
    <main>
      <header className="hero">
        <h1>Plumbing Tools API</h1>
        <p>
          Google Sheet–backed tools for an emergency plumbing voice agent (ElevenLabs). Deploy on Vercel;
          point your agent tools at this host.
        </p>
      </header>

      <section className="panel">
        <h2>Status</h2>
        <HealthStatus />
        <p className="note">
          <code>/api/health</code> is public. All other <code>/api/*</code> routes require{' '}
          <code>x-elevenlabs-secret</code>.
        </p>
      </section>

      <section className="panel">
        <h2>Endpoints</h2>
        <ul className="endpoints">
          {ENDPOINTS.map((e) => (
            <li key={e.path}>
              <span className={`method ${e.method === 'GET' ? 'get' : 'post'}`}>{e.method}</span>
              <span>{e.path}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2>Vercel environment variables</h2>
        <p className="note" style={{ marginTop: 0 }}>
          Add these in the Vercel project → Settings → Environment Variables. Do not commit secrets to git;
          production values live only in Vercel (and your local <code>.env</code> for dev).
        </p>
        <table className="env-table">
          <tbody>
            {REQUIRED_ENV.map((row) => (
              <tr key={row.name}>
                <th>
                  <code>{row.name}</code>
                </th>
                <td>{row.note}</td>
              </tr>
            ))}
            {OPTIONAL_ENV.map((row) => (
              <tr key={row.name}>
                <th>
                  <code>{row.name}</code> <span style={{ color: 'var(--muted)' }}>(optional)</span>
                </th>
                <td>{row.note || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <h2>ElevenLabs</h2>
        <p className="note" style={{ marginTop: 0 }}>
          Use your deployment URL as the tool base, e.g.{' '}
          <code>https://&lt;project&gt;.vercel.app/api/rules-applicable</code>. Set the same secret in Vercel
          and in the ElevenLabs tool header <code>x-elevenlabs-secret</code>.
        </p>
      </section>

      <footer>
        Sheet tabs: Company, ServiceAreas, Services, EmergencyRules, IntakeFlow, FAQs, SMS, CallLogs. See{' '}
        <code>README.md</code> for full tool payloads and smoke tests.
      </footer>
    </main>
  );
}
