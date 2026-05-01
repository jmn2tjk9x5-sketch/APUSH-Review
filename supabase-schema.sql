create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  created_at timestamptz not null default now()
);

create table if not exists question_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  content_key text not null,
  content_title text not null,
  amsco_period text not null,
  mode text not null,
  question_type text not null,
  correct boolean not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;
alter table question_attempts enable row level security;

drop policy if exists "profiles_select_own" on profiles;
create policy "profiles_select_own"
on profiles for select
using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on profiles;
create policy "profiles_insert_own"
on profiles for insert
with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on profiles;
create policy "profiles_update_own"
on profiles for update
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "attempts_select_own" on question_attempts;
create policy "attempts_select_own"
on question_attempts for select
using (auth.uid() = user_id);

drop policy if exists "attempts_insert_own" on question_attempts;
create policy "attempts_insert_own"
on question_attempts for insert
with check (auth.uid() = user_id);

create index if not exists idx_question_attempts_user_created_at
on question_attempts(user_id, created_at desc);

create index if not exists idx_question_attempts_user_period
on question_attempts(user_id, amsco_period);
