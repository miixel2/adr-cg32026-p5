(function(){
'use strict';
var lessons=Array.from(document.querySelectorAll('.tutorial-lesson')),steps=Array.from(document.querySelectorAll('[data-step]')),current=0,answer=null;
var speeches=['พร้อมแล้ว! จิ้มปุ่ม ไม่ต้องจิ้มฉันนะ','เลือกคำตอบให้ดี น้องจิ๋วไม่แอบบอกหรอก!','คะแนนเป็นของเรา แชร์เมื่อเราพร้อมนะ','ดูอันดับได้เลย น้องจิ๋วขอเชียร์ข้างสนาม!','เห็นอะไรแปลก ๆ บอกได้ อย่าให้น้องจิ๋วงงคนเดียว'];
function byId(id){return document.getElementById(id)}
function celebrate(text){
 byId('tutorial-speech').textContent=text;
 var chick=byId('tutorial-chick');chick.classList.remove('is-celebrating');void chick.offsetWidth;chick.classList.add('is-celebrating');
}
function reveal(id){var el=byId(id);el.hidden=false;el.classList.remove('is-revealing');void el.offsetWidth;el.classList.add('is-revealing')}
function message(id,text){var el=byId(id);el.textContent=text;el.classList.add('is-success')}
function show(index,focus){
 current=Math.max(0,Math.min(lessons.length-1,index));
 lessons.forEach(function(lesson,i){lesson.hidden=i!==current});
 steps.forEach(function(step,i){step.setAttribute('aria-pressed',String(i===current))});
 byId('tutorial-prev').disabled=current===0;byId('tutorial-next').disabled=current===lessons.length-1;
 byId('tutorial-progress').textContent='ขั้นตอน '+(current+1)+' / '+lessons.length;
 byId('tutorial-speech').textContent=speeches[current];
 if(focus){var heading=lessons[current].querySelector('h2');heading.focus({preventScroll:true});heading.scrollIntoView({block:'start'})}
}
steps.forEach(function(step){step.addEventListener('click',function(){show(Number(step.dataset.step),false)})});
byId('tutorial-prev').addEventListener('click',function(){show(current-1,true)});
byId('tutorial-next').addEventListener('click',function(){show(current+1,true)});
document.querySelectorAll('[data-demo-start]').forEach(function(button){button.addEventListener('click',function(){
 document.querySelectorAll('.tutorial-pack').forEach(function(pack){pack.classList.remove('is-selected')});
 button.closest('.tutorial-pack').classList.add('is-selected');
 message('start-demo-status','✅ เลือกชุด'+button.dataset.demoStart+'แล้ว! ในเว็บจริงจะเปิดโจทย์ข้อแรก');celebrate('ฮึบ! น้องจิ๋วพร้อมแล้ว ไปขั้นตอน 2 กัน');
})});
document.querySelectorAll('[data-answer]').forEach(function(button){button.addEventListener('click',function(){
 answer=Number(button.dataset.answer);
 document.querySelectorAll('[data-answer]').forEach(function(choice){choice.setAttribute('aria-pressed',String(choice===button));choice.classList.remove('is-correct')});
 byId('demo-submit-answer').disabled=false;byId('answer-demo-status').textContent='เลือก '+'กขคง'[answer]+' แล้ว ลองกดส่งคำตอบ';byId('answer-demo-status').classList.remove('is-success');
})});
byId('demo-submit-answer').addEventListener('click',function(){
 if(answer===null)return;
 document.querySelector('[data-answer="2"]').classList.add('is-correct');
 message('answer-demo-status','คะแนนตัวอย่าง '+(answer===2?'1':'0')+' / 1 · เฉลย ค. 3/4 เพราะ 1/2 = 2/4 แล้วบวก 1/4');
 celebrate(answer===2?'เย้! ถูกแล้ว เก่งกว่าน้องจิ๋วอีก':'ไม่เป็นไร อ่านวิธีคิดแล้วลองใหม่ได้เลย');
});
byId('demo-consent').addEventListener('change',function(){
 byId('demo-save-fields').hidden=!this.checked;
 byId('save-demo-status').textContent=this.checked?'ยังไม่แชร์ ต้องกดยืนยันบันทึกก่อน':'คะแนนอยู่ในเครื่อง ยังไม่แชร์ออนไลน์';
 byId('save-demo-status').classList.remove('is-success');
});
byId('demo-save-score').addEventListener('click',function(){
 if(!byId('demo-consent').checked)return;
 var name=byId('demo-nickname').value.trim()||'ดาวน้อย-123';
 message('save-demo-status','✅ บันทึกตัวอย่างแล้ว! ชื่อเล่น: '+name+' · 40 / 50 (ไม่ได้ส่งออนไลน์จริง)');celebrate('แชร์เมื่อพร้อม แบบนี้แหละ! น้องจิ๋วปรบปีก');
});
byId('demo-show-board').addEventListener('click',function(){reveal('demo-board');message('board-demo-status','อันดับตัวอย่างแสดงแล้ว · ในเว็บจริงเลือกชุดและกดอัปเดตได้');celebrate('ว้าว! ดูเฉย ๆ ก็ได้ ไม่ต้องแข่งกับใครนะ')});
byId('demo-open-feedback').addEventListener('click',function(){reveal('demo-feedback-fields');byId('demo-feedback-text').focus({preventScroll:true});celebrate('น้องจิ๋วกางสมุด พร้อมรับคำแนะนำ!')});
byId('demo-send-feedback').addEventListener('click',function(){
 if(byId('demo-feedback-text').value.trim().length<10){byId('feedback-demo-status').textContent='ในเว็บจริงต้องใส่รายละเอียดอย่างน้อย 10 ตัวอักษร';return}
 message('feedback-demo-status','✅ ส่งตัวอย่างแล้ว! ในเว็บจริง ผู้ดูแลจะได้รับข้อความเป็นการส่วนตัว');celebrate('ขอบคุณ! น้องจิ๋วจะไม่เอาไปประกาศหน้าเสาธง');
});
byId('tutorial-chick').addEventListener('animationend',function(){this.classList.remove('is-celebrating')});
show(0,false);
})();
