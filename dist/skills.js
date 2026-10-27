import {BROODMOTHER_RULES,broodmotherDamageBranch,tickBroodmotherJob} from './broodmother-rules.js';
import {NIGHTMARE_RULES,initializeNightmareDeployment,tickNightmareJob,nightmareMainDeath,nightmareDamagePrefix} from './nightmare-rules.js';
import {DEATH_TRIGGER_RULES,runMainUnitDeath} from './death-trigger-rules.js';
import {SKELETON_KING_RULES,skeletonKingMainDeath,isSkeletonKingJobType,tickSkeletonKingJob} from './skeleton-king-rules.js';
import {ELEMENTAL_PROC_RULES,elementalDamagePrefix,iceExplosionAttackIssued} from './elemental-proc-rules.js';
import {SOUL_TOXIN_RULES,soulToxinDamageBranch,tickSoulToxinJob,pruneSoulToxinHandles} from './soul-toxin-rules.js';
import {HUSKAR_DUEL_RULE,huskarDuelDamage,huskarDuelDeath,tickHuskarDuelJob} from './huskar-duel.js';
import {RELOCATION_RULES,RELOCATION_BOUNDARY} from './relocation-rules.js';
import {HUSKAR_RULES,huskarMainDamage,huskarAttackDamage,tickHuskarJob} from './huskar-rules.js';
import {AESARA_RULES,canAesaraCastAbility,aesaraManualSkill,castAesaraAbility,aesaraIncomingDamage,aesaraMainDamage,aesaraDamageCleanup,isAesaraJobType,tickAesaraJob,sourceAesaraDeath} from './aesara-rules.js';
import {BRIGHT_ARTHAS_RULES,canBrightArthasCastAbility,castBrightArthasAbility,tryBrightArthasAutoCast,brightArthasEventDamage,initializeBrightArthasDeployment,tickBrightArthasJob,isBrightArthasJobType,sourceBrightArthasDeath} from './bright-arthas-rules.js';
import {DARK_ARTHAS_RULES,canDarkArthasCastAbility,castDarkArthasAbility,darkArthasMainDamage,darkArthasAttackDamage,darkArthasDamageListeners,darkArthasIncomingEvent,tickDarkArthasJob,isDarkArthasJobType,sourceDarkArthasDeath} from './dark-arthas-rules.js';
import {LICH_KING_RULES,canLichKingCastAbility,castLichKingAbility,initializeLichKingDeployment,lichKingMainDeath,lichKingDeath,tickLichKingJob,isLichKingJobType} from './lich-king-rules.js';
import {VASHJ_RULES,canVashjCastAbility,castVashjAbility,tryVashjAutoCast,vashjOnAttackDamage,initializeVashjDeployment,tickVashjJob,isVashjJobType,sourceVashjDeath} from './vashj-rules.js';
import {ICE_HERO_RULES,canIceHeroCastAbility,castIceHeroAbility,tryIceHeroAutoCast,tickIceHeroJob,sourceIceHeroDeath,isIceHeroJobType} from './ice-hero-rules.js';
import {TROLL_RULES,TROLL_ACTIVE_RULES,initializeTrollUnit,canTrollCastAbility,castTrollAbility,tryTrollAutoCast,trollOnHit,trollIncomingDamage,sourceTrollDeath,tickTrollJob,isTrollJobType,trollHaste} from './troll-rules.js';
import {KELTHUZAD_RULES,KELTHUZAD_ACTIVE_RULES,registerKelthuzadSource,applyKelthuzadBuildingAlliance,kelthuzadBeforeDamage,kelthuzadOnAttackDamage,canKelthuzadCastAbility,castKelthuzadAbility,tryKelthuzadAutoCast,kelthuzadNativeSpellEffect,sourceKelthuzadDeath,tickKelthuzadJob,isKelthuzadJobType} from './kelthuzad-rules.js';
import {SOURCE_AURA_RULES,tickSourceAuraRules} from './source-aura-rules.js';
import {SOURCE_CLASS_RULES,initializeSourceClassDeployment,sourceClassBeforeDamage,sourceClassOnAttackDamage,sourceClassDeath,tickSourceClassJob,isSourceClassJobType} from './source-class-rules.js';
import { RULES } from './data.js';
import { WORKBOOK_ABILITIES, WORKBOOK_UNIT_TEMPLATES } from './workbook-reference.js';
import { V14_ABILITIES, V14_UNIT_TEMPLATES } from './v14-reference.js';
import { ALCHEMIST_ACTIVE_RULES, alchemistAfterDamage, tryAlchemistAutoCast, castAlchemistAbility, tickAlchemistJob, sourceAlchemistDeath, alchemistDeathReward } from './alchemist-rules.js';
import { garroshAfterDamage, garroshOnHit, tickGarroshJobs } from './garrosh-rules.js';
import { YSERA_ACTIVE_RULES, canYseraCastAbility, tryYseraAutoCast, castYseraAbility, tickYseraJob, sourceYseraMainDeath, sourceYseraDeath } from './ysera-rules.js';
import { NAGA_ACTIVE_RULES, initializeNagaUnit, nagaBeforeDamage, nagaIncomingDamage, nagaOnHit, tickNagaUnit, castNagaAbility, tickNagaJob, sourceNagaDeath } from './naga-active-rules.js';
import { closestWalkable, isWalkable } from './layout.js';
import { GARROSH_ACTIVE_RULES, GARROSH_PASSIVE_RULES, canGarroshCastAbility, castGarroshAbility, tryGarroshAutoCast, garroshActiveAfterDamage, sourceGarroshActiveDeath, tickGarroshActiveJob } from './garrosh-active-rules.js';
import { ILLIDAN_RULES, ILLIDAN_ACTIVE_RULES, canIllidanCastAbility, castIllidanAbility, registerIllidanSource, tickIllidanSource, illidanOnAttackHit, tryIllidanAutoCast, illidanAfterDamage, sourceIllidanDeath, tickIllidanJob, isIllidanJobType } from './illidan-rules.js';

