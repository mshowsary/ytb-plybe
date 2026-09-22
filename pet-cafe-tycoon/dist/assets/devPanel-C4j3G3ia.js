import{a as e,at as t}from"./three-D7ZZVgkm.js";import{a as n,c as r,d as i,f as a,g as o,h as s,i as c,l,m as u,n as d,o as f,p,r as m,s as h,t as g,u as _}from"./index-LtLWWlXH.js";var v=[[1,400],[3,650],[5,950],[8,1400],[10,1600],[12,1900],[14,2200],[16,3e3],[20,3800],[24,4400],[28,5e3],[32,6200],[36,7e3],[40,7500]];function y(e){let t=Math.max(1,e|0),n=v[v.length-1];if(t<=v[0][0])return v[0][1];if(t>=n[0])return n[1];for(let e=0;e<v.length-1;e++){let[n,r]=v[e],[i,a]=v[e+1];if(t>=n&&t<=i)return Math.round(r+(a-r)*(t-n)/(i-n))}return n[1]}var b=30,x=`
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
`;function S(){if(document.getElementById(`dev-panel-style`))return;let e=document.createElement(`style`);e.id=`dev-panel-style`,e.textContent=x,document.head.appendChild(e)}function C(e){let t=null;for(let n of Object.keys(h)){let r=f(n,e.staff);r!=null&&(!t||r<t.cost)&&(t={kind:n,cost:r})}return t}function w(e){let t=d(e.world.area.zones,e.world.built);if(!t)return!1;e.coins<t.price&&(e.coins+=t.price-e.coins);let n=c(e.world,t.id,e.coins,9999);return e.coins-=n.spent,e.hud?.setCoins?.(e.coins),n.done}function T(e){let t=C(e);if(!t)return!1;e.coins<t.cost&&(e.coins+=t.cost-e.coins);let r=n(e,t.kind);return e.hud?.setCoins?.(e.coins),!!r.ok}function E(e){let t=0;for(let n of l){let a=r[n];for(let r=0;r<a.length&&t<3;r++)e.meta.petBook[i(n,r)]||(_(e.meta,n,r),t++);if(t>=3)break}return t}async function D(e){e.intro&&e.intro.active&&(e.intro.step=5,e.intro.active=!1,e.intro.target=null);let t=y(e.dayState.day),n=Math.max(0,t-(e.dayStats.earned|0));e.dayStats.earned+=n,e.dayStats.served+=Math.round(n/20),e.coins+=n,e.stats.lifetimeEarned=(e.stats.lifetimeEarned|0)+n,e.stats.served=(e.stats.served|0)+Math.round(n/20),e.dayState.t=239.99;for(let t=0;t<20&&!e.dayState._ended;t++)e.update(.05);await e.dev.finishDayTransition(`dev`)}function O(n,r,i){globalThis.__dev={itemFor:m,carry(e=6,t=`cupcake`){let r=n.owner;if(!r)return 0;r.clearItems(),r.setCarryProps(null,0);for(let n=0;n<e;n++)r.addItem(m(t));for(let e=0;e<40;e++)n.update(.05);return r.items.length},supply(e){n.owner?.clearItems(),n.owner?.setCarryProps(e,0);for(let e=0;e<20;e++)n.update(.05)},route(e,t){let r=n.world.grid;if(!r)return[];let i=o(r,s(r,n.P.x,n.P.z),3),c=o(r,s(r,e,t),3);if(i<0||c<0)return[];let l=new Int32Array(r.w*r.h),d=u(r,i,c,3,l),f=[];for(let e=0;e<d;e++)f.push({x:a(r,l[e]),z:p(r,l[e])});return f},portrait(e=`cat:0`,t=null){let n=g(r.renderer,{petKey:e,poseId:t,accessoryId:null});return{ok:!!n,bytes:n?n.length:0,head:n?n.slice(0,32):null}},sizes(n=`pet:`){let i=[],a=new e,o=new e,s=new t,c=e=>(a.makeEmpty(),e.updateWorldMatrix(!0,!0),e.traverseVisible(e=>{!e.isMesh&&!e.isInstancedMesh||e.geometry&&(o.setFromBufferAttribute(e.geometry.attributes.position),o.applyMatrix4(e.matrixWorld),a.union(o))}),a);return r.scene.traverse(e=>{!e.name||!e.name.startsWith(n)||(c(e).getSize(s),i.push({name:e.name,scale:+e.scale.x.toFixed(3),w:+s.x.toFixed(2),h:+s.y.toFixed(2),l:+s.z.toFixed(2),at:`${e.position.x.toFixed(1)},${e.position.z.toFixed(1)}`}))}),i}},S();let c=document.createElement(`div`);c.className=`dev-panel`,c.innerHTML=`
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
  `,document.body.appendChild(c);let l=c.querySelector(`.dp-readout`),d=[...c.querySelectorAll(`button`)];function f(){let e=(n.world.area.zones||[]).length,t=n.world.built.size;l.textContent=`dev · day ${n.dayState.day} · ${Math.round(n.coins).toLocaleString(`en-US`)} coins · built ${t}/${e}`}setInterval(f,400),f();function h(e){for(let t of d)t.disabled=e}async function _(){h(!0);try{await D(n)}finally{h(!1),f()}}async function v(){h(!0);try{for(let e=0;e<5;e++)await D(n),f(),e<4&&await new Promise(e=>setTimeout(e,50))}finally{h(!1),f()}}function y(){n.coins+=1e3,n.hud?.setCoins?.(n.coins),f()}function x(){w(n),f()}function C(){T(n),f()}function O(){n.dayState.t=240-b,n.update(0),f()}function k(){E(n),f()}let A={day1:_,day5:v,coins:y,build:x,hire:C,dusk:O,pets:k};c.addEventListener(`click`,e=>{let t=e.target.closest(`button[data-a]`);!t||t.disabled||A[t.dataset.a]?.()})}export{O as installDevPanel};