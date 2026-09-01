-- A credential for a thing that cannot sign in.
--
-- A watch has no browser, no session and no way to complete an OAuth round
-- trip on a 46mm screen. It needs a bearer token it can hold and present, and
-- that token has to say which person's data it may write to.
--
-- WHAT IS STORED IS A HASH, NOT THE TOKEN. The plaintext exists exactly twice:
-- once on the watch, and once on screen at the moment it is created. A leak of
-- this table yields no working credentials, which is the whole reason to hash
-- it — the same argument as a password, for the same reason.
--
-- WRITE ONLY. Nothing about this table grants reading health data. The edge
-- function that accepts a device token inserts observations and returns a
-- count; it has no path that returns a record. A stolen watch token can add
-- noise to a day, which is recoverable, and cannot read a history, which is
-- not.
create table if not exists public.device_tokens (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users (id) on delete cascade,
  -- sha256 of the plaintext, hex. Not bcrypt: this is a 256-bit random value,
  -- not a human-chosen password, so there is nothing for a slow hash to defend
  -- against — no dictionary, no reuse across sites, no guessable structure.
  token_hash  text        not null unique,
  -- "Matan's FR265". For the person to recognise which watch to revoke.
  label       text        not null,
  created_at  timestamptz not null default now(),
  -- Set when the token is withdrawn. Kept rather than deleted so that a
  -- revoked token's writes stay attributable in the audit trail.
  revoked_at  timestamptz,
  last_used_at timestamptz
);

create index if not exists device_tokens_user_idx on public.device_tokens (user_id);
create index if not exists device_tokens_hash_idx on public.device_tokens (token_hash) where revoked_at is null;

-- The browser may list and revoke its own tokens; it may never read a hash.
-- The hash column is excluded from the grant rather than hidden by a view,
-- because a grant is checked by the database and a view is checked by whoever
-- remembers to use it.
revoke all on public.device_tokens from anon, authenticated;
grant select (id, user_id, label, created_at, revoked_at, last_used_at) on public.device_tokens to authenticated;
grant update (revoked_at) on public.device_tokens to authenticated;

alter table public.device_tokens enable row level security;

drop policy if exists device_tokens_own on public.device_tokens;
create policy device_tokens_own on public.device_tokens
  for select using (auth.uid() = user_id);

drop policy if exists device_tokens_revoke_own on public.device_tokens;
create policy device_tokens_revoke_own on public.device_tokens
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Creating one is deliberately NOT granted here. A token is minted by an edge
-- function holding the service role, which is the only place that sees the
-- plaintext and the only place that can hash it before it lands.
comment on table public.device_tokens is
  'Bearer credentials for devices that cannot sign in. Hashed; write-only in effect.';
