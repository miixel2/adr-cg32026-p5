/* Optional Supabase leaderboard: no data leaves the browser unless a player opts in. */
(function(){
'use strict';
var cfg=window.QUIZ_CONFIG||{};
var client=null;
var supabaseLoader=null;
var currentAttempt=null;
var busy=false;
var boardToken=0;
var NICK_ADJ=['ดาว','เมฆ','รุ้ง','ฟ้า','แสง','เก่ง','ใจดี','จิ๋ว','ฮีโร่','นักสืบ'];
var NICK_NOUN=['น้อย','สายฟ้า','ตัวจิ๋ว','แสนสนุก','นักสำรวจ','หรรษา','อัจฉริยะ','ยิ้มแฉ่ง'];
function ready(){return /^https:\/\/[a-z0-9.-]+\.supabase\.co\/?$/i.test(cfg.supabaseUrl||'') && (cfg.supabaseAnonKey||'').length>20}
async function getClient(){
 if(!ready())throw Error('ยังไม่ได้เชื่อมต่อฐานข้อมูล กรุณาตั้งค่า config.js ก่อน');
 if(!window.supabase||!window.supabase.createClient){
  if(!supabaseLoader)supabaseLoader=new Promise(function(resolve,reject){
    var s=document.createElement('script');
    s.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/dist/umd/supabase.min.js';
    s.onload=resolve;s.onerror=function(){supabaseLoader=null;reject(Error('ไม่สามารถโหลด Supabase SDK ได้'))};
    document.head.appendChild(s);
  });
  await supabaseLoader;
 }
 if(!window.supabase||!window.supabase.createClient)throw Error('โหลด Supabase SDK ไม่สำเร็จ');
 if(!client)client=window.supabase.createClient(cfg.supabaseUrl.replace(/\/$/,''),cfg.supabaseAnonKey,{auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:false}});
 return client;
}
function randomName(){
 var a=NICK_ADJ[Math.floor(Math.random()*NICK_ADJ.length)],n=NICK_NOUN[Math.floor(Math.random()*NICK_NOUN.length)];
 return a+n+'-'+String(Math.floor(Math.random()*900)+100);
}
function packOptions(){
 return PACKS.filter(function(p){return p.id!=='retry'}).map(function(p){
  return '<option value="'+esc(p.id)+'">'+esc(p.title)+'</option>';
 }).join('');
}
function boardMarkup(){
 return '<div class="leaderboard-panel" id="leaderboard-home"><h2>🏆 กระดานนักพิชิตข้อสอบ</h2>'+
 '<p class="lb-muted">อันดับแยกตามชุดข้อสอบ • คะแนนสูงสุดจากผู้ร่วมสนุก (ไม่ใช่ผลสอบจริง)</p>'+
 '<div class="lb-controls"><label for="lb-pack">เลือกชุดข้อสอบ:</label><select id="lb-pack" class="lb-select">'+packOptions()+'</select>'+
 '<button type="button" class="btn secondary sm" id="lb-refresh">🔄 อัปเดตอันดับ</button></div>'+
 '<div id="lb-status" role="status" class="lb-muted"></div><div class="lb-wrap" id="lb-results"></div></div>';
}
function resultMarkup(){
 return '<div class="leaderboard-panel" id="leaderboard-result">'+
 '<h2>🏅 อยากแชร์คะแนนบน Leaderboard ไหม?</h2>'+
 '<p class="lb-muted">เป็นทางเลือกเท่านั้น ไม่บันทึกคะแนนออนไลน์หากไม่ยินยอม • แนะนำให้ใช้ชื่อเล่น ไม่ใช้ชื่อจริง/ชื่อเต็ม</p>'+
 '<div class="lb-opt"><label class="lb-check"><input type="checkbox" id="lb-consent"> <span>ฉันต้องการบันทึกคะแนนและชื่อเล่นเพื่อแสดงใน Leaderboard</span></label>'+
 '<div id="lb-details" class="lb-details"><label for="lb-name">ชื่อเล่นสำหรับแสดงอันดับ (เว้นว่างได้)</label>'+
 '<input class="lb-input" id="lb-name" maxlength="24" autocomplete="off" placeholder="เว้นว่าง = สุ่มชื่อสุดน่ารักให้อัตโนมัติ">'+
 '<div class="lb-tip">ชื่อเล่นไม่เกิน 24 ตัวอักษร • ห้ามกรอกชื่อ-นามสกุลจริง เบอร์โทร หรือข้อมูลส่วนตัว</div>'+
 '<button class="btn" id="lb-save" type="button">🌟 ยืนยันบันทึกลง Leaderboard</button></div>'+
 '<div id="lb-save-status" class="lb-msg" role="status"></div></div>'+
 '<div class="lb-controls"><strong>อันดับของชุดนี้</strong><button type="button" class="btn secondary sm" id="lb-result-refresh">🔄 ดูอันดับล่าสุด</button></div>'+
 '<div id="lb-result-status" role="status" class="lb-muted"></div><div class="lb-wrap" id="lb-result-rows"></div></div>';
}
function status(el,message){var node=document.getElementById(el);if(node)node.textContent=message||''}
function formatRanks(rows){
 if(!rows||!rows.length)return '<p class="lb-muted">ยังไม่มีใครบันทึกคะแนนในชุดนี้ มาเป็นคนแรกกันเถอะ! ✨</p>';
 var html='<table class="lb-table"><thead><tr><th>อันดับ</th><th>ชื่อเล่น</th><th>คะแนน</th><th>วันที่</th></tr></thead><tbody>';
 rows.forEach(function(row,i){
  var d=new Date(row.submitted_at),date=isNaN(d.valueOf())?'-':d.toLocaleDateString('th-TH',{day:'numeric',month:'short'});
  html+='<tr><td class="lb-rank">'+(['🥇','🥈','🥉'][i]||String(i+1))+'</td><td>'+esc(row.display_name)+'</td>'+
  '<td><strong>'+Number(row.score)+' / '+Number(row.total)+'</strong></td><td>'+esc(date)+'</td></tr>';
 });
 return html+'</tbody></table>';
}
async function updateBoard(packId,rowsId,statusId){
 var token=++boardToken;
 if(!ready()){
  status(statusId,'⏳ ระบบ Leaderboard ยังไม่เปิดใช้งาน โปรดตั้งค่า Supabase ตาม README (ข้อสอบยังทำได้ปกติ)');
  var el=document.getElementById(rowsId);if(el)el.innerHTML='';
  return;
 }
 status(statusId,'กำลังโหลดอันดับ…');
 try{
  var sb=await getClient();
  var result=await sb.rpc('get_quiz_leaderboard',{p_pack_id:packId,p_limit:15});
  if(result.error)throw result.error;
  if(token!==boardToken)return;
  var el=document.getElementById(rowsId);if(el)el.innerHTML=formatRanks(result.data);
  status(statusId,'อัปเดตอันดับแล้ว • '+(result.data||[]).length+' รายการ');
 }catch(e){
  status(statusId,'ยังโหลดอันดับไม่ได้: '+(e.message||'โปรดลองใหม่'));
 }
}
async function sendScore(){
 var box=document.getElementById('lb-consent'),button=document.getElementById('lb-save');
 if(!box||!box.checked||busy||!currentAttempt)return;
 if(!ready()){status('lb-save-status','ยังไม่ได้เชื่อม Supabase: อ่านวิธีตั้งค่าใน README.md');return}
 if(currentAttempt.seconds<15){status('lb-save-status','เวลาทำข้อสอบน้อยกว่า 15 วินาที กรุณาลองทำชุดใหม่เพื่อบันทึกอันดับ');return}
 var raw=document.getElementById('lb-name').value.trim();
 if(raw.length>24){status('lb-save-status','กรุณาใช้ชื่อเล่นไม่เกิน 24 ตัวอักษร');return}
 if(/[<>&"'\/\\]/.test(raw)){status('lb-save-status','ชื่อเล่นมีอักขระที่ไม่อนุญาต');return}
 if(/\d{8,}/.test(raw)){status('lb-save-status','ไม่ควรใส่เบอร์โทรหรือข้อมูลส่วนตัวในชื่อเล่น');return}
 var name=raw||randomName();
 busy=true;button.disabled=true;status('lb-save-status','กำลังบันทึกคะแนน…');
 try{
  var sb=await getClient();
  var sessionRes=await sb.auth.getSession();
  if(sessionRes.error)throw sessionRes.error;
  if(!sessionRes.data.session){
   var login=await sb.auth.signInAnonymously();
   if(login.error)throw login.error;
  }
  var r=await sb.rpc('submit_quiz_score',{p_pack_id:currentAttempt.packId,
     p_answers:currentAttempt.answers,p_elapsed_seconds:currentAttempt.seconds,p_display_name:name});
  if(r.error)throw r.error;
  var data=r.data||{};
  status('lb-save-status','✅ บันทึกแล้ว! ชื่อที่แสดง: '+(data.display_name||name)+' • คะแนนครั้งนี้ '+data.score+'/'+data.total+
    ' • คะแนนดีที่สุด '+data.best_score+'/'+data.total);
  button.textContent='✅ บันทึกเรียบร้อย';
  document.getElementById('lb-name').disabled=true;
  box.disabled=true;
  updateBoard(currentAttempt.packId,'lb-result-rows','lb-result-status');
 }catch(e){
  status('lb-save-status','❌ บันทึกไม่สำเร็จ: '+(e.message||'กรุณาลองใหม่')+'. คะแนนยังอยู่ในเครื่องตามปกติ');
  button.disabled=false;
 }finally{busy=false}
}
function renderResultLeaderboard(){
 if(!currentAttempt)return;
 var visible=currentAttempt.packId!=='retry';
 var el=document.getElementById('leaderboard-result');if(!el)return;
 el.style.display=visible?'':'none';
 if(!visible)return;
 document.getElementById('lb-consent').checked=false;
 document.getElementById('lb-consent').disabled=false;
 document.getElementById('lb-name').value='';
 document.getElementById('lb-name').disabled=false;
 document.getElementById('lb-save').disabled=false;
 document.getElementById('lb-save').textContent='🌟 ยืนยันบันทึกลง Leaderboard';
 document.getElementById('lb-details').classList.remove('is-open');
 status('lb-save-status','ยังไม่มีข้อมูลถูกส่งขึ้นออนไลน์');
 updateBoard(currentAttempt.packId,'lb-result-rows','lb-result-status');
}
function celebrate(){
 if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 var parent=document.querySelector('#result .report');
 if(!parent)return;
 var colors=['⭐','✨','🎈','🌟','🎉','💛','💙'];
 for(var i=0;i<12;i++){
  var node=document.createElement('span');node.className='flying-sticker';node.textContent=colors[i%colors.length];
  node.style.left=(10+Math.random()*80)+'%';node.style.animationDelay=(Math.random()*.9)+'s';
  node.style.animationDuration=(1.7+Math.random()*1.1)+'s';parent.appendChild(node);
  setTimeout((function(n){return function(){n.remove()}})(node),3200);
 }
}
function init(){
 var home=document.getElementById('home'),result=document.querySelector('#result .quiz-box');
 if(!home||!result||typeof PACKS==='undefined')return;
 var tabs=[['all','🌈 ทุกวิชา'],['math','🧮 คณิตศาสตร์'],['english','🔤 อังกฤษ'],['thai','📖 ภาษาไทย'],['social','🌏 สังคม/ประวัติศาสตร์'],['science','🔬 วิทยาศาสตร์']];
 var filterBox=document.getElementById('packs');
 filterBox.insertAdjacentHTML('beforebegin','<div class="subject-ribbon" id="subject-filters" aria-label="เลือกวิชา"></div>');
 var filters=document.getElementById('subject-filters');
 tabs.forEach(function(tab){
  var b=document.createElement('button');b.className='subject-filter'+(tab[0]==='all'?' selected':'');
  b.type='button';b.textContent=tab[1];b.setAttribute('aria-pressed',tab[0]==='all'?'true':'false');
  b.addEventListener('click',function(){
   Array.from(filters.children).forEach(function(child){child.classList.remove('selected');child.setAttribute('aria-pressed','false')});
   b.classList.add('selected');b.setAttribute('aria-pressed','true');
   Array.from(filterBox.children).forEach(function(card,i){
    var pack=PACKS[i];
    var show=tab[0]==='all'||(tab[0]==='math'
      ? ['fractions','decimals','data','mathmock'].includes(pack.id)
      : pack.id===tab[0]);
    card.classList.toggle('hidden',!show);
   });
  });
  filters.appendChild(b);
 });
 var earlier=home.querySelector('.section:has(#history)');
 if(earlier)earlier.insertAdjacentHTML('beforebegin',boardMarkup());
 else home.insertAdjacentHTML('beforeend',boardMarkup());
 result.querySelector('.report').insertAdjacentHTML('afterend',resultMarkup());
 var select=document.getElementById('lb-pack');
 select.value='fullmock';
 select.addEventListener('change',function(){updateBoard(this.value,'lb-results','lb-status')});
 document.getElementById('lb-refresh').addEventListener('click',function(){updateBoard(select.value,'lb-results','lb-status')});
 document.getElementById('lb-consent').addEventListener('change',function(){
   document.getElementById('lb-details').classList.toggle('is-open',this.checked);
   status('lb-save-status',this.checked?'กรอกชื่อเล่นหรือเว้นว่าง แล้วกดยืนยันเพื่อบันทึก':'จะไม่บันทึกคะแนนออนไลน์ หากไม่เลือกยินยอม');
 });
 document.getElementById('lb-save').addEventListener('click',sendScore);
 document.getElementById('lb-result-refresh').addEventListener('click',function(){if(currentAttempt)updateBoard(currentAttempt.packId,'lb-result-rows','lb-result-status')});
 var legend=document.querySelector('.hero-info');
 if(legend)legend.insertAdjacentHTML('beforeend','<span class="pill">🏆 Leaderboard แบบสมัครใจ</span>');
 var allPills=document.querySelectorAll('.hero-info .pill');
 if(allPills.length>=2)allPills[1].textContent='📖 ทุกวิชาเท่าเทียม';
 var intro=document.querySelector('#home .intro .subhead');
 if(intro)intro.textContent='เลือกฝึกทั้ง 5 วิชาอย่างเท่าเทียมกัน • โจทย์จัดทำขึ้นเองตามหัวข้อที่โรงเรียนแจ้ง ไม่ใช่ข้อสอบจริง • บันทึกอันดับได้ตามความสมัครใจ';
 var note=document.querySelector('#home .note');
 if(note)note.textContent='💡 ฝึกทุกวิชาอย่างสม่ำเสมอ วันละ 15–25 นาที ตรวจเฉลยและทบทวนข้อที่พลาด • คะแนนและประวัติส่วนตัวเก็บในเครื่องโดยอัตโนมัติ ส่วน Leaderboard ออนไลน์จะบันทึกต่อเมื่อกดยินยอม';
 var hero=document.querySelector('.hero .container');
 if(hero)hero.insertAdjacentHTML('beforeend','<p class="school-note">ธีมฟ้า–ทองเบื้องต้น (ยังไม่ได้ยืนยันรหัสสี CI ทางการ) • เว็บไซต์นี้เป็นสื่อฝึกอิสระ ไม่ใช่เว็บไซต์โรงเรียน</p>');
 document.querySelectorAll('#packs .card').forEach(function(c,i){c.style.animationDelay=(i%5*.07)+'s'});
 var previousFinish=finishExam;
 finishExam=function(auto){
  var before=finalSession;
  previousFinish(auto);
  if(finalSession&&finalSession!==before){
   currentAttempt={packId:finalSession.pack.id,seconds:elapsed,
     answers:finalSession.qs.map(function(q){
      return {id:q.id,answer:finalSession.answers[q.id]===undefined?null:finalSession.answers[q.id]};
     })};
   renderResultLeaderboard();
   celebrate();
  }
 };
 var previousGoHome=goHome;
 goHome=function(){previousGoHome();updateBoard(select.value,'lb-results','lb-status')};
 updateBoard(select.value,'lb-results','lb-status');
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
