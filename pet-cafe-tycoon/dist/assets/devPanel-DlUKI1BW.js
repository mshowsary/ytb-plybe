import{a as e,c as t,i as n,l as r,n as i,o as a,r as o,s,t as c}from"./index-C-V-YQQt.js";var l=[[1,400],[3,650],[5,950],[8,1400],[10,1600],[12,1900],[14,2200],[16,3e3],[20,3800],[24,4400],[28,5e3],[32,6200],[36,7e3],[40,7500]];function u(e){let t=Math.max(1,e|0),n=l[l.length-1];if(t<=l[0][0])return l[0][1];if(t>=n[0])return n[1];for(let e=0;e<l.length-1;e++){let[n,r]=l[e],[i,a]=l[e+1];if(t>=n&&t<=i)return Math.round(r+(a-r)*(t-n)/(i-n))}return n[1]}var d=30,f=`
.dev-panel{position:fixed;left:8px;bottom:8px;z-index:999;pointer-events:auto;
  font:11px/1.5 ui-monospace,Menlo,Consolas,monospace;color:#f3ede4;
  background:#20161066;background:#201610e6;border:1px solid #ffffff2b;border-radius:9px;
  padding:8px 9px;width:max-content;max-width:min(240px,calc(100vw - 16px));box-shadow:0 6px 20px #0008;}
.dev-panel .dp-readout{font-weight:700;margin-bottom:6px;white-space:normal;word-break:break-word;}
.dev-panel .dp-row{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:4px;}
.dev-panel button{font:inherit;color:inherit;background:#ffffff1a;border:1px solid #ffffff33;
  border-radius:5px;padding:3px 6px;cursor:pointer;}
.dev-panel button:hover{background:#ffffff30;}
.dev-panel button:disabled{opacity:.45;cursor:default;}
.dev-panel .dp-note{opacity:.6;margin-top:2px;font-size:10px;}
`;function p(){if(document.getElementById(`dev-panel-style`))return;let e=document.createElement(`style`);e.id=`dev-panel-style`,e.textContent=f,document.head.appendChild(e)}function m(t){let r=null;for(let i of Object.keys(e)){let e=n(i,t.staff);e!=null&&(!r||e<r.cost)&&(r={kind:i,cost:e})}return r}function h(e){let t=i(e.world.area.zones,e.world.built);if(!t)return!1;e.coins<t.price&&(e.coins+=t.price-e.coins);let n=c(e.world,t.id,e.coins,9999);return e.coins-=n.spent,e.hud?.setCoins?.(e.coins),n.done}function g(e){let t=m(e);if(!t)return!1;e.coins<t.cost&&(e.coins+=t.cost-e.coins);let n=o(e,t.kind);return e.hud?.setCoins?.(e.coins),!!n.ok}function _(e){let n=0;for(let i of s){let o=a[i];for(let a=0;a<o.length&&n<3;a++)e.meta.petBook[r(i,a)]||(t(e.meta,i,a),n++);if(n>=3)break}return n}async function v(e){e.intro&&e.intro.active&&(e.intro.step=5,e.intro.active=!1,e.intro.target=null);let t=u(e.dayState.day),n=Math.max(0,t-(e.dayStats.earned|0));e.dayStats.earned+=n,e.dayStats.served+=Math.round(n/20),e.coins+=n,e.stats.lifetimeEarned=(e.stats.lifetimeEarned|0)+n,e.stats.served=(e.stats.served|0)+Math.round(n/20),e.dayState.t=239.99;for(let t=0;t<20&&!e.dayState._ended;t++)e.update(.05);await e.dev.finishDayTransition(`dev`)}function y(e,t,n){p();let r=document.createElement(`div`);r.className=`dev-panel`,r.innerHTML=`
    <div class="dp-readout"></div>
    <div class="dp-row">
      <button type="button" data-a="day1">+1 day</button>
      <button type="button" data-a="day5">+5 days</button>
      <button type="button" data-a="coins">+1,000 coins</button>
    </div>
    <div class="dp-row">
      <button type="button" data-a="build">Build next</button>
      <button type="button" data-a="hire">Hire</button>
      <button type="button" data-a="dusk">Dusk</button>
    </div>
    <div class="dp-row">
      <button type="button" data-a="pets">Discover 3 pets</button>
    </div>
    <div class="dp-note">dev only, never shown to players</div>
  `,document.body.appendChild(r);let i=r.querySelector(`.dp-readout`),a=[...r.querySelectorAll(`button`)];function o(){let t=(e.world.area.zones||[]).length,n=e.world.built.size;i.textContent=`dev · day ${e.dayState.day} · ${Math.round(e.coins).toLocaleString(`en-US`)} coins · built ${n}/${t}`}setInterval(o,400),o();function s(e){for(let t of a)t.disabled=e}async function c(){s(!0);try{await v(e)}finally{s(!1),o()}}async function l(){s(!0);try{for(let t=0;t<5;t++)await v(e),o(),t<4&&await new Promise(e=>setTimeout(e,50))}finally{s(!1),o()}}function u(){e.coins+=1e3,e.hud?.setCoins?.(e.coins),o()}function f(){h(e),o()}function m(){g(e),o()}function y(){e.dayState.t=240-d,e.update(0),o()}function b(){_(e),o()}let x={day1:c,day5:l,coins:u,build:f,hire:m,dusk:y,pets:b};r.addEventListener(`click`,e=>{let t=e.target.closest(`button[data-a]`);!t||t.disabled||x[t.dataset.a]?.()})}export{y as installDevPanel};