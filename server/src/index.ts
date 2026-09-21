import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import dotenv from 'dotenv';
import os from 'os';
import fs from 'fs';

import compression from 'compression';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { ensureDbConnected } from './db/connection.js';
import { runMigrations } from './db/migrate.js';
import { seedDatabase } from './db/seed.js';

import authRoutes from './routes/auth.js';
import productionRoutes from './routes/production.js';
import operatorRoutes from './routes/operators.js';
import shiftRoutes from './routes/shifts.js';
import scanRoutes from './routes/scans.js';
import dashboardRoutes from './routes/dashboard.js';
import { errorHandler } from './middleware/errorHandler.js';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '4000', 10);
const HOST = process.env.HOST || '0.0.0.0';

// Enable gzip/brotli HTTP response compression
app.use(compression());

// CORS for development
app.use(cors());
app.use(express.json());

if (process.env.TRUST_PROXY === '1') {
  app.set('trust proxy', true);
}

// Explicit Health Check Endpoint
app.get('/api/health', async (req, res) => {
  try {
    const isConnected = await ensureDbConnected();
    if (isConnected) {
      return res.status(200).json({ status: 'ok', database: 'connected' });
    }
    return res.status(500).json({ status: 'error', database: 'disconnected' });
  } catch (err: any) {
    return res.status(500).json({ status: 'error', database: 'disconnected', message: err.message });
  }
});

// Register API Routes
app.use('/api/auth', authRoutes);
app.use('/api', productionRoutes);
app.use('/api/operators/me', operatorRoutes);
app.use('/api/shifts', shiftRoutes);
app.use('/api', scanRoutes);
app.use('/api', dashboardRoutes);

// Robust static frontend dist directory resolution
function resolveDistPath(): string {
  const candidates = [
    path.resolve(process.cwd(), 'dist'),
    path.resolve(__dirname, '../dist'),
    path.resolve(__dirname, '../../dist')
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.existsSync(path.join(candidate, 'index.html'))) {
      return candidate;
    }
  }
  return path.resolve(process.cwd(), 'dist');
}

const distPath = resolveDistPath();

// Serve production static frontend with immutable caching for hashed assets and no-cache for HTML
app.use(express.static(distPath, {
  setHeaders: (res, filePath) => {
    const normPath = filePath.replace(/\\/g, '/');
    if (normPath.includes('/assets/')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

// Fallback all non-API GET routes to index.html for SPA client routing
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'API_NOT_FOUND', message: `API route ${req.method} ${req.path} not found` });
  }
  const indexPath = path.join(distPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    return res.sendFile(indexPath);
  }
  return res.status(404).json({ error: 'FRONTEND_NOT_BUILT', message: `index.html not found at ${indexPath}` });
});

app.use(errorHandler);

// Helper to retrieve local LAN IP addresses
function getLanIps(): string[] {
  const interfaces = os.networkInterfaces();
  const ips: string[] = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  return ips;
}

export async function startServer() {
  console.log('🚀 Starting UniFlow Ops Backend Server...');
  const isConnected = await ensureDbConnected();
  if (isConnected) {
    console.log('📦 Running database migrations...');
    await runMigrations();
    await seedDatabase();
    console.log('✅ Migrations completed successfully.');
  } else {
    console.warn('⚠️ Warning: MySQL database connection not established on server startup.');
  }

  return new Promise<import('http').Server>((resolve, reject) => {
    const server = app.listen(PORT, HOST, () => {
      console.log('\n==================================================');
      console.log(`⚡ UniFlow Ops Full-Stack Server Running on Port ${PORT}`);
      console.log('==================================================');
      console.log(`➜ Local:   http://localhost:${PORT}/`);
      console.log(`➜ Health:  http://localhost:${PORT}/api/health`);
      console.log(`➜ Static:  ${distPath}`);

      const lanIps = getLanIps();
      if (lanIps.length > 0) {
        lanIps.forEach(ip => {
          console.log(`➜ Network: http://${ip}:${PORT}/ (Android Wi-Fi PWA)`);
        });
      }
      console.log(`➜ Database: MySQL (${process.env.DB_NAME || 'uniflow_ops'} @ ${process.env.DB_HOST || 'localhost'})`);
      console.log(`➜ Timezone: ${process.env.FACTORY_TIMEZONE || 'Asia/Colombo'}`);
      console.log('==================================================\n');
      resolve(server);
    });

    server.on('error', (err) => {
      console.error('❌ Server startup error:', err);
      reject(err);
    });
  });
}

if (process.env.NODE_ENV !== 'test') {
  startServer().catch(err => {
    console.error('❌ Fatal server startup failure:', err);
    process.exit(1);
  });
}

export { app };
