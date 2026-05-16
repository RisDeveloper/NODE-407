-- ============================================
-- AI CHATBOT DATABASE SCHEMA (PostgreSQL)
-- ============================================

-- ============================================
-- TABEL USERS
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20) DEFAULT NULL,
    avatar VARCHAR(255) DEFAULT NULL,
    google_id VARCHAR(255) DEFAULT NULL,
    role VARCHAR(10) DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    status VARCHAR(10) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'banned')),
    email_verified BOOLEAN DEFAULT FALSE,
    phone_verified BOOLEAN DEFAULT FALSE,
    message_limit INT DEFAULT 100,
    messages_used INT DEFAULT 0,
    reset_date DATE DEFAULT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    last_login TIMESTAMP NULL,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- TABEL AI SETTINGS (per model)
-- ============================================
CREATE TABLE IF NOT EXISTS ai_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    model_key VARCHAR(50) NOT NULL UNIQUE,
    model_name VARCHAR(100) NOT NULL,
    model_description TEXT,
    api_key VARCHAR(500) DEFAULT '',
    api_endpoint VARCHAR(255) DEFAULT '',
    system_prompt TEXT DEFAULT 'You are a helpful AI assistant.',
    max_tokens INT DEFAULT 2048,
    temperature FLOAT DEFAULT 0.7,
    is_active TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ============================================
-- TABEL CHAT SESSIONS
-- ============================================
CREATE TABLE IF NOT EXISTS chat_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    title VARCHAR(200) DEFAULT 'Chat Baru',
    model_key VARCHAR(50) DEFAULT 'llama-3.1-8b-instant',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================
-- TABEL CHAT MESSAGES
-- ============================================
CREATE TABLE IF NOT EXISTS chat_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id INT NOT NULL,
    user_id INT NOT NULL,
    role ENUM('user', 'assistant') NOT NULL,
    content TEXT NOT NULL,
    model_key VARCHAR(50) DEFAULT NULL,
    tokens_used INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================
-- TABEL GLOBAL SETTINGS
-- ============================================
CREATE TABLE IF NOT EXISTS global_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    setting_key VARCHAR(100) NOT NULL UNIQUE,
    setting_value TEXT,
    setting_type ENUM('text', 'number', 'boolean', 'json') DEFAULT 'text',
    description VARCHAR(255),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ============================================
-- TABEL AUDIT LOG
-- ============================================
CREATE TABLE IF NOT EXISTS audit_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    action VARCHAR(100) NOT NULL,
    details TEXT,
    ip_address VARCHAR(45),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- ============================================
-- DATA DEFAULT
-- ============================================

-- Admin default (password: admin123)
INSERT INTO users (username, email, password, full_name, role, message_limit) VALUES 
('admin', 'admin@aichat.com', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Administrator', 'admin', 999999);

-- AI Models default
INSERT INTO ai_settings (model_key, model_name, model_description, api_endpoint, system_prompt, max_tokens, temperature) VALUES
('claude-sonnet', 'Claude Sonnet 4', 'Model Claude terbaru dari Anthropic, sangat pintar dan cepat.', 'https://api.anthropic.com/v1/messages', 'You are a helpful, harmless, and honest AI assistant named Claude. Respond in the same language as the user.', 2048, 0.7),
('gpt-4o', 'GPT-4o', 'Model terbaru dari OpenAI dengan kemampuan multimodal.', 'https://api.openai.com/v1/chat/completions', 'You are a helpful AI assistant. Respond in the same language as the user.', 2048, 0.7),
('gemini-pro', 'Gemini 2.0 Flash', 'Model dari Google DeepMind yang cepat dan efisien.', 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent', 'You are a helpful AI assistant. Respond in the same language as the user.', 2048, 0.7),
('deepseek', 'DeepSeek Chat', 'Model AI dari DeepSeek, cerdas dan hemat biaya.', 'https://api.deepseek.com/v1/chat/completions', 'You are a helpful AI assistant. Respond in the same language as the user.', 2048, 0.7);

-- Global settings default
INSERT INTO global_settings (setting_key, setting_value, setting_type, description) VALUES
('site_name', 'NODE-407', 'text', 'Nama aplikasi'),
('default_message_limit', '100', 'number', 'Batas pesan default untuk user baru'),
('allow_registration', '1', 'boolean', 'Izinkan pendaftaran user baru'),
('maintenance_mode', '0', 'boolean', 'Mode maintenance'),
('welcome_message', 'Selamat datang! Saya siap membantu Anda hari ini.', 'text', 'Pesan sambutan AI'),
('google_client_id', '', 'text', 'Google OAuth Client ID'),
('google_client_secret', '', 'text', 'Google OAuth Client Secret');

-- ============================================
-- TABEL VERIFICATION CODES
-- ============================================
CREATE TABLE IF NOT EXISTS verification_codes (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    code VARCHAR(6) NOT NULL,
    type VARCHAR(10) NOT NULL CHECK (type IN ('email', 'phone')),
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX idx_chat_sessions_user ON chat_sessions(user_id);
CREATE INDEX idx_chat_messages_session ON chat_messages(session_id);
CREATE INDEX idx_chat_messages_user ON chat_messages(user_id);
CREATE INDEX idx_audit_log_user ON audit_log(user_id);
CREATE INDEX idx_verify_codes_user ON verification_codes(user_id);
CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_google_id ON users(google_id);
