const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const ReplicateService = require('../services/replicate.service');

const JWT_SECRET = process.env.JWT_SECRET || 'cloudchat_dr_jwt_secret_key_2026_super_secure';

exports.register = async (req, res) => {
  const { username, display_name, password, avatar_url, bio } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username và mật khẩu là bắt buộc' });
  }

  try {
    // Kiểm tra username đã tồn tại chưa
    const existing = await db.query('SELECT id FROM profiles WHERE username = $1', [username]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Tên người dùng này đã được đăng ký' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const sql = `
      INSERT INTO profiles (username, display_name, password_hash, avatar_url, bio, is_online)
      VALUES ($1, $2, $3, $4, $5, TRUE)
      RETURNING id, username, display_name, avatar_url, bio, is_online, created_at;
    `;
    const values = [username, display_name || username, passwordHash, avatar_url || null, bio || null];
    const { rows } = await db.query(sql, values);
    const user = rows[0];

    // Tự động đẩy bản sao sang Supabase (Không gửi password_hash lên bảng công khai nếu không cần)
    ReplicateService.syncToPassive('profiles', {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      avatar_url: user.avatar_url,
      bio: user.bio,
      is_online: user.is_online,
      created_at: user.created_at,
    });

    const token = jwt.sign(
      { id: user.id, username: user.username, display_name: user.display_name },
      JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    return res.status(201).json({
      success: true,
      message: 'Đăng ký thành công',
      token,
      user,
    });
  } catch (error) {
    console.error('[Auth Register Error]:', error);
    return res.status(500).json({ error: error.message });
  }
};

exports.login = async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username và mật khẩu là bắt buộc' });
  }

  try {
    const { rows } = await db.query(
      'SELECT id, username, display_name, password_hash, avatar_url, bio, is_online FROM profiles WHERE username = $1',
      [username]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' });
    }

    const user = rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash || '');
    if (!isMatch) {
      return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' });
    }

    // Cập nhật trạng thái online
    await db.query('UPDATE profiles SET is_online = TRUE, last_seen = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);

    delete user.password_hash;

    const token = jwt.sign(
      { id: user.id, username: user.username, display_name: user.display_name },
      JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    return res.json({
      success: true,
      message: 'Đăng nhập thành công',
      token,
      user,
    });
  } catch (error) {
    console.error('[Auth Login Error]:', error);
    return res.status(500).json({ error: error.message });
  }
};

exports.getMe = async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT id, username, display_name, avatar_url, bio, is_online, last_seen, created_at FROM profiles WHERE id = $1',
      [req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy người dùng' });
    return res.json({ success: true, user: rows[0] });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.updateProfile = async (req, res) => {
  const { display_name, bio, avatar_url } = req.body;
  const userId = req.user.id;

  try {
    const sql = `
      UPDATE profiles 
      SET display_name = COALESCE($1, display_name),
          bio = COALESCE($2, bio),
          avatar_url = COALESCE($3, avatar_url),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
      RETURNING id, username, display_name, bio, avatar_url, is_online, updated_at;
    `;
    const { rows } = await db.query(sql, [display_name, bio, avatar_url, userId]);
    const updated = rows[0];

    // Đồng bộ sang Passive
    ReplicateService.syncToPassive('profiles', updated, 'UPDATE');

    return res.json({ success: true, user: updated });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.searchProfiles = async (req, res) => {
  const { q } = req.query;
  if (!q) return res.json({ success: true, data: [] });

  try {
    const sql = `
      SELECT id, username, display_name, bio, avatar_url, is_online, last_seen
      FROM profiles
      WHERE (username ILIKE $1 OR display_name ILIKE $1) AND id != $2
      LIMIT 20;
    `;
    const { rows } = await db.query(sql, [`%${q}%`, req.user.id]);
    return res.json({ success: true, data: rows });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
