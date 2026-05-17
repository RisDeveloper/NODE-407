<?php
require_once 'config.php';

$action = $_POST['action'] ?? $_GET['action'] ?? '';

switch ($action) {
    case 'login':
        handleLogin();
        break;
    case 'register':
        handleRegister();
        break;
    case 'logout':
        handleLogout();
        break;
    case 'check':
        handleCheck();
        break;
    case 'get_user':
        handleGetUser();
        break;
    case 'send_verification':
        handleSendVerification();
        break;
    case 'verify_code':
        handleVerifyCode();
        break;
    case 'google_login':
        handleGoogleLogin();
        break;
    case 'google_callback':
        handleGoogleCallback();
        break;
    default:
        jsonResponse(['success' => false, 'message' => 'Aksi tidak valid.']);
}

// ============================================
// LOGIN (email, username, or phone)
// ============================================
function handleLogin() {
    $login   = trim($_POST['email'] ?? '');
    $password = $_POST['password'] ?? '';

    if (empty($login) || empty($password)) {
        jsonResponse(['success' => false, 'message' => 'Email/No. HP dan password harus diisi.']);
    }

    $db = getDB();

    // Cek apakah input adalah nomor HP atau email/username
    $isPhone = preg_match('/^[0-9+\-\s()]+$/', $login);

    if ($isPhone) {
        // Bersihkan nomor HP
        $phone = preg_replace('/[^0-9]/', '', $login);
        $stmt = $db->prepare("SELECT * FROM users WHERE phone = ? LIMIT 1");
        $stmt->execute([$phone]);
    } else {
        $stmt = $db->prepare("SELECT * FROM users WHERE email = ? OR username = ? LIMIT 1");
        $stmt->execute([$login, $login]);
    }
    $user = $stmt->fetch();

    if (!$user || !password_verify($password, $user['password'])) {
        jsonResponse(['success' => false, 'message' => 'Email/No. HP atau password salah.']);
    }

    if ($user['status'] !== 'active') {
        jsonResponse(['success' => false, 'message' => 'Akun Anda telah ' . ($user['status'] === 'suspended' ? 'disuspend' : 'diban') . '.']);
    }

    // Cek verifikasi email (skip untuk admin)
    if ($user['role'] !== 'admin') {
        $emailVerified = $user['email_verified'] === 't' || $user['email_verified'] === true;
        if (!$emailVerified) {
            // Kirim kode verifikasi
            $code = generateVerificationCode($user['id'], 'email');
            jsonResponse([
                'success' => false,
                'message' => 'Email belum diverifikasi. Kode verifikasi telah dikirim.',
                'need_verification' => true,
                'user_id' => $user['id'],
                'email' => maskEmail($user['email']),
                'code' => $code // untuk development
            ]);
        }
    }

    doLogin($user);
}

