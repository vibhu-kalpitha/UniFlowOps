import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import dotenv from 'dotenv';
import os from 'os';

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

// CORS for development
app.use(cors());
app.use(express.json());

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

// Serve production static frontend from /dist with no-cache headers to ensure immediate updates
const distPath = path.resolve(__dirname, '../../dist');
app.use(express.static(distPath, {
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}));

// Fallback all non-API GET routes to index.html for SPA client routing
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  const indexPath = path.join(distPath, 'index.html');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(indexPath, err => {
    if (err) {
      res.status(200).send('UniFlow Ops API Server Running. Frontend build in /dist.');
    }
  });
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
