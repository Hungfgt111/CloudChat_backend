const { createClient } = require('@supabase/supabase-js');
const db = require('../config/database');

const supabaseUrl = process.env.SUPABASE_URL || 'https://niwcxukzzngjbxasytdn.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

let supabasePassive = null;
if (supabaseUrl && supabaseKey) {
  try {
    supabasePassive = createClient(supabaseUrl, supabaseKey);
    console.log('[ReplicateService] Đã khởi tạo kết nối tới Supabase Passive Cluster:', supabaseUrl);
  } catch (err) {
    console.warn('[ReplicateService Warning] Không thể khởi tạo Supabase Client:', err.message);
  }
}

// Thống kê phục vụ Route Health Check & Báo cáo đồ án
const replicationStats = {
  total: 0,
  success: 0,
  failed: 0,
  lastSyncAt: null,
  recentErrors: [],
};

class ReplicateService {
  /**
   * Đẩy bản sao dữ liệu sang Supabase (Passive) bằng Worker bất đồng bộ
   * @param {string} tableName - Tên bảng ('profiles', 'messages', 'groups', 'group_members', 'friendships')
   * @param {object} record - Dữ liệu bản ghi vừa được ghi trên VPS
   * @param {'INSERT' | 'UPDATE' | 'DELETE'} operation
   */
  static syncToPassive(tableName, record, operation = 'INSERT') {
    // Chỉ server ACTIVE mới phát tán bản sao sang Passive
    if (process.env.SERVER_ROLE !== 'ACTIVE') {
      return;
    }

    if (!supabasePassive) {
      console.warn('[ReplicateService] Supabase Client chưa sẵn sàng.');
      return;
    }

    // Đưa vào tác vụ ngầm (Background Task) để không chặn luồng phản hồi của Client
    setImmediate(async () => {
      replicationStats.total += 1;
      const recordId = record.id;

      try {
        if (operation === 'DELETE') {
          const { error } = await supabasePassive
            .from(tableName)
            .delete()
            .eq('id', recordId);
          if (error) throw error;
        } else {
          // INSERT hoặc UPDATE -> Dùng Upsert dựa trên khóa chính id
          const { error } = await supabasePassive
            .from(tableName)
            .upsert(record, { onConflict: 'id' });
          if (error) throw error;
        }

        replicationStats.success += 1;
        replicationStats.lastSyncAt = new Date().toISOString();
        console.log(`[DR Replication] [SUCCESS] Da dong bo [${tableName}] ID: ${recordId} sang Supabase.`);

        // Ghi audit log vào CSDL VPS
        await db.query(
          `INSERT INTO sync_audit_logs (table_name, record_id, operation, sync_status) 
           VALUES ($1, $2, $3, 'SUCCESS')`,
          [tableName, recordId, operation]
        ).catch(() => {});

        // Đánh dấu is_synced = true cho tin nhắn
        if (tableName === 'messages') {
          await db.query(`UPDATE messages SET is_synced = TRUE WHERE id = $1`, [recordId]).catch(() => {});
        }
      } catch (err) {
        replicationStats.failed += 1;
        const errMsg = err.message || JSON.stringify(err);
        replicationStats.recentErrors.unshift({
          tableName,
          recordId,
          error: errMsg,
          timestamp: new Date().toISOString(),
        });
        if (replicationStats.recentErrors.length > 10) {
          replicationStats.recentErrors.pop();
        }

        console.error(`[DR Replication] [FAILED] That bai khi dong bo [${tableName}]:`, errMsg);

        await db.query(
          `INSERT INTO sync_audit_logs (table_name, record_id, operation, sync_status, error_message) 
           VALUES ($1, $2, $3, 'FAILED', $4)`,
          [tableName, recordId, operation, errMsg]
        ).catch(() => {});
      }
    });
  }

  static getStats() {
    return { ...replicationStats };
  }
}

module.exports = ReplicateService;
