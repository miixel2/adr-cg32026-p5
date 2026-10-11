-- Run after leaderboard.sql + feedback.sql as postgres in Supabase SQL Editor.
-- Temporary identities and all changes are rolled back. Any failing assertion aborts.
begin;
insert into auth.users(id,email,is_anonymous) values
 ('fd000000-0000-4000-8000-000000000001','feedback-test-admin@example.invalid',false),
 ('fd000000-0000-4000-8000-000000000002',null,true),
 ('fd000000-0000-4000-8000-000000000003','feedback-test-member@example.invalid',false);
insert into public.feedback_admins(user_id) values
 ('fd000000-0000-4000-8000-000000000001'),
 ('fd000000-0000-4000-8000-000000000002');

create function pg_temp.assert_true(value boolean,label text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'FAIL: %',label; end if; end $$;
create function pg_temp.expect_error(statement text, expected_code text) returns void language plpgsql as $$
begin
 begin execute statement;
 exception when others then
  if sqlstate = expected_code then return; end if;
  raise exception 'Unexpected SQLSTATE %: %',sqlstate,sqlerrm;
 end;
 raise exception 'FAIL: statement was permitted: %',statement;
end $$;

set local role anon;
select pg_temp.expect_error('select * from public.quiz_feedback','42501');
select pg_temp.expect_error($q$select public.submit_quiz_feedback('general','An unauthenticated report')$q$,'42501');
reset role;

select set_config('request.jwt.claims','{"sub":"fd000000-0000-4000-8000-000000000002","role":"authenticated","is_anonymous":true}',true);
set local role authenticated;
select pg_temp.assert_true(not public.is_feedback_admin(),'Anonymous users cannot become admin even if allowlisted');
select pg_temp.expect_error('select * from public.feedback_admins','42501');
select pg_temp.expect_error($q$insert into public.feedback_admins(user_id) values ('fd000000-0000-4000-8000-000000000003')$q$,'42501');
select pg_temp.expect_error($q$insert into public.quiz_feedback(kind,message) values ('general','A direct feedback insert')$q$,'42501');
select pg_temp.expect_error($q$select public.submit_quiz_feedback(null,'A sufficiently long report')$q$,'P0001');
select pg_temp.expect_error($q$select public.submit_quiz_feedback('general','short')$q$,'P0001');
select pg_temp.expect_error($q$select public.submit_quiz_feedback('correction','A sufficiently long report')$q$,'P0001');
select pg_temp.expect_error($q$select public.submit_quiz_feedback('general',repeat('x',3001))$q$,'P0001');
select set_config('test.feedback_id',public.submit_quiz_feedback('correction','Please review the answer for this question','Suggested correction','fractions','Q001','A test question snapshot')::text,true);
select pg_temp.expect_error($q$select public.submit_quiz_feedback('general','Another report too quickly')$q$,'P0001');
select pg_temp.assert_true((select count(*)=0 from public.quiz_feedback),'Players cannot read even their own feedback');
with changed as (update public.quiz_feedback set status='resolved' returning id)
 select pg_temp.assert_true((select count(*)=0 from changed),'Players cannot update feedback');
with removed as (delete from public.quiz_feedback returning id)
 select pg_temp.assert_true((select count(*)=0 from removed),'Players cannot delete feedback');
reset role;

select set_config('request.jwt.claims','{"sub":"fd000000-0000-4000-8000-000000000003","role":"authenticated","is_anonymous":false}',true);
set local role authenticated;
select pg_temp.assert_true(not public.is_feedback_admin(),'Permanent accounts require explicit allowlisting');
select pg_temp.assert_true((select count(*)=0 from public.quiz_feedback),'Non-admin permanent accounts cannot read reports');
select pg_temp.expect_error($q$select public.submit_quiz_feedback('correction','A report about an invalid question','','fractions','Q999')$q$,'23503');
select public.submit_quiz_feedback('general','This is general feedback without a question');
reset role;

select set_config('request.jwt.claims','{"sub":"fd000000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":false}',true);
set local role authenticated;
select pg_temp.assert_true(public.is_feedback_admin(),'Allowlisted permanent maintainer is authorized');
select pg_temp.assert_true(exists(select 1 from public.quiz_feedback where id=current_setting('test.feedback_id')::uuid),'Admin can read the report');
select pg_temp.expect_error($q$update public.quiz_feedback set message='Admin must not rewrite the original report'$q$,'42501');
select pg_temp.expect_error($q$update public.quiz_feedback set status='invalid'$q$,'23514');
update public.quiz_feedback set status='resolved',admin_note='Reviewed in the repository' where id=current_setting('test.feedback_id')::uuid;
select pg_temp.assert_true(exists(select 1 from public.quiz_feedback where id=current_setting('test.feedback_id')::uuid and status='resolved' and managed_by=auth.uid()),'Resolve and audit attribution work');
update public.quiz_feedback set status='archived' where id=current_setting('test.feedback_id')::uuid;
update public.quiz_feedback set status='open' where id=current_setting('test.feedback_id')::uuid;
delete from public.quiz_feedback where id=current_setting('test.feedback_id')::uuid;
select pg_temp.assert_true(not exists(select 1 from public.quiz_feedback where id=current_setting('test.feedback_id')::uuid),'Admin can delete a report');
reset role;

delete from public.feedback_admins where user_id='fd000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.assert_true(not public.is_feedback_admin(),'Revoking the allowlist takes effect without changing the JWT');
select pg_temp.assert_true((select count(*)=0 from public.quiz_feedback),'Revoked maintainer loses read access');
reset role;
rollback;
