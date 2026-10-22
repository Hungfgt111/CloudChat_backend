require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const setupChatSocket = require('./sockets/chat.socket');

const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

// Cấu hình Socket.IO với CORS hỗ trợ mọi client
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

app.set('io', io);

// Khởi chạy Socket
setupChatSocket(io);

server.listen(PORT, () => {
  console.log('====================================================');
  console.log(`[Server] CloudChat Backend Active Node dang chay tai port: ${PORT}`);
  console.log(`[Server] Cluster Role: [ ${process.env.SERVER_ROLE || 'ACTIVE'} ]`);
  console.log(`[Server] Replication Target: [ ${process.env.SUPABASE_URL || 'Chua cau hinh'} ]`);
  console.log(`[Server] Health Check: http://localhost:${PORT}/api/health`);
  console.log('====================================================');
});
