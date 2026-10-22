const db = require('../config/database');
const ReplicateService = require('../services/replicate.service');

exports.sendFriendRequest = async (req, res) => {
  const { friend_id } = req.body;
  const user_id = req.user.id;

  if (user_id === friend_id) {
    return res.status(400).json({ error: 'Không thể kết bạn với chính mình' });
  }

  try {
    const sql = `
      INSERT INTO friendships (user_id, friend_id, status)
      VALUES ($1, $2, 'pending')
      ON CONFLICT (user_id, friend_id) DO UPDATE SET status = 'pending', updated_at = CURRENT_TIMESTAMP
      RETURNING *;
    `;
    const { rows } = await db.query(sql, [user_id, friend_id]);
    const friendship = rows[0];

    // Đồng bộ sang Supabase
    ReplicateService.syncToPassive('friendships', friendship, 'INSERT');

    // Bắn realtime thông báo cho friend_id
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${friend_id}`).emit('friendship:request', {
        from: req.user,
        friendship,
      });
    }

    return res.status(201).json({ success: true, data: friendship });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.acceptFriendRequest = async (req, res) => {
  const { friendship_id } = req.body;
  const currentUserId = req.user.id;

  try {
    const sql = `
      UPDATE friendships
      SET status = 'accepted'
      WHERE id = $1 AND friend_id = $2
      RETURNING *;
    `;
    const { rows } = await db.query(sql, [friendship_id, currentUserId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy lời mời kết bạn hoặc bạn không có quyền' });
    }

    const updated = rows[0];

    // Đồng bộ sang Supabase
    ReplicateService.syncToPassive('friendships', updated, 'UPDATE');

    const io = req.app.get('io');
    if (io) {
      io.to(`user_${updated.user_id}`).emit('friendship:accepted', updated);
    }

    return res.json({ success: true, data: updated });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.getFriends = async (req, res) => {
  const userId = req.user.id;

  try {
    const sql = `
      SELECT f.id as friendship_id, f.status, f.created_at,
             p.id as user_id, p.username, p.display_name, p.avatar_url, p.bio, p.is_online, p.last_seen
      FROM friendships f
      JOIN profiles p ON (CASE WHEN f.user_id = $1 THEN f.friend_id ELSE f.user_id END) = p.id
      WHERE (f.user_id = $1 OR f.friend_id = $1) AND f.status = 'accepted';
    `;
    const { rows } = await db.query(sql, [userId]);
    return res.json({ success: true, data: rows });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