export const SKILL_IMPLEMENTATION_REVISION = 'v14-content-20261027-v28-1';

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
const nagaScriptCasterAbilities = new Set(['A2Y0','A2Y1','A2Y5']);
const nagaRetainedCasterBoundary = '脚本仅检查非空单位、魔法和独立脚本冷却，不因死亡或眩晕拒绝自动施法；已保留清尸后的同一施法状态。原图Player8/9死亡时FlushChildHashtable及真实RemoveUnit后的原生handle行为尚未核定，未伪造重置/移除效果。';
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
    // These effects are reached from New_UnitDamaged / New_UnitAttack, rather
    // than from the marker object's tooltip (raw JASS 33074–33184, 40881–40901,
    // 41542, 42282–42289, 42576–42578 and 42725–42727).
    if(id==='A2Y1'){s.kind='naga_hurricane';s.status='partial';s.runtimeImplemented=true;s.activation='damage_event';s.manaCost=20;s.cooldown=15;s.radius=3.5;s.damage=13;s.interval=.2;s.count=25;s.pull=.2;s.targets=['enemies'];s.effectText='敌对伤害事件触发自动施法，消耗20魔法、冷却15秒；固定350范围每0.2秒造成13点混乱攻击/通用伤害并向中心牵引20码，共25次，施法者死亡后仍继续';}
    if(id==='A2Y5'){s.kind='naga_ripple';s.status='partial';s.runtimeImplemented=true;s.activation='damage_event';s.manaCost=15;s.cooldown=12;s.radius=3;s.damage=15;s.interval=1;s.count=5;s.targets=['enemies'];s.effectText='敌对伤害事件触发自动施法，实际消耗15魔法、冷却12秒；选中地点300范围当时存活敌军，每秒受到15点混乱攻击/通用伤害，共5次；JASS未施加文案中的攻速/移速削弱';}
    if(nagaScriptCasterAbilities.has(id)){s.sourceCasterBoundaryStatus='partial';s.sourceCasterBoundary=nagaRetainedCasterBoundary;s.effectText+=`【待核定：${nagaRetainedCasterBoundary}】`;}
    if(id==='A2Y6'){s.kind='naga_boon';s.status='implemented';s.radius=6;s.chance=.2;s.cooldown=5;s.effectText='受到实际普攻伤害时20%概率触发，内置冷却5秒；600范围存活非无敌友军护甲+3持续3秒，攻速+15%持续5秒，同名效果刷新而不叠加';}
    if(id==='A0TA'){s.kind='stacking_bite';s.status='implemented';s.damage=5;s.effectText='实际普攻命中时，对该攻击者/受害者组合累计5点额外混乱攻击/通用伤害：5、10、15…；换目标不清除先前目标累计值';}
    if(id==='A0JO'){s.kind='damage_mana';s.status='implemented';s.manaGain=2;s.effectText='造成敌对实际伤害事件时回复2点魔法，最高不超过最大魔法；JASS并不限于攻击启动';}
    if(id==='A0LM'){s.kind='economic_marker';s.status='implemented';s.effectText='原图qC普通怪物击杀结算：技能等级1时35%概率获得1木材；飞行怪h0OU走专属奖励分支，31波及以后不触发。本效果由经济结算统一执行';}
    if(id==='A0S3'){s.kind='hellfire_damage';s.status='implemented';s.effectText='按地狱冥火战斗体n0S4注册独立伤害事件：正伤害追加事件中受害者当时生命3%的法术攻击/通用伤害，九倍不采用1v1的2%分支；仅该独立监听在自身追加期间暂停，不能由主伤害回调的重入保护误吞';}
    if(id==='A0SA'){s.kind='death_explosion';s.status='implemented';s.effectText='沙丘之虫战斗体n0SC死亡时，300范围敌军受到8点普通攻击/火焰伤害；死亡结算统一执行，不重复叠加同名技能';}
    if(id==='A2YJ'){s.kind='form_description';s.status='marker';s.effectText='巨龙之梦为形态说明标记；实际人形、临时龙形、死亡苏醒由A2YC及对应源脚本统一处理，不额外叠加效果';}
    if(id==='A19Z'){s.kind='script_attack_level';s.status='implemented';s.effectText='致命挥砍动态攻击层：每级1点平攻、最高100级，由A1A1死亡监听和建筑部署统一应用；不重复添加常驻数值';}
    if(id==='A1CG'){s.kind='naga_spell_resistance';s.status='implemented';s.effectText='生命法师出生及光环授予的永久法术抗性，第1级降低10%法术伤害；状态随实体保存，由娜迦伤害入口统一执行，不降低普通魔法攻击或通用伤害';}
    if(id==='A2Z2'){s.kind='alchemist_rage';s.status='implemented';s.effectText='本次伤害后生命不高于25%时触发药剂狂暴：1/2/3级分别获得50%/100%/150%攻速与2/3/5护甲，持续5秒；期间不刷新，结束后可再次触发，不免死';}
    if(id==='A2Z3'){s.kind='economic_marker';s.status='implemented';s.effectText='击杀敌人时单次1—100整数抽奖：1级2%得5金/5%得2金/10%得1金，2级2%/8%/12%，3级4%/10%/15%；互斥结算，31波后仍生效';}
    if(id==='A1A5'){s.kind='garrosh_armor';s.status='implemented';s.effectText='首次受伤登记1级护甲；伤害事件前生命比例比上次记录下降至少2个百分点时，本事件最多再升1级。护甲不因治疗撤销，并同步保留在建筑，下次出战恢复；最多100级';}
    if(id==='A1A6'){s.kind='garrosh_bleed';s.status='implemented';s.effectText='实际普攻命中10%概率流血：立即造成10点混乱攻击/通用伤害，此后每秒10点；同一双方组合不叠加，不同攻击者独立，任一方死亡结束';}
    if(id==='A1Q0'){s.kind='azure_fire';s.status='implemented';s.damage=20;s.effectText='实际普攻命中追加20点混乱攻击/通用伤害，可伤害魔免单位；不采用文案的魔法伤害类型';}
    if(id==='A0TH'){s.kind='anchor_smash';s.status='implemented';s.damage=10;s.radius=1.5;s.chance=.33;s.effectText='实际普攻命中时按JASS GetRandomReal(1,101)≥68判定（33%）；自身暂停1秒，对自身150范围目标阵营单位造成10点混乱攻击/通用伤害';}
    if(id==='A0YD'){s.kind='dragon_soul';s.status='implemented';s.chance=29/99;s.effectText='独立普攻伤害监听在沸血之后、狂战回血之前按JASS GetRandomReal(1,100)<30判定（约29.29%，非文案40%）；原生英雄受到最大生命30%的混乱攻击/通用伤害，其他单位受到99999点同类伤害，并非直接设置死亡';}
    if(['AIde','AIas'].includes(a.base_code)&&has('DataA')){s.kind='passive_stats';s.status='implemented';if(a.base_code==='AIde'){s.armor=A;s.effectText=`原生物品能力：自身护甲+${A}`;}else{s.haste=A;s.effectText=`原生物品能力：自身攻速+${A*100}%`;}}
    if(['A138','A13T'].includes(id)){s.kind='passive_stats';s.status='implemented';s.bonusHp=A;s.effectText=`神秘礼物原生AIml：自身最大生命+${A}；部署时应用一次，不随存档刷新重复增加`;}
    if(['A139','A13X','A0I4'].includes(id)){s.kind='passive_stats';s.status='implemented';s.flatDamage=A;s.effectText=`原生AIat：两组普通武器攻击力各+${A}，不增加法术固定伤害`;}
    if(['A13V','A198','A0W2','A0I6'].includes(id)){s.kind='passive_stats';s.status='implemented';s.selfRegen=A;s.effectText=`原生Arel：自身每秒恢复${A}生命，不是范围光环或最大生命百分比恢复`;}
    if(id==='A2ZG'){s.kind='box_damage_shield';s.status='implemented';s.damageFactor=.85;s.sourceLines=[40524,40574];s.effectText='单位护盾按主伤害事件将正敌对伤害乘以0.85，包括通用与法术伤害；排除空来源、自伤、盟友及带A2Y7的来源，主监听内部追加伤害不重复触发。先于翡翠复苏判断（JASS 40551–40585）';}
  }
  if(s.kind==='summon'&&!TEMPLATES[s.summonId]){s.status='unresolved';s.effectText=`召唤模板${s.summonId??'未指定'}缺失`;}
  if(['crit','evasion','hardened','demolish','orb','barrage','pulverize'].includes(s.kind)&&!has('DataA')&&!has('DataB')){s.status='unresolved';s.effectText='缺少原生效果数据，不应用空值默认';}
  if(version==='v14.1A5'&&a.base_code==='Aroc'){
    // Native experiments (reference/native-barrage-evidence.json) contradict
    // treating Efk1/Efk2 as flat damage. Preserve all fields for unresolved cases.
    s.kind='native_barrage';delete s.damage;delete s.damageCap;
    const knownCount=has('DataC')&&has('DataB')&&(C<0||C>=1&&(B===0||B>=C+2||C===1&&B===2));
    s.extraTargets=knownCount?(C<0?0:C===1&&B===2?1:C+1):null;
    s.runtimeImplemented=knownCount&&has('Area');s.status=s.runtimeImplemented?'partial':'unresolved';
    s.effectText=s.runtimeImplemented?`分裂箭沿用本次武器的攻击力与攻击类型，额外攻击至多${s.extraTargets}个目标，各自计算护甲；不是DataA的固定伤害。暴击触发时不发分裂箭。【待核定：原生版本差异、弹道时序、同类技能/法球叠加及目标枚举顺序】`:'原生分裂箭沿用武器伤害；目标数/范围所需原生继承字段未齐，保留待核定，不把DataA当作固定伤害';
  }
  if(version==='v14.1A5'&&id==='A0VZ'){
    s.kind='native_attack_factor';s.status='partial';s.runtimeImplemented=true;s.attackFactor=B;
    s.effectText='原生AIdd的DataB为造成伤害倍率：普通攻击及分裂箭输出×0.5，固定脚本伤害不减半。DataA/E/G/H均为1，不额外减免承伤。【待核定：原生版本与其他攻击修正叠加】';
  }
  if(s.kind==='spell_orb'&&compile(s.spellId,version).status!=='implemented'){s.status='unresolved';s.effectText=`触发子技能${s.spellId}未核定，未计入已实现`; }
  s.effectText??=effectSummary(s);
  if(version==='v14.1A5'&&YSERA_ACTIVE_RULES[id]){const r=YSERA_ACTIVE_RULES[id];Object.assign(s,{kind:'ysera_active',status:r.status,effectText:r.description,manaCost:r.manaCost,cooldown:r.cooldown});}
  if(version==='v14.1A5'&&ALCHEMIST_ACTIVE_RULES[id]){const r=ALCHEMIST_ACTIVE_RULES[id];Object.assign(s,{kind:'alchemist_active',status:'implemented',manaCost:r.manaCost,cooldown:r.cooldown,effectText:id==='A2Z0'?'医疗气雾自动选择范围内生命比例最低的友军，跟随中心每秒治疗10/10/20，共5/15/15跳；中心死亡变为固定8秒云雾，每0.2秒治疗与通用伤害2/2/3。原生手动冷却与受伤自动冷却独立。':'随机选择1000范围最多两名不同敌人，每秒10/20/30通用伤害共5跳；目标死亡或第5跳后形成固定325范围酸池，立即及随后每秒15/25/35伤害共7跳，减甲2/3/3持续2秒且期间不刷新。'});}
  if(version==='v14.1A5'&&AESARA_RULES[id]){const r=AESARA_RULES[id];Object.assign(s,{kind:'aesara_source',status:r.status,effectText:r.description+`【待核定：${r.partial}】`,manaCost:r.manaCost,cooldown:r.cooldown});if(r.range!==undefined)s.range=r.range/100;}
  if(version==='v14.1A5'&&['A0W0','A0W3'].includes(id)){s.kind='aesara_native_request';s.status='partial';s.effectText=id==='A0W0'?'秘术异蛇通过共享e00O发852274幻象命令后立即移除A0W0；物编为50%输出、5倍承伤、3秒。原生创建/继承未核定，保存请求，不虚构分身。':'魔法护盾对近战伤害来源通过共享e00O发slow后立即移除A0W3。显式攻速降低30%、普通/英雄3秒，移速字段缺失；原生施法完成未核定，保留请求。';}
  if(version==='v14.1A5'&&BRIGHT_ARTHAS_RULES[id]){const r=BRIGHT_ARTHAS_RULES[id];Object.assign(s,{kind:'bright_arthas_source',status:r.status,effectText:r.description+(r.partial?`【待核定：${r.partial}】`:''),manaCost:r.manaCost??0,cooldown:r.cooldown??0});if(r.range!==undefined)s.range=r.range/100;}
  if(version==='v14.1A5'&&DARK_ARTHAS_RULES[id]){const r=DARK_ARTHAS_RULES[id];Object.assign(s,{kind:'dark_arthas_source',status:r.status,effectText:r.description+(r.partial?`【待核定：${r.partial}】`:''),manaCost:r.manaCost??0,cooldown:r.cooldown??0});if(r.range!==undefined)s.range=r.range/100;}
  if(version==='v14.1A5'&&LICH_KING_RULES[id]){const r=LICH_KING_RULES[id];Object.assign(s,{kind:'lich_king_source',status:r.status,effectText:r.description+`【待核定：${r.partial}】`,manaCost:r.manaCost??0,cooldown:r.cooldown??0});if(r.range!==undefined)s.range=r.range/100;}
  if(version==='v14.1A5'&&id==='A0KR'){s.kind='lich_native_request';s.status='partial';s.effectText='辛达苟萨每步单个dummy以骨龙计数为等级，向所有当步新命中敌人发thunderbolt后立即RemoveUnit。原生连续命令命中仲裁未核定，当前保留请求，不虚构所有目标已眩晕。';}
  if(version==='v14.1A5'&&id==='A1CK')s.rangedOnly=false; // Ear2/Ear3 both explicitly enabled for this self aura.
  if(version==='v14.1A5'&&VASHJ_RULES[id]){const r=VASHJ_RULES[id];Object.assign(s,{kind:'vashj_source',status:r.status,manaCost:r.manaCost??0,cooldown:r.cooldown??0,effectText:r.description+(r.partial?`【待核定：${r.partial}】`:'')});if(r.range!==undefined)s.range=r.range/100;}
  if(version==='v14.1A5'&&NAGA_ACTIVE_RULES[id]){const r=NAGA_ACTIVE_RULES[id];Object.assign(s,{kind:'naga_source',status:r.status??'implemented',manaCost:r.manaCost??0,cooldown:r.cooldown??0,effectText:(r.effectText??r.description??`${r.name}由本版JASS专属规则处理，手动与自动共享原生冷却。`)+(r.partial?`【待核定：${r.partial}】`:'')});if(r.range!==undefined)s.range=r.range/100;if(r.radius!==undefined)s.radius=r.radius/100;}
  if(version==='v14.1A5'&&SOURCE_AURA_RULES[id]){const r=SOURCE_AURA_RULES[id];Object.assign(s,{kind:r.kind,status:r.status,effectText:r.description+`【待核定：${r.partial}】`});}
  const familyRule=version==='v14.1A5'&&(GARROSH_ACTIVE_RULES[id]??GARROSH_PASSIVE_RULES[id]??ILLIDAN_RULES[id]);
  if(familyRule){const r=familyRule;Object.assign(s,{kind:ILLIDAN_RULES[id]?'illidan_source':'garrosh_source',status:r.status,manaCost:r.manaCost??0,cooldown:r.cooldown??0,effectText:r.description+(r.partial?`【待核定：${r.partial}】`:'')});if(r.range!==undefined)s.range=r.range/100;if(r.radius!==undefined)s.radius=r.radius/100;}
  const extendedRule=version==='v14.1A5'&&(ICE_HERO_RULES[id]??TROLL_RULES[id]??KELTHUZAD_RULES[id]);
  if(extendedRule){const r=extendedRule;Object.assign(s,{...(!r.preserveNativeKind?{kind:ICE_HERO_RULES[id]?'ice_source':TROLL_RULES[id]?'troll_source':'kelthuzad_source'}:{}),status:r.status,manaCost:r.manaCost??s.manaCost,cooldown:r.cooldown??s.cooldown,effectText:r.description+(r.partial?`【待核定：${r.partial}】`:'')});if(r.range!==undefined)s.range=r.range/100;if(r.radius!==undefined)s.radius=r.radius/100;}
  if(version==='v14.1A5'&&SOURCE_CLASS_RULES[id]){const r=SOURCE_CLASS_RULES[id];Object.assign(s,{...(!r.preserveNativeKind?{kind:'source_class'}:{}),...(r.compiled??{}),status:r.status,effectText:r.description+(r.partial?`【待核定：${r.partial}】`:'')});}
  if(version==='v14.1A5'&&HUSKAR_RULES[id]){const r=HUSKAR_RULES[id];Object.assign(s,{...(!r.preserveNativeKind?{kind:'huskar_source'}:{}),status:r.status,runtimeImplemented:true,effectText:r.description+(r.partial?`【待核定：${r.partial}】`:'')});}
  if(version==='v14.1A5'&&RELOCATION_RULES[id]){const r=RELOCATION_RULES[id];Object.assign(s,{kind:'building_relocation',status:r.status,effectText:r.description+(r.status==='partial'?`【待核定：${RELOCATION_BOUNDARY}】`:'')});}
  if(version==='v14.1A5'&&BROODMOTHER_RULES[id]){const r=BROODMOTHER_RULES[id];Object.assign(s,{kind:r.preserveNativeKind?s.kind:'source_broodmother',status:r.status,runtimeImplemented:true,effectText:r.description+`【待核定：${r.partial}】`});}
  if(version==='v14.1A5'&&DEATH_TRIGGER_RULES[id]){const r=DEATH_TRIGGER_RULES[id];Object.assign(s,{kind:'source_death_trigger',status:r.status,runtimeImplemented:true,effectText:r.description+`【待核定：${r.partial}】`});}
  if(version==='v14.1A5'&&SKELETON_KING_RULES[id]){const r=SKELETON_KING_RULES[id];Object.assign(s,{kind:id==='A0IA'?'skeleton_king_source':'skeleton_king_native_request',status:r.status,runtimeImplemented:true,effectText:r.description+`【待核定：${r.partial}】`});if(id==='A0IB'){s.manaCost=null;s.cooldown=null;}}
  if(version==='v14.1A5'&&ELEMENTAL_PROC_RULES[id]){const r=ELEMENTAL_PROC_RULES[id];Object.assign(s,{kind:'elemental_source_proc',status:r.status,runtimeImplemented:true,effectText:r.description+(r.partial?`【待核定：${r.partial}】`:'')});}
  if(version==='v14.1A5'&&NIGHTMARE_RULES[id]){const r=NIGHTMARE_RULES[id];Object.assign(s,{kind:'nightmare_source',status:r.status,runtimeImplemented:true,effectText:r.description+`【待核定：${r.partial}】`});}
  if(version==='v14.1A5'&&SOUL_TOXIN_RULES[id]){const r=SOUL_TOXIN_RULES[id];Object.assign(s,{kind:'soul_toxin_source',status:r.status,runtimeImplemented:true,soulToxinRevision:1,cooldown:has('Cool')?n('Cool'):null,effectText:r.description+`【待核定：${r.partial}】`});}
  if(version==='v14.1A5'&&id==='A0ID')Object.assign(s,{kind:'huskar_duel',status:'partial',effectText:HUSKAR_DUEL_RULE.description+`【待核定：${HUSKAR_DUEL_RULE.partial}】`});
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
const V14_TRIGGER_DESCRIPTIONS={n0S4:'伤害事件>0时追加受害者当前生命3%的法术攻击/通用伤害（两倍模式分支为2%，不用于九倍）',n0S6:'伤害事件>40时，对英雄追加当前生命1%、其他单位追加最大生命1%的法术攻击/普通伤害',n0SC:'死亡时300范围敌军受到8点普通攻击/火焰伤害',h0CZ:'击杀时回复死者最大生命50%',h03B:'攻击启动30%概率自施2秒狂热与增益，击杀时追加增益',h0OC:'攻击启动30%概率自施2秒狂热与增益，击杀时追加增益',H08U:'死亡后原位置重新生成同类型单位'};
const V14_PARTIAL_TRIGGER_DESCRIPTIONS={
  h0M0:{status:'partial',text:'邪恶光环按原生字段提供35%移速与每秒20生命恢复。Arthas死亡/施法监听、4秒复制尸体与辛达苟萨12次推进已接入（war3map.j:20015—20120、20194—20201、21377—21385）。原生Aslo字段继承、自动施法及每步单dummy连续眩晕命中仍未核定；护命匣联盟仍由既有克尔苏加德模块处理。'},
};
const V14_ECONOMY_DESCRIPTIONS={
  farmer:{name:'淘金（玩家级经济）',rawcodes:['n085','h0W1'],text:'首座娜迦农夫从开始建造时为玩家注册15%击杀额外获得1金币的概率，每新增一座再加0.5个百分点；该概率影响玩家的击杀结算，农夫本身没有对战技能。升级完成后注销该农夫的注册；出售按原脚本不会注销已注册概率。'},
  master:{name:'压榨（回合经济）',rawcodes:['n084','h0W0'],text:'回合结算时，每座存活的娜迦农场主获得3×本波农夫数量的金币。原脚本条件会把原型h0W1的尸体也计入农夫数，皮肤农夫则要求存活；经济模块按这一源逻辑结算。'},
};
export function compileSkills(def) {const scale=def.distanceScale??1,version=versionOf(def);return [...new Set(def.abilityIds??def.sourceAbilityIds??(def.sourceAbilities??[]).map(a=>a.rawcode??a.id))].filter(Boolean).map(id=>compile(id,version)).map(s=>({...s,...(version==='v14.1A5'&&s.id==='A0II'?{haste:num(s.fields['DataB'+(def.abilityLevels?.A0II??1)])}:{}),...(version==='v14.1A5'&&s.id==='A0I4'?{flatDamage:num(s.fields['DataA'+(def.abilityLevels?.A0I4??1)])}:{}),...(version==='v14.1A5'&&s.id==='A1CK'?{damage:num(s.fields['DataA'+(def.abilityLevels?.A1CK??1)])}:{}),...Object.fromEntries(['range','radius','length','width','inner','outer','outerRadius','deathRadius','pull'].filter(k=>s[k]!==undefined).map(k=>[k,s[k]*scale]))}));}
export function describeSkills(def) {const list=compileSkills(def).map(s=>({id:s.id,name:s.name,description:s.description,status:s.status,effectText:s.effectText,cooldown:s.cooldown,manaCost:s.manaCost,duration:s.duration,range:s.range,radius:s.radius}));const r=raw(def),descriptions=isV14(def)?V14_TRIGGER_DESCRIPTIONS:TRIGGER_DESCRIPTIONS;if(descriptions[r])list.push({id:'trigger:'+r,name:'脚本机制',description:descriptions[r],effectText:descriptions[r],status:'implemented',cooldown:0,manaCost:0});const sourceGap=isV14(def)&&V14_PARTIAL_TRIGGER_DESCRIPTIONS[r];if(sourceGap)list.push({id:'trigger:'+r,name:'脚本机制（部分实现）',description:sourceGap.text,effectText:sourceGap.text,status:sourceGap.status,cooldown:0,manaCost:0});if(isV14(def))for(const [key,rule] of Object.entries(V14_ECONOMY_DESCRIPTIONS))if(rule.rawcodes.includes(r))list.push({id:'economy:'+key,name:rule.name,description:rule.text,effectText:rule.text,status:'implemented',cooldown:0,manaCost:0});return list;}
export function skillCoverage(def) {const list=describeSkills(def);return {implemented:list.filter(s=>s.status==='implemented').length,partial:list.filter(s=>s.status==='partial').length,markers:list.filter(s=>s.status==='marker').length,unresolved:list.filter(s=>s.status==='unresolved').length};}
export function attachSkills(e,def) {
  e.skillVersion=versionOf(def);e.skillImplementationRevision=SKILL_IMPLEMENTATION_REVISION;e.sourceVersion=def.sourceVersion??e.sourceVersion;e.combatRawcode=raw(def);e.skillSpecs=compileSkills(def);e.skillStates={};e.buffs=[];e.skillSource=!!def.abilityIds;e.weapon1=def.weapon1??{};e.weapon2=def.weapon2??{};e.sourceRawFields=def.sourceRawFields??{};e.sourceArmorTypeRaw=def.sourceArmorTypeRaw??e.sourceRawFields.defType??e.sourceArmorTypeRaw;e.distanceScale=def.distanceScale??1;
  const f=e.sourceRawFields;e.isHero=!!(e.isHero||def.hero||def.isHero||['STR','AGI','INT'].includes(f.Primary));e.maxMana=num(def.maxMana??def.mana??f.manaN);e.mana=clamp(num(def.initialMana??def.manaStart??f.mana0,e.maxMana),0,e.maxMana);e.manaRegen=num(def.manaRegen??f.regenMana);e.hpRegen=num(def.hpRegen??f.regenHP);e.targetType=def.targetType??f.targType??(f.movetp==='fly'?'air':'ground');e.traits=String(def.traits??def.unitType??f.type??'').split(',');e.isBuilding=!!(e.isBuilding||def.isBuilding||num(f.isbldg));e.nativeInvulnerable=e.skillSpecs.some(s=>s.status==='implemented'&&s.kind==='invulnerability');e.invulnerable=e.nativeInvulnerable;e.isStaticObstacle=!!(isV14(def)&&e.isBuilding&&f.pathTex&&!num(f.spd));if(e.isStaticObstacle)e.moveSpeed=0;
  // Altar heroes are giant units in the source, with a separate UI category.
  if(isV14(def)&&def.heroFamily)e.isNativeHero=['STR','AGI','INT'].includes(f.Primary);
  for(const s of e.skillSpecs)e.skillStates[s.id]={readyAt:0,casts:0,...(s.kind==='x9_sapper'&&Number.isFinite(e.createdAt)?{nextPulseAt:e.createdAt+1}:{})};
  // The source adds these native item abilities to the freshly deployed body
  // (43658–43698). Their literal bonuses follow the creation HP scaling.
  // Keep an ability journal so reattachment cannot add the same stats twice;
  // refreshing a saved skill definition deliberately does not run this step.
  for(const s of active(e))if(s.kind==='passive_stats'&&(s.bonusHp||s.flatDamage)){
    const applied=e.sourcePassiveStatBonuses??={};if(Object.hasOwn(applied,s.id))continue;
    const bonusHp=s.bonusHp??0,flatDamage=s.flatDamage??0;
    if(bonusHp){e.maxHp=num(e.maxHp)+bonusHp;if(e.hp>0)e.hp=Math.min(e.maxHp,e.hp+bonusHp);}
    if(flatDamage)e.damage=num(e.damage)+flatDamage;
    applied[s.id]={bonusHp,flatDamage};
  }
}
export function refreshSourceSkills(e,def) {
  const staleSoulToxin=e.skillSpecs?.some(s=>SOUL_TOXIN_RULES[s.id]&&s.soulToxinRevision!==1);
  const staleSkeleton=isV14(e)&&e.skillSpecs?.some(s=>SKELETON_KING_RULES[s.id]&&s.kind!==(s.id==='A0IA'?'skeleton_king_source':'skeleton_king_native_request'));
  if(e.skillImplementationRevision===SKILL_IMPLEMENTATION_REVISION&&!staleSkeleton&&!staleSoulToxin)return false;
  // Recompile the saved runtime ability set. Rebuilding from the template's
  // abilityIds would lose injected abilities and give mirror images skills.
  const abilityIds=Array.isArray(e.skillSpecs)?e.skillSpecs.map(s=>s.id).filter(Boolean):def.abilityIds;
  e.skillSpecs=compileSkills({...def,abilityIds,abilityLevels:e.abilityLevels});
  if(staleSoulToxin&&e.skillStates?.A0I5?.casts>0){e.skillStates.A0I5.nativeCooldownUnresolved=true;e.skillStates.A0I5.readyAt=null;}
  // Runtime state belongs to the save: preserve cooldowns, counters, buffs,
  // resources and HP. New skill state is initialized by state() on first use.
  e.skillStates??={};e.skillImplementationRevision=SKILL_IMPLEMENTATION_REVISION;
  return true;
}
export function matchesTargets(s,source,target) {
  const t=s.targets??[];
  if(source.side!==target.side&&scriptInvulnerable(target)&&!t.includes('invu')&&!t.includes('invulnerable'))return false;
  if(!t.length||t[0]==='_')return true;
  if(t.includes('notself')&&source.id===target.id)return false;
  const hostile=t.includes('enemies')||t.includes('enemy'),friendly=t.includes('friend')||t.includes('ally')||t.includes('allies');
  if(t.includes('self')&&!hostile&&!friendly&&!t.includes('neutral')&&source.id!==target.id)return false;
  if(hostile&&!friendly&&source.side===target.side)return false;if(friendly&&!hostile&&source.side!==target.side)return false;
  if(t.includes('air')&&!t.includes('ground')&&target.targetType!=='air')return false;
  if(t.includes('ground')&&!t.includes('air')&&target.targetType==='air')return false;
  if(t.includes('mechanical')&&!target.traits?.includes('mechanical'))return false;
  if(t.includes('organic')&&target.traits?.includes('mechanical'))return false;
  if(t.includes('tree')&&!target.traits?.includes('tree'))return false;
  if(t.includes('structure')&&t.length===1&&!target.isBuilding)return false;
  return true;
}
export function sourceWeapon(source,target,now=0){
  if((source.status?.cycloneUntil??0)>now||(target.status?.cycloneUntil??0)>now)return null;
  if(source.side!==target.side&&scriptInvulnerable(target))return null;
  if(isV14(source)&&source.isBuilding&&source.sourceRawFields?.weapsOn===undefined)return null;
  const explicit=source.skillSource;for(const slot of [1,2]){const w=slot===1?source.weapon1:source.weapon2;if(!w||!Object.keys(w).length)continue;const type=w[`weapTp${slot}`],mask=num(w.weapsOn,source.sourceRawFields?.weapsOn??1);if(!(mask&(1<<(slot-1)))||!type||type==='_')continue;const targets=String(w[`targs${slot}`]??'_').split(',');if(!matchesTargets({targets},source,target))continue;
    return {slot,raw:w,type,range:num(w[`rangeN${slot}`],source.range*100/(source.distanceScale||1))/100*(source.distanceScale??1),interval:num(w[`cool${slot}`],source.attackInterval),attackType:w[`atkType${slot}`]??source.attackType,damage:slot===1?source.damage:num(w.dmgplus2)+num(w.dice2)*(num(w.sides2)+1)/2+Object.values(source.sourcePassiveStatBonuses??{}).reduce((sum,bonus)=>sum+(bonus.flatDamage??0),0)+(source.sourceNightmareStatBonuses?.flatDamage??0)};
  }
  return explicit?null:{slot:1,raw:{},type:'normal',range:source.range,interval:source.attackInterval,attackType:source.attackType,damage:source.damage};
}
export function canWeaponTarget(source,target,now=0){return !!sourceWeapon(source,target,now);}

