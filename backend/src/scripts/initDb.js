require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../config/database');

async function initDb() {
  console.log('[InitDB] Đang khởi tạo các bảng CSDL trên PostgreSQL...');
  try {
    const sqlPath = path.join(__dirname, '../../schema.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    await db.query(sql);
    console.log('[InitDB] [SUCCESS] Khoi tao CSDL thanh cong!');
    process.exit(0);
  } catch (error) {
    console.error('[InitDB] [FAILED] Khoi tao CSDL that bai:', error.message);
    process.exit(1);
  }
}

initDb();
