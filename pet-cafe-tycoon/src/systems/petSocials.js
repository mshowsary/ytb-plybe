import * as THREE from 'three';
import { part, mesh } from '../render/geo.js';
import { SOCIALS, normalizeSocials, availableSocials, startSocial, tickSocial, recordSocialSale, claimSocial } from '../sim/petSocials.js';
import { petProfile } from '../sim/petBook.js';
import { petPortrait } from '../ui/petPortrait.js';
import { iconFor, buntingIcon, medalIcon, clockIcon, checkIcon, crossIcon, coinIcon } from '../ui/icons.js';
import { cue, cueHtml } from '../ui/hud.js';

export function createPetSocials(G,S,ctx) {
  G.meta.socials=normalizeSocials(G.meta.socials);
  const style=document.createElement('style');style.textContent=`
  .social-launch{position:fixed;left:12px;top:350px;z-index:15;border:2px solid #fff7ee;border-radius:16px;background:#426f63;color:white;padding:10px 12px;min-height:46px;min-width:46px;font:850 13px/1 system-ui;box-shadow:0 4px 0 #25483f;max-width:166px;cursor:pointer}
  .social-root{position:fixed;inset:0;z-index:76;background:#292037a6;backdrop-filter:blur(5px);display:grid;place-items:center;padding:14px;box-sizing:border-box}.social-root[hidden],.social-launch[hidden]{display:none}
  .social-panel{background:#fff7ea;color:#42332f;border-radius:26px;padding:22px;width:min(620px,100%);max-height:88vh;overflow:auto;box-sizing:border-box;font:14px/1.5 system-ui;box-shadow:0 18px 80px #20162966}.social-top{display:flex;justify-content:space-between;gap:12px;align-items:center}.social-top h2{font-size:27px;line-height:1.1;margin:6px 0}.social-close{width:46px;height:46px;flex:none;border:0;border-radius:50%;background:#eee0d0;font-size:24px;cursor:pointer}.social-kicker{font-size:10px;letter-spacing:.13em;color:#628c7c;font-weight:900}.social-tier{display:flex;gap:7px;flex-wrap:wrap;margin:16px 0}.social-tier button{flex:1;padding:10px;border:2px solid #ddcfc3;border-radius:13px;background:#fff;font-weight:800;min-height:46px;cursor:pointer}.social-tier button[aria-pressed=true]{background:#426f63;color:white;border-color:#426f63}.social-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.social-choice{border-radius:19px;background:linear-gradient(145deg,#fff,#f3e3d0);padding:12px;border:1px solid #e9d6c3;text-align:center;display:flex;align-items:center;flex-direction:column}.social-portrait{width:85px;height:93px}.social-choice h3{font-size:16px;margin:7px 0}.social-choice p{font-size:12px;color:#786256;flex:1}.social-menu svg{width:32px;height:32px}.social-host,.social-collect{min-height:46px;border:0;border-radius:12px;padding:10px;background:#785cc0;color:white;font-weight:900;cursor:pointer;width:100%}.social-host:disabled{background:#ddd1c4;color:#786a5d;cursor:default}.social-note{font-size:12px;color:#786256}.social-score{font-size:24px;font-weight:900;margin:16px 0}.social-track{height:12px;border-radius:9px;overflow:hidden;background:#e9dacb}.social-track div{height:100%;background:linear-gradient(90deg,#8c70ce,#e99aac);transition:width .2s}.social-medal{font-size:11px;color:#8a642d;font-weight:800}
  @media(max-width:520px){.social-panel{padding:17px}.social-grid{grid-template-columns:1fr}.social-choice{display:grid;grid-template-columns:70px 1fr;gap:4px 12px;text-align:left}.social-portrait{grid-row:1/5;width:70px;height:80px}.social-choice h3,.social-choice p{margin:0}.social-menu{display:none}.social-host{grid-column:1/-1}.social-launch{font-size:11px;max-width:135px}}
  @media(max-height:520px){.social-launch{top:auto;bottom:18px;left:140px}.social-panel{max-height:94vh}.social-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
  body.meta-summary-open .social-launch{display:none}
  @media(prefers-reduced-motion:reduce){.social-track div{transition:none}}
  `;document.head.appendChild(style);
  const launch=document.createElement('button');launch.type='button';launch.className='social-launch';launch.hidden=true;document.body.appendChild(launch);
  const root=document.createElement('div');root.className='social-root';root.hidden=true;root.innerHTML='<section class="social-panel" role="dialog" aria-modal="true" aria-label="Pet Socials"><div class="social-top"><div><div class="social-kicker">MAKE YOUR CAFÉ THE MEETING PLACE</div><h2>Pet Socials</h2></div><button type="button" class="social-close" aria-label="Close Pet Socials">×</button></div><div class="social-content"></div></section>';document.body.appendChild(root);
  let tier=1,stamp='',lastLaunch='',lastDecor='';
  const close=()=>{root.hidden=true;launch.focus();};root.querySelector('.social-close').onclick=close;
  root.onclick=e=>{if(e.target===root)close();};root.onkeydown=e=>{e.stopPropagation();if(e.key==='Escape')close();if(e.key==='Tab'){const buttons=[...root.querySelectorAll('button:not(:disabled)')],first=buttons[0],last=buttons.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}};
  launch.onclick=()=>{if(G.userPaused||ctx.sheets.isOpen)return;ctx.input.reset();root.hidden=false;stamp='';render();root.querySelector('.social-close').focus();};
  const decor=new THREE.Group();S.scene.add(decor);
  const sets=SOCIALS.map(theme=>{
    const parts=[];
    for(const x of [-2.5,3.1]) {
      parts.push(part('cyl',[.035,.035,2.8,6],'#C39861',{x,y:1.4,z:4.15}));
      for(let i=0;i<3;i++) parts.push(part('sph',[.19,10],i%2? '#FFE4BA':theme.color,{x:x+(i-1)*.18,y:2.65+i*.16,z:4.15,sy:1.25}));
    }
    parts.push(part('box',[5.6,.025,.025],'#EED8B9',{x:.3,y:2.4,z:4.15}));
    for(let i=0;i<10;i++) parts.push(part('cone',[.15,.3,3],i%2?'#FFE4BA':theme.color,{x:-2.2+i*.55,y:2.23,z:4.15,rz:Math.PI}));
    const m=mesh(parts,{cast:false});m.visible=false;decor.add(m);return m;
  });
  function save(reason){G.requestCheckpoint?.(reason);}
  function render() {
    if(root.hidden)return;
    const state=G.meta.socials,a=state.active,day=G.dayState.day,time=G.dayState.t;
    const key=JSON.stringify([a,day,a?Math.floor(time):time>140,tier,state.best,state.lastDay,availableSocials(ctx.world).map(s=>s.id)]);
    if(root.hidden||key===stamp)return;stamp=key;
    const content=root.querySelector('.social-content');content.textContent='';
    if(a){
      const theme=SOCIALS.find(s=>s.id===a.id);
      content.innerHTML=`<p><strong>${theme.title}</strong> · ${a.status==='ready'?'Your social is a success!':'Guests are ordering '+theme.product+'.'}</p><div class="social-score">${a.count} / ${a.target} sold <span style="font-size:14px">${a.status==='ready'?'✓':Math.max(0,Math.ceil(a.deadline-time))+'s left'}</span></div><div class="social-track"><div style="width:${a.count/a.target*100}%"></div></div><p>${theme.tip}</p>`;
      if(a.status==='ready') {const b=document.createElement('button');b.className='social-collect';b.textContent=`Collect medal + ${[0,100,200,320][a.tier]} coins`;b.onclick=()=>{const result=claimSocial(state);if(!result)return;G.coins+=result.reward;ctx.hud.setCoins(G.coins);ctx.hud.banner(cue([medalIcon(result.tier),checkIcon()],'Social success, '+['','bronze','silver','gold'][result.tier]+' medal'),2400);ctx.audio.play('chime');save('pet-social-claim');stamp='';render();};content.appendChild(b);}
      return;
    }
    const canStart=day>=8&&state.lastDay<day&&time<=140;
    content.innerHTML='<p>Choose a menu. Prepare your café. Host a 90-second gathering for pet lovers.</p><div class="social-tier"></div><div class="social-grid"></div><p class="social-note">One event per shift, from day 8. New guests order your featured menu. Normal crowd limit. No entry fee or penalty for missing the target; ordinary café service continues.</p>';
    if(!canStart){const p=document.createElement('p');p.textContent=state.lastDay>=day?'Your next social opens next shift.':'Start during the first 140 seconds of a shift.';content.prepend(p);}
    for(let n=1;n<=3;n++){const b=document.createElement('button');b.type='button';b.textContent=['','Cozy · 6','Lively · 10','Grand · 14'][n];b.setAttribute('aria-pressed',String(tier===n));b.onclick=()=>{tier=n;stamp='';render();};content.querySelector('.social-tier').appendChild(b);}
    const available=availableSocials(ctx.world);
    for(const theme of SOCIALS){const card=document.createElement('article');card.className='social-choice';const profile=petProfile(theme.species,0);card.innerHTML=`<div class="social-portrait">${petPortrait(theme.species,profile)}</div><h3>${theme.title}</h3><div class="social-menu">${iconFor(theme.product)}</div><p>${theme.tip}</p><div class="social-medal">${['No medal yet','Bronze medal','Silver medal','Gold medal'][state.best[theme.id]]}</div>`;const b=document.createElement('button');b.className='social-host';b.disabled=!canStart||!available.some(s=>s.id===theme.id);b.textContent=available.some(s=>s.id===theme.id)?`Host · ${[0,100,200,320][tier]} coin prize`:`Unlock ${theme.product}`;b.onclick=()=>{if(startSocial(state,theme.id,tier,day,G.dayState.t,availableSocials(ctx.world))){close();ctx.hud.banner(cue([buntingIcon(),iconFor(theme.product),clockIcon(),90],theme.title+', 90 seconds'),2300);ctx.audio.play('chime');save('pet-social-start');}};card.appendChild(b);content.querySelector('.social-grid').appendChild(card);}
  }
  return {
    update(){
      const state=G.meta.socials;
      if(tickSocial(state,G.dayState.day,G.dayState.t)){ctx.hud.toast(cue([buntingIcon(),clockIcon(),crossIcon()],'Social ended, try a new plan next shift'));save('pet-social-expired');}
      const a=state.active;
      const decorKey=a?.id||'';if(decorKey!==lastDecor){sets.forEach((m,i)=>m.visible=SOCIALS[i].id===decorKey);lastDecor=decorKey;}
      launch.hidden=G.dayState.day<8||G.userPaused||ctx.sheets.isOpen;
      if(G.userPaused||ctx.sheets.isOpen)root.hidden=true;
      // Three states, three pictures rather than three sentences:
      //   idle    bunting + coin      -- press this and the terrace gets bunting and pays a prize
      //   running featured item, count/target, clock + seconds remaining
      //   ready   the gold medal      -- the thing waiting to be collected
      // The bunting is deliberately the same garland this file hangs over the terrace when a social
      // starts (the `sets` meshes above), so the button is a picture of its own consequence. The
      // two emoji it replaces were the last ones left on the play field.
      const theme=a?SOCIALS.find(s=>s.id===a.id):null;
      const cells=a
        ?(a.status==='ready'
          ?[medalIcon(3),coinIcon()]
          :[iconFor(theme.product),a.count,'/',a.target,clockIcon(),Math.max(0,Math.ceil(a.deadline-G.dayState.t))])
        :[buntingIcon(),coinIcon()];
      const aria=a
        ?(a.status==='ready'?'Collect social prize':`${theme.title}, ${a.count} of ${a.target}, ${Math.max(0,Math.ceil(a.deadline-G.dayState.t))} seconds left`)
        :'Host a Pet Social';
      const html=cueHtml(cells);
      if(html!==lastLaunch){launch.innerHTML=html;launch.classList.add('cueRow');lastLaunch=html;}
      if(launch.getAttribute('aria-label')!==aria)launch.setAttribute('aria-label',aria);
      render();
    },
    onSale(order){if(recordSocialSale(G.meta.socials,order,G.dayState.day,G.dayState.t)){ctx.hud.banner(cue([buntingIcon(),medalIcon(3),checkIcon()],'Pet social complete, collect your medal'),2200);ctx.audio.play('chime');save('pet-social-ready');}},
  };
}
