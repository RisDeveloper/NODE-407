<?php
// ================== DEBUG MODE ==================
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);
// ================================================

require_once 'config.php';

// Pastikan session aktif
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

checkMaintenance();

$action = $_POST['action'] ?? $_GET['action'] ?? '';

switch ($action) {
    case 'get_sessions':       getSessionsList(); break;
    case 'new_session':        newSession(); break;
    case 'delete_session':     deleteSession(); break;
    case 'rename_session':     renameSession(); break;
    case 'get_messages':       getMessages(); break;
    case 'send_message':       sendMessage(); break;
    case 'get_models':         getModels(); break;
    default:
        jsonResponse(['success' => false, 'message' => 'Aksi tidak valid.']);
}

// ============================================
// GET DAFTAR SESI CHAT
// ============================================
function getSessionsList() {
    $db = getDB();
    $userId = $_SESSION['user_id'] ?? 0;
    $stmt = $db->prepare("
        SELECT cs.*, 
               (SELECT content FROM chat_messages WHERE session_id = cs.id ORDER BY created_at DESC LIMIT 1) as last_message,
               (SELECT COUNT(*) FROM chat_messages WHERE session_id = cs.id) as msg_count
        FROM chat_sessions cs 
        WHERE cs.user_id = ? 
        ORDER BY cs.updated_at DESC
    ");
    $stmt->execute([$userId]);
    $sessions = $stmt->fetchAll(PDO::FETCH_ASSOC);
    jsonResponse(['success' => true, 'sessions' => $sessions]);
}

// ============================================
// BUAT SESI BARU
// ============================================
function newSession() {
    $db = getDB();
    $userId = $_SESSION['user_id'] ?? 0;
    $model  = sanitize($_POST['model'] ?? 'llama-3.1-8b-instant');

    $stmt = $db->prepare("INSERT INTO chat_sessions (user_id, title, model_key) VALUES (?, 'Chat Baru', ?)");
    $stmt->execute([$userId, $model]);
    $sessionId = $db->lastInsertId();
    jsonResponse(['success' => true, 'session_id' => $sessionId, 'title' => 'Chat Baru']);
}

// ============================================
// HAPUS SESI
// ============================================
function deleteSession() {
    $db = getDB();
    $userId    = $_SESSION['user_id'] ?? 0;
    $sessionId = (int)($_POST['session_id'] ?? 0);

    $stmt = $db->prepare("SELECT id FROM chat_sessions WHERE id = ? AND user_id = ?");
    $stmt->execute([$sessionId, $userId]);
    if (!$stmt->fetch(PDO::FETCH_ASSOC)) {
        jsonResponse(['success' => false, 'message' => 'Sesi tidak ditemukan.']);
    }
    $db->prepare("DELETE FROM chat_sessions WHERE id = ?")->execute([$sessionId]);
    jsonResponse(['success' => true, 'message' => 'Sesi dihapus.']);
}

// ============================================
// RENAME SESI
// ============================================
function renameSession() {
    $db = getDB();
    $userId    = $_SESSION['user_id'] ?? 0;
    $sessionId = (int)($_POST['session_id'] ?? 0);
    $title     = sanitize($_POST['title'] ?? 'Chat Baru');

    $stmt = $db->prepare("UPDATE chat_sessions SET title = ? WHERE id = ? AND user_id = ?");
    $stmt->execute([$title, $sessionId, $userId]);
    jsonResponse(['success' => true]);
}

// ============================================
// GET PESAN DALAM SESI
// ============================================
function getMessages() {
    $db = getDB();
    $userId    = $_SESSION['user_id'] ?? 0;
    $sessionId = (int)($_GET['session_id'] ?? 0);

    $stmt = $db->prepare("SELECT * FROM chat_sessions WHERE id = ? AND user_id = ?");
    $stmt->execute([$sessionId, $userId]);
    $session = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$session) {
        jsonResponse(['success' => false, 'message' => 'Sesi tidak ditemukan.']);
    }

    $stmt = $db->prepare("SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC");
    $stmt->execute([$sessionId]);
    $messages = $stmt->fetchAll(PDO::FETCH_ASSOC);
    jsonResponse(['success' => true, 'messages' => $messages, 'session' => $session]);
}

