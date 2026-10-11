(function(){
'use strict';
var dialog, form, context={}, sending=false, opener=null;
function byId(id){return document.getElementById(id)}
function message(text){byId('feedback-status').textContent=text}
function refreshKind(){
 var correction=byId('feedback-kind').value==='correction';
 byId('feedback-question-fields').hidden=!correction;
 byId('feedback-question').required=correction;
}
function openFeedback(questionId){
 if(dialog.open)return;
 opener=document.activeElement;
 form.reset();form.hidden=false;
 byId('feedback-done').hidden=true;
 message('');
 var inExam=!byId('exam').classList.contains('hidden');
 var inResult=!byId('result').classList.contains('hidden');
 var active=inExam?session:(inResult?finalSession:null);
 context={packId:active?active.pack.id:null,questions:active?active.qs:BANK};
 var select=byId('feedback-question');select.replaceChildren();
 context.questions.forEach(function(q,i){
  var option=document.createElement('option');option.value=q.id;
  option.textContent=(active?'ข้อ '+(i+1)+' · ':'')+q.id+' · '+q.q.slice(0,90);
  select.appendChild(option);
 });
 var current=questionId||(inExam&&active?active.qs[pos].id:null);
 if(current){select.value=current;byId('feedback-kind').value='correction'}
 byId('feedback-context').textContent=active?'ชุดข้อสอบ: '+active.pack.title+(inExam?' · ตัวจับเวลายังคงเดินระหว่างแนะนำติชม':''):'คำแนะนำเกี่ยวกับเว็บไซต์หรือข้อสอบ';
 refreshKind();dialog.showModal();
}
async function submitFeedback(event){
 event.preventDefault();if(sending)return;
 if(!form.reportValidity())return;
 var text=byId('feedback-message').value.trim(), correction=byId('feedback-kind').value==='correction';
 if(text.length<10){message('กรุณาใส่รายละเอียดอย่างน้อย 10 ตัวอักษร');byId('feedback-message').focus();return}
 var q=correction?context.questions.find(function(q){return q.id===byId('feedback-question').value}):null;
 if(correction&&!q){message('กรุณาเลือกข้อสอบที่ต้องการแจ้งแก้ไข');return}
 var button=byId('feedback-submit');
 sending=true;button.disabled=true;byId('feedback-close').disabled=true;
 message('กำลังส่งความคิดเห็น…');
 try{
  var client=await window.QuizBackend.getClient();
  var sessionResult=await client.auth.getSession();if(sessionResult.error)throw sessionResult.error;
  if(!sessionResult.data.session){var login=await client.auth.signInAnonymously();if(login.error)throw login.error}
  var snapshot=q?q.q+'\n'+q.options.map(function(option,i){return 'กขคง'[i]+'. '+option}).join('\n')+'\nเฉลย: '+'กขคง'[q.answer]+'\nคำอธิบาย: '+q.explain:null;
  var result=await client.rpc('submit_quiz_feedback',{
   p_kind:correction?'correction':'general',p_message:text,
   p_suggested_correction:correction?byId('feedback-suggestion').value.trim():'',
   p_pack_id:context.packId,p_question_id:q?q.id:null,p_question_text:snapshot
  });
  if(result.error)throw result.error;
  form.hidden=true;byId('feedback-done').hidden=false;
  message('✅ ส่งความคิดเห็นแล้ว ขอบคุณที่ช่วยปรับปรุงแบบฝึกหัด');
  byId('feedback-done-close').focus();
 }catch(error){message('❌ ยังส่งไม่ได้: '+(error.message||'โปรดลองอีกครั้ง')+' ข้อความยังอยู่ในช่องกรอก')}
 finally{sending=false;button.disabled=false;byId('feedback-close').disabled=false}
}
function init(){
 document.body.insertAdjacentHTML('beforeend',
  '<dialog id="feedback-dialog" class="feedback-dialog" aria-labelledby="feedback-title" aria-describedby="feedback-privacy">'+
  '<div class="feedback-dialog-top"><h2 id="feedback-title">แนะนำติชม</h2><button class="btn secondary sm" id="feedback-close" type="button" aria-label="ปิดหน้าต่างแนะนำติชม">ปิด</button></div>'+
  '<p id="feedback-context" class="feedback-muted"></p>'+
  '<p id="feedback-privacy" class="feedback-muted">ส่งให้ผู้ดูแลเท่านั้น ไม่แสดงต่อสาธารณะ • ไม่ต้องใส่ชื่อจริง อีเมล เบอร์โทร หรือข้อมูลส่วนตัว</p>'+
  '<form id="feedback-form"><label for="feedback-kind">ต้องการแนะนำเรื่องใด</label><select id="feedback-kind"><option value="general">คำแนะนำ / ติชมเว็บไซต์</option><option value="correction">แจ้งแก้ไขโจทย์หรือเฉลย</option></select>'+
  '<div id="feedback-question-fields" hidden><label for="feedback-question">ข้อสอบที่ต้องการแจ้ง</label><select id="feedback-question"></select>'+
  '<label for="feedback-suggestion">คำตอบหรือคำอธิบายที่เสนอ (ไม่จำเป็น)</label><textarea id="feedback-suggestion" maxlength="2000" rows="3"></textarea></div>'+
  '<label for="feedback-message">รายละเอียด <span class="feedback-muted">(10–3,000 ตัวอักษร)</span></label><textarea id="feedback-message" minlength="10" maxlength="3000" rows="5" required placeholder="พบปัญหาอะไร หรืออยากให้ปรับปรุงตรงไหน"></textarea>'+
  '<p class="feedback-muted">เมื่อกดส่ง จะส่งข้อความและข้อมูลข้อสอบที่เลือกให้ผู้ดูแลผ่าน Supabase โดยใช้บัญชีไม่ระบุชื่อ</p>'+
  '<button class="btn" id="feedback-submit" type="submit">ส่งความคิดเห็น</button></form>'+
  '<div id="feedback-done" hidden><button type="button" class="btn" id="feedback-done-close">กลับไปทำแบบฝึกหัด</button></div>'+
  '<p id="feedback-status" role="status" class="feedback-status"></p></dialog>');
 dialog=byId('feedback-dialog');form=byId('feedback-form');
 document.querySelector('#home .intro .buttons').insertAdjacentHTML('beforeend','<button type="button" class="btn secondary" data-feedback>💬 แนะนำติชม</button>');
 document.querySelector('#exam .quiz-box > .buttons').insertAdjacentHTML('beforeend','<button type="button" class="btn secondary sm" data-feedback>💬 แนะนำติชม / แจ้งแก้ไขข้อนี้</button>');
 document.querySelector('#result .lb-shortcuts').insertAdjacentHTML('beforeend','<button type="button" class="btn secondary" data-feedback>💬 แนะนำติชม / แจ้งแก้ไขข้อสอบ</button>');
 document.querySelector('.footer').insertAdjacentHTML('afterbegin','<div class="feedback-footer"><button type="button" class="btn secondary sm" data-feedback>💬 แนะนำติชม</button></div>');
 document.addEventListener('click',function(event){
  var trigger=event.target.closest('[data-feedback]');
  if(trigger)openFeedback(trigger.dataset.feedback||null);
 });
 var previousRender=renderResult;
 renderResult=function(){
  previousRender.apply(this,arguments);
  document.querySelectorAll('#reviews .review-item').forEach(function(item,i){
   var button=document.createElement('button');button.type='button';button.className='btn secondary sm';
   button.textContent='แจ้งแก้ไขข้อนี้';button.dataset.feedback=finalSession.qs[i].id;item.appendChild(button);
  });
 };
 byId('feedback-kind').addEventListener('change',refreshKind);
 form.addEventListener('submit',submitFeedback);
 function close(){if(!sending)dialog.close()}
 byId('feedback-close').addEventListener('click',close);
 byId('feedback-done-close').addEventListener('click',close);
 dialog.addEventListener('cancel',function(event){if(sending)event.preventDefault()});
 dialog.addEventListener('close',function(){if(opener&&opener.isConnected)opener.focus()});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
