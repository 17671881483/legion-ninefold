// New_UnitDamaged 41295–41311; H0JIAbility 42854–42890.
export const BROODMOTHER_RULES=Object.freeze({
  A0I1:{status:'partial',description:'伤害来源携带孕母蛛群、受害者仍带B04U且局部伤害严格大于当时生命时，在伤害结算前创建穴居蜘蛛。不限普攻，也不等待最终击杀确认；后续免伤或回血不撤回已创建蜘蛛。来源精确为h0UV时生成h0V2，否则h03E；新体加入召唤组并获得蛛群护甲、10点攻击和每秒10点恢复。',partial:'原生CreateUnit碰撞、攻击移动命令到玩家出生点的路径及原生buff/事件时序仍有宿主差异；前置DemonStatueBounce尚未核定时不穿透。'},
  A0I2:{status:'partial',preserveNativeKind:true,description:'显式目标为self的2点护甲，不给范围内任意友军叠加。普通波FightStart等待1秒后，若全图存在h0JI/h0OK，则给全图这两类及h03E/h03F添加A0I2、10级A0I4和A0I6，不检查同玩家、距离或存活。h0UV/h0V2不加入此旧原型枚举；孕母蛛群新建蜘蛛则直接授予。',partial:'原生光环默认字段/驻留、TriggerSleepAction实际调度和原生尸体移除时刻尚未实测；Web保留等待期间尸体引用，显式RemoveUnit不再参与。'},
});
const raw=e=>e?.combatRawcode??e?.sourceRawcode;
const has=(e,id)=>e?.skillSpecs?.some(s=>s.id===id)&&(e.abilityLevels?.[id]??1)>0;
const hasBuff=(e,id,now)=>e?.nativeBuffIds?.includes(id)||e?.buffs?.some(b=>[b.id,b.key,b.buffKey].includes(id)&&(b.expiresAt===undefined||b.expiresAt>now));
const position=e=>({x:e.worldX??e.x,y:e.worldY??e.y});
const allianceTypes=new Set(['h0JI','h0OK','h03E','h03F']);
function grant(g,e,api){
  api.addAbility(g,e,'A0I2');api.addAbility(g,e,'A0I4');api.addAbility(g,e,'A0I6');
  (e.abilityLevels??={}).A0I4=10;
  const ability=e.skillSpecs.find(s=>s.id==='A0I4'),amount=Number(ability.fields.DataA10);
  // Dynamic UnitAddAbility does not run attachSkills. Journal the exact native
  // item bonus so repeated grants and save refresh cannot stack it again.
  const applied=e.sourcePassiveStatBonuses??={},old=applied.A0I4?.flatDamage??0;
  e.damage+=amount-old;ability.flatDamage=amount;applied.A0I4={bonusHp:0,flatDamage:amount};
}
export function broodmotherDamageBranch(g,target,source,localDamage,api,center=position(target)){
  if(!(localDamage>0)||!source||source.id===target.id||source.side===target.side||has(source,'A2Y7')||!has(source,'A0I1')||!hasBuff(target,'B04U',g.state.time)||!(localDamage>target.hp))return false;
  const code=raw(source)==='h0UV'?'h0V2':'h03E',userData=source.userData??(source.sourceLaneId??source.ownerId??-1)+1;
  const body=api.spawnUnit(g,source,code,{worldX:center.x,worldY:center.y,facing:source.facing??0,userData,isSummon:true,expiresAt:undefined,nav:source.nav?{...source.nav,path:[],index:0,distance:0}:undefined});
  if(body){
    g._syncLocal?.(body);grant(g,body,api);
    body.status.broodmotherSpawn={sourceId:source.id,victimId:target.id,at:g.state.time};
    body.status.sourceAttackMoveRequest={order:'attack',targetPlayerId:userData-1,at:g.state.time};
    g._event?.('summon',body,'孕母蛛群',{skillId:'A0I1',sourceId:source.id});
  }
  return true;
}
export function retainBroodmotherAlliance(g,units=g.state.entities){
  for(const j of g.state.sourceSkillJobs??[])if(j.type==='broodmother_alliance'&&!j.done){
    j.units??={};for(const e of units)if(allianceTypes.has(raw(e))&&!e.status?.sourceRemoved)j.units[e.id]=e;
  }
}
export function queueBroodmotherAlliance(g){
  (g.state.sourceSkillJobs??=[]).push({type:'broodmother_alliance',at:g.state.time+1,units:{}});
  retainBroodmotherAlliance(g);
}
export function tickBroodmotherJob(g,j,api){
  if(j.done)return false;
  retainBroodmotherAlliance(g);
  if(j.at>g.state.time+1e-8)return true;
  // Prefer restored live handles over JSON-copied retained records. Corpses
  // cleaned from the Web entity array still exist for this source enumeration.
  const current=new Map(g.state.entities.map(e=>[e.id,e]));
  const units=Object.values(j.units).map(e=>current.get(e.id)??e).filter(e=>!e.status?.sourceRemoved);
  if(units.some(e=>['h0JI','h0OK'].includes(raw(e))))for(const e of units)grant(g,e,api);
  j.done=true;return false;
}