// ============================================
// REGISTER
// ============================================
function handleRegister() {
    $db = getDB();

    // Cek apakah registrasi diizinkan
    $settingStmt = $db->prepare("SELECT setting_value FROM global_settings WHERE setting_key = 'allow_registration'");
    $settingStmt->execute();
    $setting = $settingStmt->fetch();
    if ($setting && $setting['setting_value'] == '0') {
        jsonResponse(['success' => false, 'message' => 'Pendaftaran saat ini ditutup.']);
    }

    $full_name = sanitize($_POST['full_name'] ?? '');
    $username  = sanitize($_POST['username'] ?? '');
    $email     = sanitize($_POST['email'] ?? '');
    $phone     = preg_replace('/[^0-9]/', '', $_POST['phone'] ?? '');
    $password  = $_POST['password'] ?? '';
    $confirm   = $_POST['confirm_password'] ?? '';

    // Validasi
    if (empty($full_name) || empty($username) || empty($email) || empty($password)) {
        jsonResponse(['success' => false, 'message' => 'Semua field harus diisi.']);
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        jsonResponse(['success' => false, 'message' => 'Format email tidak valid.']);
    }
    if (strlen($password) < 6) {
        jsonResponse(['success' => false, 'message' => 'Password minimal 6 karakter.']);
    }
    if ($password !== $confirm) {
        jsonResponse(['success' => false, 'message' => 'Konfirmasi password tidak cocok.']);
    }
    if (!preg_match('/^[a-zA-Z0-9_]{3,20}$/', $username)) {
        jsonResponse(['success' => false, 'message' => 'Username hanya boleh huruf, angka, underscore (3-20 karakter).']);
    }
    if (!empty($phone) && !preg_match('/^[0-9]{10,15}$/', $phone)) {
        jsonResponse(['success' => false, 'message' => 'Format nomor HP tidak valid (10-15 digit).']);
    }

    // Cek duplikat
    $stmt = $db->prepare("SELECT id FROM users WHERE email = ? OR username = ?" . (!empty($phone) ? " OR phone = ?" : ""));
    $params = [$email, $username];
    if (!empty($phone)) $params[] = $phone;
    $stmt->execute($params);
    if ($stmt->fetch()) {
        jsonResponse(['success' => false, 'message' => 'Email, username, atau No. HP sudah terdaftar.']);
    }

    // Ambil default limit
    $limitStmt = $db->prepare("SELECT setting_value FROM global_settings WHERE setting_key = 'default_message_limit'");
    $limitStmt->execute();
    $limitSetting = $limitStmt->fetch();
    $defaultLimit = $limitSetting ? (int)$limitSetting['setting_value'] : 100;

    // Insert user
    $hashed = password_hash($password, PASSWORD_BCRYPT);
    $stmt = $db->prepare("INSERT INTO users (username, email, password, full_name, phone, message_limit) VALUES (?, ?, ?, ?, ?, ?)");
    $stmt->execute([$username, $email, $hashed, $full_name, $phone ?: null, $defaultLimit]);
    $userId = $db->lastInsertId();

    // Generate verification code
    $code = generateVerificationCode($userId, 'email');

    logAudit($userId, 'REGISTER', 'Akun baru dibuat');

    jsonResponse([
        'success' => true,
        'message' => 'Registrasi berhasil! Silakan masukkan kode verifikasi.',
        'need_verification' => true,
        'user_id' => $userId,
        'email' => maskEmail($email),
        'code' => $code // untuk development (tanpa mail server)
    ]);
}

// ============================================
// SEND VERIFICATION CODE
// ============================================
function handleSendVerification() {
    requireLogin();
    $db = getDB();
    $userId = $_SESSION['user_id'];
    $type = $_POST['type'] ?? 'email';

    $userStmt = $db->prepare("SELECT email, phone FROM users WHERE id = ?");
    $userStmt->execute([$userId]);
    $user = $userStmt->fetch();

    if (!$user) {
        jsonResponse(['success' => false, 'message' => 'User tidak ditemukan.']);
    }

    $code = generateVerificationCode($userId, $type);

    $destination = $type === 'email' ? maskEmail($user['email']) : maskPhone($user['phone']);
    jsonResponse([
        'success' => true,
        'message' => "Kode verifikasi telah dikirim ke $destination.",
        'code' => $code // untuk development
    ]);
}

// ============================================
// VERIFY CODE
// ============================================
function handleVerifyCode() {
    $userId = (int)($_POST['user_id'] ?? 0);
    $code   = trim($_POST['code'] ?? '');
    $type   = $_POST['type'] ?? 'email';

    if (empty($code)) {
        jsonResponse(['success' => false, 'message' => 'Kode verifikasi harus diisi.']);
    }

    $db = getDB();
    $stmt = $db->prepare("SELECT * FROM verification_codes WHERE user_id = ? AND type = ? AND code = ? AND used = FALSE AND expires_at > NOW() ORDER BY id DESC LIMIT 1");
    $stmt->execute([$userId, $type, $code]);
    $vc = $stmt->fetch();

    if (!$vc) {
        jsonResponse(['success' => false, 'message' => 'Kode verifikasi tidak valid atau sudah kadaluwarsa.']);
    }

    // Mark code as used
    $db->prepare("UPDATE verification_codes SET used = TRUE WHERE id = ?")->execute([$vc['id']]);

    // Update user verification status
    if ($type === 'email') {
        $db->prepare("UPDATE users SET email_verified = TRUE WHERE id = ?")->execute([$userId]);
    } else {
        $db->prepare("UPDATE users SET phone_verified = TRUE WHERE id = ?")->execute([$userId]);
    }

    // If user is not logged in yet, log them in
    if (!isLoggedIn()) {
        $userStmt = $db->prepare("SELECT * FROM users WHERE id = ?");
        $userStmt->execute([$userId]);
        $user = $userStmt->fetch();
        if ($user) {
            doLogin($user);
            return;
        }
    }

    jsonResponse(['success' => true, 'message' => 'Verifikasi berhasil!']);
}

