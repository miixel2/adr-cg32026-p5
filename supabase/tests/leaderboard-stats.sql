-- Run after leaderboard.sql and leaderboard-stats.sql. Fixtures roll back.
begin;
create function pg_temp.stats_assert(value boolean,label text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'FAIL: %',label; end if; end $$;
-- Isolate fixtures from real shared scores for this transaction only.
delete from public.quiz_scores;
insert into public.quiz_scores(user_id,pack_id,display_name,score,total,elapsed_seconds) values
 ('fc000000-0000-4000-8000-000000000001','fractions','one',0,10,60),
 ('fc000000-0000-4000-8000-000000000002','fractions','two',5,10,60),
 ('fc000000-0000-4000-8000-000000000003','fractions','three',5,10,60),
 ('fc000000-0000-4000-8000-000000000004','fractions','four',8,10,60),
 ('fc000000-0000-4000-8000-000000000005','fractions','five',10,10,60),
 ('fc000000-0000-4000-8000-000000000002','english','two',2,4,60);
select set_config('request.jwt.claims','{"sub":"fc000000-0000-4000-8000-000000000002"}',true);
set local role authenticated;
select pg_temp.stats_assert((select (r->>'average_pct')::numeric=56 and (r->>'participants')::integer=5
 and (r->>'my_pct')::numeric=50 and (r->>'percentile')::numeric=20
 from jsonb_array_elements(public.get_quiz_statistics()) r where r->>'pack_id'='fractions'),
 'Average uses entire cohort; ties are not lower scores');
select pg_temp.stats_assert((select r->>'percentile' is null and (r->>'my_pct')::numeric=50
 from jsonb_array_elements(public.get_quiz_statistics()) r where r->>'pack_id'='english'),
 'Small cohort hides percentile and normalizes differing totals');
select pg_temp.stats_assert((select (r->>'participants')::integer=0 and r->>'average_pct' is null
 from jsonb_array_elements(public.get_quiz_statistics()) r where r->>'pack_id'='science'),'Empty sets have no invented averages');
reset role;
select set_config('request.jwt.claims','{}',true);
set local role anon;
select pg_temp.stats_assert((select bool_and(r->>'my_pct' is null and r->>'percentile' is null)
 from jsonb_array_elements(public.get_quiz_statistics()) r),'Public visitors cannot obtain personal scores');
select pg_temp.stats_assert((select bool_and(not(r ? 'user_id'))
 from jsonb_array_elements(public.get_quiz_statistics()) r),'User IDs are never published');
reset role;
rollback;
