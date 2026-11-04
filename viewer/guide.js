import { createGuideModel } from './guide-model.js';
const $=id=>document.getElementById(id);
const el=(tag,text,className)=>{const node=document.createElement(tag);if(text)node.textContent=text;if(className)node.className=className;return node;};
let data,model,index=0,frame=0,progress=.15,playing=false,last=0,arrows=true,reference=false;
function play(value){playing=value&&!reference;$('guide-play').textContent=playing?'Ⅱ Pause action':progress===1?'↻ Replay action':'▶ Play action';}
function update(value){progress=Math.max(0,Math.min(1,value));model.update(progress);$('guide-progress').value=Math.round(progress*1000);$('guide-progress').setAttribute('aria-valuetext',`${Math.round(progress*100)} percent`);$('guide-percent').value=`${Math.round(progress*100)}%`;}
function setFrame(value){frame=value;model.setStep(index+1,data.steps[index].stage,frame);update(frame===0?.15:frame===1?.7:.45);play(false);document.querySelectorAll('[data-frame]').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.frame)===frame)));}
function showStep(value,historyMode='push'){
  index=Math.max(0,Math.min(data.steps.length-1,value));const step=data.steps[index],stage=step.stage,total=data.steps.length;
  play(false);$('step-title').textContent=step.title;$('instruction-number').textContent=`STEP ${String(index+1).padStart(2,'0')}`;
  $('step-counter').textContent=`Step ${index+1} of ${total}`;$('chapter').textContent=step.chapter;
  $('instruction-list').replaceChildren(...step.instructions.map(text=>el('li',text)));
  $('action-number').textContent=String(index+1).padStart(2,'0');$('action-caption').textContent=stage.label;
  $('step-warning').hidden=!stage.note;$('step-warning').textContent=stage.note;
  $('geometry-badge').textContent=reference?'KEYSHOT RENDER':'CAD + RECONSTRUCTION';
  $('view-note').textContent=reference?'Original supplied KeyShot render of the assembled Brax3. This is an appearance reference, not an image of the current repair action.':'Brax3 KeyShot artwork on an interactive reconstruction with the original CAD chassis. Arrows and part motion are illustrative.';
  $('tool-list').replaceChildren(...stage.tools.map(toolIndex=>{const tool=data.tools[toolIndex],card=el('div',null,'tool'),image=el('img');image.src=tool.image;image.alt=tool.name;image.width=130;image.height=76;card.append(image,el('span',tool.name));return card;}));
  if(!stage.tools.length)$('tool-list').append(el('p','No hand tool illustrated for this step.','no-tools'));
  $('frame-list').replaceChildren(...stage.frames.map((preset,i)=>{const button=el('button');button.dataset.frame=i;button.disabled=reference;button.append(el('strong',`VIEW ${i+1}`),el('span',['Rear overview','Angled view','Detail'][i]));button.addEventListener('click',()=>setFrame(i));return button;}));
  $('step-select').value=String(index);
  document.querySelectorAll('[data-step]').forEach(button=>{if(Number(button.dataset.step)===index)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');});
  $('previous-step').disabled=index===0;$('next-step').disabled=index===total-1;$('navigation-title').textContent=`${index+1} / ${total} · Brax3`;
  $('guide-status').textContent=`Brax3 visual service draft · ${index===total-1?'End of guide':'Hardware details require service verification'}`;
  setFrame(0);
  if(historyMode!=='none')history[historyMode==='replace'?'replaceState':'pushState']({},'',`/guide?step=${index+1}`);
  document.title=`Brax3 · Step ${index+1} · ${step.title}`;
}
function setReference(value){
  reference=value;play(false);$('keyshot-reference').hidden=!value;$('guide-canvas').hidden=value;
  $('reference-toggle').textContent=value?'Interactive 3D':'KeyShot reference';$('reference-toggle').setAttribute('aria-pressed',String(value));
  for(const id of ['guide-play','guide-progress','guide-angle','guide-labels'])$(id).disabled=value;
  document.querySelectorAll('[data-frame]').forEach(button=>button.disabled=value);
  $('geometry-badge').textContent=value?'KEYSHOT RENDER':'CAD + RECONSTRUCTION';
  $('action-overlay').hidden=value;$('gesture-hint').textContent=value?'Original assembled render supplied with the model':'Drag to rotate · Scroll to zoom';
  $('view-note').textContent=value?'Original supplied KeyShot render of the assembled Brax3. This is an appearance reference, not an image of the current repair action.':'Brax3 KeyShot artwork on an interactive reconstruction with the original CAD chassis. Arrows and part motion are illustrative.';
  if(!value)model.camera();
}
async function init(){try{
  const response=await fetch('/guide-data.json');if(!response.ok)throw new Error('Guide data unavailable');data=await response.json();
  model=await createGuideModel($('guide-canvas'),data.steps);
  $('sequence-count').textContent=`${data.steps.length} steps`;
  $('step-list').replaceChildren(...data.steps.map((step,i)=>{const button=el('button');button.dataset.step=i;button.append(el('span',String(i+1).padStart(2,'0')),el('div',step.title));button.addEventListener('click',()=>showStep(i));return button;}));
  $('step-select').replaceChildren(...data.steps.map((step,i)=>{const option=el('option',`${i+1}. ${step.title}`);option.value=i;return option;}));
  document.querySelectorAll('button,input,select').forEach(node=>node.disabled=false);
  const requested=()=>{const value=Number(new URLSearchParams(location.search).get('step')||1);return Number.isFinite(value)?Math.max(0,Math.min(data.steps.length-1,Math.floor(value)-1)):0;};
  showStep(requested(),'replace');$('guide-loading').hidden=true;
  $('step-select').addEventListener('change',event=>showStep(Number(event.target.value)));
  $('previous-step').addEventListener('click',()=>showStep(index-1));$('next-step').addEventListener('click',()=>showStep(index+1));
  $('guide-progress').addEventListener('input',event=>{update(Number(event.target.value)/1000);play(false);});
  $('guide-play').addEventListener('click',()=>{if(!playing&&progress===1)update(0);play(!playing);});
  $('guide-angle').addEventListener('click',()=>model.camera());
  $('guide-labels').addEventListener('click',()=>{arrows=!arrows;model.setAnnotations(arrows);$('guide-labels').textContent=arrows?'Arrows on':'Arrows off';$('guide-labels').setAttribute('aria-pressed',String(arrows));});
  $('reference-toggle').addEventListener('click',()=>setReference(!reference));
  window.addEventListener('popstate',()=>showStep(requested(),'none'));
  document.addEventListener('visibilitychange',()=>{if(document.hidden)play(false);});
  let oldWidth=$('guide-canvas').clientWidth;new ResizeObserver(()=>{const width=$('guide-canvas').clientWidth;if(width>0&&Math.abs(width-oldWidth)>10){oldWidth=width;requestAnimationFrame(()=>model.camera());}}).observe($('guide-canvas'));
  function animate(time){const delta=Math.min((time-last)/1000,.05);last=time;if(playing){update(progress+delta/5);if(progress===1)play(false);}if(!reference)model.render();requestAnimationFrame(animate);}requestAnimationFrame(animate);
}catch(error){$('guide-loading').textContent='Unable to load the guide. Refresh to try again.';$('guide-status').textContent=error.message;console.error(error);}}
init();
