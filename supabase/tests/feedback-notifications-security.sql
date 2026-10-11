-- Run after feedback-notifications.sql as postgres. Everything rolls back.
begin;
insert into auth.users(id,email,is_anonymous,email_confirmed_at) values
 ('fe000000-0000-4000-8000-000000000001','admin@example.invalid',false,now()),
 ('fe000000-0000-4000-8000-000000000002','unconfirmed@example.invalid',false,null),
 ('fe000000-0000-4000-8000-000000000003','anonymous@example.invalid',true,now());
insert into public.feedback_admins(user_id) select id from auth.users where id::text like 'fe000000-%';
create function pg_temp.notification_assert(value boolean,label text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'FAIL: %',label; end if; end $$;
create function pg_temp.notification_denied(statement text) returns void language plpgsql as $$
begin
 begin execute statement; exception when insufficient_privilege then return; end;
 raise exception 'FAIL: statement was permitted: %',statement;
end $$;
insert into public.quiz_feedback(id,kind,message) values
 ('fe100000-0000-4000-8000-000000000001','general','This is a test report');
insert into public.quiz_feedback(id,kind,message,question_id) values
 ('fe100000-0000-4000-8000-000000000002','correction','Please review this question','Q001');
select pg_temp.notification_assert((select count(*)=2 from public.feedback_email_notifications
 where admin_user_id='fe000000-0000-4000-8000-000000000001'),'Both kinds queue verified admin alerts');
select pg_temp.notification_assert((select count(*)=0 from public.feedback_email_notifications
 where admin_user_id in ('fe000000-0000-4000-8000-000000000002','fe000000-0000-4000-8000-000000000003')),
 'Unconfirmed and anonymous accounts receive no jobs');
update public.quiz_feedback set status='resolved' where id='fe100000-0000-4000-8000-000000000001';
select pg_temp.notification_assert((select count(*)=2 from public.feedback_email_notifications
 where admin_user_id='fe000000-0000-4000-8000-000000000001'),'Moderation does not queue more alerts');
set local role authenticated;
select pg_temp.notification_denied('select * from public.feedback_email_notifications');
select pg_temp.notification_denied('update public.feedback_email_notifications set status=''sent''');
select pg_temp.notification_denied($q$select public.claim_feedback_email('fe100000-0000-4000-8000-000000000001','fe000000-0000-4000-8000-000000000001')$q$);
reset role;
set local role anon;
select pg_temp.notification_denied('select * from public.feedback_email_notifications');
reset role;
set local role service_role;
select pg_temp.notification_assert((select count(*)=1 from public.claim_feedback_email(
 'fe100000-0000-4000-8000-000000000001','fe000000-0000-4000-8000-000000000001')),'Worker can claim pending job');
select pg_temp.notification_assert((select count(*)=0 from public.claim_feedback_email(
 'fe100000-0000-4000-8000-000000000001','fe000000-0000-4000-8000-000000000001')),'Active lease prevents duplicate claim');
update public.feedback_email_notifications set processing_until=now()-interval '1 minute'
 where feedback_id='fe100000-0000-4000-8000-000000000001';
select pg_temp.notification_assert((select attempts=2 from public.claim_feedback_email(
 'fe100000-0000-4000-8000-000000000001','fe000000-0000-4000-8000-000000000001')),'Expired lease is retryable');
update public.feedback_email_notifications set status='failed',processing_until=null
 where feedback_id='fe100000-0000-4000-8000-000000000001';
select pg_temp.notification_assert((select attempts=3 from public.claim_feedback_email(
 'fe100000-0000-4000-8000-000000000001','fe000000-0000-4000-8000-000000000001')),'Failed jobs are retryable');
update public.feedback_email_notifications set status='sent',sent_at=now()
 where feedback_id='fe100000-0000-4000-8000-000000000001';
select pg_temp.notification_assert((select count(*)=0 from public.claim_feedback_email(
 'fe100000-0000-4000-8000-000000000001','fe000000-0000-4000-8000-000000000001')),'Sent jobs cannot be claimed again');
reset role;
delete from public.quiz_feedback where id='fe100000-0000-4000-8000-000000000001';
select pg_temp.notification_assert((select count(*)=0 from public.feedback_email_notifications
 where feedback_id='fe100000-0000-4000-8000-000000000001'),'Feedback deletion removes its email jobs');
update auth.users set email='changed@example.invalid' where id='fe000000-0000-4000-8000-000000000001';
select pg_temp.notification_assert((select count(*)=0 from public.claim_feedback_email(
 'fe100000-0000-4000-8000-000000000002','fe000000-0000-4000-8000-000000000001')),'Changed email blocks stale recipient');
delete from public.feedback_admins where user_id='fe000000-0000-4000-8000-000000000001';
select pg_temp.notification_assert((select count(*)=0 from public.feedback_email_notifications
 where admin_user_id='fe000000-0000-4000-8000-000000000001'),'Revocation removes queued jobs');
rollback;
