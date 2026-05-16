<?php
// ============================================
// KONFIGURASI DATABASE SUPABASE (Direct Connection)
// ============================================

define('DB_HOST', getenv('DB_HOST') ?: 'db.lvveteqoidlcnmvuoupa.supabase.co');
define('DB_PORT', getenv('DB_PORT') ?: '5432');
define('DB_USER', getenv('DB_USER') ?: 'postgres');
define('DB_PASS', getenv('DB_PASS') ?: '@Faris111029H');
define('DB_NAME', getenv('DB_NAME') ?: 'postgres');

define('APP_NAME', 'NODE-407');
define('APP_VERSION', '1.0.0');
define('APP_URL', getenv('APP_URL') ?: 'http://localhost/NODE-407');

// Session config
ini_set('session.cookie_httponly', 1);
ini_set('session.use_only_cookies', 1);
session_start();

// ============================================
// KONEKSI DATABASE
// ============================================
function getDB() {
    static $pdo = null;
    if ($pdo === null) {
        try {
            $dsn = "pgsql:host=" . DB_HOST . 
                   ";port=" . DB_PORT . 
                   ";dbname=" . DB_NAME . 
                   ";sslmode=require;connect_timeout=10";

            // Try direct first, fallback to pooler
            $dbHost = DB_HOST;
            $dbUser = DB_USER;
            $dbPort = DB_PORT;
            
            if (getenv('DB_POOLER') === 'true') {
                $dbHost = 'aws-0-us-west-1.pooler.supabase.com';
                $dbUser = 'postgres.lvveteqoidlcnmvuoupa';
                $dbPort = '6543';
            }
            
            $dsn = "pgsql:host=" . $dbHost . 
                   ";port=" . $dbPort . 
                   ";dbname=" . DB_NAME . 
                   ";sslmode=require;connect_timeout=10";

            $options = [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ];

            $pdo = new PDO($dsn, $dbUser, DB_PASS, $options);
        } catch (PDOException $e) {
            error_log("DB Connection Error: " . $e->getMessage());
            die(json_encode([
                'success' => false, 
                'message' => 'Koneksi database gagal.',
                'debug' => $e->getMessage()
            ]));
        }
    }
    return $pdo;
}

// Helper: cek login
function isLoggedIn() {
    return isset($_SESSION['user_id']) && !empty($_SESSION['user_id']);
}

// Helper: cek admin
function isAdmin() {
    return isset($_SESSION['user_role']) && $_SESSION['user_role'] === 'admin';
}

// Helper: require login
function requireLogin() {
    if (!isLoggedIn()) {
        if (isAjax()) {
            echo json_encode(['success' => false, 'message' => 'Sesi habis, silakan login ulang.', 'redirect' => 'index.html']);
            exit;
        }
        header('Location: ' . APP_URL . '/index.html');
        exit;
    }
}

// Helper: require admin
function requireAdmin() {
    requireLogin();
    if (!isAdmin()) {
        if (isAjax()) {
            echo json_encode(['success' => false, 'message' => 'Akses ditolak.']);
            exit;
        }
        header('Location: ' . APP_URL . '/chat.php');
        exit;
    }
}

// Helper: cek AJAX request
function isAjax() {
    return isset($_SERVER['HTTP_X_REQUESTED_WITH']) && 
           strtolower($_SERVER['HTTP_X_REQUESTED_WITH']) === 'xmlhttprequest';
}

// Helper: response JSON
// Cari fungsi ini di file config.php kamu, lalu sesuaikan jalurnya:
function jsonResponse($data) {
    header('Content-Type: application/json');
    echo json_encode($data);
    exit; // <--- PASTIKAN ADA BARIS INI SEBELUM TUTUP KURUNG
}

// Helper: sanitize input
function sanitize($input) {
    return htmlspecialchars(strip_tags(trim($input)), ENT_QUOTES, 'UTF-8');
}

// Helper: get current user
function getCurrentUser() {
    if (!isLoggedIn()) return null;
    $db = getDB();
    $stmt = $db->prepare("SELECT id, username, email, full_name, avatar, role, status, message_limit, messages_used FROM users WHERE id = ?");
    $stmt->execute([$_SESSION['user_id']]);
    return $stmt->fetch();
}

// Helper: log audit
function logAudit($userId, $action, $details = '', $ip = null) {
    try {
        $db = getDB();
        $ip = $ip ?? ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
        $stmt = $db->prepare("INSERT INTO audit_log (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)");
        $stmt->execute([$userId, $action, $details, $ip]);
    } catch (Exception $e) {
        // silent fail
    }
}

// Helper: check maintenance mode
function checkMaintenance() {
    try {
        $db = getDB();
        $stmt = $db->prepare("SELECT setting_value FROM global_settings WHERE setting_key = 'maintenance_mode'");
        $stmt->execute();
        $row = $stmt->fetch();
        if ($row && ($row['setting_value'] === '1' || $row['setting_value'] === 't')) {
            if (!isAdmin()) {
                if (isAjax()) {
                    echo json_encode(['success' => false, 'message' => 'Maintenance mode aktif.']);
                    exit;
                }
                http_response_code(404);
                echo '<!DOCTYPE html><html><head><title>404 - Not Found</title><style>body{font-family:sans-serif;text-align:center;padding:80px 20px;background:#1a0000;color:#e2e8f0}h1{font-size:5em;margin:0;color:#CC0000}p{font-size:1.2em;color:#94a3b8}</style></head><body><h1>404</h1><p>Not Found — Tunggu ya, lagi di fix sama coder.</p></body></html>';
                exit;
            }
        }
    } catch (Exception $e) {
        // silent fail
    }
}

// Set headers CORS untuk API
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit(0); }