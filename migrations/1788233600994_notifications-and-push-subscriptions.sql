-- Up Migration

-- Per-user in-app notification history -- one row per notification shown in the
-- bell/inbox UI. `type` drives the render variant (success | error | warning |
-- information | ...); `data` carries the deep-link/render payload (jobId,
-- batchId, href, ...). `read_at` is the source of truth for read state:
-- unread <=> read_at IS NULL.
CREATE TABLE notifications (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  user_id    uuid NOT NULL REFERENCES users (id),
  type       varchar(50) NOT NULL,
  title      varchar(255) NOT NULL,
  body       text,
  data       jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Main inbox query: "this user's notifications, newest first". id is uuid v7 so
-- it doubles as a stable created_at tie-breaker.
CREATE INDEX notifications_user_created_at_idx
  ON notifications (user_id, created_at DESC, id DESC);

-- Unread badge count + "unread only" filter. Partial so it stays small as read
-- rows accumulate.
CREATE INDEX notifications_user_unread_idx
  ON notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;

-- Web Push (RFC 8291 / VAPID) subscriptions -- one row per browser/device that
-- opted in. `endpoint` is the push service URL, globally unique per
-- subscription, so re-subscribing from the same browser should upsert on it
-- (ON CONFLICT (endpoint) DO UPDATE SET user_id, p256dh, auth). `p256dh` +
-- `auth` are the client keys used to encrypt the push payload.
CREATE TABLE push_subscriptions (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
  user_id    uuid NOT NULL REFERENCES users (id),
  endpoint   text NOT NULL UNIQUE,
  p256dh     text NOT NULL,
  auth       text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX push_subscriptions_user_id_idx ON push_subscriptions (user_id);

-- Down Migration

DROP TABLE IF EXISTS push_subscriptions;
DROP TABLE IF EXISTS notifications;
