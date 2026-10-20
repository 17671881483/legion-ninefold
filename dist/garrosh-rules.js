// Literal v14.1A5 JASS behavior: GarroshShieldWallAction (33502–33542),
// GarroshBleed/Action (33543–33581), and the A1A6 hit branch (42332–42336).
// Damage is injected so this module never imports the skill compiler/engine.
const ARMOR_ABILITY='A1A5',BLEED_ABILITY='A1A6',MAX_ARMOR_LEVEL=100;
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const level=value=>finite(value)?Math.min(MAX_ARMOR_LEVEL,Math.max(0,Math.trunc(value))):0;
const hasAbility=(entity,id,api)=>{
  if(api.hasAbility)return api.hasAbility(entity,id);
  // Runtime ability lists are authoritative. A mirror's deliberately empty
  // skillSpecs must not fall back to its source template's original abilList.
  if(Array.isArray(entity?.skillSpecs))return entity.skillSpecs.some(s=>s.id===id);
  return Array.isArray(entity?.abilityIds)&&entity.abilityIds.includes(id);
};
const findEntity=(game,id)=>game.state.entities?.find(e=>e.id===id)??game.state.kings?.find(e=>e.id===id);
const alive=entity=>!!entity&&finite(entity.hp)&&entity.hp>.405&&!entity.status?.deathCounted&&!entity.status?.sourceDeathHandled;
const findBuilding=(game,target)=>game.state.players?.find(p=>p.id===target.ownerId)?.buildings?.find(b=>b.id===target.buildingId);
const pairMap=target=>(target.status??={}).garroshBleedSources??={};
const clearPair=(game,job)=>{
  const target=findEntity(game,job.targetId);
  if(target?.status?.garroshBleedSources)delete target.status.garroshBleedSources[job.sourceId];
};

/**
 * Call immediately after subtracting actual damage, before reactive healing.
 * EVENT_UNIT_DAMAGED reads pre-subtraction life: pass preDamageHp if the caller
 * already changed life again, otherwise hp + actual reconstructs that value.
 * Only the level persists on the building; a new deployment resets the
 * trigger's last-life-percent threshold to 100.
 */
export function garroshAfterDamage(game,target,actual,api={}){
  if(!target||!finite(actual)||actual<0||!hasAbility(target,ARMOR_ABILITY,api)||!finite(target.maxHp)||target.maxHp<=0)return null;
  const preHp=finite(api.preDamageHp)?api.preDamageHp:target.hp+actual;
  if(!finite(preHp)||preHp<=.405)return null;
  const building=api.building??findBuilding(game,target),status=target.status??={};
  const oldLevel=Math.max(level(status.garroshArmorLevel),level(building?.garroshArmorLevel),level(target.abilityLevels?.A1A0));
  let nextLevel=oldLevel||1;
  const currentPercent=preHp/target.maxHp*100;
  const previousPercent=finite(status.garroshArmorLastLifePercent)?status.garroshArmorLastLifePercent:100;
  if(previousPercent-currentPercent>=2-1e-8){
    status.garroshArmorLastLifePercent=currentPercent;
    nextLevel=Math.min(MAX_ARMOR_LEVEL,nextLevel+1);
  }
  status.garroshArmorLevel=nextLevel;
  if(building)building.garroshArmorLevel=nextLevel;
  return {level:nextLevel,addedLevel:nextLevel-oldLevel};
}

/**
 * Returns true when a new pair started. Successful hits roll the source 10%
 * chance before GarroshBleed rejects allies/duplicate pairs. The zero-second
 * timer is executed immediately through the same tick path as later pulses.
 */
export function garroshOnHit(game,caster,target,api={}){
  if(!caster||!target||!hasAbility(caster,BLEED_ABILITY,api))return false;
  if(game._random()*100>10)return false;
  const allies=api.isAlly?api.isAlly(caster,target):caster.team!==undefined&&target.team!==undefined?caster.team===target.team:caster.side===target.side;
  if(allies||!alive(caster)||!alive(target)||caster.id===undefined||target.id===undefined)return false;
  const pairs=pairMap(target);
  if(pairs[caster.id])return false;
  if(typeof api.universalDamage!=='function')throw new TypeError('Garrosh bleed requires api.universalDamage(game,target,amount,source)');
  pairs[caster.id]=true;
  const job={type:'garrosh_bleed',sourceId:caster.id,targetId:target.id,nextAt:game.state.time,interval:1,damage:10};
  game.state.sourceSkillJobs??=[];
  if(tickGarroshJobs(game,job,game.state.time,api))game.state.sourceSkillJobs.push(job);
  return true;
}

/** Called for garrosh_bleed jobs; true keeps a live job, false removes it. */
export function tickGarroshJobs(game,job,now,api={}){
  if(job?.type!=='garrosh_bleed')return false;
  const source=findEntity(game,job.sourceId),target=findEntity(game,job.targetId);
  if(!alive(source)||!alive(target)){clearPair(game,job);return false;}
  if(typeof api.universalDamage!=='function')throw new TypeError('Garrosh bleed requires api.universalDamage(game,target,amount,source)');
  while(job.nextAt<=now+1e-8){
    if(!alive(source)||!alive(target)){clearPair(game,job);return false;}
    api.universalDamage(game,target,10,source);
    game._event?.('hit',target,'流血10');
    job.nextAt+=1;
  }
  if(!alive(source)||!alive(target)){clearPair(game,job);return false;}
  return true;
}
