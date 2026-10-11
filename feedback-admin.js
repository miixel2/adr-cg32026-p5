(function(){
'use strict';
var client, authorized=false, page=0, pageSize=20, total=0, busy=false, requestToken=0;
var labels={open:'รอตรวจสอบ',resolved:'แก้ไขแล้ว',archived:'เก็บเข้าคลัง'};
function byId(id){return document.getElementById(id)}
function status(text){byId('admin-status').textContent=text||''}
function lock(locked){
 busy=locked;
 document.querySelectorAll('#admin-workspace button,#admin-workspace select,#admin-workspace textarea').forEach(function(el){el.disabled=locked});
 byId('admin-prev').disabled=locked||page===0;
 byId('admin-next').disabled=locked||(page+1)*pageSize>=total;
 byId('admin-list').setAttribute('aria-busy',String(locked));
}
function clearWorkspace(){
 authorized=false;requestToken++;
 byId('admin-workspace').hidden=true;byId('admin-login').hidden=false;
 byId('admin-list').replaceChildren();byId('admin-page').textContent='';
 byId('admin-password').value='';page=0;total=0;
}
async function authorize(){
 authorized=false;
 var session=await client.auth.getSession();if(session.error)throw session.error;
 if(!session.data.session||session.data.session.user.is_anonymous)throw Error('โปรดเข้าสู่ระบบด้วยบัญชีผู้ดูแล');
 var result=await client.rpc('is_feedback_admin');if(result.error)throw result.error;
 if(result.data!==true)throw Error('บัญชีนี้ไม่มีสิทธิ์จัดการความคิดเห็น กรุณาติดต่อผู้ดูแล Supabase');
 authorized=true;byId('admin-workspace').hidden=false;byId('admin-login').hidden=true;
}
function node(tag,className,text){
 var el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;
}
function button(text,action,id,state){
 var el=node('button','btn secondary',text);el.type='button';el.dataset.action=action;el.dataset.id=id;
 if(state)el.dataset.state=state;return el;
}
function render(rows){
 var list=byId('admin-list');list.replaceChildren();
 if(!rows.length)list.appendChild(node('p','feedback-empty','ยังไม่มีความคิดเห็นในรายการนี้'));
 rows.forEach(function(row){
  var item=node('article','feedback-item');item.dataset.id=row.id;
  item.appendChild(node('h3','',row.kind==='correction'?'แจ้งแก้ไขข้อสอบ'+(row.question_id?' · '+row.question_id:''):'คำแนะนำ / ติชม'));
  var meta=node('div','feedback-item-meta');
  meta.appendChild(node('span','feedback-badge '+row.status,labels[row.status]||row.status));
  meta.appendChild(node('span','',new Date(row.created_at).toLocaleString('th-TH')));
  if(row.pack_id)meta.appendChild(node('span','','ชุด: '+row.pack_id));
  item.appendChild(meta);item.appendChild(node('p','feedback-body',row.message));
  if(row.suggested_correction){item.appendChild(node('strong','','ข้อเสนอการแก้ไข'));item.appendChild(node('p','feedback-body',row.suggested_correction))}
  if(row.question_text){
   var details=node('details','feedback-question');details.appendChild(node('summary','','ดูโจทย์และเฉลย ณ วันที่ส่ง'));
   details.appendChild(node('pre','',row.question_text));item.appendChild(details);
  }
  var note=node('div','feedback-note'),label=node('label','','บันทึกผู้ดูแล (ไม่แสดงต่อผู้ส่ง)');
  label.htmlFor='note-'+row.id;var input=node('textarea');input.id=label.htmlFor;input.rows=2;input.maxLength=3000;input.value=row.admin_note||'';
  note.appendChild(label);note.appendChild(input);item.appendChild(note);
  var actions=node('div','feedback-actions');actions.appendChild(button('บันทึกหมายเหตุ','note',row.id,row.status));
  if(row.status!=='resolved')actions.appendChild(button('ทำเครื่องหมายแก้ไขแล้ว','status',row.id,'resolved'));
  if(row.status!=='open')actions.appendChild(button('เปิดตรวจสอบอีกครั้ง','status',row.id,'open'));
  if(row.status!=='archived')actions.appendChild(button('เก็บเข้าคลัง','status',row.id,'archived'));
  var remove=button('ลบถาวร','delete',row.id);remove.className='btn danger';actions.appendChild(remove);
  item.appendChild(actions);list.appendChild(item);
 });
 byId('admin-page').textContent='หน้า '+(page+1)+' / '+Math.max(1,Math.ceil(total/pageSize))+' · '+total+' รายการ';
}
async function loadFeedback(success){
 if(!authorized||busy)return;
 var token=++requestToken;lock(true);status('กำลังโหลดความคิดเห็น…');
 try{
  await authorize();
  var query=client.from('quiz_feedback').select('id,kind,message,suggested_correction,pack_id,question_id,question_text,status,admin_note,created_at,updated_at',{count:'exact'});
  if(byId('admin-filter-status').value!=='all')query=query.eq('status',byId('admin-filter-status').value);
  if(byId('admin-filter-kind').value!=='all')query=query.eq('kind',byId('admin-filter-kind').value);
  var result=await query.order('created_at',{ascending:false}).order('id',{ascending:false}).range(page*pageSize,(page+1)*pageSize-1);
  if(result.error)throw result.error;
  if(token!==requestToken)return;
  total=result.count||0;
  if(page>0&&page*pageSize>=total){page=Math.max(0,Math.ceil(total/pageSize)-1);lock(false);return loadFeedback(success)}
  render(result.data||[]);status(success||'โหลดความคิดเห็นแล้ว');
 }catch(error){
  if(token!==requestToken)return;
  clearWorkspace();status('ยังโหลดไม่ได้: '+(error.message||'โปรดลองเข้าสู่ระบบอีกครั้ง'));
 }finally{lock(false)}
}
async function manage(event){
 var trigger=event.target.closest('button[data-action]');if(!trigger||busy||!authorized)return;
 if(trigger.dataset.action==='delete'&&!window.confirm('ลบความคิดเห็นนี้ถาวรหรือไม่? การเก็บเข้าคลังสามารถย้อนกลับได้ แต่การลบไม่สามารถย้อนกลับได้'))return;
 lock(true);status('กำลังบันทึก…');
 try{
  await authorize();
  var query=client.from('quiz_feedback');
  if(trigger.dataset.action==='delete')query=query.delete();
  else query=query.update({status:trigger.dataset.state,admin_note:byId('note-'+trigger.dataset.id).value.trim()});
  var result=await query.eq('id',trigger.dataset.id).select('id');
  if(result.error)throw result.error;
  if(!result.data||result.data.length!==1)throw Error('ไม่พบรายการ หรือสิทธิ์ของคุณเปลี่ยนไป โปรดอัปเดตรายการ');
  lock(false);await loadFeedback(trigger.dataset.action==='delete'?'ลบความคิดเห็นแล้ว':'บันทึกสถานะและหมายเหตุแล้ว');
 }catch(error){if(!authorized)clearWorkspace();status('บันทึกไม่สำเร็จ: '+(error.message||'โปรดลองอีกครั้ง'))}
 finally{lock(false)}
}
async function login(event){
 event.preventDefault();if(busy)return;
 busy=true;byId('admin-login-button').disabled=true;status('กำลังตรวจสอบสิทธิ์…');
 try{
  if(!client)client=await window.QuizBackend.getClient(true);
  var result=await client.auth.signInWithPassword({email:byId('admin-email').value.trim(),password:byId('admin-password').value});
  if(result.error)throw result.error;
  byId('admin-password').value='';await authorize();busy=false;await loadFeedback();
 }catch(error){clearWorkspace();status(error.message||'เข้าสู่ระบบไม่สำเร็จ')}
 finally{busy=false;byId('admin-login-button').disabled=false}
}
async function init(){
 byId('admin-login-form').addEventListener('submit',login);
 byId('admin-list').addEventListener('click',manage);
 ['admin-filter-status','admin-filter-kind'].forEach(function(id){byId(id).addEventListener('change',function(){page=0;loadFeedback()})});
 byId('admin-refresh').addEventListener('click',function(){loadFeedback()});
 byId('admin-prev').addEventListener('click',function(){if(page>0){page--;loadFeedback()}});
 byId('admin-next').addEventListener('click',function(){if((page+1)*pageSize<total){page++;loadFeedback()}});
 byId('admin-signout').addEventListener('click',async function(){
  clearWorkspace();status('ออกจากระบบแล้ว');
  try{var result=await client.auth.signOut({scope:'local'});if(result.error)throw result.error}
  catch(error){status('ออกจากระบบไม่สำเร็จ: '+error.message+' โปรดปิดแท็บนี้')}
 });
 try{
  client=await window.QuizBackend.getClient(true);
  client.auth.onAuthStateChange(function(event){if(event==='SIGNED_OUT')clearWorkspace()});
  var session=await client.auth.getSession();if(session.error)throw session.error;
  if(session.data.session){await authorize();await loadFeedback()}
 }catch(error){clearWorkspace();status(error.message||'ระบบยังไม่พร้อม โปรดลองอีกครั้ง')}
}
init();
})();