// ============================================
// GOOGLE OAUTH LOGIN
// ============================================
function handleGoogleLogin() {
    $db = getDB();

    $clientIdStmt = $db->prepare("SELECT setting_value FROM global_settings WHERE setting_key = 'google_client_id'");
    $clientIdStmt->execute();
    $clientId = $clientIdStmt->fetchColumn();

    if (empty($clientId)) {
        jsonResponse(['success' => false, 'message' => 'Google Login belum dikonfigurasi.']);
    }

    $redirectUri = APP_URL . '/php/auth.php?action=google_callback';
    $params = http_build_query([
        'client_id' => $clientId,
        'redirect_uri' => $redirectUri,
        'response_type' => 'code',
        'scope' => 'openid email profile',
        'access_type' => 'online',
        'prompt' => 'select_account',
    ]);

    header('Location: https://accounts.google.com/o/oauth2/auth?' . $params);
    exit;
}

// ============================================
// GOOGLE OAUTH CALLBACK
// ============================================
function handleGoogleCallback() {
    $code = $_GET['code'] ?? '';
    if (empty($code)) {
        header('Location: ' . APP_URL . '/login.html?error=google_auth_failed');
        exit;
    }

    $db = getDB();

    $clientIdStmt = $db->prepare("SELECT setting_value FROM global_settings WHERE setting_key = 'google_client_id'");
    $clientIdStmt->execute();
    $clientId = $clientIdStmt->fetchColumn();

    $clientSecretStmt = $db->prepare("SELECT setting_value FROM global_settings WHERE setting_key = 'google_client_secret'");
    $clientSecretStmt->execute();
    $clientSecret = $clientSecretStmt->fetchColumn();

    if (empty($clientId) || empty($clientSecret)) {
        header('Location: ' . APP_URL . '/login.html?error=google_not_configured');
        exit;
    }

    $redirectUri = APP_URL . '/php/auth.php?action=google_callback';

    // Exchange code for token
    $tokenUrl = 'https://oauth2.googleapis.com/token';
    $postData = http_build_query([
        'code' => $code,
        'client_id' => $clientId,
        'client_secret' => $clientSecret,
        'redirect_uri' => $redirectUri,
        'grant_type' => 'authorization_code',
    ]);

    $ch = curl_init($tokenUrl);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $postData,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => ['Content-Type: application/x-www-form-urlencoded'],
        CURLOPT_TIMEOUT => 10,
    ]);
    $tokenResponse = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode !== 200) {
        header('Location: ' . APP_URL . '/login.html?error=google_token_failed');
        exit;
    }

    $tokenData = json_decode($tokenResponse, true);
    $accessToken = $tokenData['access_token'] ?? '';

    // Get user info from Google
    $ch = curl_init('https://www.googleapis.com/oauth2/v2/userinfo');
    curl_setopt_array($ch, [
        CURLOPT_HTTPHEADER => ["Authorization: Bearer $accessToken"],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 10,
    ]);
    $userInfo = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode !== 200) {
        header('Location: ' . APP_URL . '/login.html?error=google_userinfo_failed');
        exit;
    }

    $googleUser = json_decode($userInfo, true);
    $googleId = $googleUser['id'] ?? '';
    $email = $googleUser['email'] ?? '';
    $name = $googleUser['name'] ?? '';
    $avatar = $googleUser['picture'] ?? '';

    if (empty($email)) {
        header('Location: ' . APP_URL . '/login.html?error=google_no_email');
        exit;
    }

    // Check if user exists by google_id or email
    $stmt = $db->prepare("SELECT * FROM users WHERE google_id = ? OR email = ? LIMIT 1");
    $stmt->execute([$googleId, $email]);
    $user = $stmt->fetch();

    if ($user) {
        // Update google_id if not set
        if (empty($user['google_id'])) {
            $db->prepare("UPDATE users SET google_id = ?, avatar = ?, email_verified = TRUE WHERE id = ?")
                ->execute([$googleId, $avatar ?: null, $user['id']]);
        }
        $_SESSION['user_id'] = $user['id'];
        $_SESSION['user_role'] = $user['role'];
        $_SESSION['username'] = $user['username'];
        $db->prepare("UPDATE users SET last_login = NOW() WHERE id = ?")->execute([$user['id']]);
        logAudit($user['id'], 'LOGIN', 'Login via Google');
        redirectAfterLogin($user['role']);
    } else {
        // Create new user
        $username = strtolower(explode('@', $email)[0]) . rand(100, 999);
        $baseUsername = $username;

        // Ensure unique username
        $checkStmt = $db->prepare("SELECT id FROM users WHERE username = ?");
        while (true) {
            $checkStmt->execute([$username]);
            if (!$checkStmt->fetch()) break;
            $username = $baseUsername . rand(10, 99);
        }

        $hashed = password_hash(bin2hex(random_bytes(16)), PASSWORD_BCRYPT);
        $limitStmt = $db->prepare("SELECT setting_value FROM global_settings WHERE setting_key = 'default_message_limit'");
        $limitStmt->execute();
        $defaultLimit = (int)($limitStmt->fetchColumn() ?: 100);

        $stmt = $db->prepare("INSERT INTO users (username, email, password, full_name, avatar, google_id, email_verified, message_limit) VALUES (?, ?, ?, ?, ?, ?, TRUE, ?)");
        $stmt->execute([$username, $email, $hashed, $name, $avatar ?: null, $googleId, $defaultLimit]);
        $userId = $db->lastInsertId();

        logAudit($userId, 'REGISTER', 'Akun baru via Google');

        $_SESSION['user_id'] = $userId;
        $_SESSION['user_role'] = 'user';
        $_SESSION['username'] = $username;
        $db->prepare("UPDATE users SET last_login = NOW() WHERE id = ?")->execute([$userId]);
        logAudit($userId, 'REGISTER', 'Akun baru via Google');
        redirectAfterLogin('user');
    }
}

