import { careerGoalProgress } from '../sim/career.js';
const PATHS={
 serve:'<circle cx="8" cy="7" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20v-5a5 5 0 0 1 10 0v5m1-6a4 4 0 0 1 7 3v3"/>',
 earn:'<circle cx="12" cy="12" r="9"/><path d="M15 8h-4a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4H9m3-10v12"/>',
 streak:'<path d="m9 15 6-6m-8 4-2 2a4 4 0 0 0 6 6l3-3a4 4 0 0 0 0-6m3-1 2-2a4 4 0 0 0-6-6l-3 3a4 4 0 0 0 0 6"/>',
};
export function contractModel(goal,stats,day) {
 if(!goal || !PATHS[goal.kind] || !(goal.target>0))return null;
 const current=Math.max(0,careerGoalProgress(goal,stats)),target=goal.target;
 return {key:`${day}:${goal.kind}:${target}`,kind:goal.kind,current,target,ratio:Math.min(1,current/target),complete:current>=target};
}
export function createContractBadge(parent) {
 const style=document.createElement('style');style.textContent=`
 #dayPill .contract-badge{display:flex;align-items:center;justify-content:center;gap:6px;margin-top:3px;padding:3px 6px;border-radius:12px;background:#fff7e8;color:#654930;min-width:0;font:900 10px/1 system-ui}
 #dayPill .contract-badge[hidden]{display:none}
 .contract-ring{display:grid;place-items:center;width:25px;height:25px;border-radius:50%;background:conic-gradient(#75bda0 var(--contract-progress,0%),#dbcab4 0);flex:none}
 .contract-ring>span{display:grid;place-items:center;background:#fffaf0;border-radius:50%;width:19px;height:19px}
 .contract-ring svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
 .contract-badge.complete{color:#337453;background:#e8f4e6}.contract-badge.complete .contract-ring{background:#76bd94}
 .contract-badge.celebrate{animation:contractCelebrate .65s ease-out}
 @keyframes contractCelebrate{40%{transform:scale(1.08);box-shadow:0 0 0 5px #b8deb955}100%{transform:scale(1)}}
 @media(max-width:320px){#dayPill .contract-badge{font-size:9px;padding:2px 4px;gap:4px}.contract-ring{width:20px;height:20px}.contract-ring>span{width:16px;height:16px}.contract-ring svg{width:12px;height:12px}}
 @media(prefers-reduced-motion:reduce){.contract-badge.celebrate{animation:none}}
 `;document.head.appendChild(style);
 const el=document.createElement('div');el.className='contract-badge';el.hidden=true;el.setAttribute('role','progressbar');
 el.innerHTML='<span class="contract-ring" aria-hidden="true"><span></span></span><span class="contract-count" aria-hidden="true"></span>';
 parent.appendChild(el);const icon=el.querySelector('.contract-ring>span'),count=el.querySelector('.contract-count');let last=null;
 return {update(goal,stats,day){
  const model=contractModel(goal,stats,day);el.hidden=!model;if(!model){last=null;return;}
  if(last?.kind!==model.kind)icon.innerHTML=`<svg viewBox="0 0 24 24">${PATHS[model.kind]}</svg>`;
  if(last?.key!==model.key)el.classList.remove('celebrate');
  if(last?.key===model.key && !last.complete && model.complete)el.classList.add('celebrate');
  el.classList.toggle('complete',model.complete);el.style.setProperty('--contract-progress',`${model.ratio*100}%`);
  const shown=Math.min(model.current,model.target);count.textContent=`${shown}/${model.target}`;
  const label=model.kind==='serve'?'Guests served':model.kind==='earn'?'Shift earnings':'Best service streak';
  el.setAttribute('aria-label',label);el.setAttribute('aria-valuemin','0');el.setAttribute('aria-valuemax',String(model.target));el.setAttribute('aria-valuenow',String(shown));
  el.title=`${label}: ${model.current}/${model.target}`;last=model;
 }};
}
