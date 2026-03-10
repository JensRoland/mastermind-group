import { Router } from 'express';
import {
  getModeratorName, setModeratorName,
  getApiKey, setApiKey, getApiKeyMasked,
  changePassword,
  getTimezone, setTimezone,
} from '../auth.js';

const router = Router();

// GET /api/settings
router.get('/', (req, res) => {
  res.json({
    moderatorName: getModeratorName(),
    hasApiKey: !!getApiKey(),
    apiKeyMasked: getApiKeyMasked(),
    hasEnvApiKey: !!process.env.OPENROUTER_API_KEY,
    timezone: getTimezone(),
  });
});

// PUT /api/settings/moderator-name
router.put('/moderator-name', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }
  setModeratorName(name.trim());
  res.json({ ok: true, moderatorName: name.trim() });
});

// PUT /api/settings/password
router.put('/password', async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password are required' });
  }
  if (newPassword.length < 4) {
    return res.status(400).json({ error: 'New password must be at least 4 characters' });
  }

  const result = await changePassword(currentPassword, newPassword);
  if (!result.ok) {
    return res.status(401).json({ error: result.error });
  }
  res.json({ ok: true });
});

// PUT /api/settings/api-key
router.put('/api-key', (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey || !apiKey.trim()) {
    return res.status(400).json({ error: 'API key is required' });
  }
  setApiKey(apiKey.trim());
  res.json({ ok: true, apiKeyMasked: getApiKeyMasked() });
});

// PUT /api/settings/timezone
router.put('/timezone', (req, res) => {
  const { timezone } = req.body;
  if (!timezone || typeof timezone !== 'string') {
    return res.status(400).json({ error: 'Timezone is required' });
  }
  // Validate: must be 'auto' or a valid IANA timezone
  if (timezone !== 'auto') {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone });
    } catch {
      return res.status(400).json({ error: 'Invalid timezone' });
    }
  }
  setTimezone(timezone);
  res.json({ ok: true, timezone });
});

export default router;
