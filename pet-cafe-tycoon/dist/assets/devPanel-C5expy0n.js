import{a as e,rt as t}from"./three-cbuf-PSy.js";import{a as n,c as r,d as i,i as a,l as o,n as s,o as c,r as l,s as u,t as d,u as f}from"./index-CbbizzLp.js";var p=[[1,400],[3,650],[5,950],[8,1400],[10,1600],[12,1900],[14,2200],[16,3e3],[20,3800],[24,4400],[28,5e3],[32,6200],[36,7e3],[40,7500]];function m(e){let t=Math.max(1,e|0),n=p[p.length-1];if(t<=p[0][0])return p[0][1];if(t>=n[0])return n[1];for(let e=0;e<p.length-1;e++){let[n,r]=p[e],[i,a]=p[e+1];if(t>=n&&t<=i)return Math.round(r+(a-r)*(t-n)/(i-n))}return n[1]}var h=30,g=`
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
`;function _(){if(document.getElementById(`dev-panel-style`))return;let e=document.createElement(`style`);e.id=`dev-panel-style`,e.textContent=g,document.head.appendChild(e)}function v(e){let t=null;for(let n of Object.keys(u)){let r=c(n,e.staff);r!=null&&(!t||r<t.cost)&&(t={kind:n,cost:r})}return t}function y(e){let t=a(e.world.area.zones,e.world.built);if(!t)return!1;e.coins<t.price&&(e.coins+=t.price-e.coins);let n=l(e.world,t.id,e.coins,9999);return e.coins-=n.spent,e.hud?.setCoins?.(e.coins),n.done}function b(e){let t=v(e);if(!t)return!1;e.coins<t.cost&&(e.coins+=t.cost-e.coins);let r=n(e,t.kind);return e.hud?.setCoins?.(e.coins),!!r.ok}function x(e){let t=0;for(let n of o){let a=r[n];for(let r=0;r<a.length&&t<3;r++)e.meta.petBook[i(n,r)]||(f(e.meta,n,r),t++);if(t>=3)break}return t}async function S(e){e.intro&&e.intro.active&&(e.intro.step=5,e.intro.active=!1,e.intro.target=null);let t=m(e.dayState.day),n=Math.max(0,t-(e.dayStats.earned|0));e.dayStats.earned+=n,e.dayStats.served+=Math.round(n/20),e.coins+=n,e.stats.lifetimeEarned=(e.stats.lifetimeEarned|0)+n,e.stats.served=(e.stats.served|0)+Math.round(n/20),e.dayState.t=239.99;for(let t=0;t<20&&!e.dayState._ended;t++)e.update(.05);await e.dev.finishDayTransition(`dev`)}function C(n,r,i){globalThis.__dev={itemFor:s,carry(e=6,t=`cupcake`){let r=n.owner;if(!r)return 0;r.clearItems(),r.setCarryProps(null,0);for(let n=0;n<e;n++)r.addItem(s(t));for(let e=0;e<40;e++)n.update(.05);return r.items.length},supply(e){n.owner?.clearItems(),n.owner?.setCarryProps(e,0);for(let e=0;e<20;e++)n.update(.05)},portrait(e=`cat:0`,t=null){let n=d(r.renderer,{petKey:e,poseId:t,accessoryId:null});return{ok:!!n,bytes:n?n.length:0,head:n?n.slice(0,32):null}},sizes(n=`pet:`){let i=[],a=new e,o=new e,s=new t,c=e=>(a.makeEmpty(),e.updateWorldMatrix(!0,!0),e.traverseVisible(e=>{!e.isMesh&&!e.isInstancedMesh||e.geometry&&(o.setFromBufferAttribute(e.geometry.attributes.position),o.applyMatrix4(e.matrixWorld),a.union(o))}),a);return r.scene.traverse(e=>{!e.name||!e.name.startsWith(n)||(c(e).getSize(s),i.push({name:e.name,scale:+e.scale.x.toFixed(3),w:+s.x.toFixed(2),h:+s.y.toFixed(2),l:+s.z.toFixed(2),at:`${e.position.x.toFixed(1)},${e.position.z.toFixed(1)}`}))}),i}},_();let a=document.createElement(`div`);a.className=`dev-panel`,a.innerHTML=`
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
  `,document.body.appendChild(a);let o=a.querySelector(`.dp-readout`),c=[...a.querySelectorAll(`button`)];function l(){let e=(n.world.area.zones||[]).length,t=n.world.built.size;o.textContent=`dev · day ${n.dayState.day} · ${Math.round(n.coins).toLocaleString(`en-US`)} coins · built ${t}/${e}`}setInterval(l,400),l();function u(e){for(let t of c)t.disabled=e}async function f(){u(!0);try{await S(n)}finally{u(!1),l()}}async function p(){u(!0);try{for(let e=0;e<5;e++)await S(n),l(),e<4&&await new Promise(e=>setTimeout(e,50))}finally{u(!1),l()}}function m(){n.coins+=1e3,n.hud?.setCoins?.(n.coins),l()}function g(){y(n),l()}function v(){b(n),l()}function C(){n.dayState.t=240-h,n.update(0),l()}function w(){x(n),l()}let T={day1:f,day5:p,coins:m,build:g,hire:v,dusk:C,pets:w};a.addEventListener(`click`,e=>{let t=e.target.closest(`button[data-a]`);!t||t.disabled||T[t.dataset.a]?.()})}export{C as installDevPanel};