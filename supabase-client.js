/* Shared public client; admin sessions use a separate, tab-scoped storage key. */
(function(){
'use strict';
var cfg=window.QUIZ_CONFIG||{}, clients={}, loader=null;
function isConfigured(){
 return /^https:\/\/[a-z0-9.-]+\.supabase\.co\/?$/i.test(cfg.supabaseUrl||'') && (cfg.supabaseAnonKey||'').length>20;
}
async function getClient(admin){
 if(!isConfigured())throw Error('ยังไม่ได้เชื่อมต่อฐานข้อมูล กรุณาตั้งค่า config.js ก่อน');
 if(!window.supabase||!window.supabase.createClient){
  if(!loader)loader=new Promise(function(resolve,reject){
   var script=document.createElement('script');
   script.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/dist/umd/supabase.min.js';
   script.onload=resolve;
   script.onerror=function(){script.remove();loader=null;reject(Error('ไม่สามารถโหลด Supabase SDK ได้ โปรดลองอีกครั้ง'))};
   document.head.appendChild(script);
  });
  await loader;
 }
 if(!window.supabase||!window.supabase.createClient){loader=null;throw Error('โหลด Supabase SDK ไม่สำเร็จ')}
 var key=admin?'admin':'player';
 if(!clients[key]){
  var auth={autoRefreshToken:true,persistSession:true,detectSessionInUrl:false};
  if(admin){auth.storageKey='quiz-feedback-admin';auth.storage=window.sessionStorage}
  clients[key]=window.supabase.createClient(cfg.supabaseUrl.replace(/\/$/,''),cfg.supabaseAnonKey,{auth:auth});
 }
 return clients[key];
}
window.QuizBackend={isConfigured:isConfigured,getClient:getClient};
})();
