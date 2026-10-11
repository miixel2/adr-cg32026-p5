-- Run after leaderboard.sql. Aggregates include ALL participants, not just top ranks.
create or replace function public.get_quiz_statistics()
returns jsonb language sql stable security definer set search_path='' as $fn$
 with packs as (
  select unnest(array['fractions','decimals','data','english','thai','social','science','mathmock','fullmock']) as id
 ), scores as (
  select s.pack_id,s.user_id,100.0*s.score/nullif(s.total,0) as pct from public.quiz_scores s
 ), summary as (
  select p.id as pack_id,count(s.user_id) as participants,round(avg(s.pct),1) as average_pct,
   (select round(m.pct,1) from scores m where m.pack_id=p.id and m.user_id=auth.uid()) as my_pct
  from packs p left join scores s on s.pack_id=p.id group by p.id
 )
 select coalesce(jsonb_agg(jsonb_build_object(
  'pack_id',a.pack_id,'participants',a.participants,'average_pct',a.average_pct,'my_pct',a.my_pct,
  'percentile',case when a.participants>=5 and a.my_pct is not null then
   (select round(100.0*count(*) filter(where s.pct <
    (select m.pct from scores m where m.pack_id=a.pack_id and m.user_id=auth.uid()))/a.participants,1)
    from scores s where s.pack_id=a.pack_id) end
 ) order by a.pack_id),'[]'::jsonb) from summary a
$fn$;
revoke all on function public.get_quiz_statistics() from public,anon,authenticated;
grant execute on function public.get_quiz_statistics() to anon,authenticated;
