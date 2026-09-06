import { UPGRADES, STAFF, WORKER_UPGRADES, MACHINE_UPGRADES, STAR_IDS } from './economy.js';
import { MASTERY, RENOVATIONS } from './career.js';
import { PET_SPECIES, PET_PROFILES, petKey, PET_BESTIE_VISITS } from './petBook.js';
// Derived entirely from durable progress; no new reward, currency, or completion-save flag.
export function cafeCompletion(G) {
 const zones=G.world?.area?.zones||[],built=G.world?.built;
 const roomComplete=zones.length>0&&zones.every(z=>built?.has(z.id));
 const career=G.meta?.career||{};
 const friendsComplete=PET_SPECIES.every(s=>PET_PROFILES[s].every((_,v)=>(G.meta?.petFriendship?.[petKey(s,v)]||0)>=PET_BESTIE_VISITS));
 const renovationsComplete=(career.renovationLevel||0)>=RENOVATIONS.length;
 const masteryComplete=Object.entries(MASTERY).every(([key,cfg])=>(career.recipeSales?.[key]||0)>=cfg.thresholds.at(-1));
 const upgradesComplete=Object.entries(UPGRADES).every(([key,cfg])=>(G.up?.[key]||0)>=cfg.costs.length)
  &&Object.entries(STAFF).every(([key,cfg])=>(G.staff?.[key]||0)>=cfg.costs.length)
  &&['runner','cashier','cleaner'].every(role=>(G.staffLevels?.[role]?.speed||0)>=WORKER_UPGRADES.speed.length)
  &&(G.staffLevels?.runner?.carry||0)>=WORKER_UPGRADES.carry.length
  &&Object.entries(MACHINE_UPGRADES).every(([key,costs])=>(G.machineLevels?.[key]||0)>=costs.length)
  &&STAR_IDS.every(id=>(G.stars?.[id]||0)>=3);
 const allContentComplete=roomComplete&&friendsComplete&&renovationsComplete&&masteryComplete&&upgradesComplete;
 return {roomComplete,allContentComplete,
  title:allContentComplete?'Café collection complete':'Your café is built',
  next:allContentComplete?'Everything authored is yours. Return for favorite pets and optional weekly cups.'
   :!friendsComplete?'Optional: welcome every regular and grow your friendships.'
   :!renovationsComplete?'Optional: make the room your own with renovations.'
   :!masteryComplete?'Optional: master the café menu.'
   :'Optional: finish the remaining staff and station upgrades.'};
}
