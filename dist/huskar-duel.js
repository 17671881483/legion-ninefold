// war3map.j: 40331–40354, 40375–40377, 41312–41335.
// A0IDCondition reads the DEAD UNIT's tag, not the trigger owner's tag.
export const HUSKAR_DUEL_RULE={status:'partial',description:'受到有效敌对伤害时，以伤害来源为圆心枚举1000范围，选首个无Avul且最大生命≥1800的敌人，向双方各发一次攻击命令，并关闭神灵武士的单位碰撞。不是最近目标，也不是持续嘲讽。任一方死亡后，回调尝试杀死死者自身tag指向的单位并销毁该次监听；正常胜利不会授予文案中的3秒无敌，也不会清除存活者的tag。',partial:'原生枚举顺序、尸体留存、命令仲裁和精确路径效果仍有宿主差异；前置未实现分支可能截断决斗时记录待核定，不假定已经穿透。不可达的自指tag免伤分支仅保留5秒标记，AIml原生吸收未核定。'};
const has=(e,id)=>e?.skillSpecs?.some(s=>s.id===id)&&(e.abilityLevels?.[id]??1)>0;
const all=g=>[...g.state.entities,...(g.state.kings??[])];
const find=(g,id)=>all(g).find(e=>e.id===id);
const buff=(e,id,now)=>e.buffs?.some(b=>(b.id===id||b.buffKey===id)&&(b.expiresAt===undefined||b.expiresAt>now));
const distance=(a,b)=>Math.hypot((a.worldX??a.x)-(b.worldX??b.x),(a.worldY??a.y)-(b.worldY??b.y));
function precedingBranch(e,a,amount,now){
  // Same elseif chain; unimplemented effects/hashtable state cannot be assumed
  // to fall through. The common A0ID path has none of these preceding abilities.
  if(['n050','n06R'].includes(a.combatRawcode))return 'DemonStatueBounce前置分支尚未核定';
  return null;
}
function order(g,e,target){
  e.status??={};e.status.huskarAttackOrder={targetId:target.id,at:g.state.time};
  // Native orders may fail (e.g. a corpse), but tag storage and registrations
  // still happen. The engine validates the order before using it.
  e.targetId=target.id;e.pendingAttack=null;e.chase=null;
}
export function huskarDuelDamage(g,e,attacker,amount,selectedPrefix=null){
  if(!(amount>0)||!attacker||attacker.id===e.id||attacker.side===e.side||has(attacker,'A2Y7')||!has(e,'A0ID')||e.status?.huskarDuelTag!=null)return;
  e.status??={};
  if(selectedPrefix){delete e.status.huskarDuelDeferred;return;}
  const blocked=precedingBranch(e,attacker,amount,g.state.time);
  if(blocked){e.status.huskarDuelDeferred=blocked;return;}
  delete e.status.huskarDuelDeferred;
  // No nearest sorting, positive-current-HP check or summon exclusion in JASS.
  // Web entity order substitutes for unverified native FirstOfGroup order.
  const radius=1000*(e.distanceScale??1/3)/100;
  const target=all(g).find(t=>t.side!==e.side&&t.battleTeam===e.battleTeam&&!has(t,'Avul')&&!has(t,'Aloc')&&!t.status?.yseraHidden&&!t.status?.yseraRemoved&&!t.status?.sourceHidden&&t.maxHp>=1800&&distance(attacker,t)<=radius);
  if(!target)return;
  e.status.huskarDuelTag=target.id;e.status.huskarPathingOff=true;
  order(g,e,target);order(g,target,e);
  (g.state.sourceSkillJobs??=[]).push({type:'huskar_duel',sourceId:e.id,targetId:target.id,at:g.state.time});
  g._event?.('cast',e,`决斗 · ${target.name}`,{skillId:'A0ID',targetId:target.id});
}
export function huskarDuelDeath(g,dead,api){
  // Nested KillUnit may enter this same registration again before destruction.
  // KillUnit(dead) is a no-op; do not turn the callback into damage or recursion.
  const listeners=(g.state.sourceSkillJobs??=[]).filter(j=>j.type==='huskar_duel'&&!j.done&&(j.sourceId===dead.id||j.targetId===dead.id));
  for(const j of listeners){
    if(j.done)continue;
    const tag=dead.status?.huskarDuelTag;
    if(tag===dead.id){
      dead.status.huskarDuelImmune=true;delete dead.status.huskarDuelTag;
      g.state.sourceSkillJobs.push({type:'huskar_duel_immune',sourceId:dead.id,source:dead,at:g.state.time+5});
    }else if(dead.hp<=0){const target=find(g,tag);if(target)api.killUnit(g,target);}
    j.done=true;
  }
}
export function tickHuskarDuelJob(g,j){
  if(j.done)return false;
  if(j.type==='huskar_duel')return true;
  if(j.at>g.state.time+1e-8)return true;
  const e=find(g,j.sourceId)??j.source;if(e)delete e.status.huskarDuelImmune;
  j.done=true;return false;
}
