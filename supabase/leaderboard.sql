-- P.5 unofficial practice leaderboard
-- Run in Supabase SQL Editor using your own project; no service_role key in the browser.
-- Scores are recalculated from submitted answers, not trusted from client-side totals.
create table if not exists public.quiz_answer_keys (
 question_id text primary key, category text not null,
 answer_idx smallint not null check(answer_idx between 0 and 3)
);
alter table public.quiz_answer_keys enable row level security;
revoke all on table public.quiz_answer_keys from anon, authenticated;

create table if not exists public.quiz_scores (
 user_id uuid not null, pack_id text not null,
 display_name varchar(24) not null,
 score smallint not null check(score>=0),
 total smallint not null check(total>0),
 elapsed_seconds integer not null check(elapsed_seconds>=0),
 attempts integer not null default 1,
 last_attempt_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key(user_id,pack_id)
);
create index if not exists quiz_scores_rank_idx
 on public.quiz_scores(pack_id,score desc,updated_at asc);
alter table public.quiz_scores enable row level security;
revoke all on table public.quiz_scores from anon, authenticated;

-- Only internal database functions can read answer keys / scores.
insert into public.quiz_answer_keys(question_id,category,answer_idx) values
('Q001','fractions',0),
('Q002','fractions',1),
('Q003','fractions',2),
('Q004','fractions',1),
('Q005','fractions',2),
('Q006','fractions',2),
('Q007','fractions',2),
('Q008','fractions',2),
('Q009','fractions',2),
('Q010','fractions',0),
('Q011','fractions',1),
('Q012','fractions',2),
('Q013','fractions',1),
('Q014','fractions',1),
('Q015','fractions',0),
('Q016','fractions',1),
('Q017','fractions',1),
('Q018','fractions',1),
('Q019','fractions',2),
('Q020','fractions',2),
('Q021','fractions',0),
('Q022','fractions',1),
('Q023','fractions',2),
('Q024','fractions',1),
('Q025','fractions',2),
('Q026','decimals',1),
('Q027','decimals',1),
('Q028','decimals',2),
('Q029','decimals',0),
('Q030','decimals',1),
('Q031','decimals',1),
('Q032','decimals',2),
('Q033','decimals',1),
('Q034','decimals',1),
('Q035','decimals',2),
('Q036','decimals',1),
('Q037','decimals',1),
('Q038','decimals',1),
('Q039','decimals',1),
('Q040','decimals',1),
('Q041','decimals',0),
('Q042','decimals',1),
('Q043','decimals',1),
('Q044','decimals',1),
('Q045','decimals',1),
('Q046','decimals',2),
('Q047','decimals',2),
('Q048','decimals',2),
('Q049','decimals',2),
('Q050','decimals',1),
('Q051','data',2),
('Q052','data',0),
('Q053','data',2),
('Q054','data',2),
('Q055','data',1),
('Q056','data',2),
('Q057','data',1),
('Q058','data',1),
('Q059','data',2),
('Q060','data',1),
('Q061','data',1),
('Q062','data',2),
('Q063','data',3),
('Q064','data',2),
('Q065','data',1),
('Q066','english',1),
('Q067','english',2),
('Q068','english',0),
('Q069','english',2),
('Q070','english',3),
('Q071','english',0),
('Q072','english',2),
('Q073','english',1),
('Q074','english',1),
('Q075','english',1),
('Q076','english',0),
('Q077','english',0),
('Q078','thai',1),
('Q079','thai',0),
('Q080','thai',2),
('Q081','thai',0),
('Q082','thai',1),
('Q083','thai',1),
('Q084','thai',2),
('Q085','thai',1),
('Q086','thai',1),
('Q087','thai',0),
('Q088','thai',0),
('Q089','thai',1),
('Q090','social',1),
('Q091','social',1),
('Q092','social',0),
('Q093','social',0),
('Q094','social',0),
('Q095','social',0),
('Q096','social',0),
('Q097','social',0),
('Q098','social',0),
('Q099','social',0),
('Q100','science',2),
('Q101','science',1),
('Q102','science',0),
('Q103','science',0),
('Q104','science',0),
('Q105','science',1),
('Q106','science',0),
('Q107','science',1),
('Q108','science',0),
('Q109','science',2),
('Q110','science',0),
('Q111','science',0),
('Q112','english',2),
('Q113','english',0),
('Q114','english',1),
('Q115','english',2),
('Q116','english',2),
('Q117','english',1),
('Q118','english',1),
('Q119','english',1),
('Q120','thai',1),
('Q121','thai',1),
('Q122','thai',1),
('Q123','thai',2),
('Q124','thai',0),
('Q125','thai',2),
('Q126','thai',1),
('Q127','thai',1),
('Q128','social',0),
('Q129','social',0),
('Q130','social',0),
('Q131','social',2),
('Q132','social',0),
('Q133','social',0),
('Q134','social',0),
('Q135','social',0),
('Q136','social',0),
('Q137','social',0),
('Q138','science',0),
('Q139','science',0),
('Q140','science',1),
('Q141','science',0),
('Q142','science',0),
('Q143','science',0),
('Q144','science',1),
('Q145','science',0)
on conflict(question_id) do update set
 category=excluded.category, answer_idx=excluded.answer_idx;

create or replace function public.submit_quiz_score(
 p_pack_id text,p_answers jsonb,p_elapsed_seconds integer,p_display_name text default null
) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare
 v_user uuid := auth.uid();
 v_expected integer;
 v_total integer; v_valid integer; v_distinct integer; v_bad integer; v_score integer;
 n_frac integer; n_dec integer; n_data integer; n_eng integer; n_thai integer; n_soc integer; n_sci integer;
 v_name text;
 v_prior timestamptz;
 v_best_score integer;
 v_best_name text;