function active(e){return (e.skillSpecs??[]).filter(s=>s.status==='implemented'||s.status==='partial'&&s.runtimeImplemented&&['A2Y1','A2Y5','A0II','A0I2'].includes(s.id));}
export function hasSourceAura(e){return active(e).some(s=>s.kind.startsWith('aura_'));}
function state(e,s){return (e.skillStates??={})[s.id]??=( {readyAt:0,casts:0});}
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
  if(isV14(target))effects.haste+=trollHaste(target);
  for(const s of active(target))if(s.kind==='carapace')effects.armor+=s.armor;
  for(const s of active(target))if(s.kind==='passive_stats'){effects.armor+=s.armor??0;effects.haste+=s.haste??0;effects.healRate+=s.selfRegen??0;}
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
  if(isV14(e))tickNagaUnit(game,e,heroScriptApi);
  if(isV14(e))tickIllidanSource(game,e,heroScriptApi);
  e.buffs=(e.buffs??[]).filter(b=>b.expiresAt>now);const aura=sourceAuraEffects(game,e,battle.auras??[]);
  e.hp=Math.min(e.maxHp,e.hp+e.hpRegen*dt);e.mana=Math.min(e.maxMana,e.mana+(e.manaRegen+aura.manaRate)*dt);
  for(const b of e.buffs){if(b.dps>0)sourceDamage(game,e,b.dps*dt,game._worldEntities?.get(b.sourceId)??{side:e.side==='monster'?'defender':'monster',ownerId:b.ownerId},true);if(b.stun)e.status.stunUntil=Math.max(e.status.stunUntil??0,b.expiresAt);if(b.root)e.status.rootUntil=Math.max(e.status.rootUntil??0,b.expiresAt);}
  if(e.hp<=0)return;
  if(!isV14(e)&&e.combatRawcode==='h08B'&&e.status.burrowEnd&&now>=e.status.burrowEnd){e.invulnerable=false;e.status.burrowEnd=0;buff(e,compile('A06Z',e.skillVersion),e,now);}
  for(const job of e.status.pendingStrikes??[]){if(job.at<=now){const t=game._worldEntities?.get(job.targetId);if(t?.hp>0)sourceDamage(game,t,job.damage,e,true);job.done=true;}}
  e.status.pendingStrikes=(e.status.pendingStrikes??[]).filter(j=>!j.done);
  // The creation-hook sapper timer continues while its unit is stunned.
  for(const s of active(e))if(s.kind==='x9_sapper'){const st=state(e,s);st.nextPulseAt??=now+1;while(st.nextPulseAt<=now+1e-8){for(const t of scriptTargets(game,e,e,s.radius,false))universalDamage(game,t,s.damage,e);st.nextPulseAt+=1;}}
  if((e.status.stunUntil??0)>now||(e.status.cycloneUntil??0)>now||(e.invulnerable&&!e.nativeInvulnerable))return;
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
export function sourceAttackIssued(game,e){if(isV14(e))iceExplosionAttackIssued(game,e,heroScriptApi);}
export function sourceAttackStart(game,e,target) {
  applyYseraCorrosion(game,e,target);
  if(isV14(e)&&['h09P','h19P'].includes(e.combatRawcode))for(const s of active(e))if(s.kind==='defend'&&s.activation==='captain_attack')state(e,s).active=true;
  if(!isV14(e)&&e.combatRawcode==='h04N'){e.status.pendingStrikes??=[];e.status.pendingStrikes.push({at:game.state.time+.633,targetId:target.id,damage:Math.trunc(e.mana*3)});}
  if((!isV14(e)&&e.combatRawcode==='h081')||(isV14(e)&&active(e).some(s=>s.id==='A06O'))){if(e.mana>=e.maxMana){e.hp=Math.min(e.maxHp,e.hp+(isV14(e)?80:25));e.mana=0;}else e.mana=Math.min(e.maxMana,e.mana+1);}
  if((e.combatRawcode==='h03B'||isV14(e)&&e.combatRawcode==='h0OC')&&!(e.buffs??[]).some(b=>b.key==='skeleton-frenzy')&&game._random()<.3){buff(e,{...compile('A0RA',e.skillVersion),buffKey:'skeleton-frenzy'},e,game.state.time);buff(e,{...compile('A02V',e.skillVersion),buffKey:'skeleton-buff'},e,game.state.time);}
  const auras=game._auraEffects(e,game._battleAuras?.[e.battleTeam]??[]);let multiplier=auras.damageMultiplier,bonus=0,critical=false;const procs=[];const missChance=clamp((e.buffs??[]).filter(b=>b.expiresAt>game.state.time).reduce((n,b)=>n+(b.miss??0),0),0,1);const missed=missChance>0&&game._random()<missChance;
  for(const s of active(e))if(matchesTargets(s,e,target)){
    if(s.kind==='crit'&&game._random()<s.chance){multiplier*=s.multiplier;critical=true;}
    if(s.kind==='brawler'&&game._random()<s.chance){multiplier*=s.multiplier;critical=true;}
    if(s.kind==='bash'&&game._random()<s.chance)procs.push(s);
    if(s.kind==='orb'&&e.mana>=s.manaCost&&state(e,s).readyAt<=game.state.time){e.mana-=s.manaCost;state(e,s).readyAt=game.state.time+s.cooldown;bonus+=s.damage;procs.push(s);}
    if(['poison','cold','corruption','lifesteal','pulverize','barrage','spell_orb'].includes(s.kind))procs.push(s);
  }
  const outgoingFactor=(e.skillSpecs??[]).filter(s=>s.kind==='native_attack_factor'&&s.runtimeImplemented).reduce((n,s)=>n*Math.max(0,s.attackFactor),1);
  return {multiplier,baseMultiplier:auras.damageMultiplier,outgoingFactor,critical,bonus,procs,missed};
}
export function sourceBarrageTargets(e,target,battle,weapon,critical=false,now=0){
  if(!isV14(e)||critical||weapon.type!=='missile')return [];
  const s=(e.skillSpecs??[]).find(s=>s.kind==='native_barrage'&&s.runtimeImplemented);
  if(!s||s.radius<=0||!matchesTargets(s,e,target))return [];
  // Snapshot at attack release, before the primary damage listener can kill,
  // move, or create units. Native group order is not established by the packet.
  return battle.filter(t=>t.hp>0&&t.battleTeam===e.battleTeam&&t.side!==e.side&&t.team!==e.team&&t.id!==target.id&&(t.status?.cycloneUntil??0)<=now&&dist(e,t)<=s.radius&&matchesTargets(s,e,t)).slice(0,s.extraTargets);
}
export function sourceBarrageHit(game,e,target,battle,weapon,damage){
  if(target.hp<=0)return;
  const armor=game._effectiveArmor(target,game._auraEffects(target,battle.auras??[]).armor);
  const dealt=damage*game._typeMultiplier(weapon.attackType,target.armorType,target.sourceArmorTypeRaw)*game._armorFactor(armor);
  const actual=game._hurt(target,dealt,e,{spell:false,weapon:true,attackType:weapon.attackType,magic:weapon.attackType==='magic',barrage:true});
  // Script attack-damage listeners apply to every arrow; native orb/buff
  // placers and another barrage/splash are not recursively copied here.
  if(actual>0&&e.hp>0)sourceOnHit(game,e,target,battle,actual,[],damage,{secondary:true});
  game._event('projectile',target,`${Math.round(actual??0)}`,{fromX:e.x,fromY:e.y,fromWorldX:e.worldX,fromWorldY:e.worldY,color:e.color});
}
export function sourceOnHit(game,e,target,battle,dealt,procs=[],rawDamage=dealt,{secondary=false}={}) {
  const now=game.state.time,aura=sourceAuraEffects(game,e,battle.auras??[]);if(!secondary&&aura.lifesteal>0)e.hp=Math.min(e.maxHp,e.hp+dealt*aura.lifesteal);
  if(isV14(e)&&dealt>0&&e.side!==target.side){
    garroshOnHit(game,e,target,{universalDamage});
    nagaOnHit(game,e,target,heroScriptApi);
    illidanOnAttackHit(game,e,target,heroScriptApi);
    trollOnHit(game,e,target,heroScriptApi);
    for(const s of active(e)){
      if(s.kind==='stacking_bite'){const st=state(e,s);st.targets??={};st.targets[target.id]=(st.targets[target.id]??0)+s.damage;universalDamage(game,target,st.targets[target.id],e);}
      if(s.kind==='azure_fire')universalDamage(game,target,s.damage,e);
      if(s.kind==='anchor_smash'&&game._random()>=1-s.chance){e.status.stunUntil=Math.max(e.status.stunUntil??0,now+1);for(const t of scriptTargets(game,e,e,s.radius,false))universalDamage(game,t,s.damage,e);}
    }
  }
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
  if(!secondary)weaponSecondary(game,e,target,battle,rawDamage);
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
  initializeSourceSkills(game,target);
  if(target.invulnerable||active(target).some(s=>s.kind==='invulnerability'))return 0;let result=damage;
  for(const s of active(target)){
    if(options.magic&&s.kind==='immunity')return 0;
    if(!options.spell&&s.kind==='evasion'&&game._random()<s.chance)return 0;
    if(!options.spell&&s.kind==='brawler'&&game._random()<s.evasion)return 0;
    if(!options.spell&&s.kind==='hardened'&&game._random()<s.chance)result=Math.max(s.minimum,result-s.reduction);
    if(s.kind==='defend'&&(!isV14(target)||target.skillStates?.[s.id]?.active)){if(!options.spell&&(options.attackType??attacker?.attackType)==='pierce')result*=s.pierceFactor;if(isV14(target)&&(options.magic||(options.attackType??attacker?.attackType)==='magic')&&s.magicFactor>0)result*=s.magicFactor;}
    if(s.kind==='carapace'&&s.incomingFactor>0)result*=s.incomingFactor;
    if(s.kind==='shield'&&s.damagePerMana>0){const absorb=Math.min(result*s.absorb,target.mana*s.damagePerMana);target.mana-=absorb/s.damagePerMana;result-=absorb;}
  }
  if(isV14(target))result=aesaraIncomingDamage(game,target,result);
  for(const b of target.buffs??[])if(b.expiresAt>game.state.time)result*=1+(b.incoming??0);
  result*=target.status?.incomingMultiplier??1;
  // A19A is an AIsr native resistance, not a reduction to magic weapons or
  // universal script damage. Mixed native resistance stacking is unresolved;
  // keep the existing A1CG host authoritative rather than invent a stack rule.
  if(isV14(target)&&(target.skillSpecs??[]).some(s=>s.id==='A19A')&&!options.universal&&(options.magic&&options.spell||options.nativeDamageType==='magic'||options.attackType==='spells')){
    if(target.status?.nagaSpellResistance)target.status.sourceClassResistanceOverlapUnresolved=true;
    else result*=.6;
  }
  // Trig_UnitDamageActions 40551–40574: QC changes this main listener's
  // event damage before YseraOnDamage. Universal damage is not exempt, but
  // its own nested damage runs while this trigger is disabled. UB and other
  // independent listeners can still create fresh, eligible main events.
  if(isV14(target)&&!game._sourceDamageTriggerDepth&&result>0&&attacker&&attacker.id!==target.id&&attacker.side!==target.side&&!(attacker.skillSpecs??[]).some(s=>s.id==='A2Y7')){
    const shield=active(target).find(s=>s.kind==='box_damage_shield');if(shield)result*=shield.damageFactor;
  }
  if(isV14(target)&&!game._sourceDamageTriggerDepth&&result>0&&target.hp>0&&active(target).some(s=>s.kind==='ysera_revival')){
    const now=game.state.time,status=target.status??={};
    if((status.yseraSleepingUntil??0)>now)return result*.2;
    // Original JASS precedence is (count<2 && !cooldown && lethal) || lowHP.
    const lethal=target.hp-result<=1,low=target.hp<=target.maxHp*.3;
    if(((status.yseraRevivalCount??0)<2&&(status.yseraRevivalCooldownUntil??0)<=now&&lethal)||low){
      status.yseraRevivalCount=(status.yseraRevivalCount??0)+1;status.yseraRevivalCooldownUntil=now+18;status.yseraSleepingUntil=now+3;status.stunUntil=Math.max(status.stunUntil??0,now+3);target.hp=Math.max(1,target.maxHp*.05);
      game.state.sourceSkillJobs??=[];game.state.sourceSkillJobs.push({type:'ysera_wake',sourceId:target.id,at:now+3});game._event('cast',target,'翡翠复苏');return 0;
    }
  }
  return isV14(target)?trollIncomingDamage(game,target,nagaIncomingDamage(game,target,result,attacker,options),attacker,heroScriptApi):result;
}
export function sourceClassAttackDamageEvent(game,target,attacker,options={},amount=0){
  if(!isV14(attacker)||options.spell&&!options.weapon||attacker.status?.sourceNativeAttackBusy)return;
  (attacker.status??={}).sourceNativeAttackBusy=true;
  try{darkArthasAttackDamage(attacker,amount);vashjOnAttackDamage(game,attacker,target,heroScriptApi);sourceClassOnAttackDamage(game,attacker,target,heroScriptApi);huskarAttackDamage(game,attacker,target,amount,heroScriptApi);}finally{attacker.status.sourceNativeAttackBusy=false;}
}
export function initializeSourceClassCombat(game,building,entity){
  if(isV14(entity)){initializeNightmareDeployment(game,entity);initializeBrightArthasDeployment(game,building,entity);initializeLichKingDeployment(game,entity);initializeVashjDeployment(game,building,entity);return initializeSourceClassDeployment(game,building,entity,heroScriptApi);}
}
// DemonStatueBounce precedes A0I1 and remains unimplemented.
function hasPendingBroodmotherPrefix(attacker){return ['n050','n06R'].includes(raw(attacker));}
export function beforeSourceDamage(game,target,actual,attacker,options={}){
  const mainEventPosition=pos(target);
  if(isV14(target))kelthuzadBeforeDamage(game,target,actual,attacker,heroScriptApi);
  if(attacker&&actual>0&&(!options.spell||options.weapon)&&!game._sourceAttackTriggerDepth){
    game._sourceAttackTriggerDepth=1;
    try{if(isV14(attacker))kelthuzadOnAttackDamage(game,attacker,target,actual,heroScriptApi);if(isV14(target)||isV14(attacker))tryKelthuzadAutoCast(game,attacker,target,heroScriptApi);}finally{game._sourceAttackTriggerDepth=0;}
  }
  if(!attacker||target.id===attacker.id||target.side===attacker.side||game._sourceDamageTriggerDepth)return;
  let eventDamage=actual;
  game._sourceDamageTriggerDepth=(game._sourceDamageTriggerDepth??0)+1;
  try{
    if(isV14(target)||isV14(attacker))tryVashjAutoCast(game,target,attacker,heroScriptApi);
    if(isV14(target)||isV14(attacker))nagaBeforeDamage(game,target,actual,attacker,heroScriptApi);
    if(isV14(target))alchemistAfterDamage(game,target,actual,{preDamageHp:target.hp});
    if(isV14(target))tryAlchemistAutoCast(game,target,{universalDamage});
    if(isV14(attacker))tryAlchemistAutoCast(game,attacker,{universalDamage});
    if(isV14(target))tryYseraAutoCast(game,target,heroScriptApi);
    if(isV14(attacker))tryYseraAutoCast(game,attacker,heroScriptApi);
    if(isV14(target)||isV14(attacker)){darkArthasMainDamage(game,target,actual,attacker,heroScriptApi);tryBrightArthasAutoCast(game,target,attacker,actual,heroScriptApi);}
    if(isV14(target)||isV14(attacker)){
      tryIllidanAutoCast(game,target,attacker,heroScriptApi);
      tryGarroshAutoCast(game,target,attacker,heroScriptApi);
      tryIceHeroAutoCast(game,target,attacker,heroScriptApi);
      tryTrollAutoCast(game,target,attacker,heroScriptApi);
    }
    if(isV14(target))aesaraMainDamage(game,target,attacker,actual,heroScriptApi);
    const prefix=isV14(target)||isV14(attacker)?elementalDamagePrefix(game,target,attacker,actual,heroScriptApi):{selected:null,localDamage:actual};
    if(!prefix.selected&&isV14(target)&&nightmareDamagePrefix(game,target,attacker,actual,heroScriptApi)){prefix.selected='A0XM';eventDamage=0;}
    if(isV14(target)){
      if(!prefix.selected)prefix.selected=soulToxinDamageBranch(game,target,attacker,actual,heroScriptApi)?.selected??null;
      const unresolvedPrior=hasPendingBroodmotherPrefix(attacker);
      if(!prefix.selected&&!unresolvedPrior&&broodmotherDamageBranch(game,target,attacker,prefix.localDamage,heroScriptApi,mainEventPosition))prefix.selected='A0I1';
      huskarDuelDamage(game,target,attacker,actual,prefix.selected);
      const prior=huskarMainDamage(game,target,attacker,prefix.localDamage,heroScriptApi);
      aesaraDamageCleanup(game,target,attacker,prefix.localDamage,heroScriptApi,prior);
    }
    if(isV14(target)&&!(attacker.skillSpecs??[]).some(s=>s.id==='A2Y7'))sourceClassBeforeDamage(game,target,actual,attacker,heroScriptApi);
  }finally{game._sourceDamageTriggerDepth--;}
  return eventDamage;
}
export function afterSourceDamage(game,target,actual,attacker,options={}) {
  if(isV14(target)){const armor=garroshAfterDamage(game,target,actual);if(armor)target.armor+=armor.addedLevel;}
  if(isV14(target)){
    garroshActiveAfterDamage(game,target,actual,heroScriptApi);
    illidanAfterDamage(game,target,actual,heroScriptApi);
  }
  // UB is an independent damage listener, registered before the main script
  // listener. It only disables itself while adding its own true-fire damage.
  if(isV14(attacker)&&attacker.combatRawcode==='n0S4'&&actual>0&&!game._sourceTrueFireDepth){
    game._sourceTrueFireDepth=1;
    try{nativeDamage(game,target,(options.sourcePreDamageHp??target.hp)*.03,attacker,{attackType:'spells',damageType:'universal'});}finally{game._sourceTrueFireDepth=0;}
  }
  if(isV14(attacker)&&attacker.combatRawcode==='n0S6'&&actual>40&&!game._sourceFrozenTouchDepth){
    game._sourceFrozenTouchDepth=1;
    try{nativeDamage(game,target,(isNativeHero(target)?options.sourcePreDamageHp??target.hp:target.maxHp)*.01,attacker,{attackType:'spells',damageType:'normal'});}finally{game._sourceFrozenTouchDepth=0;}
  }
  if(!attacker||actual<=0)return;
  if(!options.spell&&attacker.hp>0&&attacker.range<=1.28){const selfThorns=active(target).filter(s=>s.kind==='carapace').reduce((v,s)=>v+s.fraction,0);const aura=sourceAuraEffects(game,target,game._battleAuras?.[target.battleTeam]??[]);if(aura.thorns||aura.thornsFlat||selfThorns)game._hurt(attacker,actual*(aura.thorns+selfThorns)+aura.thornsFlat,target,{spell:true,reflected:true});}
  if(target.id===attacker.id||target.side===attacker.side)return;
  // JASS disables only the main damage trigger during its own callback. A
  // later timer's scripted damage is a fresh event and must still auto-cast.
  if(game._sourceDamageTriggerDepth)return;
  game._sourceDamageTriggerDepth=(game._sourceDamageTriggerDepth??0)+1;
  try {
  applyYseraCorrosion(game,attacker,target);
  if(target.side!==attacker.side){
    // The source script tests the damaged unit before the damage source. Only
    // one chieftain and one shaman may auto-cast for this damage event.
    if(isV14(target)||isV14(attacker))triggerNagaDamageSkills(game,target,attacker);
    if(isV14(attacker))for(const s of active(attacker))if(s.kind==='damage_mana')attacker.mana=Math.min(attacker.maxMana,attacker.mana+s.manaGain);
    if(!options.spell)triggerNagaBoon(game,target);
  }
  if(isV14(attacker)){
    if(active(attacker).some(s=>s.id==='A01I')&&actual>=100&&target.hp>0)universalDamage(game,target,attacker.mana*3,attacker);
    return;
  }
  if(attacker.combatRawcode==='n0S4'&&target.hp>0)game._hurt(target,target.hp*.03,attacker,{spell:true,scripted:true});
  if(attacker.combatRawcode==='n0S6'&&target.hp>0&&!active(target).some(s=>s.kind==='immunity'))game._hurt(target,target.maxHp*.01*game._typeMultiplier('magic',target.armorType,target.sourceArmorTypeRaw??target.sourceRawFields?.defType),attacker,{magic:true,spell:true,scripted:true});
  } finally {game._sourceDamageTriggerDepth--;}
}
export function sourceDeath(game,target,killer) {
  if(target.status?.sourceDeathHandled)return;target.status.sourceDeathHandled=true;
  const mainDeathRan=runMainUnitDeath(game,target,killer,mainDeathApi);
  if(isV14(target)&&!mainDeathRan)sourceClassDeath(game,target,killer,heroScriptApi,false);
  // JSON restoration breaks live-object aliases. Rebind the retained script
  // handle before corpse cleanup so its final mana/cooldowns remain authoritative.
  if(game.state.nagaScriptCasters?.[target.id])game.state.nagaScriptCasters[target.id]=target;
  sourceAesaraDeath(game,target);
  sourceBrightArthasDeath(game,target,heroScriptApi);
  sourceDarkArthasDeath(game,target,heroScriptApi);
  sourceVashjDeath(game,target);
  sourceIceHeroDeath(game,target,killer,heroScriptApi);
  sourceTrollDeath(game,target,killer,heroScriptApi);
  sourceKelthuzadDeath(game,target,killer,heroScriptApi);
  sourceGarroshActiveDeath(game,target,killer,heroScriptApi);
  sourceIllidanDeath(game,target,killer,heroScriptApi);
  sourceAlchemistDeath(game,target,killer,{universalDamage});
  sourceNagaDeath(game,target,killer,heroScriptApi);
  if(isV14(target))sourceYseraDeath(game,target,heroScriptApi,false);
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
  lichKingDeath(game,target,heroScriptApi);
  huskarDuelDeath(game,target,heroScriptApi);
}
function wf(w,key,fallback=0){return num(w[key]??w[key+'1'],fallback);}
function weaponSecondary(game,e,target,battle,dealt) {
  const weapon=sourceWeapon(e,target,game.state.time);if(!weapon)return;const w=Object.fromEntries(Object.entries(weapon.raw).map(([k,v])=>[k.endsWith(String(weapon.slot))?k.slice(0,-1):k,v])),type=weapon.type;if(!type)return;
  const hit=(t,amount)=>{const a=game._auraEffects(t,game._battleAuras?.[t.battleTeam]??[]);game._hurt(t,amount*game._typeMultiplier(weapon.attackType,t.armorType,t.sourceArmorTypeRaw??t.sourceRawFields?.defType)*game._armorFactor(game._effectiveArmor(t,a.armor)),e,{spell:true,weapon:true});};
  const count=wf(w,'targCount',1),loss=wf(w,'damageLoss'),radius=wf(w,'Farea')/100*e.distanceScale;
  if(type==='mbounce'&&count>1){let previous=target;const used=new Set([target.id]);for(let i=1;i<count;i++){const next=battle.filter(t=>t.hp>0&&t.side!==e.side&&!used.has(t.id)&&dist(previous,t)<=radius&&canWeaponTarget(e,t,game.state.time)).sort((a,b)=>dist(previous,a)-dist(previous,b))[0];if(!next)break;hit(next,dealt*Math.pow(1-loss,i));game._event('chain',next,'弹射',{fromWorldX:previous.worldX,fromWorldY:previous.worldY});used.add(next.id);previous=next;}}
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
function scriptInvulnerable(e){return e.invulnerable||e.status?.yseraHidden||active(e).some(s=>s.kind==='invulnerability');}
function scriptSource(e){return {id:e.id,ownerId:e.ownerId,side:e.side,team:e.team,battleTeam:e.battleTeam,combatRawcode:e.combatRawcode,skillVersion:e.skillVersion,attackType:'chaos',hp:e.hp};}
function retainNagaScriptCaster(game,e){
  if(e?.id===undefined||!Number.isFinite(e.mana)||!e.skillSpecs?.some(s=>nagaScriptCasterAbilities.has(s.id)))return null;
  // One source handle is shared by every owned timer, including after cleanup.
  // This is intentionally a live alias; lookup by id restores that relationship.
  return (game.state.nagaScriptCasters??={})[e.id]=e;
}
function isRetainedNagaJob(job){return job.type==='naga_hurricane'||job.type==='target_pulses';}
function resolveNagaScriptCaster(game,job,live){
  if(live)return retainNagaScriptCaster(game,live)??live;
  return game.state.nagaScriptCasters?.[job.sourceId]??job.source;
}
function scriptTargets(game,source,origin,radius,friendly){return game.state.entities.filter(t=>t.hp>0&&t.battleTeam===source.battleTeam&&(friendly?t.side===source.side:t.side!==source.side)&&!scriptInvulnerable(t)&&dist(origin,t)<=radius);}
function universalDamage(game,target,amount,source){return game._hurt(target,amount,source,{spell:true,scripted:true,universal:true});}
function nativeDamage(game,target,amount,source,{attackType='normal',damageType='normal'}={}){
  const a=game._auraEffects(target,game._battleAuras?.[target.battleTeam]??[]),magic=damageType==='magic';
  const armor=damageType==='normal'?game._armorFactor(game._effectiveArmor(target,a.armor)):1;
  return game._hurt(target,amount*game._typeMultiplier(attackType,target.armorType,target.sourceArmorTypeRaw??target.sourceRawFields?.defType)*armor,source,{spell:true,scripted:true,magic,universal:damageType==='universal',nativeDamageType:damageType,attackType});
}
function setUnitPosition(game,e,point){const safe=closestWalkable(point,e.battleTeam,e.radius??.2)??pos(e);e.worldX=safe.x;e.worldY=safe.y;game._syncLocal?.(e);}
function compileAbility(game,e,id){return compileSkills({abilityIds:[id],skillVersion:e.skillVersion??'v14.1A5',distanceScale:e.distanceScale??1/3})[0];}
function addAbility(game,e,id){if((e.skillSpecs??[]).some(s=>s.id===id))return;e.skillSpecs??=[];e.skillSpecs.push(compileAbility(game,e,id));e.skillStates??={};e.skillStates[id]??={readyAt:0,casts:0};}
function removeAbility(game,e,id){e.skillSpecs=(e.skillSpecs??[]).filter(s=>s.id!==id);if(e.skillStates)delete e.skillStates[id];}
function getBuilding(game,e){return game.state.players?.find(p=>p.id===e.ownerId)?.buildings?.find(b=>b.id===e.buildingId);}
function applyAttackLevel(game,e,id,oldLevel,newLevel){
  if(!Number.isFinite(e.damage))return;
  if(typeof id==='number'){e.damage+=id-(oldLevel??0);return;}
  const f=V14_ABILITIES[id]?.resolved_fields??{},value=level=>level>0?num(f['DataA'+level]):0;e.damage+=value(newLevel)-value(oldLevel);
}
export function initializeSourceSkills(game,e){if(!isV14(e))return;initializeNagaUnit(game,e,heroScriptApi);registerIllidanSource(game,e,heroScriptApi);initializeTrollUnit(game,e,heroScriptApi);registerKelthuzadSource(game,e,heroScriptApi);applyKelthuzadBuildingAlliance(game,e,getBuilding(game,e),heroScriptApi);}
function pauseUnitEx(game,source,target,seconds){
  // PauseUnitEx uses a thunderbolt dummy at R2I(seconds), rather than a
  // universal PauseUnit. A0I7 has organic targets and half hero duration.
  const level=Math.trunc(seconds),now=game._aesaraEventAt??game._brightArthasEventAt??game._arthasEventAt??game._vashjEventAt??game.state.time;target.status??={};
  target.status.sourceAnimationFrozenUntil=Math.max(target.status.sourceAnimationFrozenUntil??0,now+seconds);
  if(level<1){target.status.sourceUnresolvedStunLevel=0;return;}
  if(target.traits?.includes('mechanical')||active(target).some(s=>s.kind==='immunity')||scriptInvulnerable(target))return;
  const duration=Number(V14_ABILITIES.A0I7.resolved_fields[(isNativeHero(target)?'HeroDur':'Dur')+Math.min(10,level)]??0);
  if(duration>0)target.status.stunUntil=Math.max(target.status.stunUntil??0,now+duration);
}
function applyNativeControl(game,source,target,id,kind,seconds){
  const now=game._soulToxinEventAt??game._aesaraEventAt??game._brightArthasEventAt??game._arthasEventAt??game._lichEventAt??game._vashjEventAt??game._iceEventAt??game._trollEventAt??game._kelthuzadEventAt??game.state.time,skill=compileSkills({abilityIds:[id],skillVersion:'v14.1A5',distanceScale:source.distanceScale??1/3})[0];
  if(!target||target.hp<=.405||target.isBuilding||target.side===source.side||source.battleTeam!==target.battleTeam||scriptInvulnerable(target)||id!=='A15I'&&active(target).some(s=>s.kind==='immunity')||target.status?.cycloneUntil>now||!matchesTargets(skill,source,target))return false;
  const duration=seconds??(isNativeHero(target)?skill.heroDuration:skill.duration);
  target.status??={};target.status[kind]=Math.max(target.status[kind]??0,now+duration);
  if(kind==='cycloneUntil')target.pendingAttack=null;
  if(id==='A15I'&&target.targetType==='air'){target.status.ensnareOriginalTargetType??=target.targetType;target.targetType='ground';target.status.ensnareGroundedUntil=target.status[kind];}
  else if(id==='A15I'&&target.status.ensnareOriginalTargetType)target.status.ensnareGroundedUntil=target.status[kind];
  return true;
}
function castNativeNova(game,e,id,target){
  const now=game._aesaraEventAt??game._brightArthasEventAt??game._arthasEventAt??game._lichEventAt??game._vashjEventAt??game._iceEventAt??game._trollEventAt??game._kelthuzadEventAt??game.state.time,s=e.skillSpecs?.find(s=>s.id===id),fail=message=>({ok:false,message});
  if(!s||e.hp<=.405||e.status?.sourcePaused||e.status?.illidanPaused||e.status?.yseraPaused||e.status?.yseraHidden||e.status?.stunUntil>now||e.status?.cycloneUntil>now)return fail('单位当前无法施法');
  if(!target||target.hp<=.405||e.side===target.side||target.battleTeam!==e.battleTeam||scriptInvulnerable(target)||target.status?.cycloneUntil>now||active(target).some(a=>a.kind==='immunity')||!matchesTargets(s,e,target))return fail('请选择可施法的敌人');
  if(dist(e,target)>s.range+1e-8)return fail('超出施法范围');
  const st=state(e,s);if(st.readyAt>now+1e-8)return fail('技能冷却中');if(e.mana<s.manaCost)return fail('魔法不足');
  e.mana-=s.manaCost;st.readyAt=now+s.cooldown;st.casts++;game._event('cast',e,s.name,{skillId:id});
  const center=pos(target);
  for(const t of game.state.entities.filter(t=>t.hp>0&&t.side!==e.side&&t.battleTeam===e.battleTeam&&!(t.status?.cycloneUntil>now)&&dist(t,center)<=s.radius+1e-8&&matchesTargets(s,e,t))){
    nativeDamage(game,t,s.areaDamage+(t.id===target.id?s.damage:0),e,{attackType:'spells',damageType:'magic'});
    if(t.hp>0&&!active(t).some(a=>a.kind==='immunity'))buff(t,{...s,move:-num(RULES.frostMoveSpeedDecrease,.2),haste:-num(RULES.frostAttackSpeedDecrease,.2)},e,now,{key:'Bfro',damage:0});
  }
  kelthuzadNativeSpellEffect(game,e,id,heroScriptApi);
  return {ok:true,skillId:id};
}
const mainDeathApi={universalDamage,nativeDamage,
  alchemyGold:(g,dead,killer)=>{const reward=alchemistDeathReward(g,dead,killer),p=g.state.players?.[killer?.ownerId];if(p&&reward.bonusGold){p.gold+=reward.bonusGold;p.stats.goldEarned+=reward.bonusGold;g._event('gold',killer,`点金+${reward.bonusGold}`);}},
  classDeath:(g,dead,killer,enabled)=>sourceClassDeath(g,dead,killer,heroScriptApi,enabled),
  yseraAwakening:(g,dead)=>sourceYseraMainDeath(g,dead),
  boneDragonDeath:lichKingMainDeath,
  nightmareKill:(g,killer)=>nightmareMainDeath(g,killer,heroScriptApi),
  skeletonKingDeath:skeletonKingMainDeath,
};
const heroScriptApi={matchesTargets,magicImmune:e=>active(e).some(s=>s.kind==='immunity'),initializeUnit:initializeSourceSkills,applyNativeStun:(g,s,t,id)=>applyNativeControl(g,s,t,id,'stunUntil'),sourceDeath,killUnit:(g,e)=>g._killUnit(e),getOwnedUnitsOfRawcode:(g,e,code)=>[...g.state.entities.filter(u=>u.ownerId===e.ownerId&&raw(u)===code),...(g.state.players[e.ownerId]?.buildings??[]).filter(b=>(b.sourceRawcode??b.unitId?.replace(/^v14_/, ''))===code)],castNativeNova:(g,e,id,target)=>castNativeNova(g,e,id,target),applyCyclone:(g,s,t,id,seconds)=>applyNativeControl(g,s,t,id,'cycloneUntil',seconds),applyEnsnare:(g,s,t,id)=>applyNativeControl(g,s,t,id,'rootUntil'),universalDamage,nativeDamage,sourceDamage,applyCorrosion:applyYseraCorrosion,scriptInvulnerable,pauseUnitEx,compileAbility,addAbility,removeAbility,getBuilding,applyAttackLevel,setUnitPosition,moveUnit:setUnitPosition,
  applyNativeSlow:(game,source,target,id,descriptor)=>{target.status??={};target.status.sourceClassNativeSlowPending={abilityId:id,sourceId:source.id,at:game.state.time,descriptor:{...descriptor},reason:'原生Aslo默认目标许可未核定'};},
  vertigoTarget:(game,source,target,level)=>{const frozen=target.status?.sourceAnimationFrozenUntil;pauseUnitEx(game,source,target,level);if(frozen===undefined)delete target.status.sourceAnimationFrozenUntil;else target.status.sourceAnimationFrozenUntil=frozen;},
  pauseUnit:(game,e,value)=>{e.status??={};e.status.sourcePaused=!!value;if(value)e.pendingAttack=null;},
  isTerrainBlocked:(game,point,source)=>!isWalkable(point.x,point.y,source?.battleTeam??0,0),
  clampDummyPosition:(game,point)=>point,
  spawnUnit:(game,source,code,extra)=>summon(game,source,V14_UNIT_TEMPLATES[code],0,extra),
  removeUnit:(game,entity)=>{game.state.entities=game.state.entities.filter(e=>e.id!==entity.id);entity.hp=0;entity.status.sourceRemoved=true;entity.status.sourceDeathHandled=true;entity.status.deathCounted=true;entity.pendingAttack=null;},
  isLivingOwner:(game,source)=>!game.state.players[source.ownerId]?.eliminated,
};
export {darkArthasDamageListeners,brightArthasEventDamage};
export function sourceRegisteredDamageEvent(game,target,listeners){darkArthasIncomingEvent(game,target,listeners,heroScriptApi);}
export function manualSourceSkills(game,e){
  if(!e||!isV14(e))return [];
  return (e.skillSpecs??[]).filter(s=>ALCHEMIST_ACTIVE_RULES[s.id]||canYseraCastAbility(e,s.id)||NAGA_ACTIVE_RULES[s.id]?.active||canVashjCastAbility(e,s.id)||canAesaraCastAbility(e,s.id)||canBrightArthasCastAbility(e,s.id)||canDarkArthasCastAbility(e,s.id)||canLichKingCastAbility(e,s.id)||canGarroshCastAbility(e,s.id)||canIllidanCastAbility(e,s.id)||canIceHeroCastAbility(e,s.id)||canTrollCastAbility(e,s.id)||canKelthuzadCastAbility(e,s.id)).map(s=>{
    if(AESARA_RULES[s.id])return aesaraManualSkill(game,e,s);
    const alchemy=!!ALCHEMIST_ACTIVE_RULES[s.id],family=NAGA_ACTIVE_RULES[s.id]?.active?NAGA_ACTIVE_RULES[s.id]:BRIGHT_ARTHAS_RULES[s.id]??DARK_ARTHAS_RULES[s.id]??VASHJ_RULES[s.id]??LICH_KING_RULES[s.id]??GARROSH_ACTIVE_RULES[s.id]??ILLIDAN_ACTIVE_RULES[s.id]??ICE_HERO_RULES[s.id]??TROLL_ACTIVE_RULES[s.id]??KELTHUZAD_ACTIVE_RULES[s.id]??(s.id==='A0ZO'?KELTHUZAD_RULES.A0ZO:null),shared=!!family,st=e.skillStates?.[s.id]??{},remaining=Math.max(0,(st[alchemy?'manualReadyAt':'readyAt']??0)-game.state.time),autoRemaining=shared?Math.max(0,(st.readyAt??0)-game.state.time):Math.max(0,(st[alchemy?'readyAt':'yseraAutoReadyAt']??0)-game.state.time);
    const reason=e.hp<=.405?'单位已阵亡':e.status?.yseraHidden||e.status?.yseraPaused||e.status?.sourcePaused||e.status?.illidanPaused||e.status?.stunUntil>game.state.time||e.status?.cycloneUntil>game.state.time?'单位当前无法施法':remaining>1e-8?'技能冷却中':e.mana<s.manaCost?'魔法不足':'';
    return {id:s.id,name:s.name,status:s.status,manaCost:s.manaCost,cooldown:s.cooldown,remaining,autoRemaining,cooldownMode:shared?'shared_native':'independent',targetKind:family?family.targetKind:s.id==='A2YA'?'point':s.id==='A2YD'?'enemy':'none',range:s.range,radius:s.radius,canStart:!reason,reason};
  });
}
export function castManualSourceSkill(game,e,id,params={}){
  const s=manualSourceSkills(game,e).find(s=>s.id===id);if(!s)return {ok:false,message:'当前单位没有可手动释放的此技能'};
  if(!s.canStart)return {ok:false,message:s.reason};
  if(s.targetKind==='point'&&(!Number.isFinite(params.point?.x)||!Number.isFinite(params.point?.y)))return {ok:false,message:'请选择施法位置'};
  if(s.targetKind==='enemy'&&(!params.target||params.target.hp<=0||params.target.side===e.side||params.target.battleTeam!==e.battleTeam||scriptInvulnerable(params.target)))return {ok:false,message:'请选择可攻击的敌人'};
  if(s.targetKind==='unit'&&(!params.target||params.target.hp<=0||params.target.battleTeam!==e.battleTeam))return {ok:false,message:'请选择有效单位目标'};
  if(params.point&&s.targetKind==='point'||params.target&&s.targetKind==='enemy'){const p=params.point??pos(params.target),v=pos(e);if(dist(v,p)>1e-8)e.facing=Math.atan2(p.y-v.y,p.x-v.x)*180/Math.PI;}
  if(AESARA_RULES[id]?.active)return castAesaraAbility(game,e,id,params,heroScriptApi);
  if(BRIGHT_ARTHAS_RULES[id]?.active)return castBrightArthasAbility(game,e,id,{mode:'manual',...params},heroScriptApi);
  if(DARK_ARTHAS_RULES[id]?.active)return castDarkArthasAbility(game,e,id,{mode:'manual',...params},heroScriptApi);
  if(LICH_KING_RULES[id]?.active)return castLichKingAbility(game,e,id,{mode:'manual',...params},heroScriptApi);
  if(VASHJ_RULES[id]?.active)return castVashjAbility(game,e,id,{mode:'manual',...params},heroScriptApi);
  if(ICE_HERO_RULES[id])return castIceHeroAbility(game,e,id,{mode:'manual',...params},heroScriptApi);
  if(TROLL_ACTIVE_RULES[id])return castTrollAbility(game,e,id,{mode:'manual',...params},heroScriptApi);
  if(KELTHUZAD_ACTIVE_RULES[id]||id==='A0ZO')return castKelthuzadAbility(game,e,id,{mode:'manual',...params},heroScriptApi);
  if(NAGA_ACTIVE_RULES[id]?.active)return castNagaAbility(game,e,id,{mode:'manual',...params},heroScriptApi);
  if(GARROSH_ACTIVE_RULES[id])return castGarroshAbility(game,e,id,{mode:'manual',...params},heroScriptApi);
  if(ILLIDAN_ACTIVE_RULES[id])return castIllidanAbility(game,e,id,{mode:'manual',...params},heroScriptApi);
  game._sourceAbilityEffectDepth=(game._sourceAbilityEffectDepth??0)+1;
  try{return ALCHEMIST_ACTIVE_RULES[id]?castAlchemistAbility(game,e,id,{mode:'manual',...params},{universalDamage}):castYseraAbility(game,e,id,{mode:'manual',...params},heroScriptApi);}finally{game._sourceAbilityEffectDepth--;}
}
function triggerNagaDamageSkills(game,damaged,attacker){
  const now=game.state.time;
  for(const kind of ['naga_hurricane','naga_ripple'])for(const [caster,other] of [[damaged,attacker],[attacker,damaged]]){
    const s=active(caster).find(s=>s.kind===kind);if(!s||!isV14(caster)||!Number.isFinite(caster.mana)||!cast(game,caster,s,other,game.state.entities))continue;
    retainNagaScriptCaster(game,caster);
    const source=scriptSource(caster);game.state.sourceSkillJobs??=[];
    if(kind==='naga_hurricane')game.state.sourceSkillJobs.push({type:kind,sourceId:caster.id,source,...pos(other),radius:s.radius,pull:s.pull,damage:s.damage,interval:s.interval,remaining:s.count,nextAt:now+s.interval});
    else for(const t of scriptTargets(game,caster,other,s.radius,false))game.state.sourceSkillJobs.push({type:'target_pulses',sourceId:caster.id,source,targetId:t.id,damage:s.damage,interval:s.interval,remaining:s.count,nextAt:now+s.interval});
    break;
  }
}
function triggerNagaBoon(game,target){
  const s=active(target).find(s=>s.kind==='naga_boon');if(!s||!isV14(target))return;const now=game.state.time,st=state(target,s);
  if(st.readyAt>now||game._random()>=s.chance)return;st.readyAt=now+s.cooldown;st.casts++;game._event('cast',target,s.name,{skillId:s.id});
  for(const t of scriptTargets(game,target,target,s.radius,true)){
    // UnitAddAbilityByTimer refreshes separate timers for these two abilities.
    buff(t,{...compile('A2Y8','v14.1A5'),duration:3,heroDuration:3},target,now,{key:'A2Y8',damage:0});
    buff(t,{...compile('A2Y9','v14.1A5'),duration:5,heroDuration:5},target,now,{key:'A2Y9',damage:0});
  }
}
export function tickSourceScriptJobs(game,dt=0){
  for(const e of game.state.entities)if(e.status?.ensnareOriginalTargetType&&e.status.ensnareGroundedUntil<=game.state.time){e.targetType=e.status.ensnareOriginalTargetType;delete e.status.ensnareOriginalTargetType;delete e.status.ensnareGroundedUntil;}
  tickSourceAuraRules(game,{matchesTargets});
  const now=game.state.time,remaining=[];
  for(const job of game.state.sourceSkillJobs??[]){
    if(job.type==='broodmother_alliance'){if(tickBroodmotherJob(game,job,heroScriptApi))remaining.push(job);continue;}
    if(job.type==='nightmare_souls'){if(tickNightmareJob(game,job,heroScriptApi))remaining.push(job);continue;}
    if(job.type==='soul_toxin'){if(tickSoulToxinJob(game,job,heroScriptApi))remaining.push(job);continue;}
    if(isSkeletonKingJobType(job.type)){if(tickSkeletonKingJob(game,job,heroScriptApi))remaining.push(job);continue;}
    if(['huskar_duel','huskar_duel_immune'].includes(job.type)){if(tickHuskarDuelJob(game,job))remaining.push(job);continue;}
    if(job.type==='huskar_unyielding'){if(tickHuskarJob(game,job,heroScriptApi))remaining.push(job);continue;}
    if(isAesaraJobType(job.type)){if(tickAesaraJob(game,job,heroScriptApi))remaining.push(job);continue;}
    if(isBrightArthasJobType(job.type)){if(tickBrightArthasJob(game,job,heroScriptApi))remaining.push(job);continue;}
    if(isDarkArthasJobType(job.type)){if(tickDarkArthasJob(game,job,heroScriptApi))remaining.push(job);continue;}
    if(isLichKingJobType(job.type)){if(tickLichKingJob(game,job,heroScriptApi))remaining.push(job);continue;}
    if(isVashjJobType(job.type)){if(tickVashjJob(game,job,heroScriptApi))remaining.push(job);continue;}
    if(isSourceClassJobType(job.type)){tickSourceClassJob(game,job,heroScriptApi);if(!job.done)remaining.push(job);continue;}
    if(isIceHeroJobType(job.type)){if(tickIceHeroJob(game,job,heroScriptApi))remaining.push(job);continue;}
    if(isTrollJobType(job.type)){if(tickTrollJob(game,job,heroScriptApi))remaining.push(job);continue;}
    if(isKelthuzadJobType(job.type)){if(tickKelthuzadJob(game,job,heroScriptApi))remaining.push(job);continue;}
    if(job.type.startsWith('garrosh_active_')){if(tickGarroshActiveJob(game,job,heroScriptApi))remaining.push(job);continue;}
    if(isIllidanJobType(job.type)){if(tickIllidanJob(game,job,heroScriptApi))remaining.push(job);continue;}
    if(job.type.startsWith('naga_active_')){if(tickNagaJob(game,job,heroScriptApi))remaining.push(job);continue;}
    if(job.type.startsWith('alchemist_')){if(tickAlchemistJob(game,job,{universalDamage}))remaining.push(job);continue;}
    if(job.type.startsWith('ysera_')&&job.type!=='ysera_wake'){if(tickYseraJob(game,job,heroScriptApi))remaining.push(job);continue;}
    if(job.type==='garrosh_bleed'){if(tickGarroshJobs(game,job,now,{universalDamage}))remaining.push(job);continue;}
    const live=game.state.entities.find(e=>e.id===job.sourceId),source=isRetainedNagaJob(job)?resolveNagaScriptCaster(game,job,live):live??job.source;
    if(job.type==='naga_hurricane'){
      while(job.remaining>0&&job.nextAt<=now+1e-8){
        for(const t of scriptTargets(game,source,job,job.radius,false)){
          universalDamage(game,t,job.damage,source);const p=pos(t),distance=Math.hypot(job.x-p.x,job.y-p.y),step=Math.min(job.pull,distance);
          if(distance>0){const x=p.x+(job.x-p.x)/distance*step,y=p.y+(job.y-p.y)/distance*step;if(t.worldX!==undefined)t.worldX=x;else t.x=x;if(t.worldY!==undefined)t.worldY=y;else t.y=y;game._syncLocal?.(t);}
        }
        job.remaining--;job.nextAt+=job.interval;
      }
      if(job.remaining>0)remaining.push(job);
    }else if(job.type==='target_pulses'){
      const target=game.state.entities.find(e=>e.id===job.targetId);if(!target||target.hp<=0)continue;
      while(job.remaining>0&&target.hp>0&&job.nextAt<=now+1e-8){universalDamage(game,target,job.damage,source);job.remaining--;job.nextAt+=job.interval;}
      if(job.remaining>0&&target.hp>0)remaining.push(job);
    }else if(job.type==='ysera_wake'){
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
  pruneSoulToxinHandles(game);
  if(game.state.nagaScriptCasters){
    const owned=new Set(remaining.filter(isRetainedNagaJob).map(job=>String(job.sourceId)));
    for(const id of Object.keys(game.state.nagaScriptCasters))if(!owned.has(id))delete game.state.nagaScriptCasters[id];
  }
}
