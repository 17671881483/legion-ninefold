import { RULES } from './data.js';
import { WORKBOOK_ABILITIES as ABILITIES, WORKBOOK_UNIT_TEMPLATES as TEMPLATES } from './workbook-reference.js';

// Values come from resolved object fields. Empty fields remain empty: a missing
// native default is reported, rather than replacing it with tooltip numbers.
const num = (v, d = 0) => v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : d;
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const pos = e => ({x:e.worldX??e.x,y:e.worldY??e.y});
const dist = (a,b) => Math.hypot(pos(a).x-pos(b).x,pos(a).y-pos(b).y);
const raw = u => u.combatRawcode ?? u.rawcode ?? u.sourceRawcode ?? u.unitId;
const cache = new Map();
const markers = new Set(['Asph','Asth','Amgl','Aloc','AInv']);
const names = {crit:'概率暴击',bash:'概率附伤及眩晕',evasion:'闪避普攻',poison:'命中持续伤害与减速',corruption:'命中减甲',lifesteal:'命中吸血',aura_damage:'攻击光环',aura_armor:'护甲光环',aura_speed:'攻速与移速光环',aura_regen:'生命恢复光环',aura_mana:'魔法恢复光环',aura_thorns:'近战反伤光环',aura_lifesteal:'近战吸血光环',aura_slow:'攻速与移速削弱光环',shield:'魔法护盾',hardened:'概率格挡',immunity:'魔法免疫',demolish:'伤害倍增',orb:'消耗魔法强化普攻',heal:'自动治疗',heal_wave:'弹跳治疗',buff:'持续增益',debuff:'持续削弱',root:'缠绕',stomp:'范围伤害及控制',wave:'直线范围伤害',knives:'范围飞刀',nova:'目标及范围新星',breath:'锥形吐息与持续伤害',summon:'召唤源单位',mirror:'镜像',immolation:'周期范围伤害',barrage:'多目标额外攻击',pulverize:'概率范围粉碎',suicide:'自爆',burrow:'潜地与出土增益',guardian:'守护之魂',spell_orb:'概率触发法术',cold:'冰冻命中',pending:'缺少已核定运行参数'};
function fields(a) {
  if(a.resolved_fields || a.fields) return a.resolved_fields ?? a.fields;
  const f={...a.native_slk_fields};
  for(const m of a.object_overrides??[]){const l=m.level||1,v=m.resolvedValue??m.value;
    const key={aare:`Area${l}`,atar:`targs${l}`,abuf:`BuffID${l}`,acdn:`Cool${l}`,amcs:`Cost${l}`,adur:`Dur${l}`,ahdu:`HeroDur${l}`,aran:`Rng${l}`}[m.field];
    if(key)f[key]=v;else if(m.dataPointer>0 && m.dataPointer<=9 && !['aub1','atp1'].includes(m.field))f[`Data${String.fromCharCode(64+m.dataPointer)}${l}`]=v;
  }return f;
}
function compile(id) {
  if(cache.has(id))return cache.get(id);
  const a=ABILITIES[id]; if(!a)return {id,name:id,status:'unresolved',kind:'pending',effectText:'技能对象未提取，未增加猜测效果',cooldown:0,manaCost:0};
  const f=fields(a),n=k=>num(f[k+'1']),has=k=>f[k+'1']!==undefined,A=n('DataA'),B=n('DataB'),C=n('DataC'),D=n('DataD'),E=n('DataE');
  const s={id,name:a.name??id,base:a.base_code,fields:f,description:a.description??a.tooltip_text??'',status:'implemented',kind:'pending',cooldown:n('Cool'),manaCost:n('Cost'),duration:n('Dur'),heroDuration:n('HeroDur'),range:n('Rng')/100,radius:n('Area')/100,targets:String(f.targs1??'_').split(','),buffKey:String(f.BuffID1??id).split(',')[0],A,B,C,D,E};
  switch(a.base_code){
    case 'AOcr':s.kind='crit';s.chance=A/100;s.multiplier=B;break;
    case 'AHbh':s.kind='bash';s.chance=A/100;s.damage=C;break;
    case 'AEev':s.kind='evasion';s.chance=A;break;
    case 'Aspo':case 'Aven':s.kind='poison';s.dps=A;s.move=-B;s.haste=-C;break;
    case 'Afra':case 'Afrb':s.kind='cold';s.haste=-num(RULES.frostAttackSpeedDecrease,.1);s.move=-num(RULES.frostMoveSpeedDecrease,.1);s.effectText=`冰冻命中：按原图Misc全局值降低${-s.haste*100}%攻速、${-s.move*100}%移速，持续${s.duration}秒`;break;
    case 'AIcb':s.kind='corruption';s.armor=B;break;
    case 'AIva':s.kind='lifesteal';s.fraction=A;break;
    case 'AOac':case 'AEar':case 'Aakb':s.kind='aura_damage';s.damage=A;s.rangedOnly=a.base_code==='AEar';break;
    case 'AHad':s.kind='aura_armor';s.armor=A;break;
    case 'AOae':s.kind='aura_speed';s.move=A;s.haste=B;break;
    case 'AUau':s.kind='aura_regen';s.move=A;s.regen=B;s.regenPercent=!!C;break;
    case 'Aoar':s.kind='aura_regen';s.regen=A;s.regenPercent=!!B;break;
    case 'AHab':s.kind='aura_mana';s.regen=A;s.regenPercent=!!B;break;
    case 'AEah':s.kind='aura_thorns';s.fraction=A;s.flat=!B;break;
    case 'AUav':s.kind='aura_lifesteal';s.fraction=A;break;
    case 'Aasl':s.kind='aura_slow';s.move=A;s.haste=B;if(!has('DataA')&&!has('DataB')){s.status='marker';s.effectText='状态/图标标记，不重复结算同名技能';}break;
    case 'ANms':s.kind='shield';s.damagePerMana=A;s.absorb=B;break;
    case 'Assk':s.kind='hardened';s.chance=A/100;s.minimum=B;s.reduction=C;break;
    case 'Amim':s.kind='immunity';break;
    case 'ANdb':s.kind='brawler';s.chance=A/100;s.multiplier=B;s.evasion=D;break;
    case 'AHfa':case 'AHca':s.kind='orb';s.damage=A;s.haste=-B;s.move=-C;break;
    case 'Ahea':s.kind='heal';s.heal=A;break;
    case 'AOhw':s.kind='heal_wave';s.heal=A;s.count=B;s.loss=C;break;
    case 'Ablo':s.kind='buff';s.haste=A;s.move=B;break;
    case 'Aroa':s.kind='buff';s.damage=A;s.armor=B;break;
    case 'Ainf':s.kind='buff';s.damage=A;s.armor=B;break;
    case 'Afzy':s.kind='buff';s.haste=A;break;
    case 'AUts':s.kind='carapace';s.fraction=A;s.incomingFactor=B;s.armor=C;break;
    case 'AUfa':s.kind='buff';s.armor=B;s.frostDuration=A;break;
    case 'Auhf':s.kind=A<0?'debuff':'buff';s.haste=A;s.dps=B;break;
    case 'Absk':s.kind='buff';s.move=A;s.haste=B;s.incoming=C;break;
    case 'Aslo':s.kind='debuff';s.move=-A;s.haste=-B;break;
    case 'Acri':s.kind='debuff';s.move=-A;s.haste=-B;s.damage=-C;break;
    case 'ANdh':s.kind='debuff';s.move=-A;s.miss=B;break;
    case 'AEer':s.kind='root';s.dps=A;break;
    case 'Aens':s.kind='root';s.dps=0;break;
    case 'AHtc':s.kind='stomp';s.damage=A;s.move=-C;s.haste=-D;break;
    case 'AOws':s.kind='stomp';s.damage=A;s.stun=true;break;
    case 'AOsh':s.kind='wave';s.damage=A;s.length=C/100;s.width=D/100;break;
    case 'AEfk':s.kind='knives';s.damage=A;s.damageCap=B;s.targetCap=C;break;
    case 'AUfn':s.kind='nova';s.damage=B;s.areaDamage=A;break;
    case 'ACbf':s.kind='breath';s.damage=A;s.dps=E;s.length=C/100;s.width=D/100;break;
    case 'ANcs':s.kind='cluster';s.damage=A;s.interval=B;s.count=C;s.damageCap=D;s.stun=true;break;
    case 'AHwe':s.kind='summon';s.count=A;s.summonId=f.UnitID1;break;
    case 'AOmi':s.kind='mirror';s.count=A;s.outgoing=B;s.incoming=C;break;
    case 'ANpi':case 'AEim':s.kind='immolation';s.dps=A/Math.max(.01,s.duration||1);s.toggle=a.base_code==='AEim';break;
    case 'Apxf':s.kind='phoenix_fire';s.damage=A;s.dps=B;break;
    case 'Aapl':s.kind='disease';s.dps=B;s.duration=A;break;
    case 'Aroc':s.kind='barrage';s.damage=A;s.damageCap=B;s.count=C;break;
    case 'Awar':s.kind='pulverize';s.chance=A/100;s.damage=B;s.inner=C/100;s.outer=D/100;break;
    case 'Asds':s.kind='suicide';s.damage=B;s.radius=C/100;s.outerDamage=D;s.outerRadius=A/100;break;
    case 'ANfl':s.kind='forked';s.damage=A;s.count=B;break;
    case 'AHtb':s.kind='bolt';s.damage=A;s.stun=true;break;
    case 'AOcl':s.kind='chain_spell';s.damage=A;s.count=B;s.loss=C;break;
    case 'AIsb':s.kind='spell_orb';s.chance=B/100;s.spellId=f.UnitID1;break;
    case 'Adef':s.kind='defend';s.pierceFactor=A;s.move=-C;break;
    case 'Apsh':s.kind='burrow';break;
    case 'ANcl':s.status='marker';s.effectText=id==='A008'?'出售通过建筑指令结算，不作为攻击技能重复触发':'建筑或操作命令，战斗效果由专属规则处理';break;
    case 'Alit':s.kind='lightning_attack';s.status='unresolved';s.effectText='Lightning Attack为武器附加原型，毁坏/目标语义未在Web模拟核定';break;
    default:s.status=markers.has(a.base_code)?'marker':'unresolved';s.effectText=s.status==='marker'?'图标或脚本标记，独立脚本效果另行处理':'原生基码尚无已核定模拟规则';
  }
  if(id==='A061'){s.kind='guardian';s.status='implemented';s.effectText='施法后160范围内同玩家的其他单位追加A060/A063/A065；不误算为飞刀';}
  if(['A00I','A00J','A01D','A01E','A01J'].includes(id)){s.status='marker';s.effectText='武器/脚本说明标记，已按武器机制独立处理，不叠加虚构数值';}
  if(id==='A01I'){s.kind='mana_strike';s.status='implemented';s.effectText='攻击启动时记录当前魔法值×3，0.633秒后对原目标追加魔法伤害（JASS）';}
  if(id==='A06O'){s.kind='attack_charge_heal';s.status='implemented';s.effectText='攻击启动：魔法已满则回复25生命并清空魔法，否则魔法+1（JASS，非固定三次）';}
  if(id==='A0BH'){s.kind='aura_heartstopper';s.status='implemented';s.effectText='JASS每秒直接扣最大生命1.2%；仅对生命>2%的目标，最低保留1%生命，不是文案1%';}
  if(s.kind==='summon'&&!TEMPLATES[s.summonId]){s.status='unresolved';s.effectText=`召唤模板${s.summonId??'未指定'}缺失`;}
  if(['crit','evasion','hardened','demolish','orb','barrage','pulverize'].includes(s.kind)&&!has('DataA')&&!has('DataB')){s.status='unresolved';s.effectText='缺少原生效果数据，不应用空值默认';}
  if(s.kind==='spell_orb'&&compile(s.spellId).status!=='implemented'){s.status='unresolved';s.effectText=`触发子技能${s.spellId}未核定，未计入已实现`; }
  s.effectText??=effectSummary(s);
  cache.set(id,s);return s;
}
function effectSummary(s){
  const pct=v=>`${Math.round(v*10000)/100}%`,delta=v=>v>=0?`+${v}`:String(v);const parts=[];
  if(s.kind==='crit')parts.push(`${pct(s.chance)}概率，${s.multiplier}倍普攻`);
  else if(s.kind==='bash')parts.push(`${pct(s.chance)}概率，附加${s.damage}伤害、眩晕${s.duration}秒`);
  else if(s.kind==='evasion')parts.push(`闪避${pct(s.chance)}普攻`);
  else if(s.kind==='poison')parts.push(`每秒${s.dps}魔法伤害，持续${s.duration}秒，移速${pct(s.move)}、攻速${pct(s.haste)}`);
  else if(s.kind==='corruption')parts.push(`命中减甲${s.armor}，持续${s.duration}秒`);
  else if(s.kind==='lifesteal'||s.kind==='aura_lifesteal')parts.push(`回复实际普攻伤害的${pct(s.fraction)}${s.kind==='aura_lifesteal'?'（近战）':''}`);
  else if(s.kind==='shield')parts.push(`吸收${pct(s.absorb)}伤害，每点魔法吸收${s.damagePerMana}伤害`);
  else if(s.kind==='hardened')parts.push(`${pct(s.chance)}概率格挡${s.reduction}，最低伤害${s.minimum}`);
  else if(s.kind==='immunity')parts.push('免疫本模拟中的魔法技能伤害');
  else if(s.kind==='brawler')parts.push(`${pct(s.chance)}概率${s.multiplier}倍暴击，${pct(s.evasion)}闪避普攻`);
  else if(s.kind==='orb')parts.push(`强化普攻+${s.damage}伤害${s.duration?`，减速持续${s.duration}秒`:''}`);
  else if(s.kind==='heal'||s.kind==='heal_wave')parts.push(`治疗${s.heal}${s.kind==='heal_wave'?`，最多${s.count}个目标，逐次衰减${pct(s.loss)}`:''}`);
  else if(s.kind==='summon')parts.push(`召唤${s.count}个${TEMPLATES[s.summonId]?.name??s.summonId}，存活${s.duration}秒`);
  else if(s.kind==='mirror')parts.push(`${s.count}个镜像，输出${pct(s.outgoing)}、承伤${s.incoming}倍，持续${s.duration}秒`);
  else if(s.kind==='immolation')parts.push(`每秒${Math.round(s.dps*100)/100}范围魔法伤害${s.toggle?'；Web遇敌自动开启':''}`);
  else if(s.kind==='barrage')parts.push(`至多${s.count}个目标，每个额外目标${s.damage}伤害，总额上限${s.damageCap}`);
  else if(s.kind==='pulverize')parts.push(`${pct(s.chance)}概率，内圈${s.damage}/外圈${s.damage/2}额外范围伤害`);
  else if(s.kind==='spell_orb')parts.push(`${pct(s.chance)}概率触发${s.spellId}`);
  else if(s.kind==='disease')parts.push(`每秒${s.dps}魔法伤害，离圈后持续${s.duration}秒，同一状态刷新不叠加`);
  else if(s.kind==='phoenix_fire')parts.push(`每${s.cooldown}秒对单体造成${s.damage}初始魔法伤害，续伤每秒${s.dps}、持续${s.duration}秒`);
  else if(s.kind==='forked')parts.push(`最多${s.count}目标，每个${s.damage}魔法伤害`);
  else if(s.kind==='chain_spell')parts.push(`初始${s.damage}魔法伤害，最多${s.count}目标，每跳衰减${pct(s.loss)}`);
  else if(s.kind==='bolt')parts.push(`${s.damage}魔法伤害，眩晕${s.duration}秒`);
  else if(s.kind==='root')parts.push(`禁止移动${s.base==='AEer'?'与攻击':''}${s.duration}秒${s.dps?`，每秒${s.dps}魔法伤害`:''}`);
  else if(s.kind==='carapace')parts.push(`护甲+${s.armor}，近战伤害反弹${pct(s.fraction)}`);
  else {parts.push(names[s.kind]??s.kind);if(s.damage)parts.push(`伤害${s.damage>=1?s.damage:delta(s.damage*100)+'%'}`);if(s.areaDamage)parts.push(`范围附伤${s.areaDamage}`);if(s.armor)parts.push(`护甲${delta(s.armor)}`);if(s.haste)parts.push(`攻速${pct(s.haste)}`);if(s.move)parts.push(`移速${pct(s.move)}`);if(s.regen)parts.push(`每秒恢复${s.regenPercent?pct(s.regen):s.regen}`);if(s.fraction)parts.push(`反弹${s.flat?s.fraction:pct(s.fraction)}`);if(s.duration)parts.push(`持续${s.duration}秒`);}
  return parts.join('；');
}
const TRIGGER_DESCRIPTIONS={n0S4:'每次伤害事件追加受害者当前生命3%的伤害',n0S6:'每次伤害事件追加受害者最大生命1%的魔法伤害',n0SC:'死亡时300范围敌军受到8伤害',n0SD:'死亡时300范围敌军受到26伤害',h0CZ:'击杀时回复死者最大生命60%',h08B:'潜地1.5秒无敌，结束追加5秒攻速25%与移速5%',h03B:'攻击启动30%概率自施2秒狂热与2秒增益',H08U:'死亡后原位置重新生成同类型单位'};
export function compileSkills(def) {const scale=def.distanceScale??1;return [...new Set(def.abilityIds??def.sourceAbilityIds??(def.sourceAbilities??[]).map(a=>a.rawcode??a.id))].filter(Boolean).map(compile).map(s=>({...s,...Object.fromEntries(['range','radius','length','width','inner','outer','outerRadius'].filter(k=>s[k]!==undefined).map(k=>[k,s[k]*scale]))}));}
export function describeSkills(def) {const list=compileSkills(def).map(s=>({id:s.id,name:s.name,description:s.description,status:s.status,effectText:s.effectText,cooldown:s.cooldown,manaCost:s.manaCost,duration:s.duration,range:s.range,radius:s.radius}));const r=raw(def);if(TRIGGER_DESCRIPTIONS[r])list.push({id:'trigger:'+r,name:'脚本机制',description:TRIGGER_DESCRIPTIONS[r],effectText:TRIGGER_DESCRIPTIONS[r],status:'implemented',cooldown:0,manaCost:0});return list;}
export function skillCoverage(def) {const list=describeSkills(def);return {implemented:list.filter(s=>s.status==='implemented').length,markers:list.filter(s=>s.status==='marker').length,unresolved:list.filter(s=>s.status==='unresolved').length};}
export function attachSkills(e,def) {
  e.combatRawcode=raw(def);e.skillSpecs=compileSkills(def);e.skillStates={};e.buffs=[];e.skillSource=!!def.abilityIds;e.weapon1=def.weapon1??{};e.weapon2=def.weapon2??{};e.sourceRawFields=def.sourceRawFields??{};e.distanceScale=def.distanceScale??1;
  const f=e.sourceRawFields;e.isHero=!!(e.isHero||def.hero||def.isHero||['STR','AGI','INT'].includes(f.Primary));e.maxMana=num(def.maxMana??def.mana??f.manaN);e.mana=clamp(num(def.initialMana??def.manaStart??f.mana0,e.maxMana),0,e.maxMana);e.manaRegen=num(def.manaRegen??f.regenMana);e.hpRegen=num(def.hpRegen??f.regenHP);e.targetType=def.targetType??f.targType??(f.movetp==='fly'?'air':'ground');e.traits=String(def.traits??def.unitType??f.type??'').split(',');e.invulnerable=false;
  for(const s of e.skillSpecs)e.skillStates[s.id]={readyAt:0,casts:0};
}
export function matchesTargets(s,source,target) {
  const t=s.targets??[];if(!t.length||t[0]==='_')return true;
  if(t.includes('self')&&t.length===1)return source.id===target.id;
  if(t.includes('notself')&&source.id===target.id)return false;
  const hostile=t.includes('enemies')||t.includes('enemy'),friendly=t.includes('friend')||t.includes('ally');
  if(hostile&&!friendly&&source.side===target.side)return false;if(friendly&&!hostile&&source.side!==target.side)return false;
  if(t.includes('air')&&!t.includes('ground')&&target.targetType!=='air')return false;
  if(t.includes('ground')&&!t.includes('air')&&target.targetType==='air')return false;
  if(t.includes('mechanical')&&!target.traits?.includes('mechanical'))return false;
  if(t.includes('organic')&&target.traits?.includes('mechanical'))return false;
  if(t.includes('tree')&&!target.traits?.includes('tree'))return false;
  if(t.includes('structure')&&t.length===1&&!target.isBuilding)return false;
  return true;
}
export function sourceWeapon(source,target){
  const explicit=source.skillSource;for(const slot of [1,2]){const w=slot===1?source.weapon1:source.weapon2;if(!w||!Object.keys(w).length)continue;const type=w[`weapTp${slot}`],mask=num(w.weapsOn,source.sourceRawFields?.weapsOn??1);if(!(mask&(1<<(slot-1)))||!type||type==='_')continue;const targets=String(w[`targs${slot}`]??'_').split(',');if(!matchesTargets({targets},source,target))continue;
    return {slot,raw:w,type,range:num(w[`rangeN${slot}`],source.range*100/(source.distanceScale||1))/100*(source.distanceScale??1),interval:num(w[`cool${slot}`],source.attackInterval),attackType:w[`atkType${slot}`]??source.attackType,damage:slot===1?source.damage:num(w.dmgplus2)+num(w.dice2)*(num(w.sides2)+1)/2};
  }
  return explicit?null:{slot:1,raw:{},type:'normal',range:source.range,interval:source.attackInterval,attackType:source.attackType,damage:source.damage};
}
export function canWeaponTarget(source,target){return !!sourceWeapon(source,target);}

