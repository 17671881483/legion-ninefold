import {V14_ABILITIES} from './v14-reference.js';

// Narrow A14E/A18C adapter, not a general missing-field resolver. Both independently
// versioned ACrn tables record Cost=0; the map's DataA/Cool overrides win.
// See reference/reincarnation-evidence.json for evidence and remaining limits.
export const REINCARNATION_DEFAULTS=Object.freeze({code:'ACrn',manaCost:0,versions:['1.24.4','1.27.1'],mapInheritanceVerified:false});
const removed=e=>!e||e.status?.sourceRemoved||e.status?.yseraRemoved;
const supported=new Set(['A14E','A18C']);
const abilities=e=>e?.skillVersion==='v14.1A5'?(e.skillSpecs??[]).filter(s=>supported.has(s.id)&&(e.abilityLevels?.[s.id]??1)>0):[];
export const isReincarnating=e=>!removed(e)&&e.status?.reincarnation?.phase==='waiting';
export const reincarnationLethal=e=>e.hp<=0||abilities(e).length>0&&e.hp<=.405;
export const countsForBattle=e=>!removed(e)&&(e.hp>0||isReincarnating(e));

export function beginReincarnation(g,e){
 if(isReincarnating(e))return true;
 if(removed(e)||e.status?.deathCounted||e.status?.sourceDeathHandled||e.hp>.405)return false;
 // Multiple native reincarnation abilities have no verified arbitration in
 // this map. The host uses skill-list order among AVAILABLE abilities; a
 // cooling-down or disabled first ability must not block another ready one.
 for(const {id} of abilities(e)){
  const fields=V14_ABILITIES[id]?.resolved_fields??{};
  const delay=Number(fields.DataA1),cooldown=Number(fields.Cool1),explicit=fields.Cost1!=null&&fields.Cost1!=='';
  const manaCost=explicit?Number(fields.Cost1):REINCARNATION_DEFAULTS.manaCost;
  if(fields.code!=='ACrn'||!Number.isFinite(delay)||delay<0||!Number.isFinite(cooldown)||cooldown<0||!Number.isFinite(manaCost)||manaCost<0)continue;
  const now=g.state.time,state=e.skillStates?.[id]??{readyAt:0,casts:0};
  if(state.readyAt>now+1e-8||(e.mana??0)<manaCost)continue;
  (e.skillStates??={})[id]=state;
  e.hp=0;e.mana=Math.max(0,(e.mana??0)-manaCost);e.pendingAttack=null;e.targetId=null;
  state.readyAt=now+cooldown;state.casts++;
  const status=e.status??={},previous=status.reincarnation;
  status.reincarnation={phase:'waiting',startedAt:now,reviveAt:now+delay,abilityId:id,count:(previous?.count??0)+1,manaCost,manaSource:explicit?'map-override':'ACrn-versioned-default',selectionMode:'first-available-skill-order',nativeVerificationPending:true};
  g._event?.('revive',e,'复生中',{skillId:id,duration:delay});
  return true;
 }
 return false;
}

export function tickReincarnations(g){
 for(const e of g.state.entities){
  const r=e.status?.reincarnation;if(r?.phase!=='waiting')continue;
  if(removed(e)||(e.expiresAt!=null&&e.expiresAt<=g.state.time)){
   r.phase='cancelled';r.reason=removed(e)?'removed':'expired';e.hp=0;continue;
  }
  // This is a retained dead handle. Direct life writes cannot make it act
  // during the waiting phase; no new unit, creation hooks or death rewards.
  e.hp=0;e.pendingAttack=null;e.targetId=null;
  if(r.reviveAt>g.state.time+1e-8)continue;
  r.phase='revived';r.completedAt=r.reviveAt;e.hp=e.maxHp;e.mana=e.maxMana??0;
  // Keep script hashtable state and other ability cooldowns. Native buff
  // removal/persistence is still a documented boundary, not a blanket reset.
  g._event?.('revive',e,'复生归来',{skillId:r.abilityId??'A14E'});
 }
}
