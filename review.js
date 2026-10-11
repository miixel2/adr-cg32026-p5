(function(){
'use strict';
var search=document.getElementById('review-search'),subject=document.getElementById('review-subject'),topic=document.getElementById('review-topic');
var math=['fractions','decimals','data'],items=[],printState=null;
function matchesSubject(q){return subject.value==='all'||(subject.value==='math'?math.includes(q.cat):q.cat===subject.value)}
function normalized(text){return text.normalize('NFC').toLocaleLowerCase().trim()}
function render(){
 var fragment=document.createDocumentFragment();
 BANK.forEach(function(q){
  var details=document.createElement('details');details.className='review-question';details.id=q.id;
  details.innerHTML='<summary><span class="review-question-id">'+esc(q.id)+'</span><span class="review-question-topic">'+esc(CAT[q.cat])+'</span><span class="review-question-title">'+esc(q.q)+'</span></summary>'+
   '<div class="review-question-body">'+(q.chart?'<div class="chartbox">'+graphSVG(q.chart)+'</div>':'')+
   '<ul class="review-options">'+q.options.map(function(option,i){return '<li'+(i===q.answer?' class="is-correct"':'')+'>'+'กขคง'[i]+'. '+esc(option)+(i===q.answer?' <strong>✓ คำตอบที่ถูก</strong>':'')+'</li>'}).join('')+'</ul>'+
   '<p class="review-answer">เฉลย: '+'กขคง'[q.answer]+'. '+esc(q.options[q.answer])+'</p><p class="review-explanation">'+esc(q.explain)+'</p>'+
   '<div class="review-question-actions"><button type="button" class="btn secondary" data-feedback="'+esc(q.id)+'">แจ้งแก้ไขข้อนี้</button><a href="#'+esc(q.id)+'" aria-label="ลิงก์ไปข้อ '+esc(q.id)+'">ลิงก์ '+esc(q.id)+'</a></div></div>';
  items.push({q:q,el:details,text:normalized([q.id,CAT[q.cat],q.q].concat(q.options,[q.explain]).join(' '))});
  fragment.appendChild(details);
 });
 document.getElementById('review-questions').appendChild(fragment);
}
function updateTopics(){
 var previous=topic.value;topic.replaceChildren();
 var all=document.createElement('option');all.value='all';all.textContent='ทุกหัวข้อ';topic.appendChild(all);
 Object.keys(CAT).filter(function(cat){return BANK.some(function(q){return q.cat===cat&&matchesSubject(q)})}).forEach(function(cat){
  var option=document.createElement('option');option.value=cat;option.textContent=CAT[cat];topic.appendChild(option);
 });
 topic.value=Array.from(topic.options).some(function(option){return option.value===previous})?previous:'all';
 topic.disabled=topic.options.length<=2;
}
function filter(){
 var terms=normalized(search.value).split(/\s+/).filter(Boolean),count=0;
 items.forEach(function(item){
  var visible=matchesSubject(item.q)&&(topic.value==='all'||topic.value===item.q.cat)&&terms.every(function(term){return item.text.includes(term)});
  item.el.hidden=!visible;if(visible)count++;
 });
 document.getElementById('review-count').textContent='แสดง '+count+' จาก '+BANK.length+' ข้อ';
 document.getElementById('review-empty').hidden=count>0;
 document.getElementById('review-expand').disabled=count===0;document.getElementById('review-collapse').disabled=count===0;
 var url=new URL(location.href);
 [['search',search.value],['subject',subject.value],['topic',topic.value]].forEach(function(pair){if(pair[1]&&pair[1]!=='all')url.searchParams.set(pair[0],pair[1]);else url.searchParams.delete(pair[0])});
 // A question link must not silently undo a new search or filter.
 var target=items.find(function(item){return '#'+item.q.id===url.hash});if(target&&target.el.hidden)url.hash='';
 history.replaceState(null,'',url);
}
function reset(){search.value='';subject.value='all';topic.value='all';updateTopics();filter()}
function openLinkedQuestion(){
 var item=items.find(function(item){return '#'+item.q.id===location.hash});if(!item)return;
 if(item.el.hidden)reset();
 item.el.open=true;
 item.el.querySelector('summary').focus({preventScroll:true});item.el.scrollIntoView({block:'start'});
}
function expandForPrint(){if(printState)return;printState=items.map(function(item){return item.el.open});items.forEach(function(item){if(!item.el.hidden)item.el.open=true})}
function restoreAfterPrint(){if(!printState)return;items.forEach(function(item,i){item.el.open=printState[i]});printState=null}
render();
var params=new URLSearchParams(location.search);search.value=params.get('search')||'';
if(Array.from(subject.options).some(function(option){return option.value===params.get('subject')}))subject.value=params.get('subject');
updateTopics();if(Array.from(topic.options).some(function(option){return option.value===params.get('topic')}))topic.value=params.get('topic');
// Prioritize a direct question link over any stale filter parameters.
if(location.hash){var linked=items.find(function(item){return '#'+item.q.id===location.hash});if(linked){search.value='';subject.value='all';topic.value='all';updateTopics()}}
filter();if(location.hash)requestAnimationFrame(openLinkedQuestion);
search.addEventListener('input',filter);
subject.addEventListener('change',function(){topic.value='all';updateTopics();filter()});topic.addEventListener('change',filter);
document.getElementById('review-reset').addEventListener('click',reset);document.getElementById('review-empty-reset').addEventListener('click',reset);
document.getElementById('review-expand').addEventListener('click',function(){items.forEach(function(item){if(!item.el.hidden)item.el.open=true})});
document.getElementById('review-collapse').addEventListener('click',function(){items.forEach(function(item){if(!item.el.hidden)item.el.open=false})});
document.getElementById('review-print').addEventListener('click',function(){window.print()});
window.addEventListener('beforeprint',expandForPrint);window.addEventListener('afterprint',restoreAfterPrint);
window.addEventListener('hashchange',openLinkedQuestion);
})();
