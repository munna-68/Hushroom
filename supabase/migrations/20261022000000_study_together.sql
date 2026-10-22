-- Study Together: schema, RLS, RPCs and Realtime authorization.
-- All writes go through SECURITY DEFINER functions so the room cap, bans,
-- chat length and chat rate limits are enforced server-side.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- tables
create table if not exists public.rooms (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 40),
  is_public   boolean not null default true,
  focus_min   int not null check (focus_min in (25, 50)),
  break_min   int not null check (break_min in (5, 10)),
  started_at  timestamptz not null default now(),
  created_by  uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);
create index if not exists rooms_public_idx on public.rooms (is_public, created_at desc);

create table if not exists public.room_members (
  room_id    uuid not null references public.rooms (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  joined_at  timestamptz not null default now(),
  last_seen  timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index if not exists room_members_user_idx on public.room_members (user_id);

create table if not exists public.room_bans (
  room_id    uuid not null references public.rooms (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  until      timestamptz not null,
  banned_by  uuid references auth.users (id) on delete set null,
  primary key (room_id, user_id)
);

create table if not exists public.messages (
  id          bigint generated always as identity primary key,
  room_id     uuid not null references public.rooms (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  nickname    text not null,
  body        text not null check (char_length(body) between 1 and 280),
  created_at  timestamptz not null default now()
);
create index if not exists messages_user_time_idx on public.messages (user_id, created_at desc);

create table if not exists public.reports (
  id           bigint generated always as identity primary key,
  room_id      uuid references public.rooms (id) on delete set null,
  reporter_id  uuid not null references auth.users (id) on delete cascade,
  target_id    uuid not null,
  reason       text not null check (char_length(reason) between 1 and 60),
  message      text check (message is null or char_length(message) <= 280),
  created_at   timestamptz not null default now()
);

-- RLS on with no policies: clients have no direct table access. Everything goes through the RPCs below.
alter table public.rooms        enable row level security;
alter table public.room_members enable row level security;
alter table public.room_bans    enable row level security;
alter table public.messages     enable row level security;
alter table public.reports      enable row level security;

-- ---------------------------------------------------------------- helpers
-- A member counts as present if their heartbeat is fresh (client pings every 60 s).
create or replace function public._fresh() returns interval language sql immutable as $$ select interval '3 minutes' $$;

create or replace function public._uid() returns uuid language plpgsql stable as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'not_authenticated'; end if;
  return u;
end $$;

-- ---------------------------------------------------------------- RPCs
create or replace function public.server_now() returns timestamptz
language sql stable as $$ select now() $$;

create or replace function public.list_rooms()
returns table (id uuid, name text, is_public boolean, focus_min int, break_min int,
               started_at timestamptz, created_by uuid, participants int)
language sql stable security definer set search_path = public as $$
  select r.id, r.name, r.is_public, r.focus_min, r.break_min, r.started_at, r.created_by, c.n::int
  from rooms r
  cross join lateral (
    select count(*) as n from room_members m where m.room_id = r.id and m.last_seen > now() - _fresh()
  ) c
  where r.is_public and (c.n > 0 or r.created_at > now() - interval '30 minutes')
  order by c.n desc, r.created_at desc
  limit 50
$$;

create or replace function public.create_room(p_name text, p_focus int, p_break int, p_public boolean default true)
returns uuid language plpgsql security definer set search_path = public as $$
declare u uuid := _uid(); rid uuid;
begin
  if (select count(*) from rooms where created_by = u and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'too_many_rooms';
  end if;
  if not ((p_focus = 25 and p_break = 5) or (p_focus = 50 and p_break = 10)) then
    p_focus := 25; p_break := 5;
  end if;
  insert into rooms (name, is_public, focus_min, break_min, created_by)
  values (coalesce(nullif(left(btrim(p_name), 40), ''), 'Study hall'), coalesce(p_public, true), p_focus, p_break, u)
  returning id into rid;
  return rid;
end $$;

create or replace function public.quick_join() returns uuid
language plpgsql security definer set search_path = public as $$
declare u uuid := _uid(); rid uuid;
begin
  select r.id into rid
  from rooms r
  where r.is_public and r.focus_min = 25
    and not exists (select 1 from room_bans b where b.room_id = r.id and b.user_id = u and b.until > now())
    and (select count(*) from room_members m where m.room_id = r.id and m.last_seen > now() - _fresh() and m.user_id <> u) < 10
    and (select count(*) from room_members m where m.room_id = r.id and m.last_seen > now() - _fresh()) > 0
  order by (select count(*) from room_members m where m.room_id = r.id and m.last_seen > now() - _fresh()) desc, r.created_at
  limit 1;
  if rid is null then
    insert into rooms (name, focus_min, break_min, created_by) values ('Study hall', 25, 5, u) returning id into rid;
  end if;
  return rid;
end $$;

create or replace function public.join_room(p_room uuid) returns public.rooms
language plpgsql security definer set search_path = public as $$
declare u uuid := _uid(); r rooms;
begin
  select * into r from rooms where id = p_room for update;  -- serialises joins per room
  if not found then raise exception 'not_found'; end if;
  if exists (select 1 from room_bans where room_id = p_room and user_id = u and until > now()) then
    raise exception 'banned';
  end if;
  delete from room_members where room_id = p_room and last_seen < now() - _fresh();
  delete from room_members where user_id = u and room_id <> p_room;  -- one room at a time
  if exists (select 1 from room_members where room_id = p_room and user_id = u) then
    update room_members set last_seen = now() where room_id = p_room and user_id = u;
    return r;
  end if;
  if (select count(*) from room_members where room_id = p_room) >= 10 then
    raise exception 'room_full';
  end if;
  insert into room_members (room_id, user_id) values (p_room, u);
  return r;
end $$;

create or replace function public.touch_member(p_room uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update room_members set last_seen = now() where room_id = p_room and user_id = _uid();
  return found;
end $$;

create or replace function public.leave_room(p_room uuid) returns void
language sql security definer set search_path = public as $$
  delete from room_members where room_id = p_room and user_id = auth.uid()
$$;

create or replace function public.send_message(p_room uuid, p_nickname text, p_body text) returns void
language plpgsql security definer set search_path = public as $$
declare u uuid := _uid(); b text := btrim(p_body); n text := left(btrim(coalesce(p_nickname, '')), 20); m messages;
begin
  if b is null or char_length(b) = 0 then return; end if;
  if char_length(b) > 280 then raise exception 'too_long'; end if;
  if n = '' then n := 'Student'; end if;
  if not exists (select 1 from room_members where room_id = p_room and user_id = u and last_seen > now() - _fresh()) then
    raise exception 'not_member';
  end if;
  if exists (select 1 from room_bans where room_id = p_room and user_id = u and until > now()) then
    raise exception 'banned';
  end if;
  -- Rate limit: at most 5 messages per 10 seconds, and not faster than one per 700 ms.
  if (select count(*) from messages where user_id = u and created_at > now() - interval '10 seconds') >= 5
     or exists (select 1 from messages where user_id = u and created_at > now() - interval '700 milliseconds') then
    raise exception 'rate_limited';
  end if;
  insert into messages (room_id, user_id, nickname, body) values (p_room, u, n, b) returning * into m;
  perform realtime.send(
    jsonb_build_object('id', m.id::text, 'userId', u, 'nickname', n, 'text', b,
                       'at', floor(extract(epoch from m.created_at) * 1000)),
    'chat', 'room:' || p_room::text, true);
end $$;

create or replace function public.report_user(p_room uuid, p_target uuid, p_reason text, p_message text default null)
returns void language plpgsql security definer set search_path = public as $$
declare u uuid := _uid();
begin
  if (select count(*) from reports where reporter_id = u and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'rate_limited';
  end if;
  insert into reports (room_id, reporter_id, target_id, reason, message)
  values (p_room, u, p_target, left(coalesce(p_reason, 'Other'), 60), left(p_message, 280));
end $$;

create or replace function public.kick_user(p_room uuid, p_target uuid, p_minutes int default 30)
returns void language plpgsql security definer set search_path = public as $$
declare u uuid := _uid();
begin
  if not exists (select 1 from rooms where id = p_room and created_by = u) then raise exception 'not_host'; end if;
  if p_target = u then return; end if;
  insert into room_bans (room_id, user_id, until, banned_by)
  values (p_room, p_target, now() + make_interval(mins => least(greatest(coalesce(p_minutes, 30), 5), 1440)), u)
  on conflict (room_id, user_id) do update set until = excluded.until, banned_by = excluded.banned_by;
  delete from room_members where room_id = p_room and user_id = p_target;
  perform realtime.send(jsonb_build_object('userId', p_target), 'kick', 'room:' || p_room::text, true);
end $$;

-- Only signed-in (including anonymous) users may call the RPCs.
revoke all on function public.list_rooms(), public.create_room(text, int, int, boolean), public.quick_join(),
  public.join_room(uuid), public.touch_member(uuid), public.leave_room(uuid),
  public.send_message(uuid, text, text), public.report_user(uuid, uuid, text, text),
  public.kick_user(uuid, uuid, int) from public, anon;
grant execute on function public.server_now(), public.list_rooms(), public.create_room(text, int, int, boolean),
  public.quick_join(), public.join_room(uuid), public.touch_member(uuid), public.leave_room(uuid),
  public.send_message(uuid, text, text), public.report_user(uuid, uuid, text, text),
  public.kick_user(uuid, uuid, int) to authenticated;

-- ---------------------------------------------------------------- Realtime authorization
-- Private channels "room:<uuid>": only current members may receive and use
-- Presence. Nobody may send client Broadcasts, so chat can only arrive via
-- send_message() (which enforces the limits) and kicks only via kick_user().
create or replace function public.is_room_member(p_topic text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from room_members m
    where m.user_id = auth.uid()
      and 'room:' || m.room_id::text = p_topic
      and m.last_seen > now() - _fresh()
  )
$$;
grant execute on function public.is_room_member(text) to authenticated;

drop policy if exists "room members receive" on realtime.messages;
create policy "room members receive" on realtime.messages
  for select to authenticated
  using (public.is_room_member(realtime.topic()));

drop policy if exists "room members presence" on realtime.messages;
create policy "room members presence" on realtime.messages
  for insert to authenticated
  with check (realtime.messages.extension = 'presence' and public.is_room_member(realtime.topic()));

-- ---------------------------------------------------------------- housekeeping (optional)
-- Run periodically (e.g. with pg_cron, see docs/SETUP.md) to keep tables small.
create or replace function public.cleanup_old_rows() returns void
language sql security definer set search_path = public as $$
  delete from messages where created_at < now() - interval '7 days';
  delete from room_members where last_seen < now() - interval '1 hour';
  delete from room_bans where until < now();
  delete from rooms r where r.created_at < now() - interval '2 days'
    and not exists (select 1 from room_members m where m.room_id = r.id);
$$;
revoke all on function public.cleanup_old_rows() from public, anon, authenticated;
