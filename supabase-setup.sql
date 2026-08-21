-- 在 Supabase → SQL Editor 中整段执行一次

create table if not exists public.vocab_snapshots (
  user_id uuid primary key references auth.users (id) on delete cascade,
  items jsonb not null default '[]'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.vocab_snapshots enable row level security;

drop policy if exists "own row only" on public.vocab_snapshots;

create policy "own row only"
  on public.vocab_snapshots
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
