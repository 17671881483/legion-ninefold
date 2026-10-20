import { RULES } from './data.js';
import { WORKBOOK_ABILITIES, WORKBOOK_UNIT_TEMPLATES } from './workbook-reference.js';
import { V14_ABILITIES, V14_UNIT_TEMPLATES } from './v14-reference.js';

// Values come from resolved object fields. Empty fields remain empty: a missing
// native default is reported, rather than replacing it with tooltip numbers.
const num = (v, d = 0) => v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : d;
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const pos = e => ({x:e.worldX??e.x,y:e.worldY??e.y});
const dist = (a,b) => Math.hypot(pos(a).x-pos(b).x,pos(a).y-pos(b).y);
const raw = u => u.combatRawcode ?? u.rawcode ?? u.sourceRawcode ?? u.unitId;
const cache = new Map();
const versionOf = def => def?.skillVersion==='v14.1A5'||def?.provenance==='v14.1A5-dataset'||/v?14\.1A5/i.test(String(def?.sourceVersion??''))||String(def?.id??def?.unitId??'').startsWith('v14_')?'v14.1A5':'5.0dJF';
const isV14 = def => versionOf(def)==='v14.1A5';
const isNativeHero = entity => entity.isNativeHero ?? entity.isHero;
const templatesFor = def => isV14(def)?V14_UNIT_TEMPLATES:WORKBOOK_UNIT_TEMPLATES;
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
function compile(id,version='5.0dJF') {
  const key=version+':'+id,ABILITIES=version==='v14.1A5'?V14_ABILITIES:WORKBOOK_ABILITIES,TEMPLATES=version==='v14.1A5'?V14_UNIT_TEMPLATES:WORKBOOK_UNIT_TEMPLATES;
  if(cache.has(key))return cache.get(key);
  const a=ABILITIES[id]; if(!a)return {id,name:id,status:'unresolved',kind:'pending',effectText:'技能对象未提取，未增加猜测效果',cooldown:0,manaCost:0};
  const f=fields(a),n=k=>num(f[k+'1']),has=k=>f[k+'1']!==undefined,A=n('DataA'),B=n('DataB'),C=n('DataC'),D=n('DataD'),E=n('DataE');
  const s={id,version,name:a.name??id,base:a.base_code,fields:f,description:a.description??a.tooltip_text??'',status:'implemented',kind:'pending',cooldown:n('Cool'),manaCost:n('Cost'),duration:n('Dur'),heroDuration:n('HeroDur'),range:n('Rng')/100,radius:n('Area')/100,targets:String(f.targs1??'_').split(','),buffKey:String(f.BuffID1??id).split(',')[0],A,B,C,D,E};
  switch(a.base_code){
    case 'AOcr':s.kind='crit';s.chance=A/100;s.multiplier=B;break;
    case 'AHbh':s.kind='bash';s.chance=A/100;s.damage=C;break;
    case 'AEev':s.kind='evasion';s.chance=A;break;
    case 'Aspo':case 'Aven':s.kind='poison';s.dps=A;s.move=-B;s.haste=-C;break;
    case 'Afra':case 'Afrb':s.kind='cold';s.haste=version==='v14.1A5'?-num(RULES.frostAttackSpeedDecrease,.2):-.1;s.move=version==='v14.1A5'?-num(RULES.frostMoveSpeedDecrease,.2):-.1;s.effectText=`冰冻命中：按原图Misc全局值降低${-s.haste*100}%攻速、${-s.move*100}%移速，持续${s.duration}秒`;break;
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
    case 'Avul':s.kind='invulnerability';s.effectText='原生无敌：免疫伤害并被九倍脚本范围选择器排除';break;
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
    case 'AUcs':s.kind='wave';s.damage=A;s.damageCap=B;s.length=C/100;s.width=D/100;break;
    case 'AOsh':s.kind='wave';s.damage=A;s.length=C/100;s.width=D/100;break;
    case 'AEfk':s.kind='knives';s.damage=A;s.damageCap=B;s.targetCap=C;break;
    case 'AUfn':s.kind='nova';s.damage=B;s.areaDamage=A;break;
    case 'ANbf':case 'ACbf':s.kind='breath';s.damage=A;s.dps=E;s.length=C/100;s.width=D/100;break;
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
    case 'ACtb':case 'AHtb':s.kind='bolt';s.damage=A;s.stun=true;break;
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
  if(version!=='v14.1A5'&&id==='A01I'){s.kind='mana_strike';s.status='implemented';s.effectText='攻击启动时记录当前魔法值×3，0.633秒后对原目标追加魔法伤害（JASS）';}
  if(version!=='v14.1A5'&&id==='A06O'){s.kind='attack_charge_heal';s.status='implemented';s.effectText='攻击启动：魔法已满则回复25生命并清空魔法，否则魔法+1（JASS，非固定三次）';}
  if(version!=='v14.1A5'&&id==='A0BH'){s.kind='aura_heartstopper';s.status='implemented';s.effectText='JASS每秒直接扣最大生命1.2%；仅对生命>2%的目标，最低保留1%生命，不是文案1%';}
  if(version==='v14.1A5'){
    if(a.base_code==='Asth'){s.kind='pending';s.status='unresolved';s.effectText='v14.1A5脚本标记：尚未逐项核定对应JASS，不沿用5.0dJF同ID效果';}
    if(a.base_code==='ANcl'&&!['A008','A118'].includes(id)){s.kind='pending';s.status='unresolved';s.effectText='v14.1A5通道或脚本指令：待核定对应运行脚本';}
    if(id==='A01I'){s.kind='mana_strike_hit';s.status='implemented';s.effectText='JASS伤害事件达到100时，立即追加当前魔法×3的普通攻击/通用伤害；不套用旧版延迟攻击逻辑';}
    if(id==='A06O'){s.kind='attack_charge_heal';s.status='implemented';s.heal=80;s.effectText='攻击启动时满魔则回复80生命并清空魔法，否则魔法+1（v14.1A5 JASS）';}
    if(id==='A0BH'){s.kind='pending';s.status='unresolved';s.effectText='v14.1A5尚未核定该图标的周期扣血脚本，不套用5.0dJF的1.2%逻辑';}
    if(id==='A0SB'){s.kind='death_explosion';s.status='implemented';s.damage=26;s.radius=3;s.effectText='死亡时300范围敌军受到26点普通攻击/火焰伤害（v14.1A5 JASS）';}
    if(['heal','heal_wave','wave','breath','bolt','forked','chain_spell','stomp','immolation'].includes(s.kind)&&!has('DataA')){s.status='unresolved';s.effectText='v14原生效果字段DataA1缺失，可能由专属脚本另行结算；未按零效果宣称已实现';}
    if(id==='Adef'){s.status='unresolved';s.effectText='v14原生主动防御：需要开盾指令才生效；尚无通用自动开盾证据且Web未提供手动开关，默认不激活，不当作常驻减伤/减速';}
    if(id==='A07N'){s.activation='captain_attack';s.magicFactor=E;s.effectText='近卫兵h09P/h19P攻击启动时按JASS自动举盾；生效后穿刺承伤×0.6、魔法承伤×0.8，移速降低30%；未攻击前不生效';}
    if(id==='A2YI'){s.kind='ysera_revival';s.status='implemented';s.effectText='翡翠复苏按原JASS伤害事件触发：满次数/18秒CD只约束致命分支，当前生命≤30%分支可绕过；触发时设为5%生命、沉睡3秒并减伤80%，醒来回复25%最大生命。已死亡单位不复活';}
    if(id==='A2YH'){s.kind='ysera_corrosion';s.status='implemented';s.duration=4;s.heroDuration=4;s.armor=-2;s.effectText='攻击启动或实际伤害命中时，使敌军护甲-2，持续4秒；同一技能刷新期限，不重复叠甲（v14.1A5 JASS）';}
    if(id==='A1TN')s.effectText=`原生对象实际制造${s.count}个镜像，输出${s.outgoing*100}%、承伤${s.incoming}倍，持续${s.duration}秒，冷却${s.cooldown}秒；原文案数量/时长不符` ;
    if(id==='A1TP'){s.kind='fixed_totem';s.status='implemented';s.radius=3;s.heal=100;s.targets=['friend'];s.effectText='每次施法在当时坐标建立固定图腾区：每1秒为300范围友军回复100生命，施法者死亡后结束；多次施法分别计时';}
    if(id==='A1TQ'){s.kind='charging_wave';s.status='implemented';s.damage=100;s.length=12;s.radius=3;s.duration=.4;s.targets=['enemies'];s.effectText='独立冲锋虚体按1200距离/0.4秒配置每40毫秒推进120（末步前销毁，实际回调位置120至1080），每次施法对300范围敌军仅造成一次100点混乱攻击/通用伤害；施法者不位移';}
    if(id==='A1TT'){s.kind='x9_sapper';s.status='implemented';s.damage=5;s.deathDamage=56;s.radius=2;s.deathRadius=3;s.targets=['enemies'];s.effectText='九倍创建钩子：每1秒对200范围敌军造成5点混乱攻击/通用伤害；死亡对300范围敌军造成56点伤害；不使用88伤害文案';}
  }
  if(s.kind==='summon'&&!TEMPLATES[s.summonId]){s.status='unresolved';s.effectText=`召唤模板${s.summonId??'未指定'}缺失`;}
  if(['crit','evasion','hardened','demolish','orb','barrage','pulverize'].includes(s.kind)&&!has('DataA')&&!has('DataB')){s.status='unresolved';s.effectText='缺少原生效果数据，不应用空值默认';}
  if(s.kind==='spell_orb'&&compile(s.spellId,version).status!=='implemented'){s.status='unresolved';s.effectText=`触发子技能${s.spellId}未核定，未计入已实现`; }
  s.effectText??=effectSummary(s);
  cache.set(key,s);return s;
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
  else if(s.kind==='summon')parts.push(`召唤${s.count}个${(s.version==='v14.1A5'?V14_UNIT_TEMPLATES:WORKBOOK_UNIT_TEMPLATES)[s.summonId]?.name??s.summonId}，存活${s.duration}秒`);
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
const V14_TRIGGER_DESCRIPTIONS={n0S4:'伤害事件>0时追加受害者当前生命3%的普通攻击/通用伤害（两倍模式分支为2%，不用于九倍）',n0S6:'伤害事件>40时，对英雄追加当前生命1%、其他单位追加最大生命1%的普通攻击/普通伤害',n0SC:'死亡时300范围敌军受到8点普通攻击/火焰伤害',h0CZ:'击杀时回复死者最大生命50%',h03B:'攻击启动30%概率自施2秒狂热与增益，击杀时追加增益',h0OC:'攻击启动30%概率自施2秒狂热与增益，击杀时追加增益',H08U:'死亡后原位置重新生成同类型单位'};
export function compileSkills(def) {const scale=def.distanceScale??1,version=versionOf(def);return [...new Set(def.abilityIds??def.sourceAbilityIds??(def.sourceAbilities??[]).map(a=>a.rawcode??a.id))].filter(Boolean).map(id=>compile(id,version)).map(s=>({...s,...Object.fromEntries(['range','radius','length','width','inner','outer','outerRadius','deathRadius'].filter(k=>s[k]!==undefined).map(k=>[k,s[k]*scale]))}));}
export function describeSkills(def) {const list=compileSkills(def).map(s=>({id:s.id,name:s.name,description:s.description,status:s.status,effectText:s.effectText,cooldown:s.cooldown,manaCost:s.manaCost,duration:s.duration,range:s.range,radius:s.radius}));const r=raw(def),descriptions=isV14(def)?V14_TRIGGER_DESCRIPTIONS:TRIGGER_DESCRIPTIONS;if(descriptions[r])list.push({id:'trigger:'+r,name:'脚本机制',description:descriptions[r],effectText:descriptions[r],status:'implemented',cooldown:0,manaCost:0});return list;}
export function skillCoverage(def) {const list=describeSkills(def);return {implemented:list.filter(s=>s.status==='implemented').length,markers:list.filter(s=>s.status==='marker').length,unresolved:list.filter(s=>s.status==='unresolved').length};}
export function attachSkills(e,def) {
  e.skillVersion=versionOf(def);e.sourceVersion=def.sourceVersion??e.sourceVersion;e.combatRawcode=raw(def);e.skillSpecs=compileSkills(def);e.skillStates={};e.buffs=[];e.skillSource=!!def.abilityIds;e.weapon1=def.weapon1??{};e.weapon2=def.weapon2??{};e.sourceRawFields=def.sourceRawFields??{};e.sourceArmorTypeRaw=def.sourceArmorTypeRaw??e.sourceRawFields.defType??e.sourceArmorTypeRaw;e.distanceScale=def.distanceScale??1;
  const f=e.sourceRawFields;e.isHero=!!(e.isHero||def.hero||def.isHero||['STR','AGI','INT'].includes(f.Primary));e.maxMana=num(def.maxMana??def.mana??f.manaN);e.mana=clamp(num(def.initialMana??def.manaStart??f.mana0,e.maxMana),0,e.maxMana);e.manaRegen=num(def.manaRegen??f.regenMana);e.hpRegen=num(def.hpRegen??f.regenHP);e.targetType=def.targetType??f.targType??(f.movetp==='fly'?'air':'ground');e.traits=String(def.traits??def.unitType??f.type??'').split(',');e.isBuilding=!!(e.isBuilding||def.isBuilding||num(f.isbldg));e.nativeInvulnerable=e.skillSpecs.some(s=>s.status==='implemented'&&s.kind==='invulnerability');e.invulnerable=e.nativeInvulnerable;e.isStaticObstacle=!!(isV14(def)&&e.isBuilding&&f.pathTex&&!num(f.spd));if(e.isStaticObstacle)e.moveSpeed=0;
  // Altar heroes are giant units in the source, with a separate UI category.
  if(isV14(def)&&def.heroFamily)e.isNativeHero=['STR','AGI','INT'].includes(f.Primary);
  for(const s of e.skillSpecs)e.skillStates[s.id]={readyAt:0,casts:0,...(s.kind==='x9_sapper'&&Number.isFinite(e.createdAt)?{nextPulseAt:e.createdAt+1}:{})};
}
export function matchesTargets(s,source,target) {
  if(source.side!==target.side&&scriptInvulnerable(target))return false;
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
  if(source.side!==target.side&&scriptInvulnerable(target))return null;
  if(isV14(source)&&source.isBuilding&&source.sourceRawFields?.weapsOn===undefined)return null;
  const explicit=source.skillSource;for(const slot of [1,2]){const w=slot===1?source.weapon1:source.weapon2;if(!w||!Object.keys(w).length)continue;const type=w[`weapTp${slot}`],mask=num(w.weapsOn,source.sourceRawFields?.weapsOn??1);if(!(mask&(1<<(slot-1)))||!type||type==='_')continue;const targets=String(w[`targs${slot}`]??'_').split(',');if(!matchesTargets({targets},source,target))continue;
    return {slot,raw:w,type,range:num(w[`rangeN${slot}`],source.range*100/(source.distanceScale||1))/100*(source.distanceScale??1),interval:num(w[`cool${slot}`],source.attackInterval),attackType:w[`atkType${slot}`]??source.attackType,damage:slot===1?source.damage:num(w.dmgplus2)+num(w.dice2)*(num(w.sides2)+1)/2};
  }
  return explicit?null:{slot:1,raw:{},type:'normal',range:source.range,interval:source.attackInterval,attackType:source.attackType,damage:source.damage};
}
export function canWeaponTarget(source,target){return !!sourceWeapon(source,target);}

function active(e){return (e.skillSpecs??[]).filter(s=>s.status==='implemented');}
function state(e,s){return e.skillStates[s.id]??=( {readyAt:0,casts:0});}
function buff(e,s,source,now,extra={}){if(source.side!==e.side&&active(e).some(a=>a.kind==='immunity')&&(['Aslo','AEer','Acri','ANdh','Auhf','AUfn','ANcs','AHtb','AOcl'].includes(s.base)))return false;e.buffs??=[];const key=extra.key??s.buffKey??s.id;const b={key,skillId:s.id,ownerId:source.ownerId,sourceId:source.id,expiresAt:now+(isNativeHero(e)?s.heroDuration||s.duration:s.duration),damage:s.damage??0,armor:s.armor??0,move:s.move??0,haste:s.haste??0,regen:s.regen??0,dps:s.dps??0,miss:s.miss??0,incoming:s.incoming??0,disarm:s.base==='AEer',...extra};const old=e.buffs.findIndex(v=>v.key===key);if(old>=0)e.buffs[old]=b;else e.buffs.push(b);}
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
  const factor=magic?game._typeMultiplier(isV14(source)?'spells':'magic',target.armorType,target.sourceArmorTypeRaw??target.sourceRawFields?.defType):game._typeMultiplier(source?.attackType??'normal',target.armorType,target.sourceArmorTypeRaw??target.sourceRawFields?.defType)*game._armorFactor(game._effectiveArmor(target,a.armor));
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
  if(!isV14(e)&&e.combatRawcode==='h08B'&&e.status.burrowEnd&&now>=e.status.burrowEnd){e.invulnerable=false;e.status.burrowEnd=0;buff(e,compile('A06Z',e.skillVersion),e,now);}
  for(const job of e.status.pendingStrikes??[]){if(job.at<=now){const t=game._worldEntities?.get(job.targetId);if(t?.hp>0)sourceDamage(game,t,job.damage,e,true);job.done=true;}}
  e.status.pendingStrikes=(e.status.pendingStrikes??[]).filter(j=>!j.done);
  // The creation-hook sapper timer continues while its unit is stunned.
  for(const s of active(e))if(s.kind==='x9_sapper'){const st=state(e,s);st.nextPulseAt??=now+1;while(st.nextPulseAt<=now+1e-8){for(const t of scriptTargets(game,e,e,s.radius,false))universalDamage(game,t,s.damage,e);st.nextPulseAt+=1;}}
  if((e.status.stunUntil??0)>now||(e.invulnerable&&!e.nativeInvulnerable))return;
  for(const s of active(e)){
    const st=state(e,s);if(st.readyAt>now)continue;
    if(s.kind==='x9_sapper')continue;
    if(s.kind==='fixed_totem'||s.kind==='charging_wave'){
      const enemy=battle.find(t=>t.hp>0&&t.side!==e.side&&!scriptInvulnerable(t)&&dist(e,t)<=Math.max(s.range,e.acquisitionRange??0));if(!enemy||!cast(game,e,s,enemy,battle))continue;
      const origin=pos(e),p=pos(enemy),d=dist(e,enemy)||1,source=scriptSource(e);game.state.sourceSkillJobs??=[];
      if(s.kind==='fixed_totem')game.state.sourceSkillJobs.push({type:'fixed_totem',sourceId:e.id,source,x:origin.x,y:origin.y,radius:s.radius,heal:s.heal,nextAt:now+1});
      else game.state.sourceSkillJobs.push({type:'charging_wave',sourceId:e.id,source,x:origin.x,y:origin.y,vx:(p.x-origin.x)/d,vy:(p.y-origin.y)/d,length:s.length,radius:s.radius,damage:s.damage,startAt:now,duration:s.duration,nextAt:now,traveled:0,hitIds:[]});
      continue;
    }
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
      if(cast(game,e,s,null,battle)){if(isV14(e)&&s.kind==='mirror')e.buffs=[];for(let i=0;i<Math.min(24,s.count);i++){const TEMPLATES=templatesFor(e),def=s.kind==='mirror'?TEMPLATES[e.combatRawcode]:TEMPLATES[s.summonId];const n=summon(game,e,def,s.duration);if(n&&s.kind==='mirror'){n.damage*=s.outgoing;n.status.incomingMultiplier=s.incoming;n.skillSpecs=[];n.isIllusion=true;}}}continue;
    }
    if(s.kind==='burrow'){
      if(isV14(e)||e.combatRawcode!=='h08B'||e.hp>e.maxHp*.75||!battle.some(t=>t.side!==e.side&&dist(e,t)<3))continue;
      if(cast(game,e,s,null,battle)){e.invulnerable=true;e.status.burrowEnd=now+s.duration;e.status.stunUntil=now+s.duration;}continue;
    }
    if(['heal','heal_wave','buff','guardian'].includes(s.kind)){
      let friends=targets(e,s,battle,true);
      if(s.kind==='guardian')friends=battle.filter(t=>t.hp>0&&t.ownerId===e.ownerId&&t.id!==e.id&&dist(e,t)<=1.6*e.distanceScale&&!t.skillSpecs?.some(a=>a.id==='A060'));
      else if(s.kind==='heal'||s.kind==='heal_wave')friends=friends.filter(t=>t.hp<t.maxHp).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp);
      else friends=friends.filter(t=>!(t.buffs??[]).some(b=>b.key===s.buffKey&&b.expiresAt>now+1)).sort((a,b)=>b.damage-a.damage);
      if(!friends.length)continue;if(!cast(game,e,s,friends[0],battle))continue;
      if(s.kind==='guardian'){for(const t of friends)for(const id of ['A060','A063','A065']){const a=compileSkills({abilityIds:[id],skillVersion:e.skillVersion,distanceScale:e.distanceScale})[0];if(a.status==='implemented'){t.skillSpecs.push(a);t.skillStates[id]={readyAt:0,casts:0};}}}
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
      affected=lineTargets(e,s,target,battle);
    }else if(s.kind==='nova'||s.kind==='cluster')affected=battle.filter(t=>t.hp>0&&t.side!==e.side&&matchesTargets(s,e,t)&&dist(t,target)<=s.radius);
    else affected=enemies.filter(t=>dist(e,t)<=s.radius);
    if(s.targetCap>0)affected=affected.slice(0,s.targetCap);
    let budget=s.damageCap>0?s.damageCap:Infinity;
    for(const t of affected){const hit=s.kind==='nova'?(t.id===target.id?s.damage:0)+s.areaDamage:s.kind==='cluster'?s.damage*s.count:s.damage;sourceDamage(game,t,Math.min(hit,budget),e,true);budget-=hit;if(s.stun)buff(t,s,e,now,{stun:true,dps:0});else if(s.duration)buff(t,s,e,now,{damage:0});if(budget<=0)break;}
  }
}
export function sourceAttackStart(game,e,target) {
  applyYseraCorrosion(game,e,target);
  if(isV14(e)&&['h09P','h19P'].includes(e.combatRawcode))for(const s of active(e))if(s.kind==='defend'&&s.activation==='captain_attack')state(e,s).active=true;
  if(!isV14(e)&&e.combatRawcode==='h04N'){e.status.pendingStrikes??=[];e.status.pendingStrikes.push({at:game.state.time+.633,targetId:target.id,damage:Math.trunc(e.mana*3)});}
  if((!isV14(e)&&e.combatRawcode==='h081')||(isV14(e)&&active(e).some(s=>s.id==='A06O'))){if(e.mana>=e.maxMana){e.hp=Math.min(e.maxHp,e.hp+(isV14(e)?80:25));e.mana=0;}else e.mana=Math.min(e.maxMana,e.mana+1);}
  if((e.combatRawcode==='h03B'||isV14(e)&&e.combatRawcode==='h0OC')&&!(e.buffs??[]).some(b=>b.key==='skeleton-frenzy')&&game._random()<.3){buff(e,{...compile('A0RA',e.skillVersion),buffKey:'skeleton-frenzy'},e,game.state.time);buff(e,{...compile('A02V',e.skillVersion),buffKey:'skeleton-buff'},e,game.state.time);}
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
    if(s.kind==='spell_orb'&&game._random()<s.chance){const child=compileSkills({abilityIds:[s.spellId],distanceScale:e.distanceScale,skillVersion:e.skillVersion})[0];if(child.status==='implemented'&&(!isV14(e)||cast(game,e,child,target,battle)))executeTriggeredSpell(game,e,child,target,battle);}
  }
  weaponSecondary(game,e,target,battle,rawDamage);
}
function lineTargets(e,s,target,battle){
  const origin=pos(e),p=pos(target),len=Math.max(s.length,s.range),vx=(p.x-origin.x)/(dist(e,target)||1),vy=(p.y-origin.y)/(dist(e,target)||1);
  return battle.filter(t=>{const q=pos(t),dx=q.x-origin.x,dy=q.y-origin.y,along=dx*vx+dy*vy,across=Math.abs(dx*vy-dy*vx),width=s.base==='AUcs'?s.radius+(s.width-s.radius)*clamp(along/len,0,1):Math.max(s.radius,s.width);return t.hp>0&&t.side!==e.side&&matchesTargets(s,e,t)&&along>=0&&along<=len&&across<=width;});
}
export function executeTriggeredSpell(game,e,s,target,battle){
  if(!matchesTargets(s,e,target)||active(target).some(a=>a.kind==='immunity'))return;
  if(s.kind==='debuff'||s.kind==='root'){buff(target,s,e,game.state.time,{root:s.kind==='root'});return;}
  if(s.kind==='wave'){let budget=s.damageCap>0?s.damageCap:Infinity;for(const t of lineTargets(e,s,target,battle)){const amount=Math.min(s.damage,budget);sourceDamage(game,t,amount,e,true);budget-=amount;if(budget<=0)break;}return;}
  if(s.kind==='forked'){const chosen=[target,...battle.filter(t=>t.id!==target.id&&t.hp>0&&t.side!==e.side&&matchesTargets(s,e,t)&&dist(e,t)<=s.range&&dist(t,target)<=Math.max(s.radius,s.D/100*e.distanceScale)).sort((a,b)=>dist(target,a)-dist(target,b)).slice(0,Math.max(0,s.count-1))];for(const t of chosen){sourceDamage(game,t,s.damage,e,true);game._event('chain',t,s.name,{fromWorldX:e.worldX,fromWorldY:e.worldY});}return;}
  if(s.kind==='chain_spell'){
    let previous=target,damage=s.damage;const used=new Set();for(let i=0;i<Math.max(1,s.count);i++){const t=i===0?target:battle.filter(t=>t.hp>0&&t.side!==e.side&&!used.has(t.id)&&matchesTargets(s,e,t)&&dist(previous,t)<=s.radius&&!active(t).some(a=>a.kind==='immunity')).sort((a,b)=>dist(previous,a)-dist(previous,b))[0];if(!t)break;sourceDamage(game,t,damage,e,true);game._event('chain',t,s.name,{fromWorldX:previous.worldX,fromWorldY:previous.worldY});used.add(t.id);previous=t;damage*=1-s.loss;}return;
  }
  sourceDamage(game,target,s.damage??0,e,true);if(s.stun)buff(target,s,e,game.state.time,{stun:true,damage:0});
}
export function modifyIncoming(game,target,damage,attacker,options={}) {
  if(target.invulnerable||active(target).some(s=>s.kind==='invulnerability'))return 0;let result=damage;
  for(const s of active(target)){
    if(options.magic&&s.kind==='immunity')return 0;
    if(!options.spell&&s.kind==='evasion'&&game._random()<s.chance)return 0;
    if(!options.spell&&s.kind==='brawler'&&game._random()<s.evasion)return 0;
    if(!options.spell&&s.kind==='hardened'&&game._random()<s.chance)result=Math.max(s.minimum,result-s.reduction);
    if(s.kind==='defend'&&(!isV14(target)||target.skillStates?.[s.id]?.active)){if(!options.spell&&attacker?.attackType==='pierce')result*=s.pierceFactor;if(isV14(target)&&(options.magic||attacker?.attackType==='magic')&&s.magicFactor>0)result*=s.magicFactor;}
    if(s.kind==='carapace'&&s.incomingFactor>0)result*=s.incomingFactor;
    if(s.kind==='shield'&&s.damagePerMana>0){const absorb=Math.min(result*s.absorb,target.mana*s.damagePerMana);target.mana-=absorb/s.damagePerMana;result-=absorb;}
  }
  for(const b of target.buffs??[])if(b.expiresAt>game.state.time)result*=1+(b.incoming??0);
  result*=target.status?.incomingMultiplier??1;
  if(isV14(target)&&result>0&&target.hp>0&&active(target).some(s=>s.kind==='ysera_revival')){
    const now=game.state.time,status=target.status??={};
    if((status.yseraSleepingUntil??0)>now)return result*.2;
    // Original JASS precedence is (count<2 && !cooldown && lethal) || lowHP.
    const lethal=target.hp-result<=1,low=target.hp<=target.maxHp*.3;
    if(((status.yseraRevivalCount??0)<2&&(status.yseraRevivalCooldownUntil??0)<=now&&lethal)||low){
      status.yseraRevivalCount=(status.yseraRevivalCount??0)+1;status.yseraRevivalCooldownUntil=now+18;status.yseraSleepingUntil=now+3;status.stunUntil=Math.max(status.stunUntil??0,now+3);target.hp=Math.max(1,target.maxHp*.05);
      game.state.sourceSkillJobs??=[];game.state.sourceSkillJobs.push({type:'ysera_wake',sourceId:target.id,at:now+3});game._event('cast',target,'翡翠复苏');return 0;
    }
  }
  return result;
}
export function afterSourceDamage(game,target,actual,attacker,options={}) {
  if(!attacker||actual<=0)return;
  applyYseraCorrosion(game,attacker,target);
  if(!options.spell&&attacker.hp>0&&attacker.range<=1.28){const selfThorns=active(target).filter(s=>s.kind==='carapace').reduce((v,s)=>v+s.fraction,0);const aura=sourceAuraEffects(game,target,game._battleAuras?.[target.battleTeam]??[]);if(aura.thorns||aura.thornsFlat||selfThorns)game._hurt(attacker,actual*(aura.thorns+selfThorns)+aura.thornsFlat,target,{spell:true,reflected:true});}
  if(options.scripted||options.reflected)return;
  if(isV14(attacker)){
    if(active(attacker).some(s=>s.id==='A01I')&&actual>=100&&target.hp>0)universalDamage(game,target,attacker.mana*3,attacker);
    if(attacker.combatRawcode==='n0S4'&&target.hp>0)universalDamage(game,target,target.hp*.03,attacker);
    if(attacker.combatRawcode==='n0S6'&&actual>40&&target.hp>0){const amount=(isNativeHero(target)?target.hp:target.maxHp)*.01,a=game._auraEffects(target,game._battleAuras?.[target.battleTeam]??[]);game._hurt(target,amount*game._typeMultiplier('normal',target.armorType,target.sourceArmorTypeRaw??target.sourceRawFields?.defType)*game._armorFactor(game._effectiveArmor(target,a.armor)),attacker,{spell:true,scripted:true});}
    return;
  }
  if(attacker.combatRawcode==='n0S4'&&target.hp>0)game._hurt(target,target.hp*.03,attacker,{spell:true,scripted:true});
  if(attacker.combatRawcode==='n0S6'&&target.hp>0&&!active(target).some(s=>s.kind==='immunity'))game._hurt(target,target.maxHp*.01*game._typeMultiplier('magic',target.armorType,target.sourceArmorTypeRaw??target.sourceRawFields?.defType),attacker,{magic:true,spell:true,scripted:true});
}
export function sourceDeath(game,target,killer) {
  if(target.status?.sourceDeathHandled)return;target.status.sourceDeathHandled=true;
  if(killer?.combatRawcode==='h0CZ')killer.hp=Math.min(killer.maxHp,killer.hp+target.maxHp*(isV14(killer)?.5:.6));
  if(killer?.combatRawcode==='h03B'||isV14(killer)&&killer?.combatRawcode==='h0OC')buff(killer,{...compile('A02V',killer.skillVersion),buffKey:'skeleton-buff'},killer,game.state.time);
  if(isV14(target)){
    for(const s of active(target))if(s.kind==='x9_sapper')for(const t of scriptTargets(game,target,target,s.deathRadius,false))universalDamage(game,t,s.deathDamage,target);
    const explosion=target.combatRawcode==='n0SC'?8:active(target).some(s=>s.id==='A0SB')?26:0;
    if(explosion)for(const t of scriptTargets(game,target,target,3*target.distanceScale,false)){const a=game._auraEffects(t,game._battleAuras?.[t.battleTeam]??[]);game._hurt(t,explosion*game._typeMultiplier('normal',t.armorType,t.sourceArmorTypeRaw??t.sourceRawFields?.defType),target,{spell:true,scripted:true});}
  }
  if(!isV14(target)&&['n0SC','n0SD'].includes(target.combatRawcode))for(const t of game.state.entities)if(t.hp>0&&t.side!==target.side&&t.battleTeam===target.battleTeam&&dist(t,target)<=3*target.distanceScale)sourceDamage(game,t,target.combatRawcode==='n0SC'?8:26,target,false);
  if(target.combatRawcode==='H08U'){
    const def=templatesFor(target).H08U;if(def){const n=summon(game,target,def,0,{isSummon:false,reward:target.reward,isBoss:target.isBoss});if(n){n.status={...target.status,sourceDeathHandled:false,deathCounted:false};n.hp=n.maxHp;n.ability=null;game._event('revive',n,'重新生成');}}
  }
}
function wf(w,key,fallback=0){return num(w[key]??w[key+'1'],fallback);}
function weaponSecondary(game,e,target,battle,dealt) {
  const weapon=sourceWeapon(e,target);if(!weapon)return;const w=Object.fromEntries(Object.entries(weapon.raw).map(([k,v])=>[k.endsWith(String(weapon.slot))?k.slice(0,-1):k,v])),type=weapon.type;if(!type)return;
  const hit=(t,amount)=>{const a=game._auraEffects(t,game._battleAuras?.[t.battleTeam]??[]);game._hurt(t,amount*game._typeMultiplier(weapon.attackType,t.armorType,t.sourceArmorTypeRaw??t.sourceRawFields?.defType)*game._armorFactor(game._effectiveArmor(t,a.armor)),e,{spell:true,weapon:true});};
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
export function sourceMoveFactor(game,e,battle){const aura=sourceAuraEffects(game,e,battle.auras??[]);let factor=1+aura.move;for(const s of active(e))if(s.kind==='defend'&&(!isV14(e)||e.skillStates?.[s.id]?.active))factor+=s.move;return (e.status.rootUntil??0)>game.state.time?0:Math.max(.05,factor);}

// v14.1A5 JASS X9SkillOne/Two and X9WoodSkillTwo (raw lines 35652–35787).
function applyYseraCorrosion(game,source,target){
  if(!isV14(source)||!target||target.hp<=0||target.side===source.side||scriptInvulnerable(target))return;
  const s=active(source).find(s=>s.kind==='ysera_corrosion');if(s)buff(target,s,source,game.state.time,{key:'A2YH',damage:0,armor:-2});
}
function scriptInvulnerable(e){return e.invulnerable||active(e).some(s=>s.kind==='invulnerability');}
function scriptSource(e){return {id:e.id,ownerId:e.ownerId,side:e.side,team:e.team,battleTeam:e.battleTeam,combatRawcode:e.combatRawcode,skillVersion:e.skillVersion,attackType:'chaos',hp:e.hp};}
function scriptTargets(game,source,origin,radius,friendly){return game.state.entities.filter(t=>t.hp>0&&t.battleTeam===source.battleTeam&&(friendly?t.side===source.side:t.side!==source.side)&&!scriptInvulnerable(t)&&dist(origin,t)<=radius);}
function universalDamage(game,target,amount,source){return game._hurt(target,amount,source,{spell:true,scripted:true,universal:true});}
export function tickSourceScriptJobs(game,dt=0){
  const now=game.state.time,remaining=[];
  for(const job of game.state.sourceSkillJobs??[]){
    const live=game.state.entities.find(e=>e.id===job.sourceId),source=live??job.source;
    if(job.type==='ysera_wake'){
      if(!live||live.hp<=0)continue;
      if(job.at<=now+1e-8){live.hp=Math.min(live.maxHp,live.hp+live.maxHp*.25);live.status.yseraSleepingUntil=0;game._event('heal',live,'翡翠复苏');}else remaining.push(job);
    }else if(job.type==='fixed_totem'){
      if(!live||live.hp<=0)continue;
      while(job.nextAt<=now+1e-8){for(const t of scriptTargets(game,source,job,job.radius,true)){const amount=Math.min(job.heal,t.maxHp-t.hp);t.hp+=amount;if(amount>0)game._event('heal',t,`+${Math.round(amount)}`);}job.nextAt+=1;}
      remaining.push(job);
    }else if(job.type==='charging_wave'){
      const step=job.length/job.duration*.04;let finished=false;
      job.nextAt??=job.startAt;job.traveled??=0;
      while(job.nextAt<=now+1e-8){
        // ChargeDistanceCondition checks this bound before moving/callback.
        if(job.traveled+step>=job.length-1e-8){finished=true;break;}
        job.traveled+=step;const point={x:job.x+job.vx*job.traveled,y:job.y+job.vy*job.traveled};
        for(const t of scriptTargets(game,source,point,job.radius,false)){if(job.hitIds.includes(t.id))continue;job.hitIds.push(t.id);universalDamage(game,t,job.damage,source);game._event('chain',t,'震荡波',{fromWorldX:point.x,fromWorldY:point.y});}
        job.nextAt+=.04;
      }
      if(!finished)remaining.push(job);
    }
  }
  game.state.sourceSkillJobs=remaining;
}
