import {V14_UNIT_TEMPLATES} from './v14-reference.js';

// Literal q[] order and exact raw registrations, war3map.j:3339–3519.
// These are unit identities, not appearance/base-unit aliases.
const classUnits={
  A18P:['h010','h012','h014','h016','h018','h01A'],
  A18S:['h00M','h00O','h00P','h00N','h00Q','h00S'],
  A18T:['h01C','h01E','h01H','h01I','h01K','h01M'],
  A18U:['h01P','h01T','h01V','h01X','h01Z','h021'],
  A18V:['h040','h042','h044','h046','h048','h04A'],
  A18W:['h05N','h05S','h05R','h05V','h05X','h05Z'],
  A18X:['h06J','h06K','h06M','h06O','h06Q','h06S'],
  A18Y:['h07J','h07O','h07Q','h07S','h07U','h07W'],
  A18Z:['h0BC','h0BE','h0BH','h0BJ','h0BM','h0BO'],
  A190:['h0A8','h0AB','h0AE','h0AH','h0AL','h0AR','n091'],
  A191:['h09L','h09W','h09N','h09R','h09T','h0A3'],
  A192:['h08F','h08H','h08N','h08Q','h08V','h090'],
  A193:['h0BF','h0BV','h0BX','h0C4','h0C5','h0C9'],
  A194:['h0CF','h0CI','h0CO','h0CQ','h0CW','h0D0'],
  A195:['h0S1','h0S3','h0S5','h0S7','h0SA','h0SC'],
  A196:['n04B','n04D','n04F','n04N','n04T','n05C'],
  A197:['h0QO','n05P','n05Q','n05U','n061','h0QG'],
};
export const SOURCE_CLASS_ORDER=Object.freeze(Object.keys(classUnits));
export const SOURCE_CLASS_REGISTRY=Object.freeze(Object.fromEntries(Object.entries(classUnits).flatMap(([id,units])=>units.map(code=>[code,id]))));
export const SOURCE_CLASS_DERIVED_ABILITIES=Object.freeze({A18P:'A18Q',A18S:'A18R',A18T:'A198',A18V:'A19A',A18W:'A19B',A192:'A19D',A193:'A19E'});
export const SOURCE_CLASS_DERIVED_IDS=Object.freeze(Object.values(SOURCE_CLASS_DERIVED_ABILITIES));

