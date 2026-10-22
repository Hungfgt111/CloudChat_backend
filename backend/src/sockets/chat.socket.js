const jwt = require('jsonwebtoken');
const db = require('../config/database');

const onlineUsers = new Map(); // userId -> Set(socketId)

function setupChatSocket(io) {
  // Middleware xác thực JWT khi bắt tay WebSocket
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
    if (!token) {
      return next(new Error('Thiếu JWT Token'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'cloudchat_dr_jwt_secret_key_2026_super_secure');
      socket.user = decoded;
      next();
    } catch (err) {
      next(new Error('Token không hợp lệ'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = socket.user.id;
    console.log(`[Socket] User ${socket.user.display_name || userId} ket noi (${socket.id})`);

    // 1. Quản lý trạng thái Online/Offline
    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set());
      io.emit('presence:update', { userId, is_online: true });

      // Cập nhật CSDL
      await db.query('UPDATE profiles SET is_online = TRUE WHERE id = $1', [userId]).catch(() => {});
    }
    onlineUsers.get(userId).add(socket.id);

    // Vào phòng cá nhân để nhận tin nhắn 1-1
    socket.join(`user_${userId}`);

    // Gửi danh sách người đang online cho socket này
    socket.emit('presence:list', Array.from(onlineUsers.keys()));

    // 2. Tham gia phòng nhóm
    socket.on('group:join', (groupId) => {
      socket.join(`group_${groupId}`);
    });

    socket.on('group:leave', (groupId) => {
      socket.leave(`group_${groupId}`);
    });

    // 3. Typing Indicator
    socket.on('typing:start', ({ receiverId, groupId }) => {
      const payload = { userId, displayName: socket.user.display_name, isTyping: true };
      if (groupId) {
        socket.to(`group_${groupId}`).emit('typing:status', { ...payload, groupId });
      } else if (receiverId) {
        socket.to(`user_${receiverId}`).emit('typing:status', { ...payload, receiverId });
      }
    });

    socket.on('typing:stop', ({ receiverId, groupId }) => {
      const payload = { userId, isTyping: false };
      if (groupId) {
        socket.to(`group_${groupId}`).emit('typing:status', { ...payload, groupId });
      } else if (receiverId) {
        socket.to(`user_${receiverId}`).emit('typing:status', { ...payload, receiverId });
      }
    });

    // 4. Ngắt kết nối
    socket.on('disconnect', async () => {
      const userSockets = onlineUsers.get(userId);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          onlineUsers.delete(userId);
          io.emit('presence:update', { userId, is_online: false, last_seen: new Date().toISOString() });

          // Cập nhật CSDL
          await db.query(
            'UPDATE profiles SET is_online = FALSE, last_seen = CURRENT_TIMESTAMP WHERE id = $1',
            [userId]
          ).catch(() => {});
        }
      }
      console.log(`[Socket] User ngat ket noi (${socket.id})`);
    });
  });
}

module.exports = setupChatSocket;
