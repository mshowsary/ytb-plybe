export const SOCIALS = [
  { id:'cat', title:'Purr & Pour', species:'cat', product:'coffee', color:'#8B7CF6', tip:'Fill the beans and assign a Runner to coffee.' },
  { id:'dog', title:'Pupcake Picnic', species:'dog', product:'cupcake', color:'#E88691', tip:'Stock cupcakes and assign a Runner to their display.' },
  { id:'bunny', title:'Berry Bunny Club', species:'bunny', product:'smoothie', color:'#67A98A', tip:'Prepare fruit and keep the smoothie display supplied.' },
];
const int=(v,max=100000)=>Math.max(0,Math.min(max,Math.floor(Number(v)||0)));
export function normalizeSocials(raw={}) {
  const best=Object.fromEntries(SOCIALS.map(s=>[s.id,int(raw?.best?.[s.id],3)]));
  const state={lastDay:int(raw?.lastDay),best,active:null};
  const a=raw?.active;
  if(a && SOCIALS.some(s=>s.id===a.id) && int(a.day)>=8) {
    const tier=Math.max(1,int(a.tier,3)), target=6+(tier-1)*4;
    state.active={id:a.id,day:int(a.day),tier,target,count:int(a.count,target),deadline:Math.max(90,Math.min(230,Number(a.deadline)||90)),status:a.status==='ready'&&int(a.count,target)>=target?'ready':'running'};
    state.lastDay=Math.max(state.lastDay,state.active.day);
  }
  return state;
}
export function availableSocials(world) {
  return SOCIALS.filter(s=>[...world.stations.values()].some(st=>st.active&&st.type==='display'&&(st.product===s.product||(s.product==='coffee'&&st.product==='latte'))));
}
export function startSocial(state,id,tier,day,time,available) {
  if(state.active || day<8 || state.lastDay>=day || time>140 || !available.some(s=>s.id===id)) return false;
  tier=Math.max(1,int(tier,3));
  state.active={id,day,tier,target:6+(tier-1)*4,count:0,deadline:Math.min(230,time+90),status:'running'};
  state.lastDay=day;return true;
}
export function tickSocial(state,day,time) {
  const a=state.active;if(!a||a.status==='ready')return false;
  if(day!==a.day||time>=a.deadline){state.active=null;return true;}return false;
}
export function recordSocialSale(state,order,day,time) {
  if(tickSocial(state,day,time))return false;
  const a=state.active;if(!a||a.status!=='running')return false;
  const menu=SOCIALS.find(s=>s.id===a.id);
  a.count=Math.min(a.target,a.count+(order||[]).filter(k=>k===menu.product||(menu.product==='coffee'&&k==='latte')).length);
  if(a.count>=a.target){a.status='ready';return true;}return false;
}
export function claimSocial(state) {
  const a=state.active;if(!a||a.status!=='ready'||a.count<a.target)return null;
  const reward=[0,100,200,320][a.tier];state.best[a.id]=Math.max(state.best[a.id]||0,a.tier);state.active=null;
  return {id:a.id,tier:a.tier,reward};
}
