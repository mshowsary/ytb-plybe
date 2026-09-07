const n=(v,max=1e9)=>Math.max(0,Math.min(max,Math.floor(Number(v)||0)));
export function normalizeServicePolicy(raw={}) {
 return {enabledFrom:n(raw?.enabledFrom),notice:!!raw?.notice,nextVisit:Math.max(1,n(raw?.nextVisit)),day:n(raw?.day),baseline:Math.max(400,Math.min(2000,n(raw?.baseline)||700)),spent:n(raw?.spent,160),incidents:Object.fromEntries(Object.entries(raw?.incidents||{}).slice(-512).map(([id,v])=>[id,n(v,18)])),causes:Object.fromEntries(['counter','register','bowl','table'].map(k=>[k,n(raw?.causes?.[k],160)])),ordinary:(Array.isArray(raw?.ordinary)?raw.ordinary:[]).slice(-5).map(v=>n(v)),recordedDay:n(raw?.recordedDay)};
}
export function prepareServicePolicy(G) {
 const p=G.meta.servicePolicy,day=G.dayState.day;
 if(!p.enabledFrom)p.enabledFrom=Math.max(8,day+1);
 if(p.day!==day){p.day=day;p.spent=0;p.incidents={};p.causes={counter:0,register:0,bowl:0,table:0};const rows=[...p.ordinary].sort((a,b)=>a-b);p.baseline=rows.length<3?700:Math.max(400,Math.min(2000,Math.round((rows[Math.floor((rows.length-1)/2)]+rows[Math.floor(rows.length/2)])/2)));}
 return day>=p.enabledFrom&&p.notice;
}
export function recordOrdinaryServiceShift(G) {
 const p=G.meta.servicePolicy,day=G.dayState.day;
 if(p.recordedDay>=day)return;p.recordedDay=day;
 if(G.meta.socials?.lastDay===day)return;
 p.ordinary.push(n(G.dayStats.earned));p.ordinary=p.ordinary.slice(-5);
}
export function serviceIncident(G,customer,reason) {
 const p=G.meta.servicePolicy;
 if(!customer?.serviceVisitId||!['counter','register','bowl','table'].includes(reason))return {fee:0,duplicate:true};
 const id=String(customer.serviceVisitId);
 if(Object.hasOwn(p.incidents,id))return {fee:0,duplicate:true};
 // Consume the incident even when the cap/wallet is exhausted; later collections cannot charge it again.
 const enabled=prepareServicePolicy(G);
 const requested=reason==='table'?(customer.paid?Math.min(18,Math.floor((customer.amount||0)*.25)):0):Math.min(18,Math.max(4,Math.ceil((customer.recoveryQuote||0)*.25)));
 const fee=enabled?Math.max(0,Math.min(requested,Math.floor(p.baseline*.08)-p.spent,G.coins)):0;
 p.incidents[id]=fee;p.spent+=fee;p.causes[reason]+=fee;
 G.coins-=fee;G.dayStats.serviceFees=(G.dayStats.serviceFees||0)+fee;G.stats.serviceFees=(G.stats.serviceFees||0)+fee;
 return {fee,duplicate:false,capped:enabled&&p.spent>=Math.floor(p.baseline*.08)};
}
export function canReassure(c) {return !!c&&!c.paid&&!c.reassured&&!c.done&&['queue','atRegister','atBowl'].includes(c.state)&&c.patience>0&&c.patience<12;}
export function reassureGuest(c,initialPatience) {
 if(!canReassure(c))return false;c.reassured=true;c.patience=Math.min(initialPatience,c.patience+initialPatience*.2);return true;
}
