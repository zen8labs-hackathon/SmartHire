-- Up Migration

-- Seed test admin user if it doesn't already exist.
-- Email: admin@smart-hire.test
-- Username: admin
-- Role: admin
-- Password: SmartHireTestAdmin!1
-- Password Hash: $2b$12$zs5wm/0dWafjryauD2G7J.hCkAwWI9jEEYNP1acxPBpgj4bOUloqu
INSERT INTO users (id, email, username, role, password_hash)
VALUES (
  'a1111111-1111-4111-8111-111111111111',
  'admin@smart-hire.test',
  'admin',
  'admin',
  '$2b$12$zs5wm/0dWafjryauD2G7J.hCkAwWI9jEEYNP1acxPBpgj4bOUloqu'
)
ON CONFLICT DO NOTHING;

-- Down Migration

DELETE FROM users WHERE id = 'a1111111-1111-4111-8111-111111111111';