// ============================================
// KIRIM PESAN & PANGGIL AI
// ============================================
function sendMessage() {
    $db = getDB();
    $userId    = $_SESSION['user_id'] ?? 0;
    $sessionId = (int)($_POST['session_id'] ?? 0);
    $content   = trim($_POST['content'] ?? '');
    
    // Dibikin dinamis lagi, dengan fallback ke Gemini 2.5 Flash Latest bawaan API Key kamu
    $modelKey  = sanitize($_POST['model'] ?? 'llama-3.1-8b-instant');

    if (empty($content)) {
        jsonResponse(['success' => false, 'message' => 'Pesan tidak boleh kosong.']);
    }

    // Cek limit user
    $userStmt = $db->prepare("SELECT * FROM users WHERE id = ?");
    $userStmt->execute([$userId]);
    $user = $userStmt->fetch(PDO::FETCH_ASSOC);

    if (!$user) {
        jsonResponse(['success' => false, 'message' => 'User tidak valid. Silakan login ulang.']);
    }

    if ($user['messages_used'] >= $user['message_limit']) {
        jsonResponse(['success' => false, 'message' => 'Batas pesan Anda telah habis (' . $user['message_limit'] . ' pesan). Hubungi admin untuk penambahan limit.']);
    }

    // Verifikasi sesi
    $sessStmt = $db->prepare("SELECT * FROM chat_sessions WHERE id = ? AND user_id = ?");
    $sessStmt->execute([$sessionId, $userId]);
    $session = $sessStmt->fetch(PDO::FETCH_ASSOC);
    if (!$session) {
        jsonResponse(['success' => false, 'message' => 'Sesi tidak valid.']);
    }

    // Ambil setting AI model - Menggunakan TRUE standar SQL
    $modelStmt = $db->prepare("SELECT * FROM ai_settings WHERE model_key = ? AND is_active = TRUE");
    $modelStmt->execute([$modelKey]);
    $modelSettings = $modelStmt->fetch(PDO::FETCH_ASSOC);
    
    // Cadangan jika database membaca boolean sebagai string 'true'
    if (!$modelSettings) {
        $modelStmt = $db->prepare("SELECT * FROM ai_settings WHERE model_key = ? AND is_active = 'true'");
        $modelStmt->execute([$modelKey]);
        $modelSettings = $modelStmt->fetch(PDO::FETCH_ASSOC);
    }

    if (!$modelSettings) {
        jsonResponse(['success' => false, 'message' => 'Model AI tidak tersedia di database. Pastikan model_key sesuai dengan: ' . $modelKey]);
    }
    if (empty($modelSettings['api_key'])) {
        jsonResponse(['success' => false, 'message' => 'API Key untuk ' . $modelSettings['model_name'] . ' belum dikonfigurasi. Hubungi admin.']);
    }

    // Ambil riwayat pesan untuk konteks
    $histStmt = $db->prepare("SELECT role, content FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC LIMIT 20");
    $histStmt->execute([$sessionId]);
    $history = $histStmt->fetchAll(PDO::FETCH_ASSOC);

    // Simpan pesan user
    $insertStmt = $db->prepare("INSERT INTO chat_messages (session_id, user_id, role, content, model_key) VALUES (?, ?, 'user', ?, ?)");
    $insertStmt->execute([$sessionId, $userId, $content, $modelKey]);

    // Panggil AI
    $aiResponse = callAI($modelSettings, $history, $content);

    if (!$aiResponse['success']) {
        jsonResponse(['success' => false, 'message' => 'Error AI: ' . $aiResponse['message']]);
    }

    $aiText   = $aiResponse['text'];
    $tokensUsed = $aiResponse['tokens'] ?? 0;

    // Simpan respons AI
    $insertStmt2 = $db->prepare("INSERT INTO chat_messages (session_id, user_id, role, content, model_key, tokens_used) VALUES (?, ?, 'assistant', ?, ?, ?)");
    $insertStmt2->execute([$sessionId, $userId, $aiText, $modelKey, $tokensUsed]);

    // Update usage counter
    $db->prepare("UPDATE users SET messages_used = messages_used + 1 WHERE id = ?")->execute([$userId]);

    // Update sesi title jika masih "Chat Baru"
    if ($session['title'] === 'Chat Baru') {
        $autoTitle = mb_substr($content, 0, 40) . (mb_strlen($content) > 40 ? '...' : '');
        $db->prepare("UPDATE chat_sessions SET title = ?, model_key = ?, updated_at = NOW() WHERE id = ?")->execute([$autoTitle, $modelKey, $sessionId]);
    } else {
        $db->prepare("UPDATE chat_sessions SET updated_at = NOW() WHERE id = ?")->execute([$sessionId]);
    }

    jsonResponse([
        'success'  => true,
        'message'  => $aiText,
        'tokens'   => $tokensUsed,
        'used'     => $user['messages_used'] + 1,
        'limit'    => $user['message_limit']
    ]);
}

