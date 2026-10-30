// Trig_UnitDeathActions 42033–42045, after the independent death effects and
// before Ysera awakening / the final fire-SkeletonKing-livingBomb chain.
export const UNSTABLE_ALCHEMY_RULES={A0UA:{status:'partial',description:'不稳定炼金术：主死亡触发器内，死者技能等级恰为1时直接抽1—20金币；否则击杀者等级恰为1时才抽实数1—101，仅结果≤1才继续抽金币。受款人为该单位userData减1对应的原玩家，死者分支优先，无敌我或普通攻击限制。',partial:'文案称击杀1%，源码却为GetRandomReal(1,101)≤1，保留原式而不改成1%抽样。Web使用既有种子随机源，原生随机精度/序列、未接入的前序死亡分支及原生非参战玩家仍待核定。'}};
const exactLevelOne=e=>e?.skillVersion==='v14.1A5'&&e.skillSpecs?.some(s=>s.id==='A0UA')&&(e.abilityLevels?.A0UA??1)===1;

export function unstableAlchemyDeath(g,dead,killer){
 let source,branch,roll;
 if(exactLevelOne(dead)){source=dead;branch='death';}
 else if(exactLevelOne(killer)){
  roll=1+100*g._random();
  if(roll>1){(dead.status??={}).unstableAlchemy={branch:'kill',roll,awarded:0};return;}
  source=killer;branch='kill';
 }else return;
 const amount=Math.min(20,Math.floor(g._random()*20)+1),userData=source.userData??0,playerId=userData-1;
 const report={branch,sourceId:source.id,userData,playerId,amount,awarded:0,...(roll===undefined?{}:{roll})};
 (dead.status??={}).unstableAlchemy=report;
 // GetUnitUserData defaults to zero. It is not the unit's current owner.
 const p=Number.isInteger(playerId)?g.state.players.find(p=>p.id===playerId):null;
 if(!p){report.boundary='native-player-not-represented';return;}
 p.gold+=amount;p.stats.goldEarned+=amount;report.awarded=amount;
 g._event?.('gold',source,`不稳定炼金术+${amount}`,{skillId:'A0UA',playerId});
}

// The native building conversion always stamps original owner+1. Limit this
// migration to an identifiable deployed building; do not guess for summons.
export function restoreUnstableAlchemyUserData(g,e){
 if(e.userData!==undefined||!exactLevelOne(e)||!e.buildingId)return;
 const p=g.state.players.find(p=>p.id===e.ownerId);
 if(p?.buildings.some(b=>b.id===e.buildingId))e.userData=p.id+1;
}
