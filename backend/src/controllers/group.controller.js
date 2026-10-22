const db = require('../config/database');
const ReplicateService = require('../services/replicate.service');

exports.createGroup = async (req, res) => {
  const { name, avatar_url, member_ids = [] } = req.body;
  const creatorId = req.user.id;

  if (!name) return res.status(400).json({ error: 'Tên nhóm là bắt buộc' });

  try {
    // 1. Tạo nhóm trong bảng groups
    const groupSql = `
      INSERT INTO groups (name, avatar_url, created_by)
      VALUES ($1, $2, $3)
      RETURNING *;
    `;
    const groupRes = await db.query(groupSql, [name, avatar_url || null, creatorId]);
    const group = groupRes.rows[0];

    // Đồng bộ group sang Supabase
    ReplicateService.syncToPassive('groups', group, 'INSERT');

    // 2. Thêm người tạo với role 'admin'
    const adminSql = `
      INSERT INTO group_members (group_id, user_id, role)
      VALUES ($1, $2, 'admin')
      RETURNING *;
    `;
    const adminRes = await db.query(adminSql, [group.id, creatorId]);
    ReplicateService.syncToPassive('group_members', adminRes.rows[0], 'INSERT');

    // 3. Thêm các thành viên được chọn
    for (const memId of member_ids) {
      if (memId !== creatorId) {
        const memSql = `
          INSERT INTO group_members (group_id, user_id, role)
          VALUES ($1, $2, 'member')
          RETURNING *;
        `;
        const memRes = await db.query(memSql, [group.id, memId]);
        ReplicateService.syncToPassive('group_members', memRes.rows[0], 'INSERT');
      }
    }

    return res.status(201).json({ success: true, data: group });
  } catch (error) {
    console.error('[GroupController createGroup Error]:', error);
    return res.status(500).json({ error: error.message });
  }
};

exports.getMyGroups = async (req, res) => {
  const userId = req.user.id;

  try {
    const sql = `
      SELECT g.*, gm.role, gm.created_at as joined_at,
             (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) as total_members
      FROM groups g
      JOIN group_members gm ON g.id = gm.group_id
      WHERE gm.user_id = $1
      ORDER BY g.created_at DESC;
    `;
    const { rows } = await db.query(sql, [userId]);
    return res.json({ success: true, data: rows });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.addMember = async (req, res) => {
  const { groupId, userId } = req.body;

  try {
    const sql = `
      INSERT INTO group_members (group_id, user_id, role)
      VALUES ($1, $2, 'member')
      ON CONFLICT (group_id, user_id) DO NOTHING
      RETURNING *;
    `;
    const { rows } = await db.query(sql, [groupId, userId]);
    if (rows.length > 0) {
      ReplicateService.syncToPassive('group_members', rows[0], 'INSERT');
    }
    return res.json({ success: true, data: rows[0] || { message: 'Thành viên đã ở trong nhóm' } });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
