-- Adds the Vault section: logins and API keys sorted into categories.
-- Paste this into Supabase > SQL Editor > New query, then click Run.
-- It is safe to run more than once.
--
-- Passwords and API keys are locked in your browser with your vault passphrase before
-- they are saved, so this database only ever holds scrambled text for them. The
-- passphrase itself is never sent or stored anywhere. The name, web address, user ID
-- and note are saved as plain text, so you can still see them if you forget the passphrase.

-- Categories are two levels deep: a category (parent_id = null) and its subcategories.
create table if not exists public.vault_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  parent_id uuid references public.vault_categories (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  position double precision not null default 0,
  created_at timestamptz not null default now()
);

-- An entry with category_id = null shows up under "Uncategorized".
-- password and api_key hold the encrypted value ("iv.ciphertext" in base64), or null when empty.
create table if not exists public.vault_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category_id uuid references public.vault_categories (id) on delete set null,
  name text not null check (char_length(name) between 1 and 100),
  url text not null default '' check (char_length(url) <= 250),
  username text not null default '' check (char_length(username) <= 250),
  password text check (char_length(password) <= 2000),
  api_key text check (char_length(api_key) <= 2000),
  note text not null default '' check (char_length(note) <= 250),
  position double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per person: what's needed to turn the passphrase back into the key.
-- check_value is a known word encrypted with the key, so a wrong passphrase can be spotted.
create table if not exists public.vault_keys (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  salt text not null,
  iterations integer not null check (iterations >= 100000),
  check_value text not null,
  created_at timestamptz not null default now()
);

create index if not exists vault_categories_user_idx on public.vault_categories (user_id);
create index if not exists vault_entries_user_idx on public.vault_entries (user_id);
create index if not exists vault_entries_category_idx on public.vault_entries (category_id);

alter table public.vault_categories enable row level security;
alter table public.vault_entries enable row level security;
alter table public.vault_keys enable row level security;

-- Every person can only see and change their own vault. Nothing here is ever shared.
drop policy if exists "Own vault categories" on public.vault_categories;
create policy "Own vault categories" on public.vault_categories
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Own vault entries" on public.vault_entries;
create policy "Own vault entries" on public.vault_entries
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Own vault key" on public.vault_keys;
create policy "Own vault key" on public.vault_keys
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Reset the vault after a forgotten passphrase: every password and API key is wiped
-- (names, web addresses, user IDs and notes stay), and the new passphrase takes over.
-- It all happens at once, so a half-finished reset can't leave old and new mixed up.
create or replace function public.reset_vault(new_salt text, new_iterations integer, new_check_value text)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  update vault_entries set password = null, api_key = null, updated_at = now() where user_id = auth.uid();
  insert into vault_keys (user_id, salt, iterations, check_value)
    values (auth.uid(), new_salt, new_iterations, new_check_value)
    on conflict (user_id) do update
      set salt = excluded.salt, iterations = excluded.iterations,
          check_value = excluded.check_value, created_at = now();
end;
$$;

revoke all on function public.reset_vault(text, integer, text) from public, anon;
grant execute on function public.reset_vault(text, integer, text) to authenticated;
