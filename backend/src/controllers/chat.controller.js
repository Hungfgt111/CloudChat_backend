const db = require('../config/database');
const ReplicateService = require('../services/replicate.service');

exports.sendMessage = async (req, res) => {
  const { receiver_id, group_id, content, message_type = 'TEXT', file_url } = req.body;
  const sender_id = req.user.id;

  if (!content && !file_url) {
    return res.status(400).json({ error: 'Nội dung tin nhắn hoặc tệp tin là bắt buộc' });
  }

  if (!receiver_id && !group_id) {
    return res.status(400).json({ error: 'Cần chỉ định receiver_id hoặc group_id' });
  }

  try {
    const sql = `
      INSERT INTO messages (sender_id, receiver_id, group_id, content, message_type, file_url)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `;
    const values = [sender_id, receiver_id || null, group_id || null, content || '', message_type, file_url || null];
    const { rows } = await db.query(sql, values);
    const message = rows[0];

    // Phát sự kiện Realtime qua Socket.IO
    const io = req.app.get('io');
    if (io) {
      if (group_id) {
        io.to(`group_${group_id}`).emit('message:new', message);
      } else if (receiver_id) {
        io.to(`user_${receiver_id}`).emit('message:new', message);
        io.to(`user_${sender_id}`).emit('message:new', message);
      }
    }

    // ĐỒNG BỘ DỰ PHÒNG SANG SUPABASE CLUSTER (PASSIVE)
    ReplicateService.syncToPassive('messages', message, 'INSERT');

    return res.status(201).json({ success: true, data: message });
  } catch (error) {
    console.error('[ChatController sendMessage Error]:', error);
    return res.status(500).json({ error: error.message });
  }
};

exports.getMessages = async (req, res) => {
  const { userId, groupId, limit = 50, before } = req.query;
  const currentUserId = req.user.id;

  try {
    let sql = '';
    let params = [];

    if (groupId) {
      sql = `
        SELECT m.*, p.display_name as sender_name, p.avatar_url as sender_avatar
        FROM messages m
        JOIN profiles p ON m.sender_id = p.id
        WHERE m.group_id = $1
      `;
      params = [groupId];
    } else if (userId) {
      sql = `
        SELECT m.*, p.display_name as sender_name, p.avatar_url as sender_avatar
        FROM messages m
        JOIN profiles p ON m.sender_id = p.id
        WHERE (m.sender_id = $1 AND m.receiver_id = $2)
           OR (m.sender_id = $2 AND m.receiver_id = $1)
      `;
      params = [currentUserId, userId];
    } else {
      return res.status(400).json({ error: 'Cần cung cấp userId hoặc groupId' });
    }

    if (before) {
      params.push(before);
      sql += ` AND m.created_at < $${params.length}`;
    }

    params.push(limit);
    sql += ` ORDER BY m.created_at DESC LIMIT $${params.length}`;

    const { rows } = await db.query(sql, params);
    return res.json({ success: true, data: rows.reverse() });
  } catch (error) {
    console.error('[ChatController getMessages Error]:', error);
    return res.status(500).json({ error: error.message });
  }
};

exports.deleteMessage = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    const checkSql = 'SELECT * FROM messages WHERE id = $1 AND sender_id = $2';
    const checkRes = await db.query(checkSql, [id, userId]);

    if (checkRes.rows.length === 0) {
      return res.status(403).json({ error: 'Bạn không có quyền xóa tin nhắn này' });
    }

    const deletedMessage = checkRes.rows[0];
    await db.query('DELETE FROM messages WHERE id = $1', [id]);

    // Báo Socket.IO
    const io = req.app.get('io');
    if (io) {
      if (deletedMessage.group_id) {
        io.to(`group_${deletedMessage.group_id}`).emit('message:deleted', { id });
      } else if (deletedMessage.receiver_id) {
        io.to(`user_${deletedMessage.receiver_id}`).emit('message:deleted', { id });
        io.to(`user_${userId}`).emit('message:deleted', { id });
      }
    }

    // ĐỒNG BỘ XÓA SANG SUPABASE
    ReplicateService.syncToPassive('messages', { id }, 'DELETE');

    return res.json({ success: true, message: 'Đã xóa tin nhắn thành công' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
