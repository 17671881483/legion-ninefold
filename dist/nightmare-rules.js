// war3map.j 9640–9693, 21329–21418, 41288–41290, 42006–42008.
// The hashtable's killnum is the current reserve; timenum is not a limit.
export const NIGHTMARE_RULES=Object.freeze({
  A0XM:{status:'partial',description:'普通出战体每5秒在生命≥1且当前灵魂不足15时获得1魂；主死亡监听中，击杀者当前魂数<15、魔法<15，且1—101实数抽样≤20时也获得1魂，不限普攻击杀。获得时先回复100生命，再增加100最大生命及10攻击。恰好10魂且本体未召唤过时，h03L/h0SX分别创建h03K/h0SU梦魇，每个出战体只尝试一次。敌对正伤害主链轮到本分支时，事件伤害≥当时生命且当前魂数≥6，取消本次事件伤害，扣6魂和6魔法，先回复1000生命再减少600最大生命及60攻击。属性与计数只属于当波出战体。',partial:'A0XN原生AOae增益、单位缺失的默认魔法上限、AIml加减上限时对当前生命的原生副作用、CreateUnit碰撞与原生句柄行为未闭合；Web按先改当前生命再改上限并夹取的宿主适配运行，不把文案20%当作精确概率。'},
  A0XN:{status:'partial',description:'黑暗之魂获得时动态添加的15级AOae能力，等级与当前killnum同步；储备降至0时移除。',partial:'对象表没有DataA/DataB各等级原生移动/攻速默认值，且高等级范围/目标继承不完整；保留能力与等级，不补造光环数值。'},
});
const has=(e,id)=>e?.skillSpecs?.some(s=>s.id===id)&&(e.abilityLevels?.[id]??1)>0;
const status=e=>e.status??={};
const count=e=>e?.status?.sourceKillnum??0;
const find=(g,id)=>g.state.entities.find(e=>e.id===id);
const addLife=(e,n)=>{if(e.hp>0)e.hp=Math.min(e.maxHp,e.hp+n);};
function maxLife(e,delta){
  // YDWE SetUnitMaxState rejects <=0 and >65535, then changes integer max HP.
  // Native AIml current-life side effects remain explicitly partial.
  const requested=e.maxHp+delta;
  if(requested<=0||requested>65535)return;
  e.maxHp+=Math.trunc(requested)-Math.trunc(e.maxHp);
  if(e.hp>0)e.hp=Math.min(e.hp,e.maxHp);
}
function attackBonus(e,delta){
  // BonusSystem type 3 uses AIat (YDb*), which applies to both weapons.
  // First weapon reads e.damage; second weapon recomputes its native base.
  const journal=e.sourceNightmareStatBonuses??={flatDamage:0};
  journal.flatDamage+=delta;e.damage+=delta;
}
function syncCounter(g,e,api){
  const n=count(e);if(n>15)return;
  if(n<=0){api.removeAbility(g,e,'A0XN');if(e.abilityLevels)delete e.abilityLevels.A0XN;}
  else{e.abilityLevels??={};e.abilityLevels.A0XN=n;}
}
export function gainNightmareSoul(g,e,timed,api){
  api.addAbility(g,e,'A0XN');
  const st=status(e);st.sourceKillnum=count(e)+1;
  if(timed)st.nightmareTimenum=(st.nightmareTimenum??0)+1;
  e.mana=Math.min(e.maxMana,Math.max(0,e.mana+1));
  addLife(e,100);maxLife(e,100);attackBonus(e,10);
  if(count(e)===10&&!st.nightmareOne){
    const code={h03L:'h03K',h0SX:'h0SU'}[e.combatRawcode];
    const summon=code?api.spawnUnit(g,e,code,{isSummon:true,reward:0,facing:270,userData:e.userData??e.ownerId+1}):null;
    if(summon){
      // CreateUnit + UnitAddType(SUMMONED) is not a summon-event callback.
      // Run the host's ordinary creation registration, not deployment bonuses.
      api.initializeUnit(g,summon);
      g._event?.('summon',summon,'梦魇',{skillId:'A0XM',sourceId:e.id});
    }
    st.nightmareOne=true;
  }
  syncCounter(g,e,api);
  g._event?.('cast',e,'黑暗之魂',{skillId:'A0XM',souls:count(e),timed:!!timed});
}
export function initializeNightmareDeployment(g,e){
  // The sole timer registration lives in oldcodefn_Bg, not PassiveSkill or
  // the global creation hook. Arena bodies and arbitrary copies get no timer.
  if(!has(e,'A0XM')||e.isArena||g.state.roundMode==='arena'||status(e).nightmareTimerRegistered)return false;
  e.status.nightmareTimerRegistered=true;
  (g.state.sourceSkillJobs??=[]).push({type:'nightmare_souls',sourceId:e.id,nextAt:g.state.time+5});
  return true;
}
export function tickNightmareJob(g,j,api){
  const e=find(g,j.sourceId),now=g.state.time;if(!e)return false;
  while(j.nextAt<=now+1e-8){
    if(e.hp<1)return false;
    const previous=g.state.time;g.state.time=j.nextAt;
    try{if(count(e)<15)gainNightmareSoul(g,e,true,api);}
    finally{g.state.time=previous;}
    j.nextAt+=5;
  }
  return true;
}
export function nightmareMainDeath(g,killer,api){
  // Short circuit before sampling. Main trigger's disabled depth is owned by
  // runMainUnitDeath; never register an independent death listener here.
  if(!has(killer,'A0XM')||count(killer)>=15||!(killer.mana<15))return false;
  if(1+g._random()*100>20)return false;
  gainNightmareSoul(g,killer,false,api);return true;
}
export function nightmareDamagePrefix(g,e,source,eventDamage,api){
  if(!(eventDamage>0)||!source||source.id===e.id||source.side===e.side||has(source,'A2Y7')||!has(e,'A0XM')||eventDamage<e.hp||count(e)<6)return false;
  status(e).sourceKillnum=count(e)-6;
  e.mana=Math.max(0,Math.min(e.maxMana,e.mana-6));
  addLife(e,1000);maxLife(e,-600);attackBonus(e,-60);
  syncCounter(g,e,api);
  g._event?.('cast',e,'黑暗之魂 · 抵挡致命伤害',{skillId:'A0XM',souls:count(e)});
  return true;
}
