-- Run after feedback.sql. Delivery is asynchronous; the browser never calls the mail provider.
begin;
create table if not exists public.feedback_email_notifications (
 feedback_id uuid not null references public.quiz_feedback(id) on delete cascade,
 admin_user_id uuid not null references public.feedback_admins(user_id) on delete cascade,
 recipient_email text not null,
 status text not null default 'pending' check (status in ('pending','sending','sent','failed')),
 attempts integer not null default 0,
 processing_until timestamptz,
 sent_at timestamptz,
 provider_message_id text,
 last_error text,
 created_at timestamptz not null default now(),
 primary key (feedback_id,admin_user_id)
);
alter table public.feedback_email_notifications enable row level security;
revoke all on public.feedback_email_notifications from public,anon,authenticated;
grant select,update on public.feedback_email_notifications to service_role;
grant select on public.quiz_feedback to service_role;

create or replace function public.queue_feedback_emails()
returns trigger language plpgsql security definer set search_path='' as $fn$
begin
 insert into public.feedback_email_notifications(feedback_id,admin_user_id,recipient_email)
 select new.id,a.user_id,u.email from public.feedback_admins a join auth.users u on u.id=a.user_id
 where u.is_anonymous=false and u.email_confirmed_at is not null and nullif(u.email,'') is not null
 on conflict do nothing;
 return new;
end
$fn$;
revoke all on function public.queue_feedback_emails() from public,anon,authenticated;
drop trigger if exists quiz_feedback_queue_email on public.quiz_feedback;
create trigger quiz_feedback_queue_email after insert on public.quiz_feedback
 for each row execute function public.queue_feedback_emails();

-- Claim a job once, with a lease so a crashed worker can be retried after two minutes.
-- Re-check admin membership and confirmed email before each delivery attempt.
create or replace function public.claim_feedback_email(p_feedback_id uuid,p_admin_user_id uuid)
returns setof public.feedback_email_notifications language sql security definer set search_path='' as $fn$
 update public.feedback_email_notifications n
 set status='sending',attempts=n.attempts+1,processing_until=now()+interval '2 minutes',last_error=null
 where n.feedback_id=p_feedback_id and n.admin_user_id=p_admin_user_id and n.sent_at is null
 and (n.status in ('pending','failed') or (n.status='sending' and n.processing_until<now()))
 and exists (select 1 from public.feedback_admins a join auth.users u on u.id=a.user_id
  where a.user_id=n.admin_user_id and u.is_anonymous=false and u.email_confirmed_at is not null and u.email=n.recipient_email)
 returning n.*
$fn$;
revoke all on function public.claim_feedback_email(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_feedback_email(uuid,uuid) to service_role;
commit;
