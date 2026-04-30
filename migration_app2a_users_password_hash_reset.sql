-- App-2A clean users reset for app-table login
-- WARNING: deletes all rows from users.

DELETE FROM users;

ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'merchandiser';
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'users_username_unique'
    ) THEN
        ALTER TABLE users
        ADD CONSTRAINT users_username_unique UNIQUE (username);
    END IF;
END $$;

INSERT INTO users (email, username, password_hash, role, is_active)
VALUES ('admin@example.com', 'admin', 'admin123', 'admin', true);
