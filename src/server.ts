import express from 'express';
import cors from 'cors';
import { requireElevenSecret } from './auth.js';
import { config } from './config.js';
import {
  handleCompanyContext,
  handleEscalateHuman,
  handleIntakeFlow,
  handleLogCall,
  handleRulesApplicable,
  handleSendSms,
  handleServicesSearch
} from './api-handlers.js';

const app = express();
app.use(cors());
app.use(express.json());

const rootLines = [
  'Plumbing Tools API',
  '',
  'API Online',
  '',
  'GET /api/company-context',
  'GET /api/services-search',
  'GET /api/intake-flow',
  'POST /api/rules-applicable',
  'POST /api/send-sms',
  'POST /api/escalate-human',
  'POST /api/log-call',
  '',
  'All /api/* routes require the x-elevenlabs-secret-plumbingpro header.'
];

app.get('/', (_req, res) => {
  res.type('text/plain').send(rootLines.join('\n'));
});

app.use('/api', requireElevenSecret);

app.get('/api/company-context', async (req, res) => {
  try {
    const companyId = String(req.query.companyId || 'rapidflow_london');
    res.json(await handleCompanyContext(companyId));
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

app.get('/api/intake-flow', async (req, res) => {
  try {
    const companyId = String(req.query.companyId || 'rapidflow_london');
    const askWhen = req.query.askWhen !== undefined ? String(req.query.askWhen) : undefined;
    res.json(await handleIntakeFlow(companyId, askWhen));
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

app.get('/api/services-search', async (req, res) => {
  try {
    const companyId = String(req.query.companyId || 'rapidflow_london');
    const query = String(req.query.query || '');
    res.json(await handleServicesSearch(companyId, query));
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

app.post('/api/rules-applicable', async (req, res) => {
  try {
    res.json(await handleRulesApplicable(req.body));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

app.post('/api/send-sms', async (req, res) => {
  try {
    res.json(await handleSendSms(req.body));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const statusCode = (error as Error & { statusCode?: number }).statusCode;
    if (statusCode === 503) {
      res.status(503).json({ error: message });
      return;
    }
    if (message.startsWith('SMS template not found')) {
      res.status(404).json({ error: message });
      return;
    }
    res.status(400).json({ error: message });
  }
});

app.post('/api/escalate-human', async (req, res) => {
  try {
    res.json(await handleEscalateHuman(req.body));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const statusCode = (error as Error & { statusCode?: number }).statusCode;
    if (statusCode === 503) {
      res.status(503).json({ error: message });
      return;
    }
    res.status(400).json({ error: message });
  }
});

app.post('/api/log-call', async (req, res) => {
  try {
    res.json(await handleLogCall(req.body));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

app.listen(config.port, () => {
  console.log(`Plumbing Tools API listening on port ${config.port}`);
});
