-- CampusOS tables for the Supabase store (run once in the Supabase SQL editor).
-- Each row keeps the full object in `data`, so the app and the JSON-file store share one shape.
create table if not exists tickets   (id text primary key, data jsonb not null, created_at timestamptz default now());
create table if not exists reports   (id text primary key, data jsonb not null, created_at timestamptz default now());
create table if not exists audit_log (id text primary key, data jsonb not null, created_at timestamptz default now());
create table if not exists wifi_samples (id text primary key, data jsonb not null, created_at timestamptz default now()); -- phone speed tests per room

-- Only the server (service key) talks to these tables.
alter table tickets   enable row level security;
alter table reports   enable row level security;
alter table audit_log enable row level security;
-- accounts (password hashes) and sessions (token hashes): server-only, never expose these tables to the browser
create table if not exists app_users    (id text primary key, data jsonb not null, created_at timestamptz default now());
create table if not exists app_sessions (id text primary key, data jsonb not null, created_at timestamptz default now());
alter table app_users    enable row level security;
alter table app_sessions enable row level security;
alter table wifi_samples enable row level security;

-- Photos: create a PUBLIC storage bucket named `campusos` (Storage → New bucket), or set SUPABASE_BUCKET.