function active(e){return (e.skillSpecs??[]).filter(s=>s.status==='implemented');}
function state(e,s){return e.skillStates[s.id]??=( {readyAt:0,casts:0});}
function buff(e,s,source,now,extra={}){if(source.side!==e.side&&active(e).some(a=>a.kind==='immunity')&&(['Aslo','AEer','Acri','ANdh','Auhf','AUfn','ANcs','AHtb','AOcl'].includes(s.base)))return false;e.buffs??=[];const key=extra.key??s.buffKey??s.id;const b={key,skillId:s.id,ownerId:source.ownerId,sourceId:source.id,expiresAt:now+(e.isHero?s.heroDuration||s.duration:s.duration),damage:s.damage??0,armor:s.armor??0,move:s.move??0,haste:s.haste??0,regen:s.regen??0,dps:s.dps??0,miss:s.miss??0,incoming:s.incoming??0,disarm:s.base==='AEer',...extra};const old=e.buffs.findIndex(v=>v.key===key);if(old>=0)e.buffs[old]=b;else e.buffs.push(b);}
export function sourceAuraEffects(game,target,auras) {
  const effects={damage:0,haste:0,move:0,armor:0,healRate:0,manaRate:0,lifesteal:0,thorns:0,thornsFlat:0};const groups=new Map();
  for(const source of auras??[]){if(source.hp<=0)continue;for(const s of active(source)){if(!s.kind.startsWith('aura_')||dist(source,target)>s.radius||!matchesTargets(s,source,target)||(s.rangedOnly&&target.range<=1.28))continue;
      const key=s.buffKey||s.id,old=groups.get(key);if(!old||Math.abs(s.damage??s.armor??s.haste??s.regen??s.fraction??0)>Math.abs(old.s.damage??old.s.armor??old.s.haste??old.s.regen??old.s.fraction??0))groups.set(key,{s,source});}}
  for(const {s}of groups.values()){
    if(s.kind==='aura_damage')effects.damage+=s.damage;
    if(s.kind==='aura_armor')effects.armor+=s.armor;
    if(['aura_speed','aura_slow','aura_regen'].includes(s.kind)){effects.move+=s.move??0;effects.haste+=s.haste??0;}
    if(s.kind==='aura_regen')effects.healRate+=s.regenPercent?s.regen*target.maxHp:s.regen;
    if(s.kind==='aura_mana')effects.manaRate+=s.regenPercent?s.regen*target.maxMana:s.regen;
    if(s.kind==='aura_lifesteal'&&target.range<=1.28)effects.lifesteal+=s.fraction;
    if(s.kind==='aura_thorns')effects[s.flat?'thornsFlat':'thorns']+=s.fraction;
  }
  for(const s of active(target))if(s.kind==='carapace')effects.armor+=s.armor;
  for(const b of target.buffs??[])if(b.expiresAt>game.state.time){effects.damage+=b.damage??0;effects.armor+=b.armor??0;effects.haste+=b.haste??0;effects.move+=b.move??0;effects.healRate+=b.regen??0;}
  return effects;
}
export function sourceDamage(game,target,amount,source,magic=false) {
  if(amount<=0)return;
  if(magic&&active(target).some(s=>s.kind==='immunity'))return;
  const a=game._auraEffects(target,game._battleAuras?.[target.battleTeam]??[]);
  const factor=magic?game._typeMultiplier('magic',target.armorType):game._typeMultiplier(source?.attackType??'normal',target.armorType)*game._armorFactor(game._effectiveArmor(target,a.armor));
  game._hurt(target,amount*factor,source,{magic,spell:true});
}
function cast(game,e,s,target,battle){
  const now=game.state.time,st=state(e,s);if(e.mana+1e-8<s.manaCost||st.readyAt>now)return false;
  e.mana-=s.manaCost;st.readyAt=now+Math.max(.1,s.cooldown);st.casts++;game._event('cast',e,s.name,{skillId:s.id});return true;
}
function targets(e,s,battle,friendly=false){return battle.filter(t=>t.hp>0&&(friendly?t.side===e.side:t.side!==e.side)&&matchesTargets(s,e,t)&&dist(e,t)<=Math.max(s.range,s.radius));}
function summon(game,e,def,duration,extra={}) {if(!def)return null;const n=game._entity(def,{team:e.team,side:e.side,laneId:e.laneId,sourceLaneId:e.sourceLaneId,ownerId:e.ownerId,x:e.x,y:e.y,worldX:e.worldX,worldY:e.worldY,battleTeam:e.battleTeam,nav:e.nav?JSON.parse(JSON.stringify(e.nav)):undefined,isSummon:true,expiresAt:duration?game.state.time+duration:undefined,reward:0,...extra});n.status.activated=true;game.state.entities.push(n);return n;}
export function tickSourceSkills(game,e,battle,dt) {
  if(!e.skillSpecs)return;const now=game.state.time;
  e.buffs=(e.buffs??[]).filter(b=>b.expiresAt>now);const aura=sourceAuraEffects(game,e,battle.auras??[]);
  e.hp=Math.min(e.maxHp,e.hp+e.hpRegen*dt);e.mana=Math.min(e.maxMana,e.mana+(e.manaRegen+aura.manaRate)*dt);
  for(const b of e.buffs){if(b.dps>0)sourceDamage(game,e,b.dps*dt,game._worldEntities?.get(b.sourceId)??{side:e.side==='monster'?'defender':'monster',ownerId:b.ownerId},true);if(b.stun)e.status.stunUntil=Math.max(e.status.stunUntil??0,b.expiresAt);if(b.root)e.status.rootUntil=Math.max(e.status.rootUntil??0,b.expiresAt);}
  if(e.hp<=0)return;
  if(e.combatRawcode==='h08B'&&e.status.burrowEnd&&now>=e.status.burrowEnd){e.invulnerable=false;e.status.burrowEnd=0;buff(e,compile('A06Z'),e,now);}
  for(const job of e.status.pendingStrikes??[]){if(job.at<=now){const t=game._worldEntities?.get(job.targetId);if(t?.hp>0)sourceDamage(game,t,job.damage,e,true);job.done=true;}}
  e.status.pendingStrikes=(e.status.pendingStrikes??[]).filter(j=>!j.done);
  if((e.status.stunUntil??0)>now||e.invulnerable)return;
  for(const s of active(e)){
    const st=state(e,s);if(st.readyAt>now)continue;
    if(s.kind==='aura_heartstopper'){for(const t of targets(e,{...s,range:0},battle)){if((t.status.heartstopperAt??0)>now)continue;t.status.heartstopperAt=now+1;if(t.hp/t.maxHp>.02)t.hp=Math.max(t.maxHp*.01,t.hp-t.maxHp*.012);}continue;}
    if(s.kind==='phoenix_fire'){const enemy=targets(e,{...s,range:s.radius},battle).find(t=>!(t.buffs??[]).some(b=>b.key===s.buffKey));if(enemy&&cast(game,e,s,enemy,battle)){sourceDamage(game,enemy,s.damage,e,true);buff(enemy,s,e,now,{damage:0});}continue;}
    if(s.kind==='disease'){for(const t of targets(e,{...s,range:0},battle))buff(t,s,e,now,{damage:0});continue;}
    if(s.kind==='immolation'){
      if(s.toggle&&e.mana<s.manaCost)continue;
      const enemies=targets(e,{...s,range:0},battle);for(const t of enemies)sourceDamage(game,t,s.dps*dt,e,true);continue;
    }
    if(['shield','defend'].includes(s.kind))continue;
    if(['summon','mirror'].includes(s.kind)){
      if(!battle.some(t=>t.side!==e.side&&t.hp>0&&dist(e,t)<=e.acquisitionRange))continue;
      if(cast(game,e,s,null,battle)){for(let i=0;i<Math.min(24,s.count);i++){const def=s.kind==='mirror'?TEMPLATES[e.combatRawcode]:TEMPLATES[s.summonId];const n=summon(game,e,def,s.duration);if(n&&s.kind==='mirror'){n.damage*=s.outgoing;n.status.incomingMultiplier=s.incoming;n.skillSpecs=[];n.isIllusion=true;}}}continue;
    }
    if(s.kind==='burrow'){
      if(e.combatRawcode!=='h08B'||e.hp>e.maxHp*.75||!battle.some(t=>t.side!==e.side&&dist(e,t)<3))continue;
      if(cast(game,e,s,null,battle)){e.invulnerable=true;e.status.burrowEnd=now+s.duration;e.status.stunUntil=now+s.duration;}continue;
    }
    if(['heal','heal_wave','buff','guardian'].includes(s.kind)){
      let friends=targets(e,s,battle,true);
      if(s.kind==='guardian')friends=battle.filter(t=>t.hp>0&&t.ownerId===e.ownerId&&t.id!==e.id&&dist(e,t)<=1.6*e.distanceScale&&!t.skillSpecs?.some(a=>a.id==='A060'));
      else if(s.kind==='heal'||s.kind==='heal_wave')friends=friends.filter(t=>t.hp<t.maxHp).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp);
      else friends=friends.filter(t=>!(t.buffs??[]).some(b=>b.key===s.buffKey&&b.expiresAt>now+1)).sort((a,b)=>b.damage-a.damage);
      if(!friends.length)continue;if(!cast(game,e,s,friends[0],battle))continue;
      if(s.kind==='guardian'){for(const t of friends)for(const id of ['A060','A063','A065']){const a=compile(id);if(a.status==='implemented'){t.skillSpecs.push(a);t.skillStates[id]={readyAt:0,casts:0};}}}
      else if(s.kind==='heal'||s.kind==='heal_wave'){let previous=e;const chosen=[];let heal=s.heal;for(let i=0;i<(s.kind==='heal'?1:Math.max(1,s.count));i++){const t=friends.filter(t=>!chosen.includes(t)&&dist(previous,t)<=Math.max(s.range,s.radius)).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp)[0];if(!t)break;const restored=Math.min(t.maxHp-t.hp,heal);t.hp+=restored;game._event('heal',t,`+${Math.round(restored)}`);chosen.push(t);previous=t;heal*=1-s.loss;}}
      else {const chosen=s.targets.length===1&&s.targets[0]==='self'?[e]:s.base==='Aroa'?friends:[friends[0]];for(const t of chosen)buff(t,s,e,now);}
      continue;
    }
    const enemies=targets(e,s,battle);if(!enemies.length)continue;const target=enemies.sort((a,b)=>dist(e,a)-dist(e,b))[0];
    if(!['debuff','root','stomp','wave','knives','nova','breath','cluster','suicide','forked','bolt','chain_spell'].includes(s.kind))continue;
    if(s.kind==='suicide'&&dist(e,target)>s.radius)continue;
    if(['debuff','root'].includes(s.kind)&&(target.buffs??[]).some(b=>b.key===s.buffKey&&b.expiresAt>now+1))continue;
    if(!cast(game,e,s,target,battle))continue;
    if(['forked','bolt','chain_spell'].includes(s.kind)){executeTriggeredSpell(game,e,s,target,battle);continue;}
    if(s.kind==='debuff'||s.kind==='root'){buff(target,s,e,now,{root:s.kind==='root'});continue;}
    if(s.kind==='suicide'){for(const t of enemies)if(dist(e,t)<=s.radius)sourceDamage(game,t,s.damage,e,false);e.hp=0;game._sourceDeath(e,null);continue;}
    let affected=[];
    if(s.kind==='wave'||s.kind==='breath'){
      const origin=pos(e),p=pos(target),len=Math.max(s.length,s.range),vx=(p.x-origin.x)/(dist(e,target)||1),vy=(p.y-origin.y)/(dist(e,target)||1);
      affected=battle.filter(t=>{const q=pos(t),dx=q.x-origin.x,dy=q.y-origin.y,along=dx*vx+dy*vy,across=Math.abs(dx*vy-dy*vx);return t.hp>0&&t.side!==e.side&&matchesTargets(s,e,t)&&along>=0&&along<=len&&across<=Math.max(s.radius,s.width);});
    }else if(s.kind==='nova'||s.kind==='cluster')affected=battle.filter(t=>t.hp>0&&t.side!==e.side&&matchesTargets(s,e,t)&&dist(t,target)<=s.radius);
    else affected=enemies.filter(t=>dist(e,t)<=s.radius);
    if(s.targetCap>0)affected=affected.slice(0,s.targetCap);
    let budget=s.damageCap>0?s.damageCap:Infinity;
    for(const t of affected){const hit=s.kind==='nova'?(t.id===target.id?s.damage:0)+s.areaDamage:s.kind==='cluster'?s.damage*s.count:s.damage;sourceDamage(game,t,Math.min(hit,budget),e,true);budget-=hit;if(s.stun)buff(t,s,e,now,{stun:true,dps:0});else if(s.duration)buff(t,s,e,now,{damage:0});if(budget<=0)break;}
  }
}
export function sourceAttackStart(game,e,target) {
  if(e.combatRawcode==='h04N'){e.status.pendingStrikes??=[];e.status.pendingStrikes.push({at:game.state.time+.633,targetId:target.id,damage:Math.trunc(e.mana*3)});}
  if(e.combatRawcode==='h081'){if(e.mana>=e.maxMana){e.hp=Math.min(e.maxHp,e.hp+25);e.mana=0;}else e.mana=Math.min(e.maxMana,e.mana+1);}
  if(e.combatRawcode==='h03B'&&!(e.buffs??[]).some(b=>b.key==='skeleton-frenzy')&&game._random()<.3){buff(e,{...compile('A0RA'),buffKey:'skeleton-frenzy'},e,game.state.time);buff(e,{...compile('A02V'),buffKey:'skeleton-buff'},e,game.state.time);}
  const auras=game._auraEffects(e,game._battleAuras?.[e.battleTeam]??[]);let multiplier=1+auras.damageMultiplier-1,bonus=0;const procs=[];const missChance=clamp((e.buffs??[]).filter(b=>b.expiresAt>game.state.time).reduce((n,b)=>n+(b.miss??0),0),0,1);const missed=missChance>0&&game._random()<missChance;
  for(const s of active(e))if(matchesTargets(s,e,target)){
    if(s.kind==='crit'&&game._random()<s.chance)multiplier*=s.multiplier;
    if(s.kind==='brawler'&&game._random()<s.chance)multiplier*=s.multiplier;
    if(s.kind==='bash'&&game._random()<s.chance)procs.push(s);
    if(s.kind==='orb'&&e.mana>=s.manaCost&&state(e,s).readyAt<=game.state.time){e.mana-=s.manaCost;state(e,s).readyAt=game.state.time+s.cooldown;bonus+=s.damage;procs.push(s);}
    if(['poison','cold','corruption','lifesteal','pulverize','barrage','spell_orb'].includes(s.kind))procs.push(s);
  }
  return {multiplier,bonus,procs,missed};
}
export function sourceOnHit(game,e,target,battle,dealt,procs=[],rawDamage=dealt) {
  const now=game.state.time,aura=sourceAuraEffects(game,e,battle.auras??[]);if(aura.lifesteal>0)e.hp=Math.min(e.maxHp,e.hp+dealt*aura.lifesteal);
  for(const s of procs){
    if(s.kind==='bash'){if(target.hp>0)sourceDamage(game,target,s.damage,e,true);buff(target,s,e,now,{stun:true,damage:0});}
    if(s.kind==='orb'&&s.duration)buff(target,s,e,now,{damage:0});
    if(s.kind==='poison'||s.kind==='cold')buff(target,s,e,now,{damage:0});
    if(s.kind==='corruption')buff(target,s,e,now,{armor:-s.armor});
    if(s.kind==='lifesteal')e.hp=Math.min(e.maxHp,e.hp+dealt*s.fraction);
    if(s.kind==='pulverize'&&game._random()<s.chance)for(const t of battle)if(t.hp>0&&t.side!==e.side&&matchesTargets(s,e,t)&&dist(t,target)<=s.outer)sourceDamage(game,t,s.damage*(dist(t,target)<=s.inner?1:.5),e,false);
    if(s.kind==='barrage'){let budget=s.damageCap||Infinity;for(const t of battle.filter(t=>t.hp>0&&t.side!==e.side&&t.id!==target.id&&dist(e,t)<=s.radius&&matchesTargets(s,e,t)).slice(0,Math.max(0,s.count-1))){const d=Math.min(s.damage,budget);sourceDamage(game,t,d,e,false);budget-=d;}}
    if(s.kind==='spell_orb'&&game._random()<s.chance){const child=compileSkills({abilityIds:[s.spellId],distanceScale:e.distanceScale})[0];if(child.status==='implemented')executeTriggeredSpell(game,e,child,target,battle);}
  }
  weaponSecondary(game,e,target,battle,rawDamage);
}
export function executeTriggeredSpell(game,e,s,target,battle){
  if(!matchesTargets(s,e,target)||active(target).some(a=>a.kind==='immunity'))return;
  if(s.kind==='debuff'||s.kind==='root'){buff(target,s,e,game.state.time,{root:s.kind==='root'});return;}
  if(s.kind==='forked'){const chosen=[target,...battle.filter(t=>t.id!==target.id&&t.hp>0&&t.side!==e.side&&matchesTargets(s,e,t)&&dist(e,t)<=s.range&&dist(t,target)<=Math.max(s.radius,s.D/100*e.distanceScale)).sort((a,b)=>dist(target,a)-dist(target,b)).slice(0,Math.max(0,s.count-1))];for(const t of chosen){sourceDamage(game,t,s.damage,e,true);game._event('chain',t,s.name,{fromWorldX:e.worldX,fromWorldY:e.worldY});}return;}
  if(s.kind==='chain_spell'){
    let previous=target,damage=s.damage;const used=new Set();for(let i=0;i<Math.max(1,s.count);i++){const t=i===0?target:battle.filter(t=>t.hp>0&&t.side!==e.side&&!used.has(t.id)&&matchesTargets(s,e,t)&&dist(previous,t)<=s.radius&&!active(t).some(a=>a.kind==='immunity')).sort((a,b)=>dist(previous,a)-dist(previous,b))[0];if(!t)break;sourceDamage(game,t,damage,e,true);game._event('chain',t,s.name,{fromWorldX:previous.worldX,fromWorldY:previous.worldY});used.add(t.id);previous=t;damage*=1-s.loss;}return;
  }
  sourceDamage(game,target,s.damage??0,e,true);if(s.stun)buff(target,s,e,game.state.time,{stun:true,damage:0});
}
export function modifyIncoming(game,target,damage,attacker,options={}) {
  if(target.invulnerable)return 0;let result=damage;
  for(const s of active(target)){
    if(options.magic&&s.kind==='immunity')return 0;
    if(!options.spell&&s.kind==='evasion'&&game._random()<s.chance)return 0;
    if(!options.spell&&s.kind==='brawler'&&game._random()<s.evasion)return 0;
    if(!options.spell&&s.kind==='hardened'&&game._random()<s.chance)result=Math.max(s.minimum,result-s.reduction);
    if(!options.spell&&s.kind==='defend'&&attacker?.attackType==='pierce')result*=s.pierceFactor;
    if(s.kind==='carapace'&&s.incomingFactor>0)result*=s.incomingFactor;
    if(s.kind==='shield'&&s.damagePerMana>0){const absorb=Math.min(result*s.absorb,target.mana*s.damagePerMana);target.mana-=absorb/s.damagePerMana;result-=absorb;}
  }
  for(const b of target.buffs??[])if(b.expiresAt>game.state.time)result*=1+(b.incoming??0);
  return result*(target.status?.incomingMultiplier??1);
}
export function afterSourceDamage(game,target,actual,attacker,options={}) {
  if(!attacker||actual<=0)return;
  if(!options.spell&&attacker.hp>0&&attacker.range<=1.28){const selfThorns=active(target).filter(s=>s.kind==='carapace').reduce((v,s)=>v+s.fraction,0);const aura=sourceAuraEffects(game,target,game._battleAuras?.[target.battleTeam]??[]);if(aura.thorns||aura.thornsFlat||selfThorns)game._hurt(attacker,actual*(aura.thorns+selfThorns)+aura.thornsFlat,target,{spell:true,reflected:true});}
  if(options.scripted||options.reflected)return;
  if(attacker.combatRawcode==='n0S4'&&target.hp>0)game._hurt(target,target.hp*.03,attacker,{spell:true,scripted:true});
  if(attacker.combatRawcode==='n0S6'&&target.hp>0&&!active(target).some(s=>s.kind==='immunity'))game._hurt(target,target.maxHp*.01*game._typeMultiplier('magic',target.armorType),attacker,{magic:true,spell:true,scripted:true});
}
export function sourceDeath(game,target,killer) {
  if(target.status?.sourceDeathHandled)return;target.status.sourceDeathHandled=true;
  if(killer?.combatRawcode==='h0CZ')killer.hp=Math.min(killer.maxHp,killer.hp+target.maxHp*.6);
  if(killer?.combatRawcode==='h03B')buff(killer,{...compile('A02V'),buffKey:'skeleton-buff'},killer,game.state.time);
  if(['n0SC','n0SD'].includes(target.combatRawcode))for(const t of game.state.entities)if(t.hp>0&&t.side!==target.side&&t.battleTeam===target.battleTeam&&dist(t,target)<=3*target.distanceScale)sourceDamage(game,t,target.combatRawcode==='n0SC'?8:26,target,false);
  if(target.combatRawcode==='H08U'){
    const def=TEMPLATES.H08U;if(def){const n=summon(game,target,def,0,{isSummon:false,reward:target.reward,isBoss:target.isBoss});if(n){n.status={...target.status,sourceDeathHandled:false,deathCounted:false};n.hp=n.maxHp;n.ability=null;game._event('revive',n,'重新生成');}}
  }
}
function wf(w,key,fallback=0){return num(w[key]??w[key+'1'],fallback);}
function weaponSecondary(game,e,target,battle,dealt) {
  const weapon=sourceWeapon(e,target);if(!weapon)return;const w=Object.fromEntries(Object.entries(weapon.raw).map(([k,v])=>[k.endsWith(String(weapon.slot))?k.slice(0,-1):k,v])),type=weapon.type;if(!type)return;
  const hit=(t,amount)=>{const a=game._auraEffects(t,game._battleAuras?.[t.battleTeam]??[]);game._hurt(t,amount*game._typeMultiplier(weapon.attackType,t.armorType)*game._armorFactor(game._effectiveArmor(t,a.armor)),e,{spell:true,weapon:true});};
  const count=wf(w,'targCount',1),loss=wf(w,'damageLoss'),radius=wf(w,'Farea')/100*e.distanceScale;
  if(type==='mbounce'&&count>1){let previous=target;const used=new Set([target.id]);for(let i=1;i<count;i++){const next=battle.filter(t=>t.hp>0&&t.side!==e.side&&!used.has(t.id)&&dist(previous,t)<=radius&&canWeaponTarget(e,t)).sort((a,b)=>dist(previous,a)-dist(previous,b))[0];if(!next)break;hit(next,dealt*Math.pow(1-loss,i));game._event('chain',next,'弹射',{fromWorldX:previous.worldX,fromWorldY:previous.worldY});used.add(next.id);previous=next;}}
  if(['msplash','artillery','aline','mline'].includes(type)){
    const medium=wf(w,'Harea')/100*e.distanceScale,outer=wf(w,'Qarea')/100*e.distanceScale;
    for(const t of battle){if(t.id===target.id||t.hp<=0||t.side===e.side||!matchesTargets({targets:String(w.splashTargs??'enemies').split(',')},e,t))continue;let factor=0;
      if(type.endsWith('line')){const a=pos(e),b=pos(target),p=pos(t),len=dist(e,target)||1,along=((p.x-a.x)*(b.x-a.x)+(p.y-a.y)*(b.y-a.y))/len,across=Math.abs((p.x-a.x)*(b.y-a.y)-(p.y-a.y)*(b.x-a.x))/len;if(along>0&&along<=Math.max(e.range,wf(w,'spillDist')/100*e.distanceScale)&&across<=wf(w,'spillRadius')/100*e.distanceScale)factor=1;}
      else{const d=dist(t,target);factor=d<=radius?1:d<=medium?wf(w,'Hfact'):d<=outer?wf(w,'Qfact'):0;}
      if(factor>0)hit(t,dealt*factor);
    }
  }
}
export function sourceMoveFactor(game,e,battle){const aura=sourceAuraEffects(game,e,battle.auras??[]);let factor=1+aura.move;for(const s of active(e))if(s.kind==='defend')factor+=s.move;return (e.status.rootUntil??0)>game.state.time?0:Math.max(.05,factor);}