const metadata=(id,name,description,extra={})=>Object.freeze({id,name,status:'implemented',kind:'source_class',sourceLines:[3339,3397],description,...extra});
export const SOURCE_CLASS_RULES=Object.freeze({
  A18P:metadata('A18P','不羁蛮力','分类初始化永久添加A18Q；其原生自我目标光环增加10%武器攻击力，不作用其他友军。'),
  A18S:metadata('A18S','先进装甲','分类初始化永久添加A18R，自身护甲+1。'),
  A18T:metadata('A18T','再生','分类初始化永久添加A198，自身每秒恢复3生命。'),
  A18U:metadata('A18U','暗蚀','独立攻击伤害监听按GetRandomPercentageBJ()≤20，直接给目标添加A199：护甲-3持续3秒；再次命中刷新，同一原生能力不叠加，目标死亡移除。',{sourceLines:[29735,29766,42353,42358]}),
  A18V:metadata('A18V','法术亲和','分类初始化永久添加A19A（AIsr DataB=0.4）；由原生法术抗性桥接，不按文案把所有普通魔法武器攻击都减伤。',{status:'partial',partial:'同类原生抗性叠加与宿主隐藏伤害分类仍需核定；A19A明确字段及授予已恢复。'}),
  A18W:metadata('A18W','虚无缥缈','分类初始化永久添加A19B，按对象DataA=0.1闪避10%普通攻击；不采用子技能15%的文案。'),
  A18X:metadata('A18X','血统融合','建筑保留A18X；每个新出战体从原q[0..16]逐次随机，抽到A18X则重抽，再初始化最终分类。存档恢复同一战斗体不重新抽取。',{status:'partial',partial:'随机调度已恢复；抽到尚有原生边界的分类时，保留该分类的限制。'}),
  A18Y:metadata('A18Y','逆流冲击','独立攻击伤害监听按随机百分数≤15，调用A0I7等级2眩晕（普通2秒、原生英雄1秒），另调用YDWEJumpTimer(...,0,0,1,.03,300)。',{sourceLines:[42375,42381],status:'partial',partial:'眩晕按已有原生dummy桥接；跳跃为1秒/0.03周期/300高度的源调用，未提供原生跳跃宿主时不伪造移动或无敌效果。'}),
  A18Z:metadata('A18Z','冰之离别','死亡时对击杀者下达带A19C的dummy slow指令；对象移动速度-50%，普通/英雄持续5秒。',{sourceLines:[41952,41958],status:'partial',partial:'原生Aslo目标与魔免许可由宿主处理；缺少指令宿主时保留调用描述，不把未命中的slow虚构为必定生效。'}),
  A190:metadata('A190','地精科技','保留原分类标记；原图通过建造者A119/Arep持续消耗木材修理，分类初始化没有添加机械类型或自动治疗。',{status:'partial',partial:'当前网页没有可操纵建造者和原生修理宿主，不能把文案代换成自动恢复。'}),
  A191:metadata('A191','圣光恩赐','主伤害监听执行到此分支时，若事件前当前生命比例≤10%，移除A191并立即回复15%最大生命；每个新出战体重新获得一次，致命伤害本身不保证触发或免死。',{sourceLines:[40992,40996]}),
  A192:metadata('A192','艾露恩之赐','分类初始化永久添加A19D，自身攻速+10%。'),
  A193:metadata('A193','致命一击','分类初始化永久添加A19E，对象实际25%概率双倍普攻，不采用250%的子技能文案。'),
  A194:metadata('A194','灵魂转移','死亡一次抽取随机百分数：≤5生成3只、(5,10]生成2只、(10,15]生成1只h03B骷髅战士，其余不生成；召唤物无脚本限时寿命。',{sourceLines:[41959,42002]}),
  A195:metadata('A195','虚空体质','保留原图A195分类及授予；本包仅见注册、无任何运行脚本读取该标记，未按文案增加10%停滞。',{status:'partial',partial:'Asth标记没有明确数值字段，缺少可以证实停滞效果的执行路径。'}),
  A196:metadata('A196','没有天赋','原图仅保留大地族分类标记，没有额外战斗效果。'),
  A197:metadata('A197','沙石冲击','独立攻击伤害事件中先移除A197，追加125混乱攻击/通用伤害；5秒后重新添加同一能力。计时器没有存活判断，死亡不取消原生重加尝试。',{sourceLines:[42242,42251,42367,42374],nativeBoundary:'真实RemoveUnit之后的原生handle行为未伪造；保留JSON可恢复的源单位快照及重加尝试。'}),
  A18Q:metadata('A18Q','不羁蛮力（原生派生）','Aakb DataA=0.1；目标mask仅self，无friend，不作为其他单位的攻击光环。',{preserveNativeKind:true,compiled:{kind:'aura_damage',damage:.1,radius:9,targets:['ground','vulnerable','air','invulnerable','self'],buffKey:'B07O'}}),
  A18R:metadata('A18R','先进装甲（原生派生）','AIde DataA=1，自身护甲+1。',{preserveNativeKind:true,compiled:{kind:'passive_stats',armor:1}}),
  A198:metadata('A198','森林族生命恢复','Arel DataA=3，自身每秒恢复3生命。',{preserveNativeKind:true,compiled:{kind:'passive_stats',selfRegen:3}}),
  A199:metadata('A199','暗蚀（临时原生能力）','AIde DataA=-3，由攻击监听直接添加3秒；同一技能刷新不叠加，不受魔法免疫阻止直接加能力。',{preserveNativeKind:true,compiled:{kind:'passive_stats',armor:-3}}),
  A19A:metadata('A19A','元素族法术抗性','AIsr DataB=0.4，原生物品法术抗性；由宿主的明确法术/魔法伤害分类处理，通用伤害不减。',{status:'partial',preserveNativeKind:true,compiled:{kind:'passive_stats',spellResistance:.4},partial:'普通魔法武器与原生隐藏伤害分类、多个抗性能力的叠加由原生桥接核定。'}),
  A19B:metadata('A19B','幽魂族闪避','AEev DataA=0.1，10%普通攻击闪避。',{preserveNativeKind:true,compiled:{kind:'evasion',chance:.1}}),
  A19C:metadata('A19C','冰之离别（原生slow）','Aslo DataA=0.5；Dur1=HeroDur1=5，Rng1=1000000000，dummy向击杀者下达slow。',{status:'partial',preserveNativeKind:true,native:{base:'Aslo',move:-.5,duration:5,heroDuration:5,range:1000000000,targets:['_']},partial:'需要原生slow指令宿主，目标默认许可未补造。'}),
  A19D:metadata('A19D','艾露恩之赐（原生派生）','AIas DataA=0.1，自身攻速+10%。',{preserveNativeKind:true,compiled:{kind:'passive_stats',haste:.1}}),
  A19E:metadata('A19E','致命一击（原生派生）','AOcr DataA=25、DataB=2，25%概率双倍普攻。',{preserveNativeKind:true,compiled:{kind:'crit',chance:.25,multiplier:2}}),
});

