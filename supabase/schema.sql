-- Run this once in your Supabase project's SQL Editor.

create table if not exists kv_store (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  value text not null,
  updated_at timestamptz default now(),
  primary key (user_id, key)
);

alter table kv_store enable row level security;

create policy "select own rows" on kv_store
  for select using (auth.uid() = user_id);

create policy "insert own rows" on kv_store
  for insert with check (auth.uid() = user_id);

create policy "update own rows" on kv_store
  for update using (auth.uid() = user_id);

create policy "delete own rows" on kv_store
  for delete using (auth.uid() = user_id);
