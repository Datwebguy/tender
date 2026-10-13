CREATE TABLE IF NOT EXISTS tender_products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  token TEXT NOT NULL CHECK (length(trim(token)) > 0),
  image_url TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tender_orders (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  product TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  token TEXT NOT NULL CHECK (length(trim(token)) > 0),
  status TEXT NOT NULL CHECK (status IN ('pending', 'reserved', 'fulfilled', 'captured', 'refunded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deadline TIMESTAMPTZ NOT NULL,
  tx TEXT,
  buyer_address TEXT,
  management_token_hash TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS tender_orders_created_at_idx
  ON tender_orders (created_at DESC);