const clone=value=>JSON.parse(JSON.stringify(value));
const snapshot=unit=>{const saved=clone(unit);if(saved.status)saved.status.sourceClassAttackBusy=false;return saved;};
const raw=unit=>unit?.combatRawcode??unit?.rawcode??unit?.sourceRawcode??String(unit?.unitId??unit?.id??'').replace(/^v14_(?:raw_)?/,'');
const now=game=>game._sourceClassEventAt??game.state.time;
const status=unit=>unit.status??={};
function abilityIds(unit){
  // An empty runtime set is authoritative for mirrors and consumed abilities.
  if(Array.isArray(unit?.skillSpecs))return unit.skillSpecs.map(spec=>spec.id);
  const native=V14_UNIT_TEMPLATES[raw(unit)]?.abilityIds??[];
  return [...new Set([...(unit?.abilityIds??unit?.sourceAbilityIds??native),...(unit?.permanentAbilityIds??[]),...String(unit?.sourceRawFields?.abilList??'').split(',')])];
}
const has=(unit,id)=>!!unit&&abilityIds(unit).includes(id);
export function sourceClassOf(unit){
  if(!unit)return null;const registered=SOURCE_CLASS_REGISTRY[raw(unit)],ids=new Set(abilityIds(unit));
  return SOURCE_CLASS_ORDER.find(id=>registered===id||ids.has(id))??null;
}
function fallbackAbility(unit,id){const rule=SOURCE_CLASS_RULES[id],compiled=clone(rule?.compiled??{});if(compiled.radius!==undefined)compiled.radius*=unit.distanceScale??1/3;return {id,name:rule?.name??id,kind:'source_class',status:rule?.status??'marker',...compiled};}
function addAbility(game,unit,id,api,permanent=false){
  if(!has(unit,id)){
    if(api.addAbility)api.addAbility(game,unit,id);
    else if(Array.isArray(unit.skillSpecs))unit.skillSpecs.push(fallbackAbility(unit,id));
    else unit.abilityIds=[...new Set([...(unit.abilityIds??unit.sourceAbilityIds??V14_UNIT_TEMPLATES[raw(unit)]?.abilityIds??[]),id])];
  }
  if(permanent)unit.permanentAbilityIds=[...new Set([...(unit.permanentAbilityIds??[]),id])];
}
function removeAbility(game,unit,id,api){
  api.removeAbility?.(game,unit,id);
  if(Array.isArray(unit.skillSpecs))unit.skillSpecs=unit.skillSpecs.filter(spec=>spec.id!==id);
  for(const key of ['abilityIds','sourceAbilityIds','permanentAbilityIds'])if(Array.isArray(unit[key]))unit[key]=unit[key].filter(value=>value!==id);
}
function initializeAbility(game,unit,classId,api){
  const granted=SOURCE_CLASS_DERIVED_ABILITIES[classId]??classId;if(granted)addAbility(game,unit,granted,api,true);return granted?[granted]:[];
}
/** Call for completed source ANCIENT buildings, including both random gifts.
 * Caller checks native ANCIENT identity; no skin/base alias expansion occurs.
 * sourceClassGrantedAbilityIds is a deployment exclusion list, not extra base
 * skills: source PassiveSkill copies only the class marker and initializes the
 * fresh body separately (43856–43860).
 */
