-- App-2A Roles & Permissions alignment
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
  module TEXT NOT NULL,
  can_view BOOLEAN DEFAULT false,
  can_create BOOLEAN DEFAULT false,
  can_edit BOOLEAN DEFAULT false,
  can_delete BOOLEAN DEFAULT false,
  UNIQUE(role_id, module)
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS role_id UUID REFERENCES roles(id);

INSERT INTO roles (name) VALUES ('admin') ON CONFLICT DO NOTHING;
INSERT INTO roles (name) VALUES ('merchandiser') ON CONFLICT DO NOTHING;

UPDATE users SET role_id = (SELECT id FROM roles WHERE name = 'admin'), role = 'admin' WHERE username = 'admin';
UPDATE users SET role_id = (SELECT id FROM roles WHERE name = 'merchandiser'), role = 'merchandiser' WHERE role_id IS NULL;

DO $$
DECLARE r_id UUID;
BEGIN
  SELECT id INTO r_id FROM roles WHERE name = 'admin';
  INSERT INTO permissions (role_id, module, can_view, can_create, can_edit, can_delete)
  VALUES
    (r_id, 'dashboard', true, true, true, true),
    (r_id, 'orders', true, true, true, true),
    (r_id, 'purchasing', true, true, true, true),
    (r_id, 'buyers', true, true, true, true),
    (r_id, 'suppliers', true, true, true, true),
    (r_id, 'sampling', true, true, true, true),
    (r_id, 'parcels', true, true, true, true),
    (r_id, 'shipping', true, true, true, true),
    (r_id, 'library', true, true, true, true),
    (r_id, 'reports', true, true, true, true),
    (r_id, 'settings', true, true, true, true)
  ON CONFLICT (role_id, module) DO UPDATE SET can_view = true, can_create = true, can_edit = true, can_delete = true;
END $$;