begin
 if v_user is null then raise exception 'Authentication required'; end if;
 v_expected:=case p_pack_id when 'fractions' then 25 when 'decimals' then 25
  when 'data' then 15 when 'english' then 20 when 'thai' then 20
  when 'social' then 20 when 'science' then 20 when 'mathmock' then 30
  when 'fullmock' then 50 else null end;
 if v_expected is null then raise exception 'Unknown quiz'; end if;
 if p_answers is null or jsonb_typeof(p_answers)<>'array'
    or jsonb_array_length(p_answers)<>v_expected then
    raise exception 'Invalid answer set'; end if;
 if p_elapsed_seconds is null or p_elapsed_seconds not between 15 and 5400 then
    raise exception 'Invalid duration'; end if;
 select count(*),count(q.question_id),count(distinct q.question_id),
  count(*) filter(where a.answer is not null and a.answer not between 0 and 3),
  count(*) filter(where a.answer=q.answer_idx),
  count(*) filter(where q.category='fractions'),
  count(*) filter(where q.category='decimals'),
  count(*) filter(where q.category='data'),
  count(*) filter(where q.category='english'),
  count(*) filter(where q.category='thai'),
  count(*) filter(where q.category='social'),
  count(*) filter(where q.category='science')
 into v_total,v_valid,v_distinct,v_bad,v_score,n_frac,n_dec,n_data,n_eng,n_thai,n_soc,n_sci
 from jsonb_to_recordset(p_answers) a(id text,answer integer)
 left join public.quiz_answer_keys q on q.question_id=a.id;
 if v_total<>v_expected or v_valid<>v_expected or v_distinct<>v_expected or v_bad<>0 then
    raise exception 'Invalid or duplicate questions'; end if;
 if not (
   (p_pack_id='fractions' and n_frac=25) or
   (p_pack_id='decimals' and n_dec=25) or
   (p_pack_id='data' and n_data=15) or
   (p_pack_id='english' and n_eng=20) or
   (p_pack_id='thai' and n_thai=20) or
   (p_pack_id='social' and n_soc=20) or
   (p_pack_id='science' and n_sci=20) or
   (p_pack_id='mathmock' and n_frac=12 and n_dec=12 and n_data=6) or
   (p_pack_id='fullmock' and n_frac=4 and n_dec=4 and n_data=2
      and n_eng=10 and n_thai=10 and n_soc=10 and n_sci=10)
 ) then raise exception 'Questions do not match this quiz'; end if;
 v_name:=nullif(btrim(coalesce(p_display_name,'')),'');
 if v_name is null then
  v_name:='นักสำรวจ-'||lpad((1+floor(random()*9999))::integer::text,4,'0');
 end if;
 if char_length(v_name)>24 then raise exception 'Nickname too long'; end if;
 if v_name ~ '[<>&"''/\\]' then raise exception 'Invalid nickname characters'; end if;
 perform pg_advisory_xact_lock(hashtext(v_user::text||':'||p_pack_id));
 select last_attempt_at into v_prior from public.quiz_scores
 where user_id=v_user and pack_id=p_pack_id;
 if v_prior is not null and v_prior > now()-interval '30 seconds'
 then raise exception 'Please wait before submitting again'; end if;
 insert into public.quiz_scores(user_id,pack_id,display_name,score,total,elapsed_seconds)
 values(v_user,p_pack_id,v_name,v_score,v_expected,p_elapsed_seconds)
 on conflict(user_id,pack_id) do update set
  attempts=public.quiz_scores.attempts+1,
  last_attempt_at=now(),
  display_name=case when excluded.score>public.quiz_scores.score then excluded.display_name
                    else public.quiz_scores.display_name end,
  elapsed_seconds=case when excluded.score>public.quiz_scores.score then excluded.elapsed_seconds
                    else public.quiz_scores.elapsed_seconds end,
  score=greatest(public.quiz_scores.score,excluded.score),
  updated_at=case when excluded.score>public.quiz_scores.score then now()
                  else public.quiz_scores.updated_at end;
 select score,display_name into v_best_score,v_best_name from public.quiz_scores
 where user_id=v_user and pack_id=p_pack_id;
 return jsonb_build_object('score',v_score,'total',v_expected,
      'best_score',v_best_score,'display_name',v_best_name);
end $fn$;

create or replace function public.get_quiz_leaderboard(
 p_pack_id text,p_limit integer default 10
) returns table(ranking bigint,display_name text,score integer,total integer,submitted_at timestamptz)
language sql stable security definer set search_path='' as $fn$
 select row_number() over(order by s.score desc,s.updated_at asc) as ranking,
  s.display_name::text,s.score::integer,s.total::integer,s.updated_at
 from public.quiz_scores s
 where s.pack_id=p_pack_id and
  p_pack_id=any(array['fractions','decimals','data','english','thai','social','science','mathmock','fullmock'])
 order by s.score desc,s.updated_at asc
 limit least(greatest(coalesce(p_limit,10),1),50)
$fn$;

revoke all on function public.submit_quiz_score(text,jsonb,integer,text) from public,anon,authenticated;
revoke all on function public.get_quiz_leaderboard(text,integer) from public,anon,authenticated;
grant execute on function public.submit_quiz_score(text,jsonb,integer,text) to authenticated;
grant execute on function public.get_quiz_leaderboard(text,integer) to anon,authenticated;

-- Security note: this is a friendly ranking, not a proctored exam.
-- Question bank and answers are public in browser code. CAPTCHA and server-side
-- challenge tokens are needed to reduce automated fake attempts at larger scale.
