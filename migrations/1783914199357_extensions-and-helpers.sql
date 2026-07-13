-- Up Migration

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- UUIDv7 (time-ordered UUID) generator. RDS PostgreSQL 17 has no built-in uuidv7();
-- native support only lands in Postgres 18. Implementation: draft-ietf-uuidrev-rfc4122bis,
-- 48-bit big-endian ms timestamp + 10 random bytes, version/variant bits set per spec.
CREATE OR REPLACE FUNCTION uuid_generate_v7()
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  unix_ts_ms bytea;
  uuid_bytes bytea;
BEGIN
  unix_ts_ms = substring(int8send(floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint) FROM 3);
  uuid_bytes = unix_ts_ms || gen_random_bytes(10);
  uuid_bytes = set_byte(uuid_bytes, 6, (b'0111' || get_byte(uuid_bytes, 6)::bit(4))::bit(8)::int);
  uuid_bytes = set_byte(uuid_bytes, 8, (b'10' || get_byte(uuid_bytes, 8)::bit(6))::bit(8)::int);
  RETURN encode(uuid_bytes, 'hex')::uuid;
END
$$;

-- Down Migration

DROP FUNCTION IF EXISTS uuid_generate_v7();
DROP EXTENSION IF EXISTS pgcrypto;
