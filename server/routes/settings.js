import { Router } from 'express';
import {
  getModeratorName, setModeratorName,
  getApiKey, setApiKey, getApiKeyMasked,
  changePassword,
} from '../auth.js';

const router = Router();

// GET /api/settings
router.get('/', (req, res) => {
  res.json({
    moderatorName: getModeratorName(),
    hasApiKey: !!getApiKey(),
    apiKeyMasked: getApiKeyMasked(),
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

export default router;
