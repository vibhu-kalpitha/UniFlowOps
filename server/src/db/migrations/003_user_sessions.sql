-- 003_user_sessions.sql — Database-Backed User Session Management Table

CREATE TABLE IF NOT EXISTS user_sessions (
  id VARCHAR(191) PRIMARY KEY,
  user_id VARCHAR(191) NOT NULL,
  token_hash VARCHAR(255) NOT NULL,
  ip_address VARCHAR(191) NULL,
  user_agent TEXT NULL,
  login_at DATETIME(3) NOT NULL,
  last_seen_at DATETIME(3) NOT NULL,
  logout_at DATETIME(3) NULL,
  expires_at DATETIME(3) NOT NULL,
  revoked_at DATETIME(3) NULL,
  active TINYINT NOT NULL DEFAULT 1,
  INDEX idx_sessions_user (user_id),
  INDEX idx_sessions_active (active),
  INDEX idx_sessions_expires (expires_at),
  INDEX idx_sessions_hash (token_hash),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
