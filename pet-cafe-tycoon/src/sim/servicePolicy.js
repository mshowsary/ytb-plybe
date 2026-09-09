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
// Batch 6: the policy OBSERVES, it never charges. The owner played the live build on a phone and
// came back with 20 recovery moments on day 2 and 25 on day 6 -- "if the player is constantly
// reassuring, cleaning, and recovering, the game is nagging them rather than challenging them" --
// against the standing rule that we never overwhelm or punish the player or raise his cortisol
// level, we only keep the shift from being boring. So the fee is unconditionally 0 now: a service
// mistake costs nothing from the wallet, ever, and the one consequence left is the one that was
// always fair and legible -- a guest who gives up and leaves.
// Everything else is deliberately unchanged. The visit id is still consumed (one incident per
// visit, so a later collection cannot double-count it), prepareServicePolicy still rolls the shift
// over, and incidents/causes keep tallying -- causes now counts INCIDENTS rather than coins, since
// coins are no longer a thing this function produces. G.dayStats.serviceFees therefore stays 0,
// which is what the summary strip, the settlement sheet and the ledger all read.
export function serviceIncident(G,customer,reason) {
 const p=G.meta.servicePolicy;
 if(!customer?.serviceVisitId||!['counter','register','bowl','table'].includes(reason))return {fee:0,duplicate:true};
 const id=String(customer.serviceVisitId);
 if(Object.hasOwn(p.incidents,id))return {fee:0,duplicate:true};
 prepareServicePolicy(G);
 p.incidents[id]=0;p.causes[reason]=(p.causes[reason]|0)+1;
 return {fee:0,duplicate:false,capped:false};
}
// Batch 6: nothing calls these any more. The floating "reassure this guest" button they backed was
// pure busywork -- hold still near a guest for 1.25s to buy patience -- and busywork is exactly the
// nagging the owner asked us to take out, so src/systems/guestCare.js is gone. The two pure helpers
// stay because a save carrying `reassured` still restores cleanly through them, and because a
// future kindness that GIVES time (rather than demanding attention for it) can reuse the rule.
export function canReassure(c) {return !!c&&!c.paid&&!c.reassured&&!c.done&&['queue','atRegister','atBowl'].includes(c.state)&&c.patience>0&&c.patience<12;}
export function reassureGuest(c,initialPatience) {
 if(!canReassure(c))return false;c.reassured=true;c.patience=Math.min(initialPatience,c.patience+initialPatience*.2);return true;
}