export function initializeSourceClassBuilding(game,building,api={}){
  if(!building||building.construction)return {classId:null,effectiveClassId:null,grantedAbilityIds:[]};
  const classId=sourceClassOf(building);if(!classId)return {classId:null,effectiveClassId:null,grantedAbilityIds:[]};
  addAbility(game,building,classId,api,true);const grantedAbilityIds=initializeAbility(game,building,classId,api);
  building.sourceClassGrantedAbilityIds=[...new Set([...(building.sourceClassGrantedAbilityIds??[]),...grantedAbilityIds.filter(id=>id!==classId)])];
  return {classId,effectiveClassId:classId,grantedAbilityIds};
}
/** Call once for a normal/arena deployment, after the raw body is created.
 * Never call this as a generic creation hook for mirrors or summons.
 */
export function initializeSourceClassDeployment(game,building,body,api={}){
  if(!body||body.isIllusion&&body.skillSpecs?.length===0)return {classId:null,effectiveClassId:null,grantedAbilityIds:[]};
  const previous=status(body).sourceClassDeployment;if(previous)return previous;
  const classId=sourceClassOf(building);if(!classId)return {classId:null,effectiveClassId:null,grantedAbilityIds:[]};
  addAbility(game,body,classId,api,true);
  // ExecuteMonsterSkillInit calls EachMonsterSkillTypeForHero again on Bc;
  // the raw body's earlier q[] class can win over the copied marker.
  let effectiveClassId=sourceClassOf(body);
  while(effectiveClassId==='A18X'){
    const index=api.randomInt?api.randomInt(game,0,SOURCE_CLASS_ORDER.length-1):Math.min(SOURCE_CLASS_ORDER.length-1,Math.max(0,Math.floor(game._random()*SOURCE_CLASS_ORDER.length)));
    effectiveClassId=SOURCE_CLASS_ORDER[index];
  }
  const grantedAbilityIds=initializeAbility(game,body,effectiveClassId,api),result={classId,effectiveClassId,grantedAbilityIds,initializedAt:now(game)};
  status(body).sourceClassDeployment=result;return result;
}
/** Descriptors for a native host; do not add these twice if compiled into the
 * normal passive-stat path. Other native child effects already have compilers.
 */
export function sourceClassNativeStats(unit){return {selfRegen:has(unit,'A198')?3:0,spellResistance:has(unit,'A19A')?.4:0};}

const enqueue=(game,job)=>{(game.state.sourceSkillJobs??=[]).push(job);return job;};
const findUnit=(game,id,fallback)=>game.state.entities?.find(unit=>unit.id===id)??game._worldEntities?.get(id)??fallback;
export const isSourceClassJobType=type=>['source_class_ability_expire','source_class_desert_rearm'].includes(type);
function addTimedArmor(game,target,api){
  const at=now(game),st=status(target),serial=(st.sourceClassTempSerial??0)+1;st.sourceClassTempSerial=serial;
  for(const job of game.state.sourceSkillJobs??[])if(job.type==='source_class_ability_expire'&&job.targetId===target.id&&job.abilityId==='A199')job.done=true;
  addAbility(game,target,'A199',api);(st.sourceClassTemporaryAbilities??={}).A199={expiresAt:at+3,serial};
  enqueue(game,{type:'source_class_ability_expire',targetId:target.id,target:snapshot(target),abilityId:'A199',at:at+3,serial});
}
/** Run inside the accepted main damage listener, after its earlier reactions,
 * before native HP subtraction. No positive-amount test: Ysera may already
 * have changed this accepted event's damage to zero (40992 still runs).
 */
