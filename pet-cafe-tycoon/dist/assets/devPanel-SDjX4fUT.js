import{a as e,rt as t}from"./three-cbuf-PSy.js";import{a as n,c as r,d as i,f as a,g as o,h as s,i as c,l,m as u,n as d,o as f,p,r as m,s as h,t as g,u as _}from"./index-BR_6uYEZ.js";var v=[[1,400],[3,650],[5,950],[8,1400],[10,1600],[12,1900],[14,2200],[16,3e3],[20,3800],[24,4400],[28,5e3],[32,6200],[36,7e3],[40,7500]];function y(e){let t=Math.max(1,e|0),n=v[v.length-1];if(t<=v[0][0])return v[0][1];if(t>=n[0])return n[1];for(let e=0;e<v.length-1;e++){let[n,r]=v[e],[i,a]=v[e+1];if(t>=n&&t<=i)return Math.round(r+(a-r)*(t-n)/(i-n))}return n[1]}var b=30,x=`
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
`;function S(){if(document.getElementById(`dev-panel-style`))return;let e=document.createElement(`style`);e.id=`dev-panel-style`,e.textContent=x,document.head.appendChild(e)}function C(e){let t=null;for(let n of Object.keys(a)){let r=i(n,e.staff);r!=null&&(!t||r<t.cost)&&(t={kind:n,cost:r})}return t}function w(e){let t=l(e.world.area.zones,e.world.built);if(!t)return!1;e.coins<t.price&&(e.coins+=t.price-e.coins);let n=m(e.world,t.id,e.coins,9999);return e.coins-=n.spent,e.hud?.setCoins?.(e.coins),n.done}function T(e){let t=C(e);if(!t)return!1;e.coins<t.cost&&(e.coins+=t.cost-e.coins);let n=_(e,t.kind);return e.hud?.setCoins?.(e.coins),!!n.ok}function E(e){let t=0;for(let n of u){let r=p[n];for(let i=0;i<r.length&&t<3;i++)e.meta.petBook[o(n,i)]||(s(e.meta,n,i),t++);if(t>=3)break}return t}async function D(e){e.intro&&e.intro.active&&(e.intro.step=5,e.intro.active=!1,e.intro.target=null);let t=y(e.dayState.day),n=Math.max(0,t-(e.dayStats.earned|0));e.dayStats.earned+=n,e.dayStats.served+=Math.round(n/20),e.coins+=n,e.stats.lifetimeEarned=(e.stats.lifetimeEarned|0)+n,e.stats.served=(e.stats.served|0)+Math.round(n/20),e.dayState.t=239.99;for(let t=0;t<20&&!e.dayState._ended;t++)e.update(.05);await e.dev.finishDayTransition(`dev`)}function O(i,a,o){globalThis.__dev={itemFor:d,carry(e=6,t=`cupcake`){let n=i.owner;if(!n)return 0;n.clearItems(),n.setCarryProps(null,0);for(let r=0;r<e;r++)n.addItem(d(t));for(let e=0;e<40;e++)i.update(.05);return n.items.length},supply(e){i.owner?.clearItems(),i.owner?.setCarryProps(e,0);for(let e=0;e<20;e++)i.update(.05)},route(e,t){let a=i.world.grid;if(!a)return[];let o=r(a,h(a,i.P.x,i.P.z),3),s=r(a,h(a,e,t),3);if(o<0||s<0)return[];let l=new Int32Array(a.w*a.h),u=f(a,o,s,3,l),d=[];for(let e=0;e<u;e++)d.push({x:c(a,l[e]),z:n(a,l[e])});return d},portrait(e=`cat:0`,t=null){let n=g(a.renderer,{petKey:e,poseId:t,accessoryId:null});return{ok:!!n,bytes:n?n.length:0,head:n?n.slice(0,32):null}},sizes(n=`pet:`){let r=[],i=new e,o=new e,s=new t,c=e=>(i.makeEmpty(),e.updateWorldMatrix(!0,!0),e.traverseVisible(e=>{!e.isMesh&&!e.isInstancedMesh||e.geometry&&(o.setFromBufferAttribute(e.geometry.attributes.position),o.applyMatrix4(e.matrixWorld),i.union(o))}),i);return a.scene.traverse(e=>{!e.name||!e.name.startsWith(n)||(c(e).getSize(s),r.push({name:e.name,scale:+e.scale.x.toFixed(3),w:+s.x.toFixed(2),h:+s.y.toFixed(2),l:+s.z.toFixed(2),at:`${e.position.x.toFixed(1)},${e.position.z.toFixed(1)}`}))}),r}},S();let s=document.createElement(`div`);s.className=`dev-panel`,s.innerHTML=`
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
  `,document.body.appendChild(s);let l=s.querySelector(`.dp-readout`),u=[...s.querySelectorAll(`button`)];function p(){let e=(i.world.area.zones||[]).length,t=i.world.built.size;l.textContent=`dev · day ${i.dayState.day} · ${Math.round(i.coins).toLocaleString(`en-US`)} coins · built ${t}/${e}`}setInterval(p,400),p();function m(e){for(let t of u)t.disabled=e}async function _(){m(!0);try{await D(i)}finally{m(!1),p()}}async function v(){m(!0);try{for(let e=0;e<5;e++)await D(i),p(),e<4&&await new Promise(e=>setTimeout(e,50))}finally{m(!1),p()}}function y(){i.coins+=1e3,i.hud?.setCoins?.(i.coins),p()}function x(){w(i),p()}function C(){T(i),p()}function O(){i.dayState.t=240-b,i.update(0),p()}function k(){E(i),p()}let A={day1:_,day5:v,coins:y,build:x,hire:C,dusk:O,pets:k};s.addEventListener(`click`,e=>{let t=e.target.closest(`button[data-a]`);!t||t.disabled||A[t.dataset.a]?.()})}export{O as installDevPanel};