// ============================================
// GET DAFTAR MODEL
// ============================================
function getModels() {
    $db = getDB();
    $stmt = $db->prepare("
        SELECT model_key, model_name, model_description, is_active 
        FROM ai_settings 
        WHERE is_active = TRUE 
        ORDER BY id ASC
    ");
    $stmt->execute();
    $models = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    // Cadangan jika query TRUE di atas gagal membaca boolean
    if (empty($models)) {
        $stmt = $db->prepare("
            SELECT model_key, model_name, model_description, is_active 
            FROM ai_settings 
            WHERE is_active = 'true' 
            ORDER BY id ASC
        ");
        $stmt->execute();
        $models = $stmt->fetchAll(PDO::FETCH_ASSOC);
    }
    
    jsonResponse(['success' => true, 'models' => $models]);
}

// ============================================
// PANGGIL AI API
// ============================================
function callAI($settings, $history, $userMessage) {
    $modelKey  = $settings['model_key'];
    $apiKey    = $settings['api_key'];
    $endpoint  = $settings['api_endpoint'];
    $sysPrompt = $settings['system_prompt'];
    $maxTokens = (int)$settings['max_tokens'];
    $temp      = (float)$settings['temperature'];

    $messages = [];
    foreach ($history as $msg) {
        $messages[] = ['role' => $msg['role'], 'content' => $msg['content']];
    }
    $messages[] = ['role' => 'user', 'content' => $userMessage];

    // ---- LLAMA / GROQ (OpenAI Compatible Endpoint) ----
    if (strpos($modelKey, 'llama') !== false) {
        $msgs = [['role' => 'system', 'content' => $sysPrompt], ...$messages];
        $body = json_encode([
            'model'       => 'llama-3.1-8b-instant',
            'messages'    => $msgs,
            'max_tokens'  => $maxTokens,
            'temperature' => $temp
        ]);
        $headers = [
            'Content-Type: application/json',
            'Authorization: Bearer ' . $apiKey
        ];
        $response = curlPost($endpoint, $body, $headers);
        if (!$response['success']) return $response;
        $data = json_decode($response['data'], true);
        if (isset($data['error'])) {
            return ['success' => false, 'message' => $data['error']['message']];
        }
        return [
            'success' => true,
            'text'    => $data['choices'][0]['message']['content'] ?? 'Tidak ada respons.',
            'tokens'  => $data['usage']['completion_tokens'] ?? 0
        ];
    }

    // ---- OPENAI (GPT) ----
    if (strpos($modelKey, 'gpt') !== false) {
        $msgs = [['role' => 'system', 'content' => $sysPrompt], ...$messages];
        $body = json_encode([
            'model'       => 'gpt-4o',
            'messages'    => $msgs,
            'max_tokens'  => $maxTokens,
            'temperature' => $temp
        ]);
        $headers = [
            'Content-Type: application/json',
            'Authorization: Bearer ' . $apiKey
        ];
        $response = curlPost($endpoint, $body, $headers);
        if (!$response['success']) return $response;
        $data = json_decode($response['data'], true);
        if (isset($data['error'])) {
            return ['success' => false, 'message' => $data['error']['message']];
        }
        return [
            'success' => true,
            'text'    => $data['choices'][0]['message']['content'] ?? 'Tidak ada respons.',
            'tokens'  => $data['usage']['completion_tokens'] ?? 0
        ];
    }

    // ---- GOOGLE GEMINI ----
if (strpos($modelKey, 'gemini') !== false) {
    $geminiMsgs = [];
    foreach ($messages as $msg) {
        $geminiMsgs[] = [
            'role'  => $msg['role'] === 'assistant' ? 'model' : 'user',
            'parts' => [['text' => $msg['content']]]
        ];
    }
    $body = json_encode([
        'contents'          => $geminiMsgs,
        'systemInstruction' => ['parts' => [['text' => $sysPrompt]]],
        'generationConfig'  => ['maxOutputTokens' => $maxTokens, 'temperature' => $temp]
    ]);
    $modelEndpoint = $modelKey;
    $url = "https://generativelanguage.googleapis.com/v1beta/models/{$modelEndpoint}:generateContent?key={$apiKey}";
    $headers = ['Content-Type: application/json'];
    $response = curlPost($url, $body, $headers);
    if (!$response['success']) return $response;
    $data = json_decode($response['data'], true);
    if (isset($data['error'])) {
        return ['success' => false, 'message' => $data['error']['message']];
    }
    return [
        'success' => true,
        'text'    => $data['candidates'][0]['content']['parts'][0]['text'] ?? 'Tidak ada respons.',
        'tokens'  => $data['usageMetadata']['candidatesTokenCount'] ?? 0
    ];
}

    // ---- DEEPSEEK ----
    if (strpos($modelKey, 'deepseek') !== false) {
        $msgs = [['role' => 'system', 'content' => $sysPrompt], ...$messages];
        $body = json_encode([
            'model'       => $modelKey,
            'messages'    => $msgs,
            'max_tokens'  => $maxTokens,
            'temperature' => $temp
        ]);
        $headers = [
            'Content-Type: application/json',
            'Authorization: Bearer ' . $apiKey
        ];
        $response = curlPost($endpoint, $body, $headers);
        if (!$response['success']) return $response;
        $data = json_decode($response['data'], true);
        if (isset($data['error'])) {
            return ['success' => false, 'message' => $data['error']['message']];
        }
        return [
            'success' => true,
            'text'    => $data['choices'][0]['message']['content'] ?? 'Tidak ada respons.',
            'tokens'  => $data['usage']['completion_tokens'] ?? 0
        ];
    }

    return ['success' => false, 'message' => 'Model tidak dikenali.'];
}

// ============================================
// CURL HELPER
// ============================================
function curlPost($url, $body, $headers) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $body,
        CURLOPT_HTTPHEADER     => $headers,
        CURLOPT_TIMEOUT        => 60,
        CURLOPT_SSL_VERIFYPEER => false,
    ]);
    $data  = curl_exec($ch);
    $error = curl_error($ch);
    curl_close($ch);
    if ($error) return ['success' => false, 'message' => 'cURL Error: ' . $error];
    return ['success' => true, 'data' => $data];
}