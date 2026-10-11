/* Five-subject quiz setup. All question content lives in question-bank.js. */
for(const p of PACKS){if(['english','thai','social','science'].includes(p.id)){p.n=20;p.minutes=30;p.subtitle+=' • ชุดฝึกเพิ่มเติม'}if(p.id==='fullmock')p.subtitle='5 วิชา วิชาละ 10 ข้อ • ทุกวิชาสำคัญเท่ากัน'}
startPack=function(pid){const p=PACKS.find(x=>x.id===pid);if(!p)return;const pool=BANK.filter(q=>p.filter.includes(q.cat));let selected;
if(pid==='fullmock')selected=[...shuffle(BANK.filter(q=>q.cat==='fractions')).slice(0,4),...shuffle(BANK.filter(q=>q.cat==='decimals')).slice(0,4),...shuffle(BANK.filter(q=>q.cat==='data')).slice(0,2),...['english','thai','social','science'].flatMap(k=>shuffle(BANK.filter(q=>q.cat===k)).slice(0,10))];
else if(pid==='mathmock')selected=[...shuffle(BANK.filter(q=>q.cat==='fractions')).slice(0,12),...shuffle(BANK.filter(q=>q.cat==='decimals')).slice(0,12),...shuffle(BANK.filter(q=>q.cat==='data')).slice(0,6)];
else selected=shuffle(pool).slice(0,p.n);
initExam(shuffle(selected).map(q=>q.id),p)};
/* Put all-subject practice first; keep a clear path to every subject. */
const packOrder=['fullmock','english','thai','social','science','fractions','decimals','data','mathmock'];
PACKS.sort((a,b)=>packOrder.indexOf(a.id)-packOrder.indexOf(b.id));
createPacks();
