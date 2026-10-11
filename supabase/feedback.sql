-- Run after leaderboard.sql in the Supabase SQL Editor.
-- Maintainers are explicitly allowlisted by Auth user ID; repo visibility is not authorization.
begin;

create table if not exists public.feedback_admins (
 user_id uuid primary key references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
alter table public.feedback_admins enable row level security;
revoke all on table public.feedback_admins from public, anon, authenticated;

create or replace function public.is_feedback_admin()
returns boolean language sql stable security definer set search_path = '' as $fn$
 select exists (
  select 1 from public.feedback_admins a join auth.users u on u.id = a.user_id
  where a.user_id = auth.uid() and u.is_anonymous = false
 )
$fn$;
revoke all on function public.is_feedback_admin() from public, anon, authenticated;
grant execute on function public.is_feedback_admin() to authenticated;

create table if not exists public.quiz_feedback (
 id uuid primary key default gen_random_uuid(),
 user_id uuid references auth.users(id) on delete set null,
 kind text not null check (kind in ('general', 'correction')),
 message text not null check (char_length(btrim(message)) between 10 and 3000),
 suggested_correction text not null default '' check (char_length(suggested_correction) <= 2000),
 pack_id text check (pack_id in ('fractions','decimals','data','english','thai','social','science','mathmock','fullmock','retry')),
 question_id text references public.quiz_answer_keys(question_id),
 question_text text check (char_length(question_text) <= 6000),
 status text not null default 'open' check (status in ('open','resolved','archived')),
 admin_note text not null default '' check (char_length(admin_note) <= 3000),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 managed_by uuid references auth.users(id) on delete set null,
 check (kind <> 'correction' or question_id is not null)
);
create index if not exists quiz_feedback_status_idx on public.quiz_feedback(status, created_at desc);
create index if not exists quiz_feedback_user_idx on public.quiz_feedback(user_id, created_at desc);
alter table public.quiz_feedback enable row level security;
revoke all on table public.quiz_feedback from public, anon, authenticated;
grant select, delete on table public.quiz_feedback to authenticated;
grant update (status, admin_note) on public.quiz_feedback to authenticated;

drop policy if exists feedback_admin_read on public.quiz_feedback;
create policy feedback_admin_read on public.quiz_feedback for select to authenticated
 using ((select public.is_feedback_admin()));
drop policy if exists feedback_admin_update on public.quiz_feedback;
create policy feedback_admin_update on public.quiz_feedback for update to authenticated
 using ((select public.is_feedback_admin())) with check ((select public.is_feedback_admin()));
drop policy if exists feedback_admin_delete on public.quiz_feedback;
create policy feedback_admin_delete on public.quiz_feedback for delete to authenticated
 using ((select public.is_feedback_admin()));

create or replace function public.stamp_feedback_update()
returns trigger language plpgsql set search_path = '' as $fn$
begin
 new.updated_at := now();
 new.managed_by := auth.uid();
 return new;
end
$fn$;
revoke all on function public.stamp_feedback_update() from public, anon, authenticated;
drop trigger if exists quiz_feedback_updated on public.quiz_feedback;
create trigger quiz_feedback_updated before update on public.quiz_feedback
 for each row execute function public.stamp_feedback_update();

create or replace function public.submit_quiz_feedback(
 p_kind text, p_message text, p_suggested_correction text default '',
 p_pack_id text default null, p_question_id text default null, p_question_text text default null
) returns uuid language plpgsql security definer set search_path = '' as $fn$
declare
 v_user uuid := auth.uid();
 v_id uuid;
begin
 if v_user is null then raise exception 'Please sign in before submitting feedback' using errcode = '42501'; end if;
 if p_kind is null or p_kind not in ('general','correction') then raise exception 'Invalid feedback type'; end if;
 if p_message is null or char_length(btrim(p_message)) not between 10 and 3000 then
  raise exception 'Feedback must contain 10 to 3000 characters';
 end if;
 if char_length(coalesce(p_suggested_correction,'')) > 2000 or char_length(p_question_text) > 6000 then
  raise exception 'Feedback context is too long';
 end if;
 if p_kind = 'correction' and p_question_id is null then raise exception 'Choose a question to correct'; end if;
 -- Serialize submissions from one identity so concurrent requests cannot bypass the interval.
 perform pg_advisory_xact_lock(hashtextextended(v_user::text, 42));
 if exists (select 1 from public.quiz_feedback where user_id = v_user and created_at > now() - interval '60 seconds') then
  raise exception 'กรุณารอ 60 วินาทีก่อนส่งความคิดเห็นอีกครั้ง' using errcode = 'P0001';
 end if;
 insert into public.quiz_feedback(user_id, kind, message, suggested_correction, pack_id, question_id, question_text)
 values (v_user, p_kind, btrim(p_message), btrim(coalesce(p_suggested_correction,'')), p_pack_id, p_question_id, p_question_text)
 returning id into v_id;
 return v_id;
end
$fn$;
revoke all on function public.submit_quiz_feedback(text,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.submit_quiz_feedback(text,text,text,text,text,text) to authenticated;

commit;

-- After creating a permanent maintainer account in Authentication > Users:
-- insert into public.feedback_admins(user_id) values ('YOUR-MAINTAINER-AUTH-USER-UUID');
-- To revoke access: delete from public.feedback_admins where user_id = 'THE-UUID';
