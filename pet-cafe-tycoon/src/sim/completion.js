import { UPGRADES, STAFF, WORKER_UPGRADES, MACHINE_UPGRADES, STAR_IDS } from './economy.js';
import { MASTERY, RENOVATIONS } from './career.js';
import { PET_SPECIES, PET_PROFILES, petKey, PET_BESTIE_VISITS, isLegendaryProfile, legendaryUnlocked } from './petBook.js';
// Derived entirely from durable progress; no new reward, currency, or completion-save flag.
export function cafeCompletion(G) {
 const zones=G.world?.area?.zones||[],built=G.world?.built;
 const roomComplete=zones.length>0&&zones.every(z=>built?.has(z.id));
 const career=G.meta?.career||{};
 // Only pets that can actually walk in count. A locked legendary is unreachable content, and
 // counting it would make "you have befriended everyone" permanently unachievable rather than hard.
 const friendsComplete=PET_SPECIES.every(s=>PET_PROFILES[s].every((p,v)=>
  (isLegendaryProfile(p)&&!legendaryUnlocked(G.meta))||(G.meta?.petFriendship?.[petKey(s,v)]||0)>=PET_BESTIE_VISITS));
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
  title:allContentComplete?'Every authored tier owned':'Your café is built',
  // The upgrade ladders continue past the authored tiers, so this is a milestone rather than an
  // ending. The old copy ("Everything authored is yours") told players the game was over.
  next:allContentComplete?'Your café keeps growing: stars, staff and machines all go further.'
   :!friendsComplete?'Optional: welcome every regular and grow your friendships.'
   :!renovationsComplete?'Optional: make the room your own with renovations.'
   :!masteryComplete?'Optional: master the café menu.'
   :'Optional: finish the remaining staff and station upgrades.'};
}