export function sourceClassBeforeDamage(game,target,amount,source,api={}){
  if(!target||!has(target,'A191')||target.maxHp<=0||target.hp/target.maxHp>.1)return false;
  removeAbility(game,target,'A191',api);
  // Another independent listener may already have killed this event target.
  // SetUnitLifePercentBJ changes a living unit's HP; it does not resurrect it.
  if(target.hp>0){target.hp=Math.min(target.maxHp,target.hp+target.maxHp*.15);game._event?.('heal',target,'圣光恩赐');}return true;
}
/** Run for YDWEIsEventAttackDamage in the independent New_UnitAttack listener.
 * Its source has no enemy, amount>0, or source-alive test. Caller owns that
 * native event classification; the reentry flag is per attacker, not global.
 */
export function sourceClassOnAttackDamage(game,attacker,target,api={}){
  if(!attacker||!target)return false;const st=status(attacker);if(st.sourceClassAttackBusy)return false;st.sourceClassAttackBusy=true;
  let triggered=false;
  try{
    if(has(attacker,'A18U')&&game._random()*100<=20){addTimedArmor(game,target,api);triggered=true;}
    if(has(attacker,'A197')){
      removeAbility(game,attacker,'A197',api);api.universalDamage?.(game,target,125,attacker);
      enqueue(game,{type:'source_class_desert_rearm',sourceId:attacker.id,source:snapshot(attacker),at:now(game)+5});triggered=true;
    }
    if(has(attacker,'A18Y')&&game._random()*100<=15){
      (api.vertigoTarget??api.pauseUnitEx)?.(game,attacker,target,2);
      api.jumpUnit?.(game,target,{sourceId:attacker.id,direction:0,distance:0,duration:1,interval:.03,height:300});
      game._event?.('source-class-jump',target,'逆流冲击',{duration:1,height:300});triggered=true;
    }
  }finally{st.sourceClassAttackBusy=false;}
  return triggered;
}
export function sourceClassDeath(game,victim,killer,api={},mainDeathEnabled=true){
  if(!victim)return false;const st=status(victim);if(st.sourceClassDeathHandled)return false;st.sourceClassDeathHandled=true;
  for(const job of game.state.sourceSkillJobs??[]){
    if(!isSourceClassJobType(job.type)||job.done)continue;
    if(job.type==='source_class_ability_expire'&&job.targetId===victim.id){removeAbility(game,victim,job.abilityId,api);delete st.sourceClassTemporaryAbilities?.[job.abilityId];job.done=true;}
    if(job.type==='source_class_desert_rearm'&&job.sourceId===victim.id)job.source=snapshot(victim);
  }
  if(!mainDeathEnabled)return true;
  if(has(victim,'A18Z')&&killer)api.applyNativeSlow?.(game,victim,killer,'A19C',SOURCE_CLASS_RULES.A19C.native);
  if(has(victim,'A194')){
    const draw=game._random()*100,count=draw<=5?3:draw<=10?2:draw<=15?1:0;
    for(let index=0;index<count;index++)api.spawnUnit?.(game,victim,'h03B',{isSummon:true,worldX:victim.worldX??victim.x,worldY:victim.worldY??victim.y,facing:victim.facing,reward:0});
  }
  return true;
}
export function tickSourceClassJob(game,job,api={}){
  if(!isSourceClassJobType(job.type))return false;if(job.done||job.at>game.state.time+1e-8)return true;
  const previous=game._sourceClassEventAt;game._sourceClassEventAt=job.at;
  try{
    if(job.type==='source_class_ability_expire'){
      const target=findUnit(game,job.targetId,job.target),temp=target?.status?.sourceClassTemporaryAbilities?.[job.abilityId];
      if(target&&temp?.serial===job.serial){removeAbility(game,target,job.abilityId,api);delete target.status.sourceClassTemporaryAbilities[job.abilityId];}
    }else{
      const source=findUnit(game,job.sourceId,job.source);if(source){addAbility(game,source,'A197',api,true);job.source=snapshot(source);}
    }
    job.done=true;
  }finally{if(previous===undefined)delete game._sourceClassEventAt;else game._sourceClassEventAt=previous;}
  return true;
}
