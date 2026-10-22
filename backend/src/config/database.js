const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:password123@localhost:5432/cloudchat_db';

const isCloud = connectionString.includes('supabase.com') || connectionString.includes('render.com');

const pool = new Pool({
  connectionString,
  ssl: isCloud ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('connect', () => {
  console.log(`[PostgreSQL] Đã kết nối thành công tới CSDL (${process.env.SERVER_ROLE || 'ACTIVE'} mode)`);
});

pool.on('error', (err) => {
  console.error('[PostgreSQL Error] Lỗi kết nối CSDL:', err.message);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
