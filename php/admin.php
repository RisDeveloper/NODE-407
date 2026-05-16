<?php
require_once 'config.php';
checkMaintenance();
requireAdmin();

$action = $_POST['action'] ?? $_GET['action'] ?? '';

switch ($action) {
    case 'get_dashboard':     getDashboard(); break;
    case 'get_users':         getUsers(); break;
    case 'get_user_detail':   getUserDetail(); break;
    case 'update_user':       updateUser(); break;
    case 'delete_user':       deleteUser(); break;
    case 'set_user_limit':    setUserLimit(); break;
    case 'get_ai_settings':   getAISettings(); break;
    case 'update_ai_setting': updateAISetting(); break;
    case 'get_global_settings': getGlobalSettings(); break;
    case 'update_global_setting': updateGlobalSetting(); break;
    case 'get_audit_log':     getAuditLog(); break;
    case 'get_chat_stats':    getChatStats(); break;
    default:
        jsonResponse(['success' => false, 'message' => 'Aksi tidak valid.']);
}

// ============================================
// DASHBOARD STATS
// ============================================
function getDashboard() {
    $db = getDB();

    $totalUsers  = $db->query("SELECT COUNT(*) FROM users WHERE role='user'")->fetchColumn();
    $activeUsers = $db->query("SELECT COUNT(*) FROM users WHERE role='user' AND status='active'")->fetchColumn();
    $totalChats  = $db->query("SELECT COUNT(*) FROM chat_sessions")->fetchColumn();
    $totalMsgs   = $db->query("SELECT COUNT(*) FROM chat_messages")->fetchColumn();
    $todayMsgs   = $db->query("SELECT COUNT(*) FROM chat_messages WHERE created_at::date=CURRENT_DATE")->fetchColumn();
    $todayUsers  = $db->query("SELECT COUNT(*) FROM users WHERE created_at::date=CURRENT_DATE")->fetchColumn();

    // Pesan per hari (7 hari terakhir)
    $stmt = $db->query("
        SELECT DATE(created_at) as date, COUNT(*) as count 
        FROM chat_messages 
        WHERE created_at >= NOW() - INTERVAL '7 days'
        GROUP BY DATE(created_at) ORDER BY date ASC
    ");
    $chartData = $stmt->fetchAll();

    // Top users
    $stmt2 = $db->query("
        SELECT u.username, u.full_name, u.messages_used, u.message_limit, u.status
        FROM users u WHERE u.role='user' ORDER BY u.messages_used DESC LIMIT 5
    ");
    $topUsers = $stmt2->fetchAll();

    // Model usage
    $stmt3 = $db->query("
        SELECT model_key, COUNT(*) as count 
        FROM chat_messages WHERE role='assistant' AND model_key IS NOT NULL
        GROUP BY model_key ORDER BY count DESC
    ");
    $modelUsage = $stmt3->fetchAll();

    jsonResponse([
        'success' => true,
        'stats' => [
            'total_users'  => $totalUsers,
            'active_users' => $activeUsers,
            'total_chats'  => $totalChats,
            'total_msgs'   => $totalMsgs,
            'today_msgs'   => $todayMsgs,
            'today_users'  => $todayUsers
        ],
        'chart_data'  => $chartData,
        'top_users'   => $topUsers,
        'model_usage' => $modelUsage
    ]);
}

// ============================================
// GET DAFTAR USER
// ============================================
function getUsers() {
    $db = getDB();
    $search = sanitize($_GET['search'] ?? '');
    $status = sanitize($_GET['status'] ?? '');

    $where = "WHERE role='user'";
    $params = [];
    if (!empty($search)) {
        $where .= " AND (username LIKE ? OR email LIKE ? OR full_name LIKE ?)";
        $params = array_merge($params, ["%$search%", "%$search%", "%$search%"]);
    }
    if (!empty($status)) {
        $where .= " AND status = ?";
        $params[] = $status;
    }

    $stmt = $db->prepare("
        SELECT u.*, 
               (SELECT COUNT(*) FROM chat_sessions WHERE user_id=u.id) as total_sessions,
               (SELECT COUNT(*) FROM chat_messages WHERE user_id=u.id) as total_messages
        FROM users u $where ORDER BY u.created_at DESC
    ");
    $stmt->execute($params);
    $users = $stmt->fetchAll();
    jsonResponse(['success' => true, 'users' => $users]);
}

// ============================================
// DETAIL USER
// ============================================
function getUserDetail() {
    $db = getDB();
    $userId = (int)($_GET['user_id'] ?? 0);

    $stmt = $db->prepare("SELECT * FROM users WHERE id = ? AND role='user'");
    $stmt->execute([$userId]);
    $user = $stmt->fetch();
    if (!$user) jsonResponse(['success' => false, 'message' => 'User tidak ditemukan.']);

    // Chat sessions
    $stmt2 = $db->prepare("
        SELECT cs.*, (SELECT COUNT(*) FROM chat_messages WHERE session_id=cs.id) as msg_count
        FROM chat_sessions cs WHERE cs.user_id=? ORDER BY cs.updated_at DESC LIMIT 10
    ");
    $stmt2->execute([$userId]);
    $sessions = $stmt2->fetchAll();

    // Stats
    $totalMsgs = $db->prepare("SELECT COUNT(*) FROM chat_messages WHERE user_id=?");
    $totalMsgs->execute([$userId]);
    $msgCount = $totalMsgs->fetchColumn();

    unset($user['password']);
    jsonResponse([
        'success'  => true,
        'user'     => $user,
        'sessions' => $sessions,
        'total_messages' => $msgCount
    ]);
}

// ============================================
// UPDATE USER
// ============================================
function updateUser() {
    $db = getDB();
    $userId    = (int)($_POST['user_id'] ?? 0);
    $status    = sanitize($_POST['status'] ?? 'active');
    $msgLimit  = (int)($_POST['message_limit'] ?? 100);
    $fullName  = sanitize($_POST['full_name'] ?? '');
    $phone     = preg_replace('/[^0-9]/', '', $_POST['phone'] ?? '');

    $stmt = $db->prepare("UPDATE users SET status=?, message_limit=?, full_name=?, phone=? WHERE id=? AND role='user'");
    $stmt->execute([$status, $msgLimit, $fullName, $phone ?: null, $userId]);

    logAudit($_SESSION['user_id'], 'ADMIN_UPDATE_USER', "Updated user ID: $userId");
    jsonResponse(['success' => true, 'message' => 'User berhasil diperbarui.']);
}

// ============================================
// HAPUS USER
// ============================================
function deleteUser() {
    $db = getDB();
    $userId = (int)($_POST['user_id'] ?? 0);
    $stmt = $db->prepare("DELETE FROM users WHERE id=? AND role='user'");
    $stmt->execute([$userId]);
    logAudit($_SESSION['user_id'], 'ADMIN_DELETE_USER', "Deleted user ID: $userId");
    jsonResponse(['success' => true, 'message' => 'User berhasil dihapus.']);
}

// ============================================
// SET LIMIT USER
// ============================================
function setUserLimit() {
    $db = getDB();
    $userId = (int)($_POST['user_id'] ?? 0);
    $limit  = (int)($_POST['limit'] ?? 100);
    $reset  = (int)($_POST['reset_usage'] ?? 0);

    $query = $reset
        ? "UPDATE users SET message_limit=?, messages_used=0 WHERE id=?"
        : "UPDATE users SET message_limit=? WHERE id=?";
    $db->prepare($query)->execute([$limit, $userId]);
    logAudit($_SESSION['user_id'], 'ADMIN_SET_LIMIT', "Set limit user $userId to $limit");
    jsonResponse(['success' => true, 'message' => 'Limit berhasil diperbarui.']);
}

// ============================================
// GET AI SETTINGS
// ============================================
function getAISettings() {
    $db = getDB();
    $stmt = $db->query("SELECT * FROM ai_settings ORDER BY id ASC");
    $settings = $stmt->fetchAll();
    // Sembunyikan sebagian API key untuk keamanan
    foreach ($settings as &$s) {
        $s['is_active'] = ($s['is_active'] === 't' || $s['is_active'] === true);
        if (!empty($s['api_key'])) {
            $s['api_key_masked'] = substr($s['api_key'], 0, 8) . str_repeat('*', max(0, strlen($s['api_key']) - 12)) . substr($s['api_key'], -4);
        } else {
            $s['api_key_masked'] = '';
        }
    }
    jsonResponse(['success' => true, 'settings' => $settings]);
}

// ============================================
// UPDATE AI SETTING
// ============================================
function updateAISetting() {
    $db = getDB();
    $modelKey    = sanitize($_POST['model_key'] ?? '');
    $apiKey      = trim($_POST['api_key'] ?? '');
    $sysPrompt   = trim($_POST['system_prompt'] ?? '');
    $maxTokens   = (int)($_POST['max_tokens'] ?? 2048);
    $temperature = (float)($_POST['temperature'] ?? 0.7);
    $isActive    = ($_POST['is_active'] ?? '1') === '1' || $_POST['is_active'] === 't' ? 't' : 'f';
    $modelName   = sanitize($_POST['model_name'] ?? '');

    if (empty($apiKey) || $apiKey === '***') {
        // Jangan update jika tidak diisi
        $stmt = $db->prepare("UPDATE ai_settings SET model_name=?, system_prompt=?, max_tokens=?, temperature=?, is_active=? WHERE model_key=?");
        $stmt->execute([$modelName, $sysPrompt, $maxTokens, $temperature, $isActive, $modelKey]);
    } else {
        $stmt = $db->prepare("UPDATE ai_settings SET model_name=?, api_key=?, system_prompt=?, max_tokens=?, temperature=?, is_active=? WHERE model_key=?");
        $stmt->execute([$modelName, $apiKey, $sysPrompt, $maxTokens, $temperature, $isActive, $modelKey]);
    }

    logAudit($_SESSION['user_id'], 'ADMIN_UPDATE_AI', "Updated AI model: $modelKey");
    jsonResponse(['success' => true, 'message' => 'Pengaturan AI berhasil disimpan.']);
}

// ============================================
// GET GLOBAL SETTINGS
// ============================================
function getGlobalSettings() {
    $db = getDB();
    $stmt = $db->query("SELECT * FROM global_settings ORDER BY id ASC");
    $settings = $stmt->fetchAll();
    foreach ($settings as &$s) {
        if ($s['setting_type'] === 'boolean') {
            $s['setting_value'] = ($s['setting_value'] === 't' || $s['setting_value'] === true || $s['setting_value'] === '1');
        }
    }
    jsonResponse(['success' => true, 'settings' => $settings]);
}

// ============================================
// UPDATE GLOBAL SETTING
// ============================================
function updateGlobalSetting() {
    $db = getDB();
    $key   = sanitize($_POST['setting_key'] ?? '');
    $value = trim($_POST['setting_value'] ?? '');

    $stmt = $db->prepare("UPDATE global_settings SET setting_value=? WHERE setting_key=?");
    $stmt->execute([$value, $key]);
    logAudit($_SESSION['user_id'], 'ADMIN_UPDATE_SETTING', "Updated setting: $key = $value");
    jsonResponse(['success' => true, 'message' => 'Pengaturan berhasil disimpan.']);
}

// ============================================
// AUDIT LOG
// ============================================
function getAuditLog() {
    $db = getDB();
    $limit = (int)($_GET['limit'] ?? 50);
    $stmt = $db->prepare("
        SELECT al.*, u.username FROM audit_log al 
        LEFT JOIN users u ON al.user_id = u.id 
        ORDER BY al.created_at DESC LIMIT ?
    ");
    $stmt->execute([$limit]);
    $logs = $stmt->fetchAll();
    jsonResponse(['success' => true, 'logs' => $logs]);
}

// ============================================
// CHAT STATS
// ============================================
function getChatStats() {
    $db = getDB();
    $userId = (int)($_GET['user_id'] ?? 0);
    if ($userId) {
        $stmt = $db->prepare("
            SELECT DATE(created_at) as date, COUNT(*) as count 
            FROM chat_messages WHERE user_id=? 
            GROUP BY DATE(created_at) ORDER BY date DESC LIMIT 30
        ");
        $stmt->execute([$userId]);
    } else {
        $stmt = $db->query("
            SELECT DATE(created_at) as date, COUNT(*) as count 
            FROM chat_messages GROUP BY DATE(created_at) ORDER BY date DESC LIMIT 30
        ");
    }
    jsonResponse(['success' => true, 'stats' => $stmt->fetchAll()]);
}