// ============================================
// LOGOUT
// ============================================
function handleLogout() {
    if (isLoggedIn()) {
        logAudit($_SESSION['user_id'], 'LOGOUT', 'Logout');
    }
    session_destroy();
    jsonResponse(['success' => true, 'message' => 'Logout berhasil.']);
}

// ============================================
// CHECK SESSION
// ============================================
function handleCheck() {
    if (isLoggedIn()) {
        $user = getCurrentUser();
        jsonResponse(['success' => true, 'logged_in' => true, 'user' => $user]);
    } else {
        // Check Google config status
        try {
            $db = getDB();
            $gStmt = $db->prepare("SELECT setting_value FROM global_settings WHERE setting_key = 'google_client_id'");
            $gStmt->execute();
            $googleConfigured = !empty($gStmt->fetchColumn());
        } catch (Exception $e) {
            $googleConfigured = false;
        }
        jsonResponse(['success' => true, 'logged_in' => false, 'google_configured' => $googleConfigured]);
    }
}

// ============================================
// GET USER DATA
// ============================================
function handleGetUser() {
    requireLogin();
    $user = getCurrentUser();
    jsonResponse(['success' => true, 'user' => $user]);
}

// ============================================
// HELPERS
// ============================================

function generateVerificationCode($userId, $type) {
    $db = getDB();
    $code = str_pad(rand(0, 999999), 6, '0', STR_PAD_LEFT);
    $stmt = $db->prepare("INSERT INTO verification_codes (user_id, code, type, expires_at) VALUES (?, ?, ?, NOW() + INTERVAL '10 minutes')");
    $stmt->execute([$userId, $code, $type]);
    return $code;
}

function doLogin($user) {
    $_SESSION['user_id'] = $user['id'];
    $_SESSION['user_role'] = $user['role'];
    $_SESSION['username'] = $user['username'];

    $db = getDB();
    $db->prepare("UPDATE users SET last_login = NOW() WHERE id = ?")->execute([$user['id']]);

    logAudit($user['id'], 'LOGIN', 'Login berhasil');

    jsonResponse([
        'success' => true,
        'message' => 'Login berhasil!',
        'user' => [
            'id' => $user['id'],
            'username' => $user['username'],
            'full_name' => $user['full_name'],
            'email' => $user['email'],
            'role' => $user['role'],
            'avatar' => $user['avatar']
        ],
        'redirect' => $user['role'] === 'admin' ? 'admin.html' : 'chat.php'
    ]);
}

function redirectAfterLogin($role) {
    header('Location: ' . APP_URL . ($role === 'admin' ? '/admin.html' : '/chat.php'));
    exit;
}

function maskEmail($email) {
    if (empty($email)) return '';
    $parts = explode('@', $email);
    $name = $parts[0];
    $domain = $parts[1] ?? '';
    $masked = substr($name, 0, 2) . str_repeat('*', max(0, strlen($name) - 2));
    return $masked . '@' . $domain;
}

function maskPhone($phone) {
    if (empty($phone)) return '';
    return substr($phone, 0, 3) . str_repeat('*', max(0, strlen($phone) - 5)) . substr($phone, -2);
}
