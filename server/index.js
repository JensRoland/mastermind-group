import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

import { setupWebSocket } from './ws.js';
import { startOrchestrator } from './orchestrator.js';
import { runStartupChecks } from './startup-check.js';
import { requireAuth, loginRoute, logoutRoute, checkAuthRoute, cleanupExpiredSessions } from './auth.js';
import expertRoutes from './routes/experts.js';
import threadRoutes from './routes/threads.js';
import likeRoutes from './routes/likes.js';
import settingsRoutes from './routes/settings.js';

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Serve avatar images
app.use('/avatars', express.static(path.join(__dirname, '..', 'public', 'avatars')));

// Auth routes (no auth required)
app.post('/api/login', loginRoute);
app.post('/api/logout', logoutRoute);
app.get('/api/auth/check', checkAuthRoute);

// Clean up expired sessions every hour
cleanupExpiredSessions();
setInterval(cleanupExpiredSessions, 60 * 60 * 1000);

// Protected routes
app.use('/api/experts', requireAuth, expertRoutes);
app.use('/api/threads', requireAuth, threadRoutes);
app.use('/api/messages', requireAuth, likeRoutes);
app.use('/api/settings', requireAuth, settingsRoutes);

// In production, serve the built client
app.use(express.static(path.join(__dirname, '..', 'client', 'dist')));
app.get('*', (req, res, next) => {
  // Only serve index.html for non-API routes
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(__dirname, '..', 'client', 'dist', 'index.html'));
});

const server = http.createServer(app);
setupWebSocket(server);
runStartupChecks();
startOrchestrator();

const PORT = process.env.PORT || 4240;
server.listen(PORT, () => {
  console.log(`Mastermind Group server running on port ${PORT}`);
});
