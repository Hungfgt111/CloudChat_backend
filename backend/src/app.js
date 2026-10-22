const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./config/database');
const ReplicateService = require('./services/replicate.service');

const authRoutes = require('./routes/auth.routes');
const chatRoutes = require('./routes/chat.routes');
const friendRoutes = require('./routes/friend.routes');
const groupRoutes = require('./routes/group.routes');
const fileRoutes = require('./routes/file.routes');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static uploaded files
const uploadDir = process.env.UPLOAD_DIR || './uploads';
app.use('/uploads', express.static(path.resolve(uploadDir)));

/**
 * Health Check API - Trọng tâm kiểm tra thảm họa của hệ thống Active - Passive
 * Cho phép Frontend và Load Balancer giám sát liên tục trạng thái của Node Active
 */
app.get('/api/health', async (req, res) => {
  const start = Date.now();
  let dbStatus = 'CONNECTED';
  let dbLatency = 0;

  try {
    await db.query('SELECT 1');
    dbLatency = Date.now() - start;
  } catch (err) {
    dbStatus = 'DISCONNECTED';
  }

  const isHealthy = dbStatus === 'CONNECTED';
  const replicationStats = ReplicateService.getStats();

  const responseData = {
    status: isHealthy ? 'HEALTHY' : 'DEGRADED',
    role: process.env.SERVER_ROLE || 'ACTIVE',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    database: {
      status: dbStatus,
      latencyMs: dbLatency,
    },
    disasterRecoveryReplication: {
      target: process.env.SUPABASE_URL,
      ...replicationStats,
    },
  };

  return res.status(isHealthy ? 200 : 503).json(responseData);
});

// Định tuyến API
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/files', fileRoutes);

// Xử lý lỗi tập trung
app.use((err, req, res, next) => {
  console.error('[Error]:', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Lỗi máy chủ nội bộ' });
});

module.exports = app;
