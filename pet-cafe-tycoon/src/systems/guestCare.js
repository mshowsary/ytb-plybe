import { canReassure, reassureGuest } from '../sim/servicePolicy.js';
import { PATIENCE } from '../sim/customers.js';
import { cue, cueHtml } from '../ui/hud.js';
import { heartIcon, clockIcon, checkIcon } from '../ui/icons.js';
export function createGuestCare(G,ctx) {
 const button=document.createElement('button');button.type='button';button.className='guest-reassure';button.hidden=true;
 button.style.cssText='position:fixed;z-index:17;transform:translate(-50%,-100%);min-height:46px;min-width:46px;max-width:170px;border:2px solid #fff;border-radius:15px;padding:10px 12px;background:#487b6b;color:white;font:850 12px/1.3 system-ui;box-shadow:0 4px 0 #294f45;cursor:pointer';document.body.appendChild(button);
 const style=document.createElement('style');style.textContent='.guest-reassure[hidden],body.meta-summary-open .guest-reassure,body.game-paused .guest-reassure{display:none}';document.head.appendChild(style);
 let target=null,working=null,timer=0;const projected={};
 button.onclick=()=>{if(target&&!G.userPaused&&!ctx.sheets.isOpen){working=target;timer=0;}};
 return {update(dt){
   const blocked=G.userPaused||ctx.sheets.isOpen||document.querySelector('.social-root:not([hidden])');
   const near=c=>Math.hypot(c.x-G.P.x,c.z-G.P.z)<1.9;
   if(working){if(blocked||!G.customers.includes(working)||!canReassure(working)||!near(working)){working=null;timer=0;}else{timer+=dt;if(timer>=1.25){if(reassureGuest(working,PATIENCE)){ctx.hud.toast(cue([heartIcon(),checkIcon(),clockIcon()],'Reassured, a little more time to serve'));ctx.audio.play('ding');G.requestCheckpoint('guest-reassured');}working=null;timer=0;}}}
   target=working||G.customers.filter(c=>canReassure(c)&&near(c)).sort((a,b)=>a.patience-b.patience)[0]||null;
   button.hidden=blocked||!target;
   if(button.hidden)return;
   ctx.fx.project(target.x,2.4,target.z,projected);button.hidden=!projected.visible;
   button.style.left=Math.max(85,Math.min(innerWidth-85,projected.sx))+'px';button.style.top=Math.max(64,projected.sy)+'px';
   // Heart + clock + "+20%" is the whole offer: be kind to this guest, buy time. While the hold is
   // running the clock drops out and the percentage becomes the progress of the hold itself -- one
   // numeral changing meaning is fine here because the button is visibly mid-press, and the two
   // states keep distinct aria-labels for anyone who cannot see that.
   const html=working?cueHtml([heartIcon(),Math.round(timer/1.25*100),'%']):cueHtml([heartIcon(),clockIcon(),'+',20,'%']);
   if(button.innerHTML!==html){button.innerHTML=html;button.classList.add('cueRow');}
   button.setAttribute('aria-label',working?'Reassuring guest':'Reassure nearby waiting guest. Stay close for 1.25 seconds.');
 }};
}
