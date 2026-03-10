-- 001_components.sql
-- Component registry: maps named components to their Figma node IDs.
-- Used for nested component awareness: when a child component already
-- exists in Figma, re-use it as an instance rather than rebuilding.

-- Enable uuid extension if not already enabled.
create extension if not exists "uuid-ossp";

-- ── Table ────────────────────────────────────────────────────────────────────

create table if not exists components (
  id                uuid        primary key default uuid_generate_v4(),
  figma_component_id text        not null,   -- Figma node id (e.g. "123:456")
  name              text        not null,    -- component name as stored in Figma
  file_key          text        not null,    -- Figma file key the component lives in
  last_synced_at    timestamptz,             -- last time this component was synced
  source_hash       text,                    -- SHA-256 of the source code that produced it
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- Primary lookup: find component by file + name (most common query).
create index if not exists components_file_key_name_idx
  on components (file_key, name);

-- Quick lookup by Figma component node id.
create index if not exists components_figma_id_idx
  on components (figma_component_id);

-- ── Updated-at trigger ────────────────────────────────────────────────────────

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger components_set_updated_at
  before update on components
  for each row execute procedure set_updated_at();

-- ── Row-Level Security ────────────────────────────────────────────────────────

alter table components enable row level security;

-- Authenticated users can read all components in their workspace.
create policy "Authenticated users can read components"
  on components for select
  using (auth.role() = 'authenticated');

-- Authenticated users can insert components (sync creates records).
create policy "Authenticated users can insert components"
  on components for insert
  with check (auth.role() = 'authenticated');

-- Authenticated users can update components (re-sync updates records).
create policy "Authenticated users can update components"
  on components for update
  using (auth.role() = 'authenticated');
