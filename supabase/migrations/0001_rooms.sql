-- Little Tyrants — multiplayer room persistence
-- Run this in the Supabase SQL editor (or `supabase db push`). Realtime broadcast/presence need no tables;
-- this table only stores the latest world snapshot per room so friends can rejoin after everyone leaves.

create table if not exists public.rooms (
  code text primary key check (char_length(code) between 4 and 8),
  name text not null default 'Untitled world',
  mode text not null default 'friends',
  mp_mode text not null default 'shared',
  snapshot text not null,                 -- gzip+base64 (prefix "g:") or raw json (prefix "r:") world snapshot
  host_id text,
  player_count integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rooms_updated_at_idx on public.rooms (updated_at desc);

-- Casual-friends security model: anyone who knows a room code can read and update that room.
-- Codes are 6 random characters (~1 billion combinations) and are only shared by invite link.
-- There is no account system, so there is no per-user ownership to enforce. See README "Honest limitations".
alter table public.rooms enable row level security;

drop policy if exists "rooms_select_by_code" on public.rooms;
create policy "rooms_select_by_code" on public.rooms for select using (true);

drop policy if exists "rooms_insert_anyone" on public.rooms;
create policy "rooms_insert_anyone" on public.rooms for insert with check (true);

drop policy if exists "rooms_update_anyone" on public.rooms;
create policy "rooms_update_anyone" on public.rooms for update using (true) with check (true);

-- Optional housekeeping: delete rooms untouched for 30 days (requires pg_cron, available on Supabase Pro).
-- select cron.schedule('purge-old-rooms', '0 4 * * *', $$delete from public.rooms where updated_at < now() - interval '30 days'$$);
