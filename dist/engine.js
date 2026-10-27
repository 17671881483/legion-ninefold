import {relocationStatus,relocationRemaining,completeRelocation} from './relocation-rules.js';
import {resetLichKingRound} from './lich-king-rules.js';
import {skeletonKingGate,beginSkeletonKingRoundFinish,tickSkeletonKingLifecycle,isSkeletonKingJobType} from './skeleton-king-rules.js';
import {sourceBarrageTargets,sourceBarrageHit} from './skills.js';
import { UNITS, MERCENARIES, LEGACY_MERCENARIES, WAVES, RULES, HEROES, BUILDERS, PROPHET_POOLS, UNIT_TEMPLATES, TECHNOLOGIES, BOX_TRAINING_RULES } from './data.js';
import { attachSkills, refreshSourceSkills, initializeSourceSkills, initializeSourceClassCombat, sourceClassAttackDamageEvent, darkArthasDamageListeners, sourceRegisteredDamageEvent, brightArthasEventDamage, compileSkills, sourceAuraEffects, hasSourceAura, tickSourceSkills, sourceAttackIssued, sourceAttackStart, sourceOnHit, modifyIncoming, beforeSourceDamage, afterSourceDamage, sourceDeath, sourceMoveFactor, canWeaponTarget, sourceWeapon, tickSourceScriptJobs, manualSourceSkills, castManualSourceSkill } from './skills.js';
import { initializeSourceClassBuilding } from './source-class-rules.js';
import { MAP, laneToWorld, worldToLane, kingWorld, spawnWarpWorld, supportWorld, routePoints, isWalkable, isSegmentWalkable, constrainPoint, closestWalkable, navigationPath } from './layout.js';
import { recordEggCompletion, restoreEggHistory, finishEggWave, recordBeastKingKill, eggRequirementStatus, appearanceQualificationStatus } from './egg-rules.js';
import { queueSpecialMonsters, applySpecialMonsterSpawn, specialMonsterDeath, sourceEconomyBuildStart, sourceEconomyUpgradeFinish, farmerGoldRate, sourceEconomyDeath, applyFarmerRoundReward } from './special-rules.js';
import { applySandboxQualification } from './sandbox-qualifications.js';
import { BOX_REWARD_RULES, BOX_FARM_RULES, advanceBoxRewards, migrateBoxRewardProgress, boxTrainingRewardStatus, boxTrainingTargetStatus, boxTrainingCost, boxTrainingReplacementState, consumeBoxTrainingReward, claimBoxReward, completeBoxSwap, boxBuildFreeRefund } from './box-training-rules.js';

const units = Object.fromEntries(UNITS.map(u => [u.id, u]));
const mercs = Object.fromEntries([...LEGACY_MERCENARIES, ...MERCENARIES].map(u => [u.id, u]));
const MERCENARY_MAX_STOCK = 3;
const heroes = Object.fromEntries(HEROES.map(u => [u.id, u]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const number = (v, fallback) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const value = (o, keys, fallback) => { for (const k of keys) if (o?.[k] !== undefined) return number(o[k], fallback); return fallback; };
const worldPoint = e => ({ x: e.worldX ?? e.x, y: e.worldY ?? e.y });
const distance = (a, b) => Math.hypot((a.worldX ?? a.x) - (b.worldX ?? b.x), (a.worldY ?? a.y) - (b.worldY ?? b.y));
const regionsByTeam = [0, 1].map(team => MAP.regions.filter(r => r.team === team));
const copy = o => JSON.parse(JSON.stringify(o));
const abilityOf = u => typeof u?.ability === 'string' ? { type: u.ability, value: .35 } : u?.ability;
const baseUnits = UNITS.filter(u => !u.legacy && (u.randomPool || u.isBase));
const rule = (key, fallback) => value(RULES, [key], fallback);
const isSourceUnit = u => ['5.0dJF-workbook', 'v14.1A5-dataset'].includes(u?.provenance);
const isV14 = u => u?.sourceVersion === 'v14.1A5' || u?.provenance === 'v14.1A5-dataset';
const rawcode = u => u?.sourceRawcode ?? u?.combatRawcode ?? u?.rawcode;
const sourceLimits = Object.fromEntries(UNITS.filter(u=>!u.legacy && u.buildLimit!==undefined && u.buildLimit!==null && Number.isFinite(Number(u.buildLimit)) && Number(u.buildLimit)>=0).map(u=>{
  const details=u.buildLimitDetails??u.buildLimits??[], list=Array.isArray(details)?details:[details], detail=list.at(-1)??{};
  return [rawcode(u),{...detail,unitRawcode:rawcode(u),maxAllowed:Number(u.buildLimit),scope:u.buildLimitScope??detail.scope??'type'}];
}));
// EggWhiteEx opens the player's chosen holy-dragon appearance with one shared
// allowance (war3map.j:28865–28866); it is absent from the static cap CSV.
for (const code of ['h201', 'h204']) sourceLimits[code] = { unitRawcode: 'h201', unitRawcodes: ['h201', 'h204'], maxAllowed: 1, scope: 'type', source: { script: 'war3map.j', lines: [28865, 28866] } };
const gameMode = mode => mode === 'sandbox' ? 'sandbox' : 'normal';
const SANDBOX_RESOURCES = 100000;
const SANDBOX_POPULATION = 300;
const BOX_PLAYER_DESCRIPTIONS={
  A131:'立即免费提升一级农场，增加人口上限。',A132:'在自己的建造区获得一个随机三级兵。',
  A133:'获得50金币。',A134:'获得150木材。',A135:'所选军团永久增加300生命、1护甲。',A136:'所选军团永久增加30攻击、10%攻速。',
  A13M:'给建造者获得“死亡一指”主动技能。',A2ZA:'选择己方兵种，支付目标原价40%的金币和木材，即时训练为目标分支；成功后用完本组礼物。',
  A2ZB:'获得一次免费建造资格；科技快捷升级入口尚未接入。',A2ZC:'所选单位永久获得护盾，受到的敌对伤害降低15%。',
  A2ZD:'先选择一个己方军团，再选择另一个，交换两者的建造位置。',A2ZE:'拆除所选兵种，按兵力值返还金币，不返还木材。',
  A140:'立即免费提升一级伐木科技。',A13N:'在自己的建造区获得一个随机六级兵。',A13O:'获得300金币。',A13P:'获得800木材。',
  A13Q:'所选军团永久增加800生命、2护甲及每秒40生命恢复。',A13R:'所选军团永久增加80攻击、20%攻速，获得40%概率的双倍暴击。',A13S:'给建造者获得“雷霆一击”主动技能。',
};



/** Deterministic, DOM-free simulation. tick receives real elapsed seconds; speed is applied here. */
export class Game {
  constructor(options = {}) {
    this.options = { seed: options.seed ?? 42, difficulty: options.difficulty ?? 'normal', builderId: options.builderId ?? RULES.defaultBuilderId ?? BUILDERS[0]?.id, ggEnabled: options.ggEnabled ?? RULES.ggEnabled ?? true, mode: gameMode(options.mode) };
    this._rng = (Number(this.options.seed) || 42) >>> 0;
    this._id = 0;
    this._spawnQueue = [];
    this._aiTimer = 0;
    this._roundTime = 0;
    this._settledLanes = [];
    this._overtime = false; this._monsterPressure = [1, 1];
    this._spatial = null; this._worldEntities = null; this._battleAuras = [[], []]; this._warpTimer = 0;
    const initialGold = rule('initialGold', 300);
    const names = ['你', '青岚 · 队友', '铁壁 · 队友', '星火 · 队友', '赤锋 · 对手', '暗潮 · 对手', '霜刃 · 对手', '影木 · 对手'];
    this.state = {
      map: { id: MAP.id, version: MAP.version, topology: '2x2-crossbar-stem' },
      mode: this.options.mode,
      phase: 'build', wave: 1, timer: this.buildDuration(1), time: 0, sourceVersion: RULES.sourceVersion, dataRevision: RULES.dataRevision ?? '5.0dJF-web9',
      speed: 1, paused: false, winner: null, difficulty: this.options.difficulty, seed: this.options.seed,
      players: names.map((name, id) => ({ id, name, team: id < 4 ? 0 : 1,
        gold: initialGold, wood: rule('initialWood', 40), income: rule('initialIncome', 5),
        workers: rule('initialWorkers', 1), lumberLevel: 0, technologies: { R0GK: 1 }, entitlements: {}, nagaFarmerGoldRate: 0, economyTasks: { workerQueue: [], lumberTask: null }, buildings: [], builderId: id === 0 ? this.options.builderId : this._pick(BUILDERS.filter(b=>b.mode!=='morph'))?.id ?? RULES.defaultBuilderId ?? BUILDERS[0]?.id, roster: [],
        mercStocks: Object.fromEntries(MERCENARIES.map(m => [m.id, { stock: this._mercenaryMaxStock(m), nextReadyAt: null }])),
        populationCap: rule('initialPopulation', 40), sourceFarmRawcode:'h024', popUsed: rule('initialWorkers', 1), heroId: null, heroAltarCount: 0, relocationsRemaining:3, healUsed: false, rerolls: 0, stats: { kills: 0, leaks: 0, warps: 0, sent: 0, damage: 0, goldEarned: 0, wavesHeld: 0 }
      })),
      kings: [0, 1].map(team => ({ team, hp: rule('kingInitialHp', 12000), maxHp: rule('kingInitialHp', 12000),
        attack: rule('kingDamage', 135), regen: rule('kingRegen', 4), healCharges: rule('kingHealCharges', 4),
        armor: rule('kingArmor', 8), armorType: 'hero', attackType: 'hero', autoUpgradeCount: 0, healBlockedUntil: 0,
        id:`king-${team}`,unitId:'king',side:'defender',isKing:true,battleTeam:team,laneId:8+team,status:{},targetType:'structure',traits:['mechanical'],isBuilding:true,hpLevel: 0, attackLevel: 0, regenLevel: 0, attackCd: 0, worldX: kingWorld(team).x, worldY: kingWorld(team).y, radius: .8 })),
      entities: [], sourceSkillJobs: [], nagaScriptCasters: {}, darkArthasCasters: {}, brightArthasHandles: {}, aesaraHandles: {}, skeletonKingGate: {li:false,statisticsEnabled:true}, events: [], logs: [], pendingSends: [], kingBountyPools: [0, 0], teamLeakFlags: [false, false],
      metrics: { spawned: 0, killed: 0, leaked: 0 }, boxRewardProgress: { firstGranted:false, secondGranted:false },
    };
    for (const p of this.state.players) {
      p.roster = this._roster(p.builderId);
      // Initialize the same empty journal saved/restored for players who have
      // not finished a troop yet; restoring must not add new progression data.
      restoreEggHistory(p,{wave:this.state.wave,buildings:p.buildings,unitsById:units});
    }
    this._log(`${RULES.title}：按来源建造军团，发展木材，与队友共同守护国王。`);
    this._log('采用v14.1A5九倍实怪数量和HP；静态数据与Web近似、原脚本冲突均保留来源说明。');
    if (this.state.mode === 'sandbox') {
      this.state.sandbox = { aiEnabled: false };
      this._sandboxResources();
      this._log('测试沙盒：金币与木材各10万、人口300；备战不限时，手动出兵。AI默认关闭，仅本路刷新波次，木怪派遣仍按正常规则生效。');
    } else for (let id = 1; id < 8; id++) this._aiBuild(this.state.players[id], true);
  }

  _random() {
    let t = this._rng = (this._rng + 0x6D2B79F5) >>> 0;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
  _uid(prefix = 'e') { return `${prefix}${++this._id}`; }
  _pick(items) { return items.length ? items[Math.floor(this._random() * items.length)] : undefined; }
  _roster(builderId = this.options?.builderId ?? RULES.defaultBuilderId ?? BUILDERS[0]?.id) {
    const builder=BUILDERS.find(b=>b.id===builderId||b.rawcode===builderId)??BUILDERS.find(b=>b.mode==='prophet');
    if(builder?.mode==='prophet')return PROPHET_POOLS.map(pool=>this._pick(pool.filter(id=>units[id]))).filter(Boolean);
    if(builder)return builder.rosterIds.filter(id=>units[id]);
    return baseUnits.slice(0,6).map(u=>u.id);
  }
  _military(p) {return p.buildings.filter(b=>!b.construction).reduce((sum,b)=>sum+value(units[b.unitId],['sourcePoints'],b.totalSpent??b.spent??this._cost(units[b.unitId])),0);}
  _buildLimitCount(p, limit, excludeBuildingId) {
    return p.buildings.filter(b=>b.id!==excludeBuildingId && (
      (limit.unitRawcodes??[limit.unitRawcode]).includes(rawcode(units[b.unitId])) || (limit.unitRawcodes??[limit.unitRawcode]).includes(rawcode(units[b.construction?.targetId])) ||
      limit.scope==='lineage' && b.limitOrigins?.includes(limit.unitRawcode)
    )).length;
  }
  buildLimitStatus(unitId, playerId = 0, excludeBuildingId) {
    const u=typeof unitId==='object'?unitId:units[unitId],p=this.state.players[playerId],limit=sourceLimits[rawcode(u)];
    if(!limit||!p)return {canStart:true,reason:'',current:0,max:null,scope:null};
    const current=this._buildLimitCount(p,limit,excludeBuildingId),canStart=current<limit.maxAllowed;
    return {canStart,reason:canStart?'':`${u.name}来源限造${limit.maxAllowed}个（含施工及预留）`,current,max:limit.maxAllowed,scope:limit.scope,rawcode:limit.unitRawcode,source:limit.source};
  }
  _recordLimitOrigins(b, def) {
    delete b.boxLimitTransferred;
    const next=sourceLimits[rawcode(def)];b.limitOrigins??=[];
    // Native base_id keeps a normal lineage through unlimited upgrades; a new
    // limited branch replaces marker-free base groups (JASS28440—28447).
    if(next)b.limitOrigins=b.limitOrigins.filter(id=>id===next.unitRawcode || sourceLimits[id]?.counterMarkerRawcode);
    if(next?.scope==='lineage'&&!b.limitOrigins.includes(next.unitRawcode))b.limitOrigins.push(next.unitRawcode);
  }
  _heroBuildings(p) {
    return p.buildings.filter(b=>[units[b.unitId],units[b.construction?.targetId]].some(u=>u?.heroEntry||u?.hero));
  }
  _heroAltarCount(p) {
    return Math.max(number(p.heroAltarCount,0),p.heroAltarUsed?1:0,this._heroBuildings(p).length,p.heroId?1:0);
  }
  _heroFamily(u) { return u?.heroFamily ?? u?.heroTypeRawcode ?? rawcode(u); }
  /** Read-only altar availability shared by the build panel and AI. */
  heroStatus(playerId = 0) {
    const p=this.state.players[playerId],limit=rule('heroLimit',2);
    if(!p)return {entries:[],limit,count:0,remaining:0,used:false,buildingId:null,buildingIds:[],military:0,requiredMilitary:0,canStart:false,reason:'玩家不存在'};
    const entries=(this._sourceBuilder(p)?.heroEntryIds??[]).filter(id=>units[id]);
    const count=this._heroAltarCount(p),buildings=this._heroBuildings(p),remaining=Math.max(0,limit-count),military=this._military(p);
    const requiredMilitary=Math.max(0,...entries.flatMap(id=>(units[id].requiresDetails??[]).map(r=>RULES.militaryRequirements?.[r.rawcode]??(/兵力要求/.test(r.name??'')?number((r.name??'').match(/\d+/)?.[0],0):0))));
    let reason=remaining===0?`本局英雄祭坛名额已用完（${limit}座）`:this.state.phase==='ended'?'本局已结束':this.state.phase!=='build'?'请在备战期建造英雄祭坛':!entries.length?'当前建造者没有英雄祭坛入口':p.buildings.length>=48?'建造区已满':'';
    if(!reason){
      const statuses=entries.map(id=>{const u=units[id],gate=this.requirementStatus(u,p.id);return gate.reason||(this._population(p)+u.population>p.populationCap?'人口不足，请扩建营地':p.gold+1e-8<this._cost(u)||p.wood+1e-8<number(u.woodCost,0)?`需要 ${this._cost(u)} 金币、${number(u.woodCost,0)} 木材`:'');});
      if(statuses.every(Boolean))reason=statuses[0];
    }
    return {entries,limit,count,remaining,used:remaining===0,buildingId:buildings[0]?.id??null,buildingIds:buildings.map(b=>b.id),military,requiredMilitary,canStart:!reason,reason};
  }
  /** A missing external entitlement/technology is a locked source condition. */
  requirementStatus(unitId, playerId = 0) {
    const u = typeof unitId === 'object' ? unitId : units[unitId], p = this.state.players[playerId];
    if (!u || !p) return { canStart: false, reason: '兵种或玩家不存在', requirements: [] };
    let source = u.requiresDetails ?? u.requirements ?? u.requires ?? [];
    if (typeof source === 'string') source = source.split(',').filter(Boolean);
    const requirements = source.map(item => {
      const r = typeof item === 'string' ? { rawcode: item } : item;
      const id = r.rawcode ?? r.requirement_rawcode ?? r.id, name = r.name ?? r.requirement_name ?? id;
      const required = Math.max(1, number(r.amount ?? r.required ?? r.level, 1));
      let kind = r.kind ?? r.requirement_kind ?? 'unit_or_requirement_marker', current = 0, threshold = RULES.militaryRequirements?.[id];
      if (!threshold && /兵力要求/.test(name)) threshold = Number(name.match(/(\d+)/)?.[1]);
      const counter=Object.values(sourceLimits).find(limit=>limit.counterMarkerRawcode===id);
      const egg=eggRequirementStatus(p,id);
      if(counter){kind='capacity_marker';current=this._buildLimitCount(p,counter)<counter.maxAllowed?1:0;}
      else if (egg) return egg;
      else if (id === 'u004') { kind = 'battle_end'; current = this.state.phase === 'build' ? 1 : 0; }
      else if (threshold) { kind = 'military'; current = this._military(p); return { rawcode: id, name, kind, required: threshold, current, met: current >= threshold }; }
      else if (/赞助|会员|荣誉|道具|皮肤|尊享/.test(name) || ['h200','h210','h220','h230','h240'].includes(id)) { kind = 'entitlement'; current = number(p.entitlements?.[id],0); }
      else if (kind === 'technology' || /^R/.test(id)) {
        kind = 'technology';
        current = id === 'R003' ? this._sourceLumberLevels(p).basic : id === 'R00H' ? this._sourceLumberLevels(p).advanced : id === 'R000' ? this.state.kings[p.team].hpLevel : id === 'R001' ? this.state.kings[p.team].attackLevel : id === 'R002' ? this.state.kings[p.team].regenLevel : number(p.technologies?.[id],0);
      } else { kind = 'owned_unit'; current = p.buildings.filter(b => !b.construction && rawcode(units[b.unitId]) === id).length; }
      return { rawcode: id, name, kind, required, current, met: current >= required };
    });
    const appearanceGate=appearanceQualificationStatus(p,u);if(appearanceGate)requirements.push(appearanceGate);
    const limit=this.buildLimitStatus(u,playerId);
    if(limit.max!==null)requirements.push({rawcode:limit.rawcode,name:`限造${limit.max}个`,kind:'build_limit',required:limit.max,current:limit.current,met:limit.canStart});
    if(u.heroEntry){const count=this._heroAltarCount(p),max=rule('heroLimit',2);requirements.push({rawcode:'hero-altars',name:`本局最多${max}座英雄祭坛`,kind:'hero_limit',required:max,current:count,met:count<max});}
    if(u.heroChoice){
      const family=this._heroFamily(u),owned=this._heroBuildings(p).some(b=>[units[b.unitId],units[b.construction?.targetId]].some(def=>def?.hero&&this._heroFamily(def)===family));
      requirements.push({rawcode:family,name:'同种英雄只能选择一次',kind:'hero_unique',required:1,current:owned?1:0,met:!owned});
      if(u.heroAllowedBuilderIds?.length){const builderId=this._sourceBuilder(p)?.id??p.builderId,allowed=u.heroAllowedBuilderIds.includes(builderId);requirements.push({rawcode:'hero-builder',name:'当前建造者不能选择此英雄',kind:'hero_builder',required:1,current:allowed?1:0,met:allowed});}
    }
    const failed = requirements.find(r => !r.met);
    return { canStart: !failed, reason: failed ? ['hero_limit','hero_unique','hero_builder'].includes(failed.kind)?failed.name:failed.kind === 'build_limit' ? limit.reason : failed.kind === 'capacity_marker' ? `数量限制：${failed.name}` : failed.kind === 'military' ? `需要军力 ${failed.required}` : failed.kind === 'battle_end' ? '等到战斗结束' : failed.kind === 'unconfirmed_recipe' ? `配方待核定：${failed.name}` : `${['entitlement','appearance_qualification'].includes(failed.kind) ? '来源资格未具备' : '未满足来源条件'}：${failed.name}` : '', requirements };
  }
  _requirement(p,u) { return this.requirementStatus(u,p.id).reason; }
  kingUpgradeCap(stat) {
    const early = RULES.kingEarlyUpgradeCaps?.[stat], cap = number(RULES.kingUpgradeCaps?.[stat],15);
    return early && this.state.wave < early.beforeWave ? Math.min(cap,early.cap) : cap;
  }
  kingHealAmount(team = 0) {
    const k = this.state.kings[team];
    return k ? Number.isFinite(RULES.kingHealFraction) ? k.maxHp * RULES.kingHealFraction : rule('kingHealAmount',10000) : 0;
  }
  _sourceLifeScale(def, wave = this.state.wave) {
    if (!isV14(def) || wave <= 5) return 1;
    const flags = String(def.unitTypeFlags ?? def.sourceRawFields?.type ?? def.type ?? '').toLowerCase().split(',');
    const eligible = def.sapperScalingTarget ?? def.sapScalingTarget ?? def.x9SapperScalingApplies ?? (flags.includes('sapper') && !flags.some(f=>['summoned','giant'].includes(f)) && !def.isBuilding && number(def.sourceRawFields?.isbldg,0)!==1);
    return eligible ? wave <= 10 ? 1.5 : 3 : 1;
  }

  _kingPosition(team){const k=this.state.kings[team];return Number.isFinite(k?.worldX)?{x:k.worldX,y:k.worldY}:kingWorld(team);}
  _sourceBuilder(p) {return BUILDERS.find(b=>b.id===p.builderId||b.rawcode===p.builderId);}
  _resolveMorph(u) {if(!u?.morphProxy)return u;const choices=(u.morphTargets?.length?u.morphTargets:PROPHET_POOLS[Math.max(0,(u.tier??1)-1)]??[]).map(v=>typeof v==='string'?units[v]:units[v.id]).filter(Boolean);return this._pick(choices)??null;}

  _log(text) { this.state.logs.push({ time: this.state.time, text }); if (this.state.logs.length > 100) this.state.logs.shift(); }
  _event(type, entity, text, extra = {}) {
    const laneId = entity?.laneId ?? -1;
    let position = entity && Number.isFinite(entity.worldX) ? worldPoint(entity) : laneToWorld(laneId, entity?.x ?? 3, entity?.y ?? 6);
    if (!position && laneId >= 8) position = kingWorld(laneId - 8);
    this.state.events.push({ id: this._uid('fx'), type, laneId,
      x: entity?.x ?? 3, y: entity?.y ?? 6,
      worldX: position?.x, worldY: position?.y,
      text: String(text ?? ''), time: this.state.time, ...extra });
    if (this.state.events.length > 250) this.state.events.splice(0, this.state.events.length - 250);
  }
  _result(ok, message) {
    if (this.state?.players) for (const p of this.state.players) p.popUsed = this._population(p);
    return { ok, message };
  }
  _population(p) { return (p.workers + (p.economyTasks?.workerQueue?.length ?? 0)) * rule('workerPopulation', 1) + p.buildings.reduce((sum,b)=>sum+Math.max(value(units[b.unitId],['population'],1),value(units[b.construction?.targetId],['population'],0)),0) + (p.heroId ? value(heroes[p.heroId], ['population'], 3) : 0); }
  _getPlayer(payload) { return this.state.players[payload?.playerId ?? 0]; }
  _cost(u) { return value(u, ['cost', 'goldCost', 'gold'], 100); }
  _woodCost(u) { return value(u, ['woodCost', 'wood', 'cost'], 60); }
  _building(id) {
    for (const p of this.state.players) { const b = p.buildings.find(b => b.id === id); if (b) return { p, b }; }
    return null;
  }
  _upgradeIds(u) {
    const explicit = u.upgrades ?? u.upgradeTo ?? [];
    const ids = (Array.isArray(explicit) ? explicit : [explicit]).map(v => typeof v === 'object' ? v.id : v);
    return [...new Set([...ids, ...UNITS.filter(v => [v.upgradeFrom, v.parentId, v.baseId].includes(u.id)).map(v => v.id)])].filter(id => units[id]);
  }

  _economyTasks(p) {
    p.economyTasks ??= { workerQueue: [], lumberTask: null };
    p.economyTasks.workerQueue ??= []; p.economyTasks.lumberTask ??= null;
    return p.economyTasks;
  }
  _workerRecipe(p) {
    const pending = p.economyTasks?.workerQueue?.length ?? 0;
    return {
      cost: { gold: rule('workerCostBase', 50) + Math.max(0, p.workers + pending - 1) * rule('workerCostStep', 0), wood: rule('workerWoodCost', 0) },
      duration: Math.max(.001, rule('workerTrainingSeconds', 20)),
    };
  }
  _lumberRecipe(p) {
    const target = p.lumberLevel + 1;
    const levels = RULES.lumberLevels ?? [];
    const listed = levels.find(level => number(level.level ?? level.targetLevel, -1) === target) ?? levels[target - 1];
    // The first 15 levels use the source upgrades. Higher levels follow the
    // explicitly configured Web continuation, never the former gold-only curve.
    const fallbackCost = target <= 8 ? 60 + 20 * (target - 1) : 200 + 10 * (target - 9);
    return {
      cost: { gold: value(listed, ['gold'], fallbackCost), wood: value(listed, ['wood'], fallbackCost) },
      duration: Math.max(.001, value(listed, ['duration', 'seconds'], target <= 8 ? 18 + 2 * (target - 1) : 35)),
      targetLevel: target,
    };
  }
  _sourceLumberLevels(p) {
    const cap=rule('lumberBasicLevelCap',7),earlyAdvanced=number(p.lumberAdvancedWhileBasicQueued,0);
    const basic=Math.min(cap,Math.max(0,p.lumberLevel-earlyAdvanced));
    return {basic,advanced:p.lumberLevel-basic};
  }
  /** Treasure UpLumbering reserves the pending research in both native branches. */
  _treasureLumberBranch(p) {
    const levels=this._sourceLumberLevels(p),queued=p.economyTasks?.lumberTask?1:0;
    if(levels.basic+queued<rule('lumberBasicLevelCap',7))return 'basic';
    if(levels.advanced+queued<rule('maxLumberLevel',30)-rule('lumberBasicLevelCap',7))return 'advanced';
    return null;
  }
  treasureStatus(playerId=0) {
    const p=this.state.players[playerId];
    if(!p)return [];
    const targets=p.buildings.filter(b=>!b.construction&&units[b.unitId]?.combatRawcode).map(b=>({buildingId:b.id,name:units[b.unitId].name,armor:units[b.unitId].armor+number(b.treasureArmor,0)}));
    return (p.treasures??[]).map(t=>({ ...t,
      gold:[0,100,130,300][t.level]??0,wood:[0,200,300,600][t.level]??0,
      unitArmor:[0,15,30,50][t.level]??0,targets,
      lumberAvailable:!!t.canLumber&&!!this._treasureLumberBranch(p),
    }));
  }
  _boxDefinition(b) {const def=units[b?.unitId];return UNIT_TEMPLATES[rawcode(def)]??def;}
  _boxFarmStatus(p) {
    const stage=BOX_FARM_RULES.byRawcode[p.sourceFarmRawcode];
    const reason=!stage?'农场原型尚未核定，暂时保留这项礼物':p.economyTasks?.farmTask?'农场正在升级，原生取消与返费尚未核定，暂时保留礼物':!stage.nextRawcode?'来源农场已经满级':'';
    return {canStart:!reason,reason,stage};
  }
  _boxCombatDefinition(def,b) {
    const derived=new Set(b?.sourceClassGrantedAbilityIds??[]),abilities=(b?.permanentAbilityIds??[]).filter(id=>!derived.has(id));
    return abilities.length?{...def,abilityIds:[...new Set([...(def.abilityIds??[]),...abilities])]}:def;
  }
  _initializeSourceClassBuilding(b){
    const def=this._boxDefinition(b);
    if(isV14(units[b?.unitId])&&String(def?.sourceRawFields?.type??'').split(',').includes('ancient'))initializeSourceClassBuilding(this,b);
  }
  _boxGiftPoint(p,payload) {
    if(!Number.isFinite(payload.worldX)||!Number.isFinite(payload.worldY))return null;
    const point=worldToLane(payload.worldX,payload.worldY,p.id);
    return point?.laneId===p.id&&point.y>=4&&point.y<=12?point:null;
  }
  _createBoxFighter(p,selection,payload) {
    const point=this._boxGiftPoint(p,payload),def=UNITS.find(u=>!u.legacy&&rawcode(u)===selection.rawcode);
    if(!point||!def)return {ok:false,reason:'随机兵种模板或放置位置无效，礼物已保留'};
    // CreateUnit is immediate and the script applies no ordinary build-menu
    // population, technology, quota, occupancy or construction gate here.
    const b={id:this._uid('b'),unitId:def.id,col:point.x-.5,row:point.y-4.5,userData:0,spent:0,totalSpent:0,builtWave:null,
      sourceGift:{abilityId:selection.abilityId,tier:selection.tier,sourceWave:p.boxRewards.sourceWave},facing:selection.facing};
    p.buildings.push(b);this._recordLimitOrigins(b,def);this._recordSourceCompletion(p,def);this._recordEggCompletion(p,def,b);
    p.popUsed=this._population(p);
    this._event('build',{laneId:p.id,worldX:payload.worldX,worldY:payload.worldY},`礼物：${def.name}`);
    return {ok:true,unit:b};
  }
  _boxOwnedTargets(p,kind='ownedNotSelf') {
    return p.buildings.filter(b=>{
      const def=this._boxDefinition(b),flags=String(def?.sourceRawFields?.type??'').split(',');
      return def&&b.hp!==0&&b.removed!==true&&(kind!=='ancient'||flags.includes('ancient'))&&(kind!=='ownedNonTauren'||!flags.includes('tauren'))&&(kind!=='ownedNonHero'||!['STR','AGI','INT'].includes(def.sourceRawFields?.Primary));
    });
  }
  _boxTechStatus(p,def) {
    const codes=BOX_TRAINING_RULES.targetRequirements?.[rawcode(def)]?.rawRequirements??[];
    const requirements=codes.map(code=>def.requiresDetails?.find(r=>r.rawcode===code)??{rawcode:code,name:TECHNOLOGIES[code]?.name??UNIT_TEMPLATES[code]?.name??code});
    // The native helper reads only its registered tech list. Ordinary menu
    // caps, appearance purchase gates and altar selection rules do not run.
    const all=this.requirementStatus({...def,requiresDetails:requirements,documentGate:null,heroEntry:false,heroChoice:false},p.id).requirements.filter(r=>r.kind!=='build_limit');
    const failed=all.find(r=>!r.met);
    return {canStart:!failed,reason:failed?failed.kind==='battle_end'?'等到战斗结束':failed.kind==='military'?`需要军力 ${failed.required}`:`未满足训练条件：${failed.name}`:'',requirements:all};
  }
  _boxLimitReady(p,old,def,limit) {
    if(!limit)return true;
    const code=rawcode(def),used=p.buildings.filter(b=>b.id!==old.id&&b.hp!==0&&(rawcode(units[b.unitId])===code||!limit.limitidEx&&(b.baseId===code||b.limitOrigins?.includes(code)))).length;
    return used<limit.count;
  }
  boxTrainingStatus(buildingId,playerId=0) {
    const p=this.state.players[playerId],b=p?.buildings.find(b=>b.id===buildingId),reward=boxTrainingRewardStatus(p);
    if(!p||!b)return {canStart:false,reason:'请选择自己的训练单位',targets:[]};
    const def=units[b.unitId],provider={id:p.boxRewards?.providerId,ownerId:p.id},selection=BOX_TRAINING_RULES.selections[rawcode(def)];
    const targets=(selection?.rawTargets??[]).map(code=>UNITS.find(u=>!u.legacy&&rawcode(u)===code)).filter(Boolean).map(next=>{
      const gate=this._boxTechStatus(p,next),status=boxTrainingTargetStatus(p,provider,b,next,{getDefinition:u=>this._boxDefinition(u),isNativeHero:u=>['STR','AGI','INT'].includes(this._boxDefinition(u)?.sourceRawFields?.Primary),techReady:()=>gate.canStart,limitReady:(owner,old,target,limit)=>this._boxLimitReady(owner,old,target,limit)});
      const reason=!status.canStart&&status.reason.includes('科技')?gate.reason:status.reason??'';
      return {unitId:next.id,name:next.name,cost:status.fee??boxTrainingCost(next),canStart:this.state.phase!=='ended'&&status.canStart,reason:this.state.phase==='ended'?'本局已结束':reason};
    });
    return {canStart:targets.some(t=>t.canStart),reason:!reward.available?reward.reason:!targets.length?'该单位没有已核定的训练分支':targets.every(t=>!t.canStart)?targets[0].reason:'',targets};
  }
  boxRewardStatus(playerId=0) {
    const p=this.state.players[playerId],holder=p?.boxRewards;if(!p||!holder)return null;
    const offers=(!holder.consumed?holder.abilityIds??[]:[]).map(id=>{
      const entry=BOX_REWARD_RULES[id];if(!entry)return null;
      const training=entry.handler==='training',targetKind=training?'training':entry.handler==='randomFighter'?'point':['ancient','ownedNotSelf','ownedNonTauren'].includes(entry.targetKind)?'building':'none';
      const targets=['building','training'].includes(targetKind)?this._boxOwnedTargets(p,training?'ownedNonHero':entry.targetKind).map(b=>({buildingId:b.id,name:units[b.unitId]?.name??b.unitId})):[];
      let reason='';
      if(entry.handler==='builderAbility')reason='建造者主动施法尚未接入，可保留礼物或选择其他奖励';
      else if(entry.handler==='farm')reason=this._boxFarmStatus(p).reason;
      else if(entry.handler==='lumber'&&!this._treasureLumberBranch(p))reason='伐木科技已满（含研究中）';
      else if(['building','training'].includes(targetKind)&&!targets.length)reason='没有符合条件的己方单位';
      if(this.state.phase==='ended')reason='本局已结束';
      return {id,name:entry.name,description:BOX_PLAYER_DESCRIPTIONS[id]??entry.description,targetKind,targets,canStart:!reason,reason};
    }).filter(Boolean);
    if(p.boxSwap){const targets=this._boxOwnedTargets(p,'ancient').filter(b=>b.id!==p.boxSwap.firstTargetId).map(b=>({buildingId:b.id,name:units[b.unitId]?.name??b.unitId}));offers.push({id:'A2ZF',name:'完成单位换位',description:'选择另一个己方单位，交换两个建筑的位置；第二次选择失败不会丢失换位资格。',targetKind:'building',targets,canStart:targets.length>0,reason:targets.length?'':'还需要另一个己方远古单位'});}
    return offers.length?{providerId:holder.providerId,tier:holder.tier,sourceWave:holder.sourceWave,pendingSwap:!!p.boxSwap,offers}:null;
  }
  _woodRate(p) {
    const difficulty = p.team === 1 ? ({ easy: .85, normal: 1, hard: 1.18 }[this.options.difficulty] ?? 1) : 1;
    const levels=this._sourceLumberLevels(p),payload=rule('lumberBasePayload',2)+levels.basic*rule('lumberBasicPayloadPerLevel',1)+levels.advanced*rule('lumberAdvancedPayloadPerLevel',2.5);
    return p.workers * payload / rule('gatheringCycleSeconds',10);
  }
  _taskStatus(task) {
    if (!task) return null;
    const now = this.state.time;
    return { ...task, cost: { ...task.cost }, remaining: Math.max(0, task.finishAt - now),
      progress: clamp((now - task.startAt) / task.duration, 0, 1), state: now + 1e-8 < task.startAt ? 'queued' : 'running' };
  }
  /** Read-only economy view; all task completion happens during simulation steps. */
  economyStatus(playerId = 0) {
    const p = this.state.players[playerId]; if (!p) return null;
    const tasks = p.economyTasks ?? { workerQueue: [], lumberTask: null }, queue = tasks.workerQueue ?? [];
    const worker = this._workerRecipe(p), lumber = this._lumberRecipe(p);
    const maxWorkers = rule('maxWorkers', 10), maxLumber = rule('maxLumberLevel', 30), queueLimit = rule('workerQueueLimit', 3);
    const shortage = cost => p.gold + 1e-8 < cost.gold || p.wood + 1e-8 < cost.wood;
    const costMessage = (label, cost) => `${label}需要 ${cost.gold} 金币、${cost.wood} 木材`;
    let workerReason = '', lumberReason = '';
    if (this.state.phase === 'ended') workerReason = lumberReason = '本局已结束';
    else {
      if (p.workers + queue.length >= maxWorkers) workerReason = '小精灵已达上限（含招募中）';
      else if (queue.length >= queueLimit) workerReason = '招募队列已满';
      else if (this._population(p) + rule('workerPopulation', 1) > p.populationCap) workerReason = '人口不足，请扩建营地';
      else if (this._military(p) < rule('workerMilitaryRequirement',0)) workerReason = `招募需要军力 ${rule('workerMilitaryRequirement',0)}`;
      else if (shortage(worker.cost)) workerReason = costMessage('招募', worker.cost);
      if (p.lumberLevel >= maxLumber) lumberReason = '伐木科技已达上限';
      else if (tasks.lumberTask) lumberReason = '伐木科技正在研究';
      else if (this._military(p) < number(RULES.lumberLevels?.[p.lumberLevel]?.militaryRequirement,0)) lumberReason = `研究需要军力 ${RULES.lumberLevels[p.lumberLevel].militaryRequirement}`;
      else if (shortage(lumber.cost)) lumberReason = costMessage('研究', lumber.cost);
    }
    return {
      worker: { current: p.workers, max: maxWorkers, queued: queue.length, queueLimit, ...worker, canStart: !workerReason, reason: workerReason, tasks: queue.map(task => this._taskStatus(task)) },
      lumber: { current: p.lumberLevel, max: maxLumber, cost: lumber.cost, duration: lumber.duration, canStart: !lumberReason, reason: lumberReason, task: this._taskStatus(tasks.lumberTask) },
      woodPerSecond: this._woodRate(p), populationReserved: queue.length * rule('workerPopulation', 1),
    };
  }
  _completeConstruction(p, b) {
    if (!b.construction) return;
    const oldDef=units[b.unitId];
    if(b.construction.targetId!==b.unitId)sourceEconomyUpgradeFinish(this,p,b,oldDef);
    b.unitId = b.construction.targetId; b.construction = null; this._recordLimitOrigins(b,units[b.unitId]);this._recordSourceCompletion(p,units[b.unitId]);this._recordEggCompletion(p,units[b.unitId],b);
    if (p.id === 0) this._event('build', { laneId: p.id, x: b.col + .5, y: b.row + 4.5 }, `${units[b.unitId]?.name ?? ''}施工完成`);
  }
  _recordEggCompletion(p, def, building) {
    this._initializeSourceClassBuilding(building);
    return recordEggCompletion(p,def,{buildingId:building?.id,wave:this.state.wave,buildings:p.buildings,unitsById:units});
  }
  _recordSourceCompletion(p, def) {
    if(!isV14(def))return;
    p.completedSourceUnits??={};p.completedSourceUnits[rawcode(def)]=true;
    // EggWhiteEx, war3map.j:28796—28800: completing both units permanently
    // unlocks the alchemist hero, even after upgrading or selling them.
    if(p.completedSourceUnits.h0AF&&p.completedSourceUnits.h0AO){p.technologies??={};p.technologies.R2Z0=1;}
  }
  _completeMilitaryConstruction() {
    // Opening combat finishes the paid army orders only. Economy jobs retain
    // their real completion times, and the simulation clock does not advance.
    for (const p of this.state.players) {
      for (const b of p.buildings) this._completeConstruction(p, b);
      p.popUsed = this._population(p);
    }
  }
  _advanceEconomy(p, from, to) {
    const tasks = this._economyTasks(p);
    for (const b of p.buildings) if (b.construction?.finishAt <= to + 1e-8) this._completeConstruction(p, b);
    let cursor = from;
    // Integrate at each completion instant: a task finishing at the end of a
    // step must not earn its new production rate for the preceding interval.
    while (cursor < to - 1e-10) {
      const nextFinish = Math.min(tasks.workerQueue[0]?.finishAt ?? Infinity, tasks.lumberTask?.finishAt ?? Infinity,tasks.farmTask?.finishAt??Infinity);
      const end = Math.max(cursor, Math.min(to, nextFinish));
      p.wood += this._woodRate(p) * (end - cursor); cursor = end;
      if (tasks.workerQueue[0]?.finishAt <= cursor + 1e-8) {
        tasks.workerQueue.shift(); p.workers++;
        if (p.id === 0) this._log(`小精灵招募完成：${p.workers}/${rule('maxWorkers', 10)}。`);
      }
      if (tasks.lumberTask?.finishAt <= cursor + 1e-8) {
        p.lumberLevel = tasks.lumberTask.targetLevel; p.lumberAdvancedWhileBasicQueued=0; tasks.lumberTask = null;
        if (p.id === 0) this._log(`伐木科技 Lv.${p.lumberLevel} 研究完成。`);
      }
      if(tasks.farmTask?.finishAt<=cursor+1e-8){tasks.farmTask=null;p.sourceFarmRawcode=null;p.populationCap=Math.min(rule('maxPopulation',300),p.populationCap+rule('farmPopulation',8));if(p.id===0)this._log('农场建造完成，人口上限增加。');}
      if (cursor >= to - 1e-10) break;
    }
    p.popUsed = this._population(p);
  }

  /** Preparation time for the wave about to start. Arena/overtime remain Web rounds. */
  buildDuration(wave = this.state?.wave ?? 1) {
    if (wave === 1) return rule('firstBuildSeconds', 80);
    if (wave === rule('overtimeStartWave',31)) return rule('overtimePreparationSeconds',60);
    if (wave >= 32) return rule('overtimeWaveInterval',50);
    return 40 + Math.floor(wave / 2);
  }
  _mercenaryLocked(m) {
    if (m.shopPreview || this._mercenaryMaxStock(m) === 0) return true;
    const unlock = value(m, ['unlock', 'unlockWave', 'wave', 'minWave'], 1);
    return this.state.wave < unlock || (this.state.wave === unlock && m.unlockPhase === 'combat' && this.state.phase === 'build');
  }
  _mercenaryMaxStock(m) { return Math.max(0, Math.floor(value(m, ['stockMax', 'maxStock'], MERCENARY_MAX_STOCK))); }
  _mercenaryCooldown(m) { return Math.max(.001, value(m, ['cooldown', 'stockRegen', 'cd'], 4)); }
  _mercenarySlot(p, m) {
    p.mercStocks ??= {};
    let slot = p.mercStocks[m.id];
    const now = this.state.time, cooldown = this._mercenaryCooldown(m), maxStock = this._mercenaryMaxStock(m);
    if (!slot) {
      // Old saves held one absolute ready time per type. Keep the remaining wait.
      // Empty source stockStart means initial full stock is a documented Web choice.
      const legacyReadyAt = number(p.mercCooldowns?.[m.id], 0);
      slot = p.mercStocks[m.id] = legacyReadyAt > now
        ? { stock: 0, nextReadyAt: legacyReadyAt }
        : { stock: maxStock, nextReadyAt: null };
    }
    slot.stock = clamp(Math.floor(number(slot.stock, maxStock)), 0, maxStock);
    if (slot.stock >= maxStock) { slot.nextReadyAt = null; return slot; }
    if (!Number.isFinite(slot.nextReadyAt)) slot.nextReadyAt = now + cooldown;
    if (now + 1e-8 >= slot.nextReadyAt) {
      const replenished = Math.min(maxStock - slot.stock, Math.floor((now - slot.nextReadyAt + 1e-8) / cooldown) + 1);
      slot.stock += replenished;
      slot.nextReadyAt = slot.stock >= maxStock ? null : slot.nextReadyAt + replenished * cooldown;
    }
    return slot;
  }
  /** Current stock and progress toward the next charge, measured in simulation time. */
  mercenaryStatus(mercId, playerId = 0) {
    const m = mercs[mercId], p = this.state.players[playerId];
    if (!m || !p) return { stock: 0, maxStock: MERCENARY_MAX_STOCK, cooldown: 0, remaining: 0, progress: 0, locked: true };
    const slot = this._mercenarySlot(p, m), cooldown = this._mercenaryCooldown(m), maxStock = this._mercenaryMaxStock(m);
    const remaining = slot.stock >= maxStock ? 0 : Math.max(0, slot.nextReadyAt - this.state.time);
    const locked = this._mercenaryLocked(m);
    return { stock: locked ? 0 : slot.stock, maxStock, cooldown, remaining,
      progress: slot.stock >= maxStock ? 1 : clamp(1 - remaining / cooldown, 0, 1), locked, reason: m.shopPreview || maxStock === 0 ? '源记录未确认可购买库存，仅供图鉴参考' : locked ? '尚未达到来源解锁波次' : '' };
  }
  _armorFactor(armor) {
    return armor >= 0 ? 1 / (1 + .06 * armor) : 1 + (.06 * Math.abs(armor)) / (1 + .06 * Math.abs(armor));
  }
  _typeMultiplier(attackType, armorType, armorTypeRaw) { const key = armorTypeRaw === 'normal' ? 'normalArmor' : armorTypeRaw === 'none' ? 'unarmored' : armorType; return number(RULES.attackMultipliers?.[attackType]?.[key], 1); }
  /** Per-target strongest effects, shared by lane combat and king combat. */
  _auraEffects(target, auras = []) {
    let damage = 0, speed = 0, slow = 0, armor = 0, healRate = 0;
    for (const a of auras) {
      if (a.hp <= 0 || !a.ability || distance(a, target) > number(a.ability.radius, 3)) continue;
      const type = a.ability.type, amount = number(a.ability.value, 0);
      if (a.side === target.side) {
        if (type === 'aura_damage') damage = Math.max(damage, amount);
        if (type === 'aura_speed') speed = Math.max(speed, amount);
        if (type === 'aura_armor') armor = Math.max(armor, amount);
        if (type === 'aura_heal') healRate = Math.max(healRate, amount);
      } else if (type === 'aura_slow') slow = Math.max(slow, amount);
    }
    const source=sourceAuraEffects(this,target,auras);
    return { damageMultiplier: Math.max(.05,1+damage+source.damage), attackSpeedMultiplier: Math.max(.05,(1+speed+source.haste)*(1-slow)), armor:armor+source.armor, healRate:healRate+source.healRate,slow };
  }
  _applyHealingAura(target, auras, dt) {
    if (target.hp <= 0 || target.hp >= target.maxHp) return;
    const rate = this._auraEffects(target, auras).healRate;
    if (rate > 0) target.hp = Math.min(target.maxHp, target.hp + rate * dt);
  }
  _effectiveArmor(target, auraArmor = 0) {
    const broken = (target.status?.armorBreakUntil ?? 0) > this.state.time ? number(target.status.armorBreak, 0) : 0;
    return number(target.armor, 0) + auraArmor - broken;
  }

  _aiEnabled() { return this.state.mode !== 'sandbox' || this.state.sandbox?.aiEnabled === true; }
  _sandboxResources() {
    const p = this.state.players[0];
    p.gold = Math.max(p.gold, SANDBOX_RESOURCES); p.wood = Math.max(p.wood, SANDBOX_RESOURCES);
    p.populationCap = Math.max(p.populationCap, SANDBOX_POPULATION);
  }
  /** Discard a trial without settling it or moving the economy clock. */
  _resetSandboxWave(wave = this.state.wave) {
    const s = this.state;
    s.wave = wave; s.phase = 'build'; s.roundMode = 'normal'; s.timer = this.buildDuration(wave);
    s.paused = false; s.winner = null; s.entities = []; s.sourceSkillJobs = []; s.nagaScriptCasters = {}; s.darkArthasCasters = {}; s.brightArthasHandles = {}; s.aesaraHandles = {}; s.sourceAuraNextAt=Math.floor(s.time)+1; s.events = []; s.pendingSends = [];
    s.kingBountyPools = [0, 0]; s.teamLeakFlags = [false, false]; s.specialMonsters = {};
    for (const key of ['waveInfo', 'arenaRemaining', 'arenaResult', 'continuousRemaining', 'congestion']) delete s[key];
    this._spawnQueue = []; this._roundTime = 0; this._settledLanes = []; this._overtime = false; this._warpTimer = 0;
    this._aiTimer = 0; this._monsterPressure = [1, 1]; this._spatial = null; this._worldEntities = null; this._battleAuras = [[], []];
    for (const p of s.players) {
      p.healUsed = false; p.interfereUntil = 0; p.interfereCooldown = 0;
      p.roundLeaks = 0; p.sourceLeaks = 0; p.leakBountyFactor = 0; p.supportAnnounced = false;
      for (const b of p.buildings) if (b.temporaryForm) { b.unitId = b.temporaryForm; b.temporaryForm = null; b.stimulatedWave = null; }
      p.popUsed = this._population(p);
      if(wave>1)restoreEggHistory(p,{wave,buildings:p.buildings,unitsById:units});
    }
    for (const k of s.kings) {
      const point = kingWorld(k.team);
      k.hp = k.maxHp; k.healCharges = rule('kingHealCharges', 4); k.healBlockedUntil = 0; k.attackCd = 0;
      k.worldX = point.x; k.worldY = point.y; k.status = {}; k.buffs = []; k.skillStates = {};
      k.targetId = null; k.pendingAttack = null; k.chase = null; k.nav = null; k.movePath = null;
      k.moveCommanderId = null; k.commandLockedUntil = 0;
    }
  }
  _sandboxCommand(type, payload) {
    if (this.state.mode !== 'sandbox') return this._result(false, '测试指令仅限沙盒模式');
    const p = this.state.players[0];
    if (type === 'sandboxResources') {
      this._sandboxResources(); return this._result(true, '金币、木材已补足10万，人口上限已补足300');
    }
    if (type === 'sandboxWave') {
      if (!Number.isInteger(payload.wave) || payload.wave < 1 || payload.wave > WAVES.length) return this._result(false, `请选择1至${WAVES.length}的整数波次`);
      this._resetSandboxWave(payload.wave); this._log(`测试沙盒：已切换至第 ${payload.wave} 波，手动出兵开始测试。`);
      return this._result(true, `已选择第 ${payload.wave} 波`);
    }
    if (type === 'sandboxReset') {
      this._resetSandboxWave(); this._log(`测试沙盒：第 ${this.state.wave} 波已重置，保留阵容与经济进度。`);
      return this._result(true, '本波已重置，可调整阵容后再次出兵');
    }
    if(type==='sandboxQualification'){const result=applySandboxQualification(this,payload);return this._result(result.ok,result.message);}
    if(type==='sandboxBoxTraining'){
      p.boxRewards={providerId:`box-n060-${p.id}`,providerRawcode:'n060',ownerId:p.id,tier:'box',abilityIds:['A2ZA','A133','A134'],sourceWave:6,consumed:false,testGrant:true};
      delete p.boxSwap;return this._result(true,'已赠予沙盒训练测试礼物，请在神秘礼物面板选择训练目标');
    }
    if (!['sandboxBuilder', 'sandboxClear', 'sandboxComplete', 'sandboxAI'].includes(type)) return this._result(false, '未知测试指令');
    if (this.state.phase !== 'build') return this._result(false, '请先重置本波，再使用备战期测试指令');
    switch (type) {
      case 'sandboxBuilder': {
        if (typeof payload.builderId !== 'string' || !payload.builderId) return this._result(false, '建造者不存在');
        const builder = BUILDERS.find(b => b.id === payload.builderId || b.rawcode === payload.builderId);
        if (!builder) return this._result(false, '建造者不存在');
        p.builderId = builder.id; p.roster = this._roster(builder.id); p.builderChoices = [];
        return this._result(true, `已切换至${builder.name}`);
      }
      case 'sandboxClear':
        p.buildings = []; p.heroId = null; p.heroAltarUsed = false; p.heroAltarCount = 0;
        return this._result(true, '已清空本路阵容，保留资源与经济进度');
      case 'sandboxComplete': {
        for (const b of p.buildings) this._completeConstruction(p, b);
        const tasks = this._economyTasks(p);
        p.workers += tasks.workerQueue.length; tasks.workerQueue = [];
        if (tasks.lumberTask) { p.lumberLevel = tasks.lumberTask.targetLevel; p.lumberAdvancedWhileBasicQueued=0; tasks.lumberTask = null; }
        if (tasks.farmTask) { p.populationCap = Math.min(rule('maxPopulation', 300), p.populationCap + rule('farmPopulation', 8));p.sourceFarmRawcode=null;tasks.farmTask = null; }
        return this._result(true, '本路已支付的施工、招募和研究已全部完成');
      }
      case 'sandboxAI':
        if (typeof payload.value !== 'boolean') return this._result(false, '请选择开启或关闭AI');
        this.state.sandbox.aiEnabled = payload.value; this._aiTimer = 0;
        this._log(`测试沙盒：AI已${payload.value ? '开启，恢复八路波次与自主操作' : '关闭，仅本路刷新波次并停止自主操作'}。`);
        return this._result(true, `AI已${payload.value ? '开启' : '关闭'}`);
    }
  }

  unitSkillStatus(entityId,playerId=0){
    const e=this.state.entities.find(e=>e.id===entityId);
    return manualSourceSkills(this,e).map(s=>{const reason=e?.ownerId!==playerId?'只能指挥自己的单位':!['combat','arena'].includes(this.state.phase)?'仅可在战斗中施法':this.state.paused?'请先继续战斗':s.reason;return {...s,canStart:!reason,reason};});
  }
  relocationStatus(buildingId,playerId=0){
    const p=this.state.players.find(p=>p.id===playerId),found=this._building(buildingId);
    const b=found&&found.p===p?found.b:null;
    return relocationStatus(this.state,p,b,b?units[b.unitId]:null);
  }
  command(type, payload = {}) {
    if (type === 'restart') { const fresh = new Game({ ...this.options, ...payload }); Object.assign(this, fresh); return this._result(true, '已重新开始'); }
    if (typeof type === 'string' && type.startsWith('sandbox')) return this._sandboxCommand(type, payload);
    if (this.state.phase === 'ended') return this._result(false, '本局已结束，请重新开始');
    if (type === 'pause') { this.state.paused = payload.value === undefined ? !this.state.paused : !!payload.value; return this._result(true, this.state.paused ? '已暂停' : '继续战斗'); }
    if (type === 'speed') { this.state.speed = clamp(number(payload.value, 1), .5, 4); return this._result(true, `${this.state.speed} 倍速`); }
    const p = this._getPlayer(payload);
    if (!p) return this._result(false, '玩家不存在');
    switch (type) {
      case 'boxTrain': {
        const found=this._building(payload.buildingId),status=this.boxTrainingStatus(payload.buildingId,p.id),choice=status.targets.find(t=>t.unitId===payload.unitId);
        if(!found||found.p.id!==p.id||!choice?.canStart)return this._result(false,choice?.reason||status.reason||'该训练分支不可用');
        const old=found.b,def=units[old.unitId],next=units[choice.unitId],native=UNIT_TEMPLATES[rawcode(next)]??next;
        const replacement={...boxTrainingReplacementState(old,native),id:this._uid('b'),ownerId:p.id,userData:old.userData??p.id+1,unitId:next.id,col:old.col,row:old.row,
          spent:choice.cost.gold,totalSpent:choice.cost.gold,boxLimitTransferred:true,boxTraining:{fromRawcode:rawcode(def),at:this.state.time,sourceWave:p.boxRewards.sourceWave}};
        // Revalidation above performs every possible failure before mutation.
        // Native replacement destroys the old handle and its arbitrary state.
        p.gold-=choice.cost.gold;p.wood-=choice.cost.wood;
        sourceEconomyUpgradeFinish(this,p,old,def);
        p.buildings.splice(p.buildings.indexOf(old),1,replacement);
        this._recordSourceCompletion(p,next);this._recordEggCompletion(p,next,replacement);
        consumeBoxTrainingReward(p);p.popUsed=this._population(p);
        this._event('upgrade',{laneId:p.id,x:old.col+.5,y:old.row+4.5},`训练为 ${next.name}`);
        return this._result(true,`已训练为 ${next.name}，消耗${choice.cost.gold}金、${choice.cost.wood}木及整组礼物`);
      }
      case 'boxReward': {
        const offer=this.boxRewardStatus(p.id)?.offers.find(o=>o.id===payload.abilityId);
        if(!offer?.canStart)return this._result(false,offer?.reason??'当前没有此神秘礼物奖励');
        const target=p.buildings.find(b=>b.id===payload.buildingId),api={getDefinition:b=>this._boxDefinition(b),getTarget:()=>target,
          isValidPoint:(_owner,point)=>!!this._boxGiftPoint(p,point),createFighter:(_owner,selection,point)=>this._createBoxFighter(p,selection,point),
          upFarm:()=>{const farm=this._boxFarmStatus(p);if(!farm.canStart)return false;p.populationCap=Math.min(rule('maxPopulation',300),p.populationCap+farm.stage.populationDelta);p.sourceFarmRawcode=farm.stage.nextRawcode;return true;},
          upLumbering:()=>{const branch=this._treasureLumberBranch(p);if(!branch)return false;const task=p.economyTasks?.lumberTask,levels=this._sourceLumberLevels(p);if(branch==='advanced'&&levels.basic<rule('lumberBasicLevelCap',7))p.lumberAdvancedWhileBasicQueued=number(p.lumberAdvancedWhileBasicQueued,0)+1;p.lumberLevel++;if(task)task.targetLevel++;return true;},
          grantAbilities:(_owner,b,ids)=>{b.permanentAbilityIds=[...new Set([...(b.permanentAbilityIds??[]),...ids])];return true;},
          demolish:(_owner,b,refund)=>{p.gold+=refund.gold;p.buildings=p.buildings.filter(old=>old!==b);return true;},
          swap:(_owner,a,b)=>{[a.col,b.col]=[b.col,a.col];[a.row,b.row]=[b.row,a.row];return true;},
        };
        const result=payload.abilityId==='A2ZF'?completeBoxSwap(this,p,target,api):claimBoxReward(this,p,payload.abilityId,payload,api);
        return this._result(result.ok,result.ok&&result.unit?`已获得 ${units[result.unit.unitId]?.name??'随机兵种'}`:result.message??result.reason);
      }
      case 'cast':{
        const e=this.state.entities.find(e=>e.id===payload.entityId),s=this.unitSkillStatus(payload.entityId,p.id).find(s=>s.id===payload.skillId);
        if(!s||!s.canStart)return this._result(false,s?.reason??'当前单位不能释放此技能');
        const target=this.state.entities.find(e=>e.id===payload.targetId),point=Number.isFinite(payload.worldX)&&Number.isFinite(payload.worldY)?{x:payload.worldX,y:payload.worldY}:undefined;
        const result=castManualSourceSkill(this,e,payload.skillId,{target,point});return this._result(result.ok,result.message??result.reason??(result.ok?`已施放${s.name}`:'施法失败'));
      }
      case 'treasure': {
        const reward=this.treasureStatus(p.id).find(t=>t.id===payload.treasureId);
        if(!reward)return this._result(false,'宝藏奖励不存在或已经领取');
        const kind=payload.reward,king=this.state.kings[p.team];
        if(!['gold','wood','kingArmor','unitArmor','lumber'].includes(kind))return this._result(false,'请选择宝藏奖励');
        if(kind==='gold'){p.gold+=reward.gold;p.stats.goldEarned+=reward.gold;}
        else if(kind==='wood')p.wood+=reward.wood;
        else if(kind==='kingArmor'){king.armor+=reward.kingArmor;king.treasureArmor=number(king.treasureArmor,0)+reward.kingArmor;}
        else if(kind==='unitArmor'){
          const b=p.buildings.find(b=>b.id===payload.buildingId&&!b.construction&&units[b.unitId]?.combatRawcode);
          if(!b)return this._result(false,'请选择自己已完工的军团建筑');
          b.treasureArmor=number(b.treasureArmor,0)+reward.unitArmor;
        } else {
          if(!reward.canLumber)return this._result(false,'此宝藏没有伐木科技选项');
          const branch=this._treasureLumberBranch(p);
          if(!branch)return this._result(false,'伐木等级已满（含研究中）');
          const task=p.economyTasks?.lumberTask,levels=this._sourceLumberLevels(p);
          if(branch==='advanced'&&levels.basic<rule('lumberBasicLevelCap',7))p.lumberAdvancedWhileBasicQueued=number(p.lumberAdvancedWhileBasicQueued,0)+1;
          p.lumberLevel++;if(task)task.targetLevel++;
        }
        p.treasures=p.treasures.filter(t=>t.id!==reward.id);
        const labels={gold:`${reward.gold}金币`,wood:`${reward.wood}木材`,kingArmor:`国王永久护甲+${reward.kingArmor}`,unitArmor:`所选军团建筑永久护甲+${reward.unitArmor}`,lumber:'伐木科技立即提升1级'};
        this._log(`${p.name}领取宝藏：${labels[kind]}。`);
        return this._result(true,`获得${labels[kind]}`);
      }
      case 'build': {
        if (this.state.phase !== 'build') return this._result(false, '战斗中无法建造');
        const u = units[payload.unitId];
        if (!u || ![...p.roster,...(this._sourceBuilder(p)?.heroEntryIds??[])].includes(u.id)) return this._result(false, '该兵种不在当前兵种池中');
        const required=this._requirement(p,u);if(required)return this._result(false,required);
        const col = Number(payload.col), row = Number(payload.row);
        if (!Number.isInteger(col) || !Number.isInteger(row) || col < 0 || col >= 6 || row < 0 || row >= 8) return this._result(false, '请选择 6 × 8 建造区内的位置');
        if (p.buildings.some(b => b.col === col && b.row === row)) return this._result(false, '此位置已有单位');
        if (this._population(p) + value(u, ['population'], 1) > p.populationCap) return this._result(false, '人口不足，请扩建营地');
        const cost = this._cost(u),woodCost=number(u.woodCost,0);
        if (p.gold + 1e-8 < cost || p.wood+1e-8<woodCost) return this._result(false, `需要 ${cost} 金币、${woodCost} 木材`);
        const resultUnit=this._resolveMorph(u);if(!resultUnit)return this._result(false,'变形候选池为空，源数据待核定');
        if(u.heroEntry)p.heroAltarCount=this._heroAltarCount(p)+1;
        p.gold -= cost;p.wood-=woodCost;
        const building = { id: this._uid('b'), unitId: resultUnit.id, col, row, spent: cost, totalSpent: cost, sourceProxy: u.morphProxy?u.id:null };
        if(isSourceUnit(u)){const duration=number(u.buildTime??u.buildingRawFields?.bldtm,0);if(duration>0)building.construction={startAt:this.state.time,finishAt:this.state.time+duration,duration,targetId:resultUnit.id};building.unitId=u.id;building.builtWave=this.state.wave;}
        if(!building.construction){this._recordLimitOrigins(building,resultUnit);this._recordSourceCompletion(p,resultUnit);}
        p.buildings.push(building);
        sourceEconomyBuildStart(this,p,building,u);
        if(!building.construction)this._recordEggCompletion(p,resultUnit,building);
        this._event('build', { laneId: p.id, x: col + .5, y: row + 4.5 }, u.name);
        return this._result(true, `已建造 ${resultUnit.name}${u.morphProxy?'（变形）':''}`);
      }
      case 'relocate': {
        const status=this.relocationStatus(payload.buildingId,p.id);
        if(!status.canStart)return this._result(false,status.reason);
        if(payload.targetPlayerId!==undefined&&payload.targetPlayerId!==p.id)return this._result(false,'请选择自己的建造区域');
        const {b}=this._building(payload.buildingId),def=units[b.unitId],col=payload.col,row=payload.row;
        if(!Number.isInteger(col)||!Number.isInteger(row)||col<0||col>=6||row<0||row>=8)return this._result(false,'请选择 6 × 8 建造区内的位置');
        if(p.buildings.some(other=>other.col===col&&other.row===row))return this._result(false,'此位置已有单位，请选择空格');
        const moved=completeRelocation(p,b,def,col,row);
        this._event('build',{laneId:p.id,x:col+.5,y:row+4.5},`${def.name} · 移位`);
        return this._result(true,`${def.name}移位完成${moved.exempt?' · 本次不扣次数':''} · 剩余 ${moved.remaining}/3 次`);
      }
      case 'upgrade': {
        if (this.state.phase !== 'build') return this._result(false, '战斗中无法升级兵种');
        const found = this._building(payload.buildingId);
        if (!found || found.p.id !== p.id) return this._result(false, '请选择自己的建筑');
        if(found.b.construction)return this._result(false,'建筑尚在施工');
        const { b } = found, old = units[b.unitId], allowed = this._upgradeIds(old);
        const u = units[payload.unitId ?? allowed[0]];
        if (!u || !allowed.includes(u.id)) return this._result(false, '该升级分支不可用');
        const required=this._requirement(p,u);if(required)return this._result(false,required);
        if (this._population(p) - value(old, ['population'], 1) + value(u, ['population'], 1) > p.populationCap) return this._result(false, '人口不足，请扩建营地');
        const cost = value(u, ['upgradeCost', 'upgradeGold'], this._cost(u));
        const woodCost=number(u.woodCost,0);
        if (p.gold + 1e-8 < cost || p.wood+1e-8<woodCost) return this._result(false, `升级需要 ${cost} 金币、${woodCost} 木材`);
        p.gold -= cost;p.wood-=woodCost; const duration=number(u.buildTime??u.buildingRawFields?.bldtm,0);if(isSourceUnit(u)&&duration>0)b.construction={startAt:this.state.time,finishAt:this.state.time+duration,duration,targetId:u.id};else b.unitId=u.id; b.spent = (b.spent ?? this._cost(old)) + cost; b.totalSpent = b.spent;
        if(!b.construction){sourceEconomyUpgradeFinish(this,p,b,old);this._recordLimitOrigins(b,u);this._recordSourceCompletion(p,u);this._recordEggCompletion(p,u,b);}
        this._event('upgrade', { laneId: p.id, x: b.col + .5, y: b.row + 4.5 }, u.name);
        return this._result(true, `已升级为 ${u.name}`);
      }
      case 'sell': {
        if (this.state.phase !== 'build') return this._result(false, '战斗中无法出售');
        const found = this._building(payload.buildingId);
        if (!found || found.p.id !== p.id) return this._result(false, '请选择自己的建筑');
        const def=units[found.b.unitId];if(def?.hero||def?.heroEntry)return this._result(false,'英雄和祭坛不能出售或更换');if(isSourceUnit(def)&&!(def.buildingAbilityIds??def.abilityIds??[]).includes('A008'))return this._result(false,'该源建筑没有出售指令');
        const raw=def.sourceRawcode,ratio=found.b.builtWave===this.state.wave?1:['h06K','h06L'].includes(raw)?.75:['h07Q','h07R'].includes(raw)?.9:rule('sellRatio',.5);
        const refund = Math.floor(value(def,['sourcePoints'],found.b.spent??this._cost(def))*ratio);
        p.gold += refund; p.buildings = p.buildings.filter(b => b.id !== found.b.id);
        return this._result(true, `出售获得 ${refund} 金币`);
      }
      case 'race': {
        if(this.state.phase!=='build')return this._result(false,'请在备战期更换种族');
        if(this._heroAltarCount(p)>=rule('heroLimit',2))return this._result(false,'英雄祭坛名额已用完，不能再更换种族');
        if(p.builderChoices?.length)return this._result(false,'请先选择本次候选建造者');
        const index=p.raceChanges??0,costs=RULES.raceChangeCosts??Array.from({length:5},(_,i)=>({gold:RULES.builderChangeGoldCosts?.[i]??50*i,wood:RULES.builderChangeWoodCosts?.[i]??100*(i+1)})),cost=costs[index];if(!cost)return this._result(false,'种族更换次数已用尽');
        if(p.gold<cost.gold||p.wood<cost.wood)return this._result(false,`更换需要 ${cost.gold} 金币、${cost.wood} 木材`);
        p.gold-=cost.gold;p.wood-=cost.wood;p.raceChanges=index+1;const candidates=[...BUILDERS];const first=this._pick(candidates),second=this._pick(candidates.filter(b=>b.id!==first.id));p.builderChoices=[first.id,second.id];return this._result(true,'请选择本次随机的两种建造者之一');
      }
      case 'builder': {
        if(this.state.phase!=='build')return this._result(false,'请在备战期选择建造者');
        if(!p.builderChoices?.includes(payload.builderId))return this._result(false,'请先支付种族更换费用，仅可选择本次两种候选');
        const builder=BUILDERS.find(b=>b.id===payload.builderId||b.rawcode===payload.builderId);if(!builder)return this._result(false,'建造者不存在');
        p.builderId=builder.id;p.roster=this._roster(builder.id);p.builderChoices=[];return this._result(true,`已选择${builder.name}`);
      }
      case 'stim':
      case 'form': {
        if(this.state.phase!=='build')return this._result(false,'形态指令仅限备战期');
        const found=this._building(payload.buildingId);if(!found||found.p.id!==p.id)return this._result(false,'请选择自己的建筑');
        const b=found.b,u=units[b.unitId];if(b.construction)return this._result(false,'施工完成后才可切换形态');
        if(u.sourceRawcode==='h06I'){if(p.gold<75)return this._result(false,'兴奋剂需要75金币');p.gold-=75;b.unitId=isV14(u)?'v14_h076':'b_h076';b.temporaryForm=u.id;b.stimulatedWave=this.state.wave;return this._result(true,'兴奋剂已激活，本波结束后复原');}
        const prefix=isV14(u)?'v14_':'b_',next=u.sourceRawcode==='h062'?`${prefix}h05Q`:u.sourceRawcode==='h05Q'?`${prefix}h062`:null;if(!next||!units[next])return this._result(false,'该建筑没有原生转换形态');
        b.construction={startAt:this.state.time,finishAt:this.state.time+1,duration:1,targetId:next};return this._result(true,'攻防转换中，1秒后完成');
      }
      case 'morph': {
        const found=this._building(payload.buildingId);if(!found||found.p.id!==p.id)return this._result(false,'请选择自己的变形建筑');
        if(this.state.phase!=='build')return this._result(false,'变形在备战期完成');
        if(found.b.construction)return this._result(false,'变形代理尚在施工');
        const u=units[found.b.unitId],next=this._resolveMorph(u);if(!u.morphProxy||!next)return this._result(false,'该建筑不属于变形代理');
        found.b.unitId=next.id;this._recordLimitOrigins(found.b,next);this._recordSourceCompletion(p,next);this._recordEggCompletion(p,next,found.b);return this._result(true,`变形为${next.name}`);
      }
      case 'farm': {
        if(p.populationCap>=rule('maxPopulation',300))return this._result(false,'人口已达上限');
        const cost=rule('farmCost',24),wood=rule('farmWoodCost',80),tasks=this._economyTasks(p);
        if(tasks.farmTask)return this._result(false,'农场正在建造');
        if(p.gold<cost||p.wood<wood)return this._result(false,`农场需要 ${cost} 金币、${wood} 木材`);
        p.gold-=cost;p.wood-=wood;const duration=rule('farmTrainingSeconds',5);tasks.farmTask={id:this._uid('eco'),type:'farm',duration,startAt:this.state.time,finishAt:this.state.time+duration,cost:{gold:cost,wood}};
        return this._result(true,`农场施工中，${duration}秒后人口+${rule('farmPopulation',8)}`);
      }
      case 'worker': {
        const status = this.economyStatus(p.id).worker;
        if (!status.canStart) return this._result(false, status.reason);
        const tasks = this._economyTasks(p), startAt = Math.max(this.state.time, tasks.workerQueue.at(-1)?.finishAt ?? this.state.time);
        const task = { id: this._uid('eco'), type: 'worker', duration: status.duration, startAt, finishAt: startAt + status.duration,
          cost: { ...status.cost }, targetLevel: p.workers + tasks.workerQueue.length + 1 };
        p.gold -= status.cost.gold; p.wood -= status.cost.wood; tasks.workerQueue.push(task);
        boxBuildFreeRefund(p,status.cost.gold,status.cost.wood,{context:'native-worker',rawcode:'e003'});
        return this._result(true, `小精灵已加入招募队列，耗时 ${status.duration} 秒`);
      }
      case 'lumber': {
        const status = this.economyStatus(p.id).lumber;
        if (!status.canStart) return this._result(false, status.reason);
        const tasks = this._economyTasks(p), startAt = this.state.time;
        tasks.lumberTask = { id: this._uid('eco'), type: 'lumber', duration: status.duration, startAt, finishAt: startAt + status.duration,
          cost: { ...status.cost }, targetLevel: p.lumberLevel + 1 };
        p.gold -= status.cost.gold; p.wood -= status.cost.wood;
        return this._result(true, `开始研究伐木科技 Lv.${p.lumberLevel + 1}，耗时 ${status.duration} 秒`);
      }
      case 'reroll': {
        if (this.state.phase !== 'build') return this._result(false, '请在备战期切兵');
        if (p.rerolls >= rule('rerollCount', 6)) return this._result(false, '本局切兵次数已用尽');
        const cost = RULES.rerollCosts?.[p.rerolls]??p.rerolls*rule('rerollCostStep',100)+rule('rerollCostBase',0);
        if (p.wood < cost) return this._result(false, `切兵需要 ${cost} 木材`);
        if(this._sourceBuilder(p)?.mode!=='prophet')return this._result(false,'仅先知可切换六阶随机兵种池');
        p.wood -= cost; p.rerolls++; p.roster = this._roster(p.builderId);
        return this._result(true, `新兵种已就绪，本次预言消耗 ${cost} 木材`);
      }
      case 'merc': {
        if (this.state.mode === 'sandbox' && this.state.phase === 'combat') return this._result(false, '沙盒请在布阵期发兵，参与本次测试');
        const m = mercs[payload.mercId]; if (!m) return this._result(false, '木怪不存在');
        if(m.shopPreview || this._mercenaryMaxStock(m) === 0)return this._result(false,'此来源记录未确认可购买库存，仅供图鉴参考');
        const unlock = value(m, ['unlock', 'unlockWave', 'wave', 'minWave'], 1);
        if (this._mercenaryLocked(m)) return this._result(false, `第 ${unlock} 波${m.unlockPhase === 'combat' ? '开战时' : ''}解锁`);
        const cost = this._woodCost(m);
        if (p.wood < cost) return this._result(false, `需要 ${cost} 木材`);
        const status = this.mercenaryStatus(m.id, p.id);
        if (status.stock <= 0) return this._result(false, `库存用尽，${status.remaining.toFixed(1)} 秒后补充 1 只`);
        const slot = p.mercStocks[m.id];
        // Spending another stocked charge must not restart a recharge in flight.
        if (slot.stock === status.maxStock) slot.nextReadyAt = this.state.time + status.cooldown;
        slot.stock--;
        const credit = isV14(m) ? Math.floor(value(m,['sourcePoints','unitPointValue','income'],0)/(this.state.wave >= rule('sentIncomeHalvingFromWave',11)?2:1)) : value(m, ['income', 'incomeGain'], Math.max(1, Math.floor(cost / 25)));
        p.wood -= cost; p.income += credit;
        const send = { id: this._uid('send'), mercId: m.id, senderId: p.id, laneId: null, dispatch: true, wave: this.state.wave + (this.state.phase === 'combat' ? 1 : 0), count: 1 };
        this.state.pendingSends.push(send); p.stats.sent++;
        if (p.id === 0) this._log(`${p.name} 派出 ${m.name}，将于第 ${send.wave} 波开战时平均分配至敌军各路。`);
        return this._result(true, `${m.name} 已排队，收入 +${credit}`);
      }
      case 'kingMove': {
        if(this.state.wave<31)return this._result(false,'第31波解除扎根后才可移动国王');
        const king=this.state.kings[p.team],point={x:Number(payload.worldX),y:Number(payload.worldY)};
        if(!Number.isFinite(point.x)||!Number.isFinite(point.y)||!isWalkable(point.x,point.y,p.team,king.radius??.8))return this._result(false,'请选择本方可通行区域');
        if((king.commandLockedUntil??0)>this.state.time&&king.moveCommanderId!==p.id)return this._result(false,'队友正在控制国王，请等待5秒交接锁');
        const path=navigationPath(this._kingPosition(p.team),point,p.team,king.radius??.8);if(path.length<2)return this._result(false,'目标无法抵达');
        king.moveCommanderId=p.id;king.commandLockedUntil=this.state.time+5;king.movePath={path,index:1};return this._result(true,'国王已接受移动指令');
      }
      case 'king': {
        const king = this.state.kings[p.team], stat = payload.stat;
        if (!['hp', 'attack', 'regen'].includes(stat)) return this._result(false, '请选择生命、攻击或恢复');
        const cost = rule('kingUpgradeCost', 80), key = `${stat}Level`;
        const cap = this.kingUpgradeCap(stat);
        if (king[key] >= cap) return this._result(false, '当前阶段已达上限');
        if (p.wood < cost) return this._result(false, `国王强化需要 ${cost} 木材`);
        p.wood -= cost; p.income += rule('kingIncome', 3); king[key]++;
        if (stat === 'hp') { const gain=RULES.kingHpUpgradeIncrements?.[king.hpLevel-1]??rule('kingHpPerUpgrade',450);king.maxHp+=gain;king.hp+=gain; }
        if (stat === 'attack') king.attack += rule('kingDamagePerUpgrade', 18);
        if (stat === 'regen') king.regen += rule('kingRegenPerUpgrade', 3);
        this._event('king', { laneId: 8 + p.team, x: 3, y: 11.5 }, stat === 'hp' ? '生命强化' : stat === 'attack' ? '攻击强化' : '恢复强化');
        return this._result(true, '国王已强化，收入增加');
      }
      case 'heal': {
        const king = this.state.kings[p.team];
        if (p.healUsed || king.healCharges <= 0) return this._result(false, '你的治疗次数已用尽');
        if (king.hp >= king.maxHp) return this._result(false, '国王生命已满');
        if ((king.healBlockedUntil ?? 0) > this.state.time) return this._result(false, '队伍治疗间隔中，请稍后再用');
        p.healUsed = true; king.healCharges--;
        const amount = Math.min(king.maxHp - king.hp, this.kingHealAmount(p.team)); king.hp += amount;
        king.healBlockedUntil = this.state.time + rule('kingHealLockSeconds', 2);
        this._event('heal', { laneId: 8 + p.team, x: 3, y: 11.5 }, `+${amount}`);
        this._log(`${p.name} 治疗国王，队伍剩余 ${king.healCharges} 次。`);
        return this._result(true, '国王获得治疗');
      }
      case 'interfere': {
        if (!RULES.interfereEnabled) return this._result(false, '本模式未开启T怪');
        if (this.state.phase !== 'combat' || this.state.roundMode === 'arena') return this._result(false, '普通波战斗时才可T怪');
        if (this.state.paused) return this._result(false, '请先继续战斗');
        if ((p.interfereUntil ?? 0) > this.state.time) return this._result(false, 'T怪冷却中');
        const { worldX, worldY } = payload, bounds = MAP.bounds;
        if (!Number.isFinite(worldX) || !Number.isFinite(worldY) || worldX < bounds.minX || worldX > bounds.maxX || worldY < bounds.minY || worldY > bounds.maxY)
          return this._result(false, '请选择地图内的T怪位置');
        const now = this.state.time, radius = rule('interfereRadius', 2 / 3);
        let count = 0;
        // A050 / Antistuck: reissue attack-move to the monster's king-region goal.
        // Both ax monster teams are eligible; this is neither a stun nor a CD reset.
        for (const e of this.state.entities) {
          if (e.side !== 'monster' || e.hp <= 0) continue;
          const point = Number.isFinite(e.worldX) && Number.isFinite(e.worldY) ? worldPoint(e) : laneToWorld(e.laneId, e.x, e.y);
          if (!point || Math.hypot(point.x - worldX, point.y - worldY) > radius + 1e-8) continue;
          this._ensureWorld(e);
          const goal = kingWorld(e.battleTeam);
          e.targetId = null; e.chase = null; e.pendingAttack = null; e.status.nextSenseAt = now; e.routeMode = 'march';
          e.nav = { mode: 'monster', routeId: e.sourceLaneId, path: navigationPath(worldPoint(e), goal, e.battleTeam, e.radius), index: 1, distance: e.nav?.distance ?? 0, interrupted: false, goal };
          count++;
        }
        p.interfereUntil = now + rule('interfereCooldown', 5); p.interfereCooldown = rule('interfereCooldown', 5);
        const lane = worldToLane(worldX, worldY)?.laneId ?? (worldX < 30 ? 8 : 9);
        this._event('interfere', { laneId: lane, worldX, worldY }, `T怪 ${count}`, { radius });
        return this._result(true, count ? `T怪：${count}只怪物重新进攻` : 'T怪：范围内没有可重置的怪物');
      }
      case 'hero':return this._result(false,'新局英雄通过建造者的英雄建筑入口与升级链获得');
      case 'ready':
        if (this.state.phase !== 'build') return this._result(false, '当前不在备战期');
        this.state.timer = 0; this._startCombat(); return this._result(true, '出兵！');
      default: return this._result(false, '未知操作');
    }
  }

  tick(dt) {
    if (this.state.paused || this.state.phase === 'ended') return;
    let remaining = clamp(number(dt, 0), 0, 60) * this.state.speed;
    while (remaining > 1e-8 && this.state.phase !== 'ended') { const step = Math.min(.1, remaining); this._step(step); remaining -= step; }
  }
  _step(dt) {
    const s = this.state; s.time += dt;
    tickSkeletonKingLifecycle(this);
    s.events = s.events.filter(e => s.time - e.time < 2.5);
    for (const p of s.players) {
      for (const m of MERCENARIES) this._mercenarySlot(p, m);
      p.interfereCooldown = Math.max(0, (p.interfereUntil ?? 0) - s.time);
      this._advanceEconomy(p, s.time - dt, s.time);
    }
    if (this._aiEnabled()) {
      this._aiTimer -= dt;
      if (this._aiTimer <= 0) { this._aiTimer = 1.4; for (let i = 1; i < 8; i++) this._aiAct(s.players[i]); }
    }
    if (s.phase === 'build') {
      for (const king of s.kings) king.hp = Math.min(king.maxHp, king.hp + king.regen * dt);
      if (s.mode === 'sandbox') return;
      s.timer = Math.max(0, s.timer - dt); if (s.timer <= 0) this._startCombat(); return; }
    this._roundTime += dt; s.timer = this._roundTime;
    while (this._spawnQueue.length && this._spawnQueue[0].at <= this._roundTime) {
      const next = this._spawnQueue.shift(); this._spawnMonster(next);
    }
    tickSourceScriptJobs(this,dt);
    this._updateEntities(dt);
    if(s.roundMode==='arena'){this._clearDead();s.arenaRemaining=Math.max(0,(s.arenaRemaining??120)-dt);const alive=[0,1].map(team=>s.entities.some(e=>e.team===team&&e.hp>0));if(!alive[0]||!alive[1]||s.arenaRemaining<=0)this._endArena(alive);return;}
    this._updateKings(dt);
    this._clearDead();
    if (s.phase === 'ended') return;
    this._transferDefenders();
    this._warpTimer += dt;
    if (this._warpTimer >= 1 - 1e-9) { this._warpTimer = Math.max(0, this._warpTimer - 1); this._warpDefenders(); }
    if(s.mode !== 'sandbox' && s.wave>=31){if(s.wave<35){s.continuousRemaining=Math.max(0,(s.continuousRemaining??50)-dt);if(s.continuousRemaining<=0)this._advanceContinuous();}}
    else if (!this._spawnQueue.length && !s.entities.some(e => e.side === 'monster' && e.hp > 0)) this._endCombat();
    // A very long stalled wave receives visible reinforcements, preserving actual combat.
    if (RULES.webFrenzyEnabled === true && this._roundTime > 100 && !this._overtime) {
      this._overtime = true; this._log('战斗持续过久：双方获得狂暴，攻击速度提升。');
      for (const e of s.entities) e.status.frenzy = true;
    }
  }
  _waveData() {
    return WAVES.find(w => Number(w.wave ?? w.id ?? w.number) === this.state.wave) ?? WAVES[Math.min(this.state.wave - 1, WAVES.length - 1)] ?? {};
  }
  _startCombat() {
    if (this.state.phase !== 'build') return;
    const s = this.state;
    if (s.mode === 'sandbox') s.roundMode = 'normal';
    if(s.roundMode==='arena-prep'){this._startArena();return;}
    if(s.roundMode==='arena-transition'){s.wave++;s.roundMode='normal';s.timer=rule('arenaNextPreparationSeconds',30);s.entities=[];return;}
    this._completeMilitaryConstruction();
    const w = this._waveData();
    const reference=value(w,['recommendedPower'],[250,350,500,650,800,1000,1200,1450,1600,1850,2050,2400,2700,3100,3500,4000,4500,5000,5500,6000,6500,7100,7700,8500,9500,10600,11800,13000,14000,15000,16000,17000,18000,19000,20000][s.wave-1]??1);
    for(const p of s.players){const factor=this._military(p)/reference-(p.sourceLeaks??0)/150;p.leakBountyFactor=this.options.ggEnabled?factor>=1?1:factor>=.1?factor:0:0;}
    resetLichKingRound(this);
    s.phase = 'combat'; s.timer = 0; s.entities = []; s.sourceSkillJobs = []; s.nagaScriptCasters = {}; s.darkArthasCasters = {}; s.brightArthasHandles = {}; s.aesaraHandles = {}; s.sourceAuraNextAt=Math.floor(s.time)+1; s.teamLeakFlags = [false,false]; this._spawnQueue = []; this._roundTime = 0; this._settledLanes = []; this._overtime = false; this._warpTimer = 0; this._battleAuras = [[], []];
    if(s.mode !== 'sandbox' && s.wave>=31)s.continuousRemaining=s.wave<35?50:null;
    const boss = !!(w.boss ?? w.isBoss ?? this.state.wave % 10 === 0);
    const baseCount = value(w, ['baseCount', 'quantity'], boss ? 1 : 5);
    // New reference waves carry an explicit adapted count. Old data still works.
    const monsterCount = Math.max(0, Math.floor(value(w, ['count'], boss ? value(w, ['bossCount'], baseCount) : baseCount * rule('monsterMultiplier', 9))));
    s.waveInfo = { ...w, baseHp: w.hp, baseDamage: w.damage, hp: w.hp * (boss ? 1 : rule('webMonsterHpScale', .25)), damage: w.damage * (boss ? 1 : rule('webMonsterDamageScale', .20)), isBoss: boss, actualCount: monsterCount };
    const waveBatches=Array.from({length:monsterCount},()=>{const substitute=s.wave>=rule('nextWaveSubstitutionFrom',6)&&s.wave<=rule('nextWaveSubstitutionThrough',28)&&!boss&&this._random()<rule('nextWaveSubstitutionProbability',.1);return {wave:substitute?(WAVES.find(n=>Number(n.wave??n.id)===s.wave+1)??w):w,substituted:substitute};});
    for (const p of s.players) {
      p.roundLeaks = 0; p.supportAnnounced = false;
      p.farmWaveCount=p.buildings.filter(b=>!b.construction&&units[b.unitId]?.combatRawcode==='h0W1').length;
      for (const b of p.buildings.filter(b=>!b.construction)) this._spawnDefender(units[b.unitId], p, b.col + .5, b.row + 4.5, b.id);
      if (p.heroId && heroes[p.heroId]) this._spawnDefender(heroes[p.heroId], p, 3, 8.7, `hero-${p.id}`, true);
      for (let i = 0; i < monsterCount && (p.id === 0 || this._aiEnabled()); i++) this._spawnQueue.push({ at: (i + 1) * rule('spawnInterval', .1), laneId: p.id, wave: waveBatches[i].wave, sourceWave:s.wave, substituted:waveBatches[i].substituted, boss: waveBatches[i].substituted ? !!waveBatches[i].wave.boss : boss,
        x: clamp(3 + (i % 6 - 2.5) * (rule('spawnSpreadWidth', 1.8) / 5) + (this._random() - .5) * .04, 3 - rule('spawnSpreadWidth',1.8)/2, 3 + rule('spawnSpreadWidth',1.8)/2), y: .3 });
    }
    queueSpecialMonsters(this,monsterCount);
    const sends = s.pendingSends.filter(v => v.wave <= s.wave);
    s.pendingSends = s.pendingSends.filter(v => v.wave > s.wave);
    // Each attacking team's shared rally stock is dealt across enemy lanes from
    // one seeded random starting position, rather than locking buyers to a lane.
    for (const team of [0, 1]) {
      const enemyLanes = s.players.filter(p => p.team !== team).map(p => p.id);
      let nextLane = Math.floor(this._random() * enemyLanes.length);
      for (const send of sends.filter(v => s.players[v.senderId]?.team === team)) {
        const m = mercs[send.mercId]; if (!m) continue;
        for (let i = 0; i < send.count; i++) {
          const laneId = send.dispatch ? enemyLanes[nextLane] : send.laneId;
          if (send.dispatch) nextLane = (nextLane + 1) % enemyLanes.length;
          if (!enemyLanes.includes(laneId)) continue;
          this._spawnQueue.push({ at: .1 + i * .1, laneId, merc: m, senderId: send.senderId,
            x: 3 + (this._random() - .5) * rule('spawnSpreadWidth', 1.8), y: .3 });
        }
      }
    }
    this._spawnQueue.sort((a, b) => a.at - b.at);
    this._log(`第 ${s.wave} 波 ${w.name ?? ''}：每路 ${monsterCount} ${boss ? '只 Boss' : '只系统怪'}，木怪额外计算。`);
    this._event('wave', { laneId: -1, x: 3, y: 4 }, `第 ${s.wave} 波`);
  }
  _entity(def, overrides) {
    let hp = value(def, ['hp', 'health', 'maxHp'], 180);
    // The native creation hook affects every freshly created eligible template,
    // including death respawns; exported wave HP already contains this multiplier.
    if(isV14(def) && !Number.isFinite(def.x9HpScale))hp*=this._sourceLifeScale(def);
    if(isV14(def) && def.x9InjectedSkills?.length){ const added=def.x9InjectedSkills.filter(a=>typeof a==='string'||!a.wave||a.wave===this.state.wave).map(a=>typeof a==='string'?a:a.rawcode??a.abilityRawcode??a.abilityId??a.id);def={...def,abilityIds:[...new Set([...(def.abilityIds??[]),...added])],sourceAbilityIds:[...new Set([...(def.sourceAbilityIds??def.abilityIds??[]),...added])]}; }
    const rawAbility = abilityOf(def);
    const ability = rawAbility ? { ...rawAbility, radius: rawAbility.radius > 10 ? rawAbility.radius / 100 : rawAbility.radius } : null;
    const e = {
      id: this._uid(), unitId: def.id ?? 'unit', name: def.name ?? '战士', createdAt:this.state.time, provenance:def.provenance, sourceVersion:def.sourceVersion, sourceRawFields:def.sourceRawFields, sourceArmorTypeRaw:def.sourceArmorTypeRaw??def.sourceRawFields?.defType,
      x: 3, y: 6, hp, maxHp: hp, damage: value(def, ['damage', 'attack', 'attackDamage'], 18),
      range: value(def, ['range', 'attackRange'], 65) / (value(def, ['range', 'attackRange'], 65) > 12 ? 100 : 1), attackCd: this._random() * .35,
      attackInterval: value(def, ['interval', 'attackInterval', 'attackSpeed', 'cooldown'], 1),
      moveSpeed: value(def, ['moveSpeed', 'speed'], 75) / (value(def, ['moveSpeed', 'speed'], 75) > 12 ? (Number.isFinite(def.sourceSpeed) ? 100 : 75) : 1), armor: value(def, ['armor'], 0),
      attackType: def.attackType ?? 'normal', armorType: def.armorType ?? 'medium',
      race: def.race, shape: def.shape ?? 'circle', color: def.color ?? '#a9cce5', radius: value(def, ['radius'], .23),
      acquisitionRange: value(def, ['acquisitionRange', 'aggroRange'], Math.max(4.5, value(def, ['range'], 65) / 100 + 1)),
      ability, status: {}, abilityCd: 1 + this._random() * 2, reward: 0, ...overrides,
    };
    if (e.acquisitionRange > 12) e.acquisitionRange /= 100;
    if (ability?.type === 'shield') e.status.shield = ability.value > 1 ? ability.value : hp * number(ability.value, .2);
    attachSkills(e,def);
    return e;
  }
  _spawnDefender(def, player, x, y, buildingId, isHero = false) {
    if (!def || (isSourceUnit(def)&&!def.combatRawcode)) return;
    def=this._boxCombatDefinition(def,player.buildings.find(b=>b.id===buildingId));
    const e = this._entity(def, { team: player.team, side: 'defender', laneId: player.id,
      ownerId: player.id, sourceLaneId: player.id, x, y, buildingId, isHero });
    initializeSourceClassCombat(this,player.buildings.find(b=>b.id===buildingId),e);
    if(e.combatRawcode==='h0JJ')e.userData=player.id+1;
    // PassiveSkill copies A1PE from the persistent building on every deployment.
    e.armor+=number(player.buildings.find(b=>b.id===buildingId)?.treasureArmor,0);
    const garroshArmor=number(player.buildings.find(b=>b.id===buildingId)?.garroshArmorLevel,0);
    if(garroshArmor){e.armor+=garroshArmor;e.status.garroshArmorLevel=garroshArmor;}
    const garroshAttack=number(player.buildings.find(b=>b.id===buildingId)?.garroshAttackLevel,0);
    if(garroshAttack){e.damage+=garroshAttack;e.status.garroshAttackLevel=garroshAttack;}
    this._ensureWorld(e); e.status.activated = false; e.routeMode = 'guard';
    e.nav = { mode: 'guard', routeId: player.id, path: [], index: 0, distance: 0, goal: spawnWarpWorld(player.id), interrupted: false };
    this.state.entities.push(e);
  }
  _spawnMonster(entry) {
    const s = this.state, defendingTeam = entry.laneId < 4 ? 0 : 1;
    const extraScale = Math.pow(1.12, Math.max(0, s.wave - WAVES.length));
    let def = entry.merc ?? entry.wave ?? {};
    const boss = !!entry.boss;
    let e = this._entity(def, { unitId: entry.merc?.id ?? def.id ?? `wave-${s.wave}`, name: def.name ?? (boss ? '远古首领' : '系统怪'),
      side: 'monster', team: 1 - defendingTeam, laneId: entry.laneId, sourceLaneId: entry.laneId,
      x: entry.x, y: entry.y, ownerId: null, senderId: entry.senderId ?? null, isMerc: !!entry.merc, isBoss: boss,
      sourceWave:entry.sourceWave??s.wave, substituted:!!entry.substituted, reward: value(def, ['reward', 'bounty', 'goldReward'], entry.merc ? 3 : 1), color: def.color ?? (entry.merc ? '#e7a446' : '#e56c78'),
      shape: def.shape ?? (boss ? 'hex' : entry.merc ? 'diamond' : 'circle'), radius: boss ? .42 : value(def, ['radius'], .21) });
    if (!entry.merc) {
      const hp = (isV14(def)&&entry.substituted ? value(def,['baseHp','baseObjectHp','hpBase'],number(def.sourceRawFields?.HP,def.hp)) * this._sourceLifeScale(def,entry.sourceWave??s.wave) : value(def, ['hp', 'health', 'monsterHp'], 45 + s.wave * 18)) * extraScale * (boss ? 1 : rule('webMonsterHpScale', 1));
      e.hp = hp; e.maxHp = hp; e.damage = value(def, ['damage', 'attack'], 4 + s.wave * 2.2) * extraScale * (boss ? 1 : rule('webMonsterDamageScale', .20));
      e.moveSpeed = value(def, ['moveSpeed', 'speed'], 55) / (Number.isFinite(def.sourceSpeed) ? 100 : 75); e.range = value(def, ['range', 'attackRange'], 55) / 100;
    }
    applySpecialMonsterSpawn(this,e,entry);
    e.y = clamp(e.y, .45, 1); this._ensureWorld(e); this._planMonsterRoute(e);
    s.entities.push(e); s.metrics.spawned++;
  }

  _ensureWorld(e) {
    e.battleTeam ??= Math.floor((e.sourceLaneId ?? e.ownerId ?? (e.laneId < 8 ? e.laneId : (e.laneId - 8) * 4)) / 4);
    if (!Number.isFinite(e.worldX) || !Number.isFinite(e.worldY)) {
      const point = laneToWorld(e.laneId, e.x ?? 3, e.y ?? 6) ?? (() => {
        const king = kingWorld(e.battleTeam);
        return { x: king.x + ((e.x ?? 3) - 3) * .8, y: 34 + clamp(e.y ?? 6, 0, 12) * .4 };
      })();
      const safe = closestWalkable(point, e.battleTeam, e.radius ?? .2) ?? point;
      e.worldX = safe.x; e.worldY = safe.y;
    }
    if(!Number.isFinite(e.facing)){const goal=e.side==='monster'?this._kingPosition(e.battleTeam):laneToWorld(e.sourceLaneId??e.ownerId??0,3,0);e.facing=Math.atan2(goal.y-e.worldY,goal.x-e.worldX)*180/Math.PI;}
    if (e.acquisitionRange === undefined) e.acquisitionRange = Math.max(4.5, e.range + 1);
    this._syncLocal(e);
    initializeSourceSkills(this,e);
  }
  _syncLocal(e) {
    const local = worldToLane(e.worldX, e.worldY);
    if (local && Math.floor(local.laneId / 4) === e.battleTeam) {
      e.laneId = local.laneId; e.x = local.x; e.y = local.y;
    } else {
      // lane 8/9 denotes the entire common road, not an extra physical arena.
      const king = kingWorld(e.battleTeam);
      e.laneId = 8 + e.battleTeam; e.x = e.worldX - king.x + 3; e.y = e.worldY - king.y + 11.5;
    }
  }
  _canSegment(from, to, team, radius = 0) {
    // Most steps and attacks are inside one convex rectangle; avoid expensive
    // union clipping there. The exact union helper handles corners and walls.
    for (const r of regionsByTeam[team] ?? []) if (
      from.x >= r.minX + radius && from.x <= r.maxX - radius && from.y >= r.minY + radius && from.y <= r.maxY - radius &&
      to.x >= r.minX + radius && to.x <= r.maxX - radius && to.y >= r.minY + radius && to.y <= r.maxY - radius) return true;
    return isSegmentWalkable(from, to, team, radius);
  }
  _planMonsterRoute(e) {
    if (e.status.leaked || e.laneId >= 8) { e.nav = { mode: 'monster', routeId: e.sourceLaneId, path: navigationPath(worldPoint(e), this._kingPosition(e.battleTeam), e.battleTeam, e.radius), index: 1, distance: 0, interrupted: false }; return; }
    const source = e.sourceLaneId;
    const exit = laneToWorld(source, e.x, 12);
    const trunk = routePoints(source).slice(2);
    const path = [worldPoint(e), exit, { x: exit.x, y: 16 }, ...trunk.map(p => ({ ...p })), this._kingPosition(e.battleTeam)];
    e.nav = { mode: 'monster', routeId: source, path, index: 1, distance: 0, interrupted: false };
  }
  _planReturn(e) {
    const goal = spawnWarpWorld(e.sourceLaneId);
    e.routeMode = 'return';
    e.nav = { mode: 'return', routeId: e.sourceLaneId, path: navigationPath(worldPoint(e), goal, e.battleTeam, e.radius), index: 1, distance: e.nav?.distance ?? 0, goal, interrupted: false };
  }
  _planSupport(e) {
    const goal = worldPoint(e);
    e.routeMode = 'support';
    e.nav = { mode: 'support', routeId: e.sourceLaneId, path: [], index: 0, distance: e.nav?.distance ?? 0, goal, anchor: goal, interrupted: false };
  }
  _nearby(e, radius) {
    const result = [], grid = this._spatial?.[e.battleTeam];
    if (!grid) return result;
    const point = worldPoint(e), minX = Math.floor(point.x - radius), maxX = Math.floor(point.x + radius),
      minY = Math.floor(point.y - radius), maxY = Math.floor(point.y + radius);
    for (let x = minX; x <= maxX; x++) for (let y = minY; y <= maxY; y++) {
      const cell = grid.get(`${x},${y}`); if (cell) result.push(...cell);
    }
    return result;
  }
  _updateEntities(dt) {
    const entities = this.state.entities, now = this.state.time;
    const battles = [[], []], monsterCounts = [0, 0];
    this._spatial = [new Map(), new Map()]; this._worldEntities = new Map();
    for (const battle of battles) battle.auras = [];
    for (const e of entities) {
      if (e.hp <= 0) { e.pendingAttack = null; continue; }
      if (e.expiresAt && e.expiresAt <= now) { e.hp = 0; e.pendingAttack = null; continue; }
      if(e.status.yseraHidden)continue;
      this._ensureWorld(e); const team = e.battleTeam, battle = battles[team];
      battle.push(e); this._worldEntities.set(e.id, e);
      const key = `${Math.floor(e.worldX)},${Math.floor(e.worldY)}`, grid = this._spatial[team];
      if (!grid.has(key)) grid.set(key, []); grid.get(key).push(e);
      if (e.ability?.type?.startsWith('aura_')||hasSourceAura(e)) battle.auras.push(e);
      if (e.side === 'monster') monsterCounts[e.team]++;
    }
    this._battleAuras = battles.map(battle => battle.auras);
    this._monsterPressure = monsterCounts.map(count => RULES.webCongestionEnabled ? clamp(1 + Math.max(0, count - rule('webCongestionThreshold', 130)) / rule('webCongestionStep', 50), 1, rule('webCongestionMax', 7)) : 1);
    this.state.congestion = monsterCounts.map((count, team) => ({ attackingTeam: team, count, attackIntervalFactor: this._monsterPressure[team] }));
    for (const e of entities) {
      if (e.hp <= 0) { e.pendingAttack = null; continue; }
      if(e.status.yseraHidden||e.status.yseraPaused||e.status.sourcePaused||e.status.illidanPaused){e.pendingAttack=null;continue;}
      this._ensureWorld(e);
      const battle = battles[e.battleTeam], st = e.status;
      if (st.poisonUntil > now) this._hurt(e, number(st.poisonDps, 0) * dt, st.poisonOwner, true);
      if (e.hp <= 0) { e.pendingAttack = null; continue; }
      e.attackCd -= dt; e.abilityCd -= dt;
      this._applyHealingAura(e, battle.auras, dt);
      this._passiveAbility(e, battle, dt);
      tickSourceSkills(this,e,battle,dt);
      if (e.hp <= 0 || (st.stunUntil ?? 0) > now || (st.cycloneUntil ?? 0) > now) { e.pendingAttack = null; continue; }
      if (e.side === 'monster' && e.pendingAttack && this._advanceMonsterAttack(e, battle)) continue;
      const aggro = Math.max(e.range, number(e.acquisitionRange, Math.max(4.5, e.range + 1)));
      let ordered=st.huskarAttackOrder?.targetId===e.targetId&&e.targetId!=null;
      if(!ordered)delete st.huskarAttackOrder;
      let target = this._worldEntities.get(e.targetId)??(ordered?this.state.kings.find(k=>k.id===e.targetId):null);
      if (target && (target.hp <= 0 || target.battleTeam !== e.battleTeam || target.side === e.side || !canWeaponTarget(e,target,now) || (!ordered&&(distance(e, target) > aggro * 1.25 || (e.nav?.mode === 'support' && distance(target, e.nav.anchor) > aggro * 1.25))))) target = null;
      if(!target){delete st.huskarAttackOrder;ordered=false;}
      if (!target && (st.nextSenseAt ?? 0) <= now) {
        st.nextSenseAt = now + .4;
        let best = Infinity;
        for (const other of this._nearby(e, aggro)) {
          if (other.id === e.id || other.hp <= 0 || other.side === e.side || !canWeaponTarget(e,other,now)) continue;
          const delta = distance(e, other);
          if (delta < best && delta <= aggro && !(e.nav?.mode === 'support' && distance(other, e.nav.anchor) > aggro * 1.25) && this._canSegment(worldPoint(e), worldPoint(other), e.battleTeam, 0)) { target = other; best = delta; }
        }
      }
      e.targetId = target?.id ?? null;
      if (target) {
        if (e.side === 'defender' && !e.status.activated) { e.status.activated = true; if (e.nav?.mode === 'guard') this._planReturn(e); }
        if (e.side === 'defender' && e.nav?.mode !== 'support') e.routeMode = 'guard';
        if (e.nav) e.nav.interrupted = true;
        const reach = (sourceWeapon(e,target,this.state.time)?.range??e.range) + e.radius + target.radius;
        if (distance(e, target) <= reach && this._canSegment(worldPoint(e), worldPoint(target), e.battleTeam, 0)) {
          if (e.side === 'monster') { if (e.attackCd <= 1e-8) this._beginMonsterAttack(e, target, battle); }
          else if (e.attackCd <= 0) this._attack(e, target, battle);
        } else this._chase(e, target, battle, dt);
      } else if (e.side === 'monster') {
        const king = this.state.kings[e.battleTeam], position = this._kingPosition(e.battleTeam);
        if (distance(e, position) <= e.range + e.radius + (king.radius ?? .8) && this._canSegment(worldPoint(e), position, e.battleTeam, 0)) {
          if (e.attackCd <= 1e-8) this._beginMonsterAttack(e, king, battle);
        } else {if(this.state.wave>=31&&e.nav?.path?.length&&distance(e.nav.path.at(-1),position)>.4)this._planMonsterRoute(e);this._followNav(e, battle, dt);}
      } else if (e.side === 'defender'||e.status.skeletonKingAttackOrder) {
        if (e.nav?.mode === 'return') {
          e.routeMode = 'return'; this._followNav(e, battle, dt);
          if (distance(e, e.nav.goal) <= .55) e.routeMode = 'warp_wait';
        } else if (e.nav?.mode === 'support') {
          e.routeMode = 'support';
          if (distance(e, e.nav.anchor) > .35) this._chase(e, { ...e.nav.anchor, id: 'support-anchor' }, battle, dt);
        }
      }
      this._syncLocal(e);
      if (e.side === 'monster') {
        if (!e.status.leaked && this._hasExited(e)) this._leak(e);
        const king = kingWorld(e.battleTeam);
        if (e.status.leaked && Math.abs(e.worldX - king.x) <= 2 && e.worldY >= 16) e.status.enteredStem = true;
      }
    }
  }
  _hasExited(e) {
    const spawn = laneToWorld(e.sourceLaneId, 3, 0), exit = laneToWorld(e.sourceLaneId, 3, 12);
    if (!spawn || !exit) return false;
    return (e.worldX - exit.x) * (exit.x - spawn.x) + (e.worldY - exit.y) * (exit.y - spawn.y) > .12;
  }
  _chase(e, target, battle, dt) {
    const from = worldPoint(e), to = worldPoint(target);
    if (this._canSegment(from, to, e.battleTeam, e.radius)) this._moveWorld(e, to, battle, dt);
    else {
      if (!e.chase || e.chase.targetId !== target.id || (e.chase.repathAt <= this.state.time && distance(e.chase.goal, to) > .6)) {
        e.chase = { targetId: target.id, goal: to, path: navigationPath(from, to, e.battleTeam, e.radius), index: 1, repathAt: this.state.time + 1.2 };
      }
      this._followPath(e, e.chase, battle, dt);
    }
  }
  _followNav(e, battle, dt) {
    if (!e.nav) this._planMonsterRoute(e);
    const nav = e.nav;
    if (nav.interrupted) {
      nav.interrupted = false; e.chase = null;
      // Resume at the furthest visible future waypoint, avoiding a trip back to
      // an old encounter point. No per-frame global pathfinding is required.
      let visible = false;
      for (let i = nav.path.length - 1; i >= Math.max(1, nav.index); i--) if (this._canSegment(worldPoint(e), nav.path[i], e.battleTeam, e.radius)) { nav.index = i; visible = true; break; }
      if (!visible && nav.path.length) {
        nav.path = navigationPath(worldPoint(e), nav.path[nav.path.length - 1], e.battleTeam, e.radius); nav.index = 1;
      }
    }
    this._followPath(e, nav, battle, dt);
  }
  _followPath(e, nav, battle, dt) {
    if (!nav?.path?.length) return;
    while (nav.index < nav.path.length && distance(e, nav.path[nav.index]) < .075) nav.index++;
    if (nav.index < nav.path.length) this._moveWorld(e, nav.path[nav.index], battle, dt);
  }
  _moveWorld(e, destination, battle, dt) {
    const from = worldPoint(e), dx = destination.x - from.x, dy = destination.y - from.y, delta = Math.hypot(dx, dy);
    if (delta < .015) return;
    const slow = (e.status.slowUntil ?? 0) > this.state.time ? number(e.status.slowFactor, .6) : 1;
    let auraSlow = 0;
    for (const a of battle.auras ?? []) if (a.side !== e.side && a.hp > 0 && a.ability?.type === 'aura_slow' && distance(a, e) <= number(a.ability.radius, 2)) auraSlow = Math.max(auraSlow, number(a.ability.value, .15));
    const step = Math.min(delta, e.moveSpeed * slow * (1 - auraSlow) * sourceMoveFactor(this,e,battle) * dt);
    let repelX = 0, repelY = 0;
    for (const a of e.status.huskarPathingOff?[]:this._nearby(e, 1)) {
      if (a.id === e.id || a.hp <= 0) continue;
      const ax = e.worldX - a.worldX, ay = e.worldY - a.worldY, separation = Math.hypot(ax, ay), radius = e.radius + a.radius;
      if (separation < radius * .9) {
        repelX += (separation > .001 ? ax / separation : e.id < a.id ? -1 : 1) * (radius - separation);
        repelY += (separation > .001 ? ay / separation : .1) * (radius - separation);
      }
    }
    const repulsion = Math.hypot(repelX, repelY), maxRepel = step * .45;
    if (repulsion > 0) { const factor = Math.min(maxRepel / repulsion, 1); repelX *= factor; repelY *= factor; }
    const desired = { x: from.x + dx / delta * step + repelX, y: from.y + dy / delta * step + repelY };
    let next;
    if (this._canSegment(from, desired, e.battleTeam, e.radius)) next = desired;
    else {
      next = constrainPoint(from, desired, e.battleTeam, e.radius);
      // Slide along a wall only through a legal swept segment; never project to
      // another walkable island or change position at route boundaries.
      if (distance(from, next) < step * .2) {
        const alongX = { x: desired.x, y: from.y }, alongY = { x: from.x, y: desired.y };
        if (this._canSegment(from, alongX, e.battleTeam, e.radius) && distance(from, alongX) > distance(from, next)) next = alongX;
        if (this._canSegment(from, alongY, e.battleTeam, e.radius) && distance(from, alongY) > distance(from, next)) next = alongY;
      }
    }
    e.worldX = next.x; e.worldY = next.y;
    e.facingX = next.x - from.x; e.facingY = next.y - from.y;
    if(Math.hypot(e.facingX,e.facingY)>1e-8)e.facing=Math.atan2(e.facingY,e.facingX)*180/Math.PI;
    if (e.nav) e.nav.distance += distance(from, next);
    this._syncLocal(e);
  }
  _beginMonsterAttack(e, target, battle) {
    if (e.pendingAttack || e.hp <= 0 || target.hp <= 0 || target.team === e.team || target.battleTeam !== e.battleTeam ||
      e.buffs?.some(b => b.expiresAt > this.state.time && b.disarm)) return;
    const weapon = sourceWeapon(e, target,this.state.time); if (!weapon) return;
    sourceAttackIssued(this,e);
    const sourceWindup = Math.max(0, number(weapon.raw[`dmgpt${weapon.slot}`], 0));
    if (!sourceWindup) { this._attack(e, target, battle, true); return; }
    let haste = this._auraEffects(e, battle.auras).attackSpeedMultiplier;
    if (e.status.frenzy) haste *= 1.6;
    const duration = sourceWindup / haste * (this._monsterPressure?.[e.team] ?? 1);
    e.pendingAttack = { targetId: target.id, targetIsKing: this.state.kings.includes(target), startedAt: this.state.time, finishAt: this.state.time + duration };
  }
  _advanceMonsterAttack(e, battle) {
    const pending = e.pendingAttack, now = this.state.time;
    const target = pending.targetIsKing ? this.state.kings.find(king => king.id === pending.targetId) : this._worldEntities.get(pending.targetId);
    const weapon = target && sourceWeapon(e, target,this.state.time);
    const valid = target && target.hp > 0 && target.battleTeam === e.battleTeam && target.team !== e.team && target.side !== e.side && weapon &&
      !e.buffs?.some(b => b.expiresAt > now && b.disarm) &&
      distance(e, target) <= weapon.range + e.radius + (target.radius ?? .8) + 1e-8 && this._canSegment(worldPoint(e), worldPoint(target), e.battleTeam, 0);
    if (!valid) { e.pendingAttack = null; return false; }
    // Hold position and target through the source attack point. T can cancel
    // this order without a hit or an artificial attack-cooldown penalty.
    if (now + 1e-8 < pending.finishAt) return true;
    e.pendingAttack = null;
    this._attack(e, target, battle, true);
    // _attack starts a full source cycle; its windup has already elapsed.
    e.attackCd = Math.max(0, e.attackCd - Math.max(0, now - pending.startedAt));
    return true;
  }
  _attack(e, target, lane, alreadyIssued = false) {
    e.facing=Math.atan2(target.worldY-e.worldY,target.worldX-e.worldX)*180/Math.PI;
    const ability = e.ability, type = ability?.type;
    if(e.buffs?.some(b=>b.expiresAt>this.state.time&&b.disarm))return;
    const weapon=sourceWeapon(e,target,this.state.time);if(!weapon)return;
    if(!alreadyIssued)sourceAttackIssued(this,e);
    const sourceAttack=sourceAttackStart(this,e,target);
    const attackAuras = this._auraEffects(e, lane.auras), targetAuras = this._auraEffects(target, lane.auras);
    let damage = (weapon.damage * sourceAttack.multiplier+sourceAttack.bonus)*sourceAttack.outgoingFactor, haste = attackAuras.attackSpeedMultiplier;
    if (type === 'crit' && this._random() < number(ability.chance, .2)){damage *= number(ability.value, 2);sourceAttack.critical=true;}
    if (type === 'swarm') damage *= 1 + Math.min(4, lane.filter(a => a.side === e.side && a.race === e.race && a.id !== e.id && a.hp > 0 && distance(a, e) <= number(ability.radius, 1.5)).length) * number(ability.value, .08);
    if (e.status.frenzy) haste *= 1.6;
    e.attackCd = Math.max(.15, weapon.interval / haste) * (e.side === 'monster' ? (this._monsterPressure?.[e.team] ?? 1) : 1);
    if(sourceAttack.missed){this._event('miss',target,'未命中');return;}
    const barrageTargets=sourceBarrageTargets(e,target,lane,weapon,sourceAttack.critical,this.state.time);
    const barrageDamage=weapon.damage*sourceAttack.baseMultiplier*sourceAttack.outgoingFactor;
    const multiplier = this._typeMultiplier(weapon.attackType, target.armorType, target.sourceArmorTypeRaw);
    const armor = this._effectiveArmor(target, targetAuras.armor);
    const armorFactor = this._armorFactor(armor);
    const dealt = damage * multiplier * armorFactor;
    const actual=this._hurt(target,dealt,e,{magic:weapon.attackType==='magic',attackType:weapon.attackType});
    if(actual>0&&e.hp>0)sourceOnHit(this,e,target,lane,actual,sourceAttack.procs,damage);
    this._event(e.range > 1 ? 'projectile' : 'hit', target, `${Math.round(dealt)}`, { fromX: e.x, fromY: e.y, fromWorldX: e.worldX, fromWorldY: e.worldY, color: e.color });
    for(const other of barrageTargets)sourceBarrageHit(this,e,other,lane,weapon,barrageDamage);
    if (e.hp <= 0) return;
    if (!ability || type === 'crit' || this._random() > number(ability.chance, 1)) return;
    const v = number(ability.value, .35), factor = v > 2 ? v / Math.max(1, e.damage) : v;
    if (['aoe', 'splash', 'cleave'].includes(type)) {
      for (const other of lane) if (other.id !== target.id && other.side !== e.side && other.hp > 0 && distance(other, target) <= number(ability.radius, 1.25)) this._hurt(other, dealt * factor, e);
      this._event('splash', target, ability.name ?? '范围伤害', { radius: ability.radius ?? 1.25 });
    }
    if (type === 'stun') target.status.stunUntil = this.state.time + number(ability.duration, ability.value || .5);
    if (type === 'armor_break') { target.status.armorBreakUntil = this.state.time + number(ability.duration, 4); target.status.armorBreak = v; }
    if (type === 'multishot') {
      for (const other of lane.filter(o => o.side !== e.side && o.hp > 0 && o.id !== target.id && distance(o, e) <= e.range + .5).slice(0, number(ability.targets, 3))) { this._hurt(other, dealt * v, e); this._event('projectile', other, Math.round(dealt * v), { fromX: e.x, fromY: e.y, fromWorldX: e.worldX, fromWorldY: e.worldY, color: e.color }); }
    }
    if (type === 'burn') for (const other of lane) if (other.side !== e.side && other.hp > 0 && distance(other, target) <= number(ability.radius, .8)) { other.status.poisonUntil = this.state.time + number(ability.duration, 3); other.status.poisonDps = v; other.status.poisonOwner = { id: e.id, ownerId: e.ownerId, side: e.side, team: e.team }; }
    if (type === 'slow') { target.status.slowUntil = this.state.time + number(ability.duration, 2); target.status.slowFactor = clamp(1 - v, .2, .9); }
    if (type === 'poison') { target.status.poisonUntil = this.state.time + number(ability.duration, 4); target.status.poisonDps = v > 1 ? v : e.damage * v; target.status.poisonOwner = { id: e.id, ownerId: e.ownerId, side: e.side, team: e.team }; }
    if (type === 'lifesteal') { const heal = dealt * v; e.hp = Math.min(e.maxHp, e.hp + heal); }
    if (type === 'chain') {
      const next = lane.filter(v => v.side !== e.side && v.hp > 0 && v.id !== target.id && distance(v, target) < number(ability.radius, 2.2)).sort((a, b) => distance(a, target) - distance(b, target)).slice(0, number(ability.targets, 3));
      next.forEach((v, i) => { this._hurt(v, dealt * Math.pow(.65, i + 1), e); this._event('chain', v, '闪电', { fromX: target.x, fromY: target.y, fromWorldX: target.worldX, fromWorldY: target.worldY }); });
    }
  }
  _hurt(target, damage, attacker, pure = false) {
    if (target.hp <= 0 || damage <= 0 || (target.status?.cycloneUntil??0)>(this._aesaraEventAt??this._brightArthasEventAt??this._arthasEventAt??this._lichEventAt??this._vashjEventAt??this._iceEventAt??this._trollEventAt??this._kelthuzadEventAt??this.state.time)) return 0;
    const options=typeof pure==='object'?pure:{spell:!!pure},legacyPure=typeof pure==='boolean'&&pure;
    const registeredDamageListeners=darkArthasDamageListeners(this,target);
    const revivalCount=target.status.yseraRevivalCount??0;
    let actual = modifyIncoming(this,target,damage,attacker,options);
    if(actual<=0){if((target.status.yseraRevivalCount??0)>revivalCount)beforeSourceDamage(this,target,0,attacker,options);sourceClassAttackDamageEvent(this,target,attacker,options,0);sourceRegisteredDamageEvent(this,target,registeredDamageListeners);return 0;}
    if ((target.status.shield ?? 0) > 0 && !legacyPure) { const absorbed = Math.min(actual, target.status.shield); target.status.shield -= absorbed; actual -= absorbed; }
    beforeSourceDamage(this,target,actual,attacker,options);
    actual=brightArthasEventDamage(this,target,actual,attacker);
    // Main damage listener was registered before New_UnitAttack in the map.
    sourceClassAttackDamageEvent(this,target,attacker,options,actual);
    sourceRegisteredDamageEvent(this,target,registeredDamageListeners);
    const sourcePreDamageHp=target.hp;
    target.hp -= actual;
    afterSourceDamage(this,target,actual,attacker,{...options,sourcePreDamageHp});
    if (!options.spell && target.ability?.type === 'thorns' && attacker?.hp > 0 && attacker.range < 1.3) this._hurt(attacker, actual * number(target.ability.value, .15), target, true);
    if (attacker?.ownerId !== undefined && attacker.ownerId !== null) { const p = this.state.players[attacker.ownerId]; if (p) p.stats.damage += actual; }
    if (target.hp <= 0 && target.ability?.type === 'revive' && !target.status.revived) {
      target.status.revived = true; target.hp = target.maxHp * clamp(number(target.ability.value, .35), .1, 1);
      target.status.stunUntil = this.state.time + .6; this._event('revive', target, '复生'); return;
    }
    this._settleDeath(target,attacker);
    return actual;
  }
  _killUnit(target){
    if(!target||target.hp<=0)return false;
    target.hp=0;target.pendingAttack=null;
    this._settleDeath(target,null);
    return true;
  }
  _settleDeath(target,attacker){
    if (target.hp <= 0 && !target.status.deathCounted) {
      target.status.deathCounted = true;
      const economicPlayer=this.state.players[attacker?.ownerId];
      this._sourceDeath(target,attacker);
      const economic=sourceEconomyDeath(this,target,attacker,units);
      if(economicPlayer){economicPlayer.gold+=economic.bonusGold;economicPlayer.wood+=economic.bonusWood;economicPlayer.stats.goldEarned+=economic.bonusGold;}
      if (target.side === 'monster') {
        const base = this.state.wave >= 31 ? 0 : target.isMerc || target.isSummon ? number(target.sourceRawFields?.level,target.reward) : number(RULES.waveKillGold?.[this.state.wave-1],target.reward);
        let bounty = target.status.sourceLeakMarker ? Math.floor(base*(this.state.players[target.sourceLaneId]?.leakBountyFactor??0)) : base;
        if(this.state.wave<31 && target.substituted)bounty+=rule('nextWaveSubstitutionBounty',3);
        if(this.state.wave<31 && target.status.sourceLeakMarker && target.status.specialLeakBonus)bounty+=2;
        const ownerId=attacker?.ownerId, p=this.state.players[ownerId];
        if(this.state.wave<31 && p && !target.status.sourceLeakMarker && !target.isMerc && !target.isSummon && !target.isBoss && p.id!==target.sourceLaneId)bounty=rule('crossLaneBounty',1);
        const special=specialMonsterDeath(this,target,attacker),normalBounty=bounty;
        if(special?.handledBounty)bounty=special.gold;
        target.reward=bounty;
        if(attacker?.isKing){
          // Native qC adds the enemy treasury, then the king's user-data treasury.
          this.state.kingBountyPools??=[0,0];
          if(special?.handledBounty){this.state.kingBountyPools[1-attacker.team]+=normalBounty;this.state.kingBountyPools[attacker.team]+=bounty;}
          else for(const team of [0,1])this.state.kingBountyPools[team]+=bounty;
        } else if(p && p.team!==target.team){p.gold+=bounty;p.wood+=special?.wood??0;p.stats.kills++;p.stats.goldEarned+=bounty;recordBeastKingKill(p,attacker,units[attacker?.unitId]??UNIT_TEMPLATES[attacker?.combatRawcode]);}
        this.state.metrics.killed++;
      }
      this._event('death', target, target.side === 'monster' ? `+${target.reward}` : '阵亡', { color: target.color });
    }
  }
  _sourceDeath(target,killer){sourceDeath(this,target,killer);}
  _passiveAbility(e, lane, dt) {
    const a = e.ability; if (!a || e.abilityCd > 0) return;
    const type = a.type, radius = number(a.radius, 2.6), v = number(a.value, 12);
    if (type === 'regen') { e.hp = Math.min(e.maxHp, e.hp + v); e.abilityCd = 1; return; }
    if (type === 'poison_aura' || type === 'stomp') {
      for (const other of lane) if (e.hp > 0 && other.side !== e.side && other.hp > 0 && distance(other, e) <= radius) {
        this._hurt(other, v, e, type === 'poison_aura');
        if (type === 'stomp') other.status.stunUntil = this.state.time + number(a.duration, .5);
      }
      if (type === 'stomp') this._event('splash', e, a.name ?? '践踏', { radius });
      e.abilityCd = type === 'poison_aura' ? 1 : number(a.cooldown, 5); return;
    }
    // Healing auras are applied once per recipient each simulation step, so
    // duplicate sources cannot stack or multiply their output by frame count.
    if (type === 'aura_heal') return;
    if (type === 'heal') {
      const friends = lane.filter(f => f.side === e.side && f.hp > 0 && f.hp < f.maxHp && distance(f, e) <= radius).sort((x, y) => x.hp / x.maxHp - y.hp / y.maxHp);
      for (const f of friends.slice(0, 1)) { const heal = v <= 1 ? f.maxHp * v : v; f.hp = Math.min(f.maxHp, f.hp + heal); this._event('heal', f, `+${Math.round(heal)}`); }
      e.abilityCd = number(a.cooldown, 2.5);
    } else if (type === 'summon') {
      const count = clamp(Math.round(v), 1, 3);
      const def = { id: `${e.unitId}-summon`, name: `${e.name}·召唤物`, hp: e.maxHp * .24, damage: e.damage * .38,
        range: .45, moveSpeed: 1.15, attackSpeed: 1.1, shape: 'triangle', color: e.color, radius: .16 };
      for (let i = 0; i < count; i++) this.state.entities.push(this._entity(def, { team: e.team, side: e.side, laneId: e.laneId, sourceLaneId: e.sourceLaneId, ownerId: e.ownerId,
        x: e.x, y: e.y, worldX: e.worldX + (i - 1) * .2, worldY: e.worldY, battleTeam: e.battleTeam, nav: e.nav ? copy(e.nav) : undefined, isSummon: true, expiresAt: this.state.time + 14, reward: 0 }));
      this._event('summon', e, '召唤'); e.abilityCd = number(a.cooldown, 9);
    } else if (type === 'shield') { e.status.shield = Math.max(e.status.shield ?? 0, v <= 1 ? e.maxHp * v : v); e.abilityCd = 9; }
    else e.abilityCd = 4;
  }
  _leak(e) {
    const source = this.state.players[e.sourceLaneId];
    if (!source || e.hp <= 0 || e.side !== 'monster' || e.status.leaked) return;
    if(!e.isMerc&&!e.isSummon&&e.combatRawcode===(this._waveData().combatRawcode??this._waveData().sourceRawcode)&&this.state.wave<30&&![10,20].includes(this.state.wave)&&!e.isBoss){source.sourceLeaks=(source.sourceLeaks??0)+1;e.status.sourceLeakMarker=true;
      if(this.state.wave>=rule('leakPenaltyFromWave',11)){this.state.teamLeakFlags??=[false,false];if(!this.state.teamLeakFlags[source.team]){this.state.teamLeakFlags[source.team]=true;for(const ally of this.state.players.filter(p=>p.team===source.team))ally.wood=Math.max(0,ally.wood-rule('teamLeakWoodPenalty',1000));this._log(`${source.team===0?'蓝方':'红方'}首次漏怪，全队每人扣除1000木材（不足扣至0）。`);}}}
    source.stats.leaks++; source.roundLeaks = (source.roundLeaks ?? 0) + 1;
    this.state.metrics.leaked++; e.status.leaked = true;
    // Crossing the exit records a leak; it never changes physical coordinates.
    this._syncLocal(e);
    this._event('leak', e, '漏怪进入公共通路');
  }
  _transferDefenders() {
    // Historical trigger: the source-lane activity group clears on death or
    // entry into the central stem, not immediately at the build-zone exit.
    for (let laneId = 0; laneId < 8; laneId++) {
      if (this._settledLanes.includes(laneId) || this._spawnQueue.some(e => e.laneId === laneId)) continue;
      if (this.state.entities.some(e => e.sourceLaneId === laneId && e.side === 'monster' && !e.status.enteredStem && e.hp > 0)) continue;
      this._settledLanes.push(laneId);
      const player = this.state.players[laneId]; if (!player.roundLeaks) player.stats.wavesHeld++;
      // The original clear-lane trigger supplies a return order even to units
      // that never acquired a target; backline units otherwise wait in place.
      for (const e of this.state.entities) if (e.side === 'defender' && e.sourceLaneId === laneId && e.hp > 0 && !e.status.warped && e.nav?.mode === 'guard') { e.status.activated = true; this._planReturn(e); }
    }
  }
  _warpDefenders() {
    for (const e of this.state.entities) {
      if (e.hp <= 0 || e.status.yseraHidden || e.status.yseraPaused || e.status.sourcePaused || e.status.illidanPaused || e.status.cycloneUntil>this.state.time || e.side !== 'defender' || e.status.warped || !this._settledLanes.includes(e.sourceLaneId)) continue;
      if (e.nav?.mode !== 'return' || distance(e, spawnWarpWorld(e.sourceLaneId)) > .55 || e.targetId) continue;
      const team = e.battleTeam, source = worldPoint(e), base = supportWorld(team);
      const slot = Number(String(e.buildingId ?? e.id).replace(/\D/g, '')) || 0;
      const destination = closestWalkable({ x: base.x + ((slot % 7) - 3) * .3, y: base.y + (e.sourceLaneId % 4) * .28 + (Math.floor(slot / 7) % 3) * .16 }, team, e.radius);
      if (!destination) continue;
      this._event('warp', { ...e, worldX: source.x, worldY: source.y }, '出生门传送', { color: e.color });
      e.worldX = destination.x; e.worldY = destination.y; e.status.warped = true;
      if (this.state.players[e.ownerId]) this.state.players[e.ownerId].stats.warps = (this.state.players[e.ownerId].stats.warps ?? 0) + 1; e.targetId = null; e.chase = null;
      this._syncLocal(e); this._planSupport(e);
      this._event('warp', e, '王前协防', { color: e.color, fromWorldX: source.x, fromWorldY: source.y });
      if (!this.state.players[e.ownerId]?.supportAnnounced) {
        this.state.players[e.ownerId].supportAnnounced = true;
        this._event('support', e, `${this.state.players[e.ownerId].name} 出生门→王前协防`);
      }
    }
  }
  _updateKings(dt) {
    for (const k of this.state.kings) {
      if (k.hp <= 0) continue;
      if(k.status?.sourcePaused||k.status?.illidanPaused||k.status?.cycloneUntil>this.state.time)continue;
      if(this.state.wave>=31&&k.movePath){const nav=k.movePath;while(nav.index<nav.path.length&&distance(this._kingPosition(k.team),nav.path[nav.index])<.03)nav.index++;if(nav.index<nav.path.length){const destination=nav.path[nav.index],from=this._kingPosition(k.team),delta=distance(from,destination),step=Math.min(delta,rule('kingMoveSpeed',250/3)/100*dt),point={x:from.x+(destination.x-from.x)/delta*step,y:from.y+(destination.y-from.y)/delta*step},next=constrainPoint(from,point,k.team,k.radius??.8);k.worldX=next.x;k.worldY=next.y;}else k.movePath=null;}
      const position = this._kingPosition(k.team), auras = this._battleAuras?.[k.team] ?? [];
      const kingTarget = { ...k, ...position, side: 'defender' }, kingAuras = this._auraEffects(kingTarget, auras);
      k.hp = Math.min(k.maxHp, k.hp + (k.regen + kingAuras.healRate) * dt); k.attackCd -= dt;
      if (k.attackCd <= 0) {
        const reach = rule('kingRange', 250) / 100 + (k.radius ?? .8);
        const enemies = this._nearby({ ...position, battleTeam: k.team }, reach + .5)
          .filter(e => e.side === 'monster' && e.hp > 0 && !(e.status?.cycloneUntil>this.state.time) && distance(e, position) <= reach + e.radius && this._canSegment(position, worldPoint(e), k.team, 0))
          .sort((a, b) => distance(a, position) - distance(b, position));
        if (enemies.length) {
          k.attackCd = rule('kingInterval', .85) / ((1 + (k.autoUpgradeCount ?? 0) * rule('kingAttackSpeedPerFourWaves', .1)) * kingAuras.attackSpeedMultiplier);
          const target = enemies[0], targetAuras = this._auraEffects(target, auras);
          const dealt = k.attack * kingAuras.damageMultiplier * this._typeMultiplier(k.attackType ?? 'hero', target.armorType, target.sourceArmorTypeRaw) * this._armorFactor(this._effectiveArmor(target, targetAuras.armor));
          this._hurt(target, dealt, k);
          this._event('kingAttack', target, `${Math.round(k.attack)}`, { fromWorldX: position.x, fromWorldY: position.y, color: k.team ? '#fb7185' : '#60a5fa' });
          if (RULES.webKingSplashEnabled===true && this.state.wave >= 7) for (const e of enemies.slice(1, 5)) if (distance(e, target) < 1.4) this._hurt(e, k.attack * kingAuras.damageMultiplier * .35 * this._typeMultiplier(k.attackType ?? 'hero', e.armorType, e.sourceArmorTypeRaw) * this._armorFactor(this._effectiveArmor(e, this._auraEffects(e, auras).armor)), k);
        }
      }
      if (this._aiEnabled() && k.hp < k.maxHp * .16 && k.healCharges > 0) {
        const ai = this.state.players.find(p => p.id !== 0 && p.team === k.team && !p.healUsed);
        if (ai) this.command('heal', { playerId: ai.id });
      }
    }
    const dead = this.state.kings.map(k => k.hp <= 0);
    if (dead.some(Boolean)) {
      this.state.kings.forEach(k => k.hp = Math.max(0, k.hp));
      this.state.phase = 'ended'; this.state.winner = dead[0] && dead[1] ? -1 : dead[0] ? 1 : 0;
      this._log(this.state.winner === -1 ? '双方国王同时倒下，本局平局。' : this.state.winner === 0 ? '敌方国王倒下！蓝方军团获胜。' : '己方国王倒下，红方军团获胜。');
    }
  }
  _clearDead() {
    for (const e of this.state.entities) if (e.expiresAt && e.expiresAt <= this.state.time) {e.hp = 0;this._sourceDeath(e,null);}
    this.state.entities = this.state.entities.filter(e => e.hp > 0);
  }
  _endCombat() {
    const s = this.state;
    beginSkeletonKingRoundFinish(this);
    for(const p of s.players)finishEggWave(p,s.wave);
    if (s.mode === 'sandbox') {
      this._resetSandboxWave(); this._log(`测试沙盒：第 ${s.wave} 波测试完成，回到备战；未结算过波奖励，可再次手动出兵。`);
      return;
    }
    const boxGrants=advanceBoxRewards(this,s.wave);
    if(boxGrants.some(g=>g.playerId===0))this._log(`神秘礼物：第${s.wave>=13?13:6}波礼物已开放，三项中任选一项。`);
    // A cleared round discards its temporary dummies before preparation/arena.
    s.sourceSkillJobs = []; s.nagaScriptCasters = {}; s.darkArthasCasters = {}; s.brightArthasHandles = {}; s.aesaraHandles = {}; s.sourceAuraNextAt=Math.floor(s.time)+1;
    const listedReward = RULES.waveRewards?.[s.wave - 1];
    const bonus = Number.isFinite(listedReward) ? listedReward * ((RULES.bossRewardDoubleWaves??[10,20]).includes(s.wave) ? 2 : 1) : rule('incomeBase', 22) + s.wave * rule('incomePerWave', 8);
    for (const p of s.players) {
      applyFarmerRoundReward(this,p,units);
      for(const b of p.buildings)if(b.temporaryForm){b.unitId=b.temporaryForm;b.temporaryForm=null;b.stimulatedWave=null;}
      const teamSize = s.players.filter(v => v.team === p.team).length;
      const kingShare = Math.floor((s.kingBountyPools?.[p.team] ?? 0) / Math.max(1, teamSize));
      const gold = p.income + bonus + kingShare; p.gold += gold; p.stats.goldEarned += gold;
    }
    s.kingBountyPools = [0, 0];
    if(s.wave>=rule('leakPenaltyFromWave',11)){
      for(const p of s.players){const sourceFlag=RULES.reproduceNoLeakRewardTeamOneBug ? s.teamLeakFlags?.[0] : s.teamLeakFlags?.[p.team];if(!sourceFlag){p.gold+=rule('noLeakGoldReward',100);p.wood+=rule('noLeakWoodReward',200);p.stats.goldEarned+=rule('noLeakGoldReward',100);}}
      if(!s.teamLeakFlags?.[0])this._log('按原图队伍1标志判定，两队获得100金200木无漏奖励。');
    }
    for(const k of s.kings){
      if(s.wave<=rule('kingRecoveryThroughWave',4)){const gain=rule('kingRecoveryHpPerEarlyWave',1000);k.maxHp+=gain;k.hp=Math.min(k.maxHp,k.hp+gain);}
      if(s.wave===rule('kingArmorRecoveryWave',4))k.armor+=rule('kingArmorRecoveryGain',8);
      if(s.wave===rule('kingArmorBonusWave',16))k.armor+=rule('kingArmorBonusGain',2);
    }
    this._log(`第 ${s.wave} 波结束：发放永久收入、${bonus} 金币守护奖励与国王杀敌分红，阵亡军团将在下波复归。`);
    if(s.wave>=WAVES.length){this._log('末波继续战斗，胜负以国王倒下为准。');return;}
    if([10,20].includes(s.wave)){s.phase='build';s.roundMode='arena-prep';s.timer=rule('arenaPreparationSeconds',30);s.entities=[];this._log('竞技场准备30秒，随后双方军团交战。');return;}
    s.wave++; s.roundMode='normal';s.phase = 'build'; s.timer = this.buildDuration(s.wave); s.entities = [];
    for (let i = 1; i < 8; i++) this._aiAct(s.players[i]);
  }

  _startArena(){
    this._completeMilitaryConstruction();
    const s=this.state;s.phase='combat';s.roundMode='arena';s.entities=[];s.sourceSkillJobs=[];s.nagaScriptCasters={};s.darkArthasCasters={};s.brightArthasHandles={};s.aesaraHandles={};s.sourceAuraNextAt=Math.floor(s.time)+1;s.timer=0;s.arenaRemaining=rule('arenaBattleLimitSeconds',120);this._spawnQueue=[];this._roundTime=0;
    for(const p of s.players)for(const b of p.buildings.filter(b=>!b.construction)){
      let def=units[b.unitId];if(!def||(isSourceUnit(def)&&!def.combatRawcode))continue;def=this._boxCombatDefinition(def,b);const point=laneToWorld(0,1.2+(p.id%4)*1.1+(b.col-2.5)*.12,p.team===0?5+(b.row/8):9-(b.row/8));
      const e=this._entity(def,{team:p.team,side:`arena${p.team}`,battleTeam:0,laneId:0,sourceLaneId:p.id,ownerId:p.id,buildingId:b.id,isArena:true,worldX:point.x,worldY:point.y});
      initializeSourceClassCombat(this,b,e);
      if(e.combatRawcode==='h0JJ')e.userData=p.id+1;
      e.armor+=number(b.treasureArmor,0);
      if(b.garroshArmorLevel){e.armor+=b.garroshArmorLevel;e.status.garroshArmorLevel=b.garroshArmorLevel;}
      if(b.garroshAttackLevel){e.damage+=b.garroshAttackLevel;e.status.garroshAttackLevel=b.garroshAttackLevel;}
      this._ensureWorld(e);
      e.status.activated=true;e.acquisitionRange=12;e.nav={mode:'arena',path:[],index:0,distance:0};s.entities.push(e);
    }
    this._log(`第${s.wave}波竞技场开始，限时120秒；Web在同一场地模拟双方军团交战。`);
  }
  _endArena(alive){
    if (this.state.mode === 'sandbox') { this._resetSandboxWave(); return; }
    const s=this.state,winner=alive[0]&&!alive[1]?0:alive[1]&&!alive[0]?1:-1,reward=s.wave*(winner===-1?rule('arenaDrawGoldPerWave',5):rule('arenaWinnerGoldPerWave',10));
    for(const p of s.players)if(winner===-1||p.team===winner){p.gold+=reward;p.stats.goldEarned+=reward;}
    s.arenaResult={winner,reward,wave:s.wave};s.entities=[];s.sourceSkillJobs=[];s.nagaScriptCasters={};s.darkArthasCasters={};s.brightArthasHandles={};s.aesaraHandles={};s.sourceAuraNextAt=Math.floor(s.time)+1;s.phase='build';s.roundMode='arena-transition';s.timer=rule('arenaAfterBattleSeconds',20);
    this._log(`竞技场${winner===-1?'平局':winner===0?'蓝方获胜':'红方获胜'}，${winner===-1?'双方':'胜方'}每人奖励${reward}金币；20秒过渡后进入30秒准备。`);
  }
  _advanceContinuous(){
    if (this.state.mode === 'sandbox') return;
    const s=this.state;if(s.wave>=35)return;const survivors=s.entities.filter(e=>e.hp>0),jobs=s.sourceSkillJobs??[],nagaCasters=s.nagaScriptCasters??{},arthasCasters=s.darkArthasCasters??{},brightHandles=s.brightArthasHandles??{},aesaraHandles=s.aesaraHandles??{},oldTime=this._roundTime,queue=this._spawnQueue.map(e=>({...e,at:Math.max(0,e.at-oldTime)}));
    s.wave++;s.phase='build';this._startCombat();s.sourceSkillJobs=jobs;s.nagaScriptCasters=nagaCasters;s.darkArthasCasters=arthasCasters;s.brightArthasHandles=brightHandles;s.aesaraHandles=aesaraHandles;s.entities=[...survivors,...s.entities.filter(e=>e.side==='monster')];this._spawnQueue=[...queue,...this._spawnQueue].sort((a,b)=>a.at-b.at);
    s.continuousRemaining=s.wave<35?50:null;this._log(`连续进攻：第${s.wave}波已加入战场，存活守军与残怪保留。`);
  }

  _isWeaponlessObstacle(u) {
    const f=u?.sourceRawFields;
    if(!isV14(u)||!number(f?.isbldg,0)||!f?.pathTex||number(f.spd,0)>0)return false;
    // Read the same native masks as actual combat; inherited editor damage is
    // not evidence that a stationary structure has an enabled weapon.
    const source={...u,side:'defender',skillSource:'v14.1A5',isBuilding:true};
    return !['ground','air','structure'].some(targetType=>sourceWeapon(source,{side:'monster',targetType,isBuilding:targetType==='structure',traits:[],hp:100,status:{}}));
  }
  _isFront(u) { return u && !this._isWeaponlessObstacle(u) && (['tank', 'frontline'].includes(u.role) || value(u, ['range'], 100) < 100); }
  _hasArea(u) { return ['aoe','splash','cleave','chain','multishot','burn','stomp','poison_aura'].includes(u?.ability?.type)||compileSkills(u??{}).some(s=>['stomp','wave','knives','nova','breath','cluster','immolation','barrage','pulverize','phoenix_fire'].includes(s.kind))||['msplash','mbounce','artillery','aline','mline'].includes(u?.weapon1?.weapTp1); }
  _combatPower(u) {
    if (!u || (isSourceUnit(u)&&!u.combatRawcode) || this._isWeaponlessObstacle(u)) return 0;
    const a = abilityOf(u), type = a?.type;
    let dps = u.damage / Math.max(.2, value(u, ['interval'], 1));
    if (['aoe','splash','cleave'].includes(type)) dps *= 1 + number(a.value,.3) * 4;
    if (type === 'chain') dps *= 1 + .65 + .65 ** 2 + .65 ** 3;
    if (type === 'multishot') dps *= 1 + number(a.value,.5) * Math.max(1,number(a.targets,3)-1);
    if (type === 'burn') dps += number(a.value,10) * 4;
    if (type === 'poison_aura') dps += number(a.value,10) * 5;
    if (type === 'stomp') dps += number(a.value,30) * 5 / number(a.cooldown,5);
    if (type === 'poison') dps += number(a.value,8);
    return dps + u.hp * (1 + .06 * (u.armor ?? 0)) * .025;
  }
  _emptyCell(p, u) {
    const rows = this._isFront(u) ? [4,3,5,2,6,1,7,0] : [5,6,4,7,3,2,1,0];
    for (const row of rows) for (const col of [2,3,1,4,0,5]) if (!p.buildings.some(b=>b.col===col&&b.row===row)) return {col,row};
    return null;
  }
  _aiOpeningCore(p) {
    if (p.buildings.length) return;
    const roster = p.roster.map(id=>units[id]).filter(Boolean), fronts = roster.filter(u=>this._isFront(u));
    const minimumFront = fronts.length ? Math.min(...fronts.map(u=>this._cost(u))) : 0;
    const plans = [];
    for (const base of roster) {
      const options = [base, ...this._upgradeIds(base).map(id=>units[id])];
      for (const u of options) {
        const cost = this._cost(base) + (u.id===base.id ? 0 : this._cost(u));
        const reserve = this._isFront(u) ? 0 : minimumFront;
        if (this._combatPower(u)>0 && !this._requirement(p,u) && cost + reserve <= p.gold && value(u,['population'],1)+p.workers <= p.populationCap)
          plans.push({base,u,cost,score:this._combatPower(u)/Math.max(1,cost) * (this._hasArea(u)?4:1) * (!this._isFront(u)?1.1:1)});
      }
    }
    plans.sort((a,b)=>b.score-a.score);
    const plan=plans[0]; if(!plan)return;
    const cell=this._emptyCell(p,plan.u);
    if (!cell || !this.command('build',{playerId:p.id,unitId:plan.base.id,...cell}).ok)return;
    if(plan.u.id!==plan.base.id)this.command('upgrade',{playerId:p.id,buildingId:p.buildings[p.buildings.length-1].id,unitId:plan.u.id});
  }
  _aiBuild(p, opening = false) {
    if(p.populationCap-this._population(p)<5&&p.gold>=rule('farmCost',75)+100)this.command('farm',{playerId:p.id});
    if(opening)this._aiOpeningCore(p);
    if(!opening&&p.buildings.some(b=>!b.construction&&!units[b.unitId]?.hero)&&!p.buildings.some(b=>units[b.unitId]?.heroEntry)){
      const altar=this.heroStatus(p.id),def=units[altar.entries[0]],cell=def&&this._emptyCell(p,def);
      if(altar.canStart&&cell)this.command('build',{playerId:p.id,unitId:def.id,...cell});
    }
    let attempts=opening?8:2;
    while(attempts-->0){
      const built=p.buildings.map(b=>units[b.unitId]), frontCount=built.filter(u=>this._isFront(u)).length;
      const frontHp=built.filter(u=>this._isFront(u)).reduce((n,u)=>n+u.hp,0);
      const damage=built.reduce((n,u)=>n+this._combatPower(u),0);
      const needFront=frontCount<Math.max(1,Math.ceil(built.length*.35)) || frontHp<damage*2.1;
      const hasArea=built.some(u=>this._hasArea(u)), options=[];
      const reserve=this.state.wave<=2?0:35;
      for(const id of p.roster){const u=units[id];if(u&&this._combatPower(u)>0&&!this._requirement(p,u)&&this._cost(u)<=p.gold-reserve&&this._population(p)+u.population<=p.populationCap){
        let score=this._combatPower(u)/this._cost(u);
        if(needFront)score*=this._isFront(u)?3:.25;else score*=this._isFront(u)?.8:1.4;
        if(!hasArea&&this._hasArea(u))score*=2.8;
        if(u.ability?.type?.startsWith('aura_'))score*=built.length>=6?1.5:.6;
        options.push({type:'build',u,cost:this._cost(u),score});
      }}
      for(const b of p.buildings)for(const id of this._upgradeIds(units[b.unitId])){const u=units[id],old=units[b.unitId];
        if(b.construction||this._combatPower(u)<=0||this._requirement(p,u)||this._cost(u)>p.gold-reserve||this._population(p)-old.population+u.population>p.populationCap)continue;
        let score=(this._combatPower(u)-this._combatPower(old))/this._cost(u)*(built.length>=9?1.9:1.1);
        if(needFront)score*=this._isFront(u)?2.3:.4;else score*=this._isFront(u)?.8:1.4;
        if(!hasArea&&this._hasArea(u))score*=3;
        options.push({type:'upgrade',u,b,cost:this._cost(u),score});
      }
      options.sort((a,b)=>b.score-a.score);const choice=options[0];if(!choice)break;
      if(choice.type==='upgrade'){if(!this.command('upgrade',{playerId:p.id,buildingId:choice.b.id,unitId:choice.u.id}).ok)break;}
      else{const cell=this._emptyCell(p,choice.u);if(!cell||!this.command('build',{playerId:p.id,unitId:choice.u.id,...cell}).ok)break;}
    }
  }
  _aiAct(p) {
    if (!this._aiEnabled()) return;
    const treasure=this.treasureStatus(p.id)[0];
    if(treasure)this.command('treasure',{playerId:p.id,treasureId:treasure.id,reward:treasure.lumberAvailable?'lumber':'gold'});
    if (this.state.phase === 'build') {
      const economy = this.economyStatus(p.id);
      if (p.workers + economy.worker.queued < Math.min(rule('maxWorkers', 10), 2 + Math.floor(this.state.wave / 2)) && economy.worker.canStart && p.gold > economy.worker.cost.gold + 80 && this._random() < .34) this.command('worker', { playerId: p.id });
      if (p.lumberLevel < this.state.wave && economy.lumber.canStart && p.wood > economy.lumber.cost.wood + 80 && p.gold > economy.lumber.cost.gold + 80 && this._random() < .24) this.command('lumber', { playerId: p.id });
      if (!p.buildings.some(b=>this._hasArea(units[b.unitId])) && p.wood>=rule('rerollCost',25) && p.gold>150 && p.rerolls<2 && this.state.wave<=4) this.command('reroll',{playerId:p.id});
      this._aiBuild(p);
    }
    if (p.wood >= rule('kingUpgradeCost', 80) && this._random() < .18) {
      const k = this.state.kings[p.team]; this.command('king', { playerId: p.id, stat: k.hp < k.maxHp * .75 ? 'hp' : this._pick(['attack', 'hp', 'regen']) });
    }
    const ownKing=this.state.kings[p.team];
    const defenseReserve=(this.state.wave<=2||ownKing.hp<ownKing.maxHp*.8)?rule('kingUpgradeCost',180):0;
    if (p.wood > 60+defenseReserve && this._random() < .3) {
      const available = MERCENARIES.filter(m => value(m, ['unlock', 'unlockWave', 'wave', 'minWave'], 1) <= this.state.wave && this._woodCost(m) <= p.wood-defenseReserve && this.mercenaryStatus(m.id, p.id).stock > 0);
      const m = this._pick(available); if (m) this.command('merc', { playerId: p.id, mercId: m.id });
    }
    if (RULES.interfereEnabled && this.state.phase === 'combat' && this.state.roundMode !== 'arena' && !this.state.paused && (p.interfereUntil ?? 0) <= this.state.time && this._random() < .06) {
      const winding = this.state.entities.find(e => e.side === 'monster' && e.hp > 0 && e.battleTeam === p.team && e.pendingAttack);
      if (winding) this.command('interfere', { playerId: p.id, worldX: winding.worldX, worldY: winding.worldY });
    }
  }

  snapshot() {
    return copy({ version: 2, mapId: MAP.id, mapVersion: MAP.version, options: this.options, state: this.state, rng: this._rng >>> 0, id: this._id,
      spawnQueue: this._spawnQueue, aiTimer: this._aiTimer, roundTime: this._roundTime, settledLanes: this._settledLanes, overtime: this._overtime, warpTimer: this._warpTimer, monsterPressure: this._monsterPressure });
  }
  restore(saved) {
    if (!saved || ![1, 2].includes(saved.version) || !saved.state?.players || saved.state.players.length !== 8 || saved.state.kings?.length !== 2) throw new Error('存档格式不匹配');
    if(saved.state.sourceVersion!==RULES.sourceVersion)throw new Error('存档来源版本不同；旧版本存档已保留，请新开v14.1A5九倍对局。');
    if (saved.version === 2 && (saved.mapId !== MAP.id || saved.mapVersion !== MAP.version)) throw new Error('存档地图版本不匹配');
    const revisionChanged=saved.state.dataRevision!==RULES.dataRevision;
    const data = copy(saved); this.options = data.options ?? this.options; this.options.ggEnabled??=RULES.ggEnabled??true; this.state = data.state;
    this.state.mode = gameMode(this.state.mode ?? data.options?.mode); this.options.mode = this.state.mode;
    if (this.state.mode === 'sandbox') this.state.sandbox = { aiEnabled: this.state.sandbox?.aiEnabled === true };
    else delete this.state.sandbox;
    this._rng = data.rng >>> 0; this._id = data.id ?? 0; this._spawnQueue = data.spawnQueue ?? [];
    this._aiTimer = data.aiTimer ?? 0; this._roundTime = data.roundTime ?? 0; this._settledLanes = data.settledLanes ?? []; this._overtime = data.overtime ?? false; this._warpTimer = data.warpTimer ?? 0; this._monsterPressure = data.monsterPressure;
    this._spatial = null; this._worldEntities = null; this._battleAuras = [[], []];
    for (const k of this.state.kings) {
      k.armor ??= rule('kingArmor', 8); k.armorType ??= 'hero'; k.attackType ??= 'hero'; k.autoUpgradeCount ??= 0; k.healBlockedUntil ??= 0;k.status??={};k.id??=`king-${k.team}`;k.side='defender';k.isKing=true;k.battleTeam=k.team;k.laneId=8+k.team;k.targetType='structure';k.traits=['mechanical'];k.isBuilding=true;
    }
    if(revisionChanged){
      for(const k of this.state.kings){const ratio=k.maxHp>0?clamp(k.hp/k.maxHp,0,1):0;const hpUpgrades=Array.from({length:k.hpLevel??0},(_,i)=>RULES.kingHpUpgradeIncrements?.[i]??rule('kingHpPerUpgrade',450)).reduce((a,b)=>a+b,0);k.maxHp=rule('kingInitialHp',5000)+hpUpgrades;k.hp=k.maxHp*ratio;k.attack=rule('kingDamage',60)+(k.attackLevel??0)*rule('kingDamagePerUpgrade',10);k.regen=rule('kingRegen',3)+(k.regenLevel??0)*rule('kingRegenPerUpgrade',5);k.armor=rule('kingArmor',5)+(k.autoUpgradeCount??0)*rule('kingArmorPerFourWaves',2)+number(k.treasureArmor,0);}
      const aliases=new Map(UNITS.filter(u=>!u.legacy&&u.sourceRawcode).map(u=>[u.sourceRawcode,u.id]));const alias=id=>{const def=units[id];return def?.legacy&&def.sourceRawcode&&aliases.has(def.sourceRawcode)?aliases.get(def.sourceRawcode):id;};
      for(const p of this.state.players){p.roster=p.roster.map(alias);for(const b of p.buildings)b.unitId=alias(b.unitId);if(p.heroId||p.buildings.some(b=>units[b.unitId]?.legacy))this.state.legacyMatch=true;}
      for(const e of this.state.entities){const id=alias(e.unitId),def=units[id];if(id!==e.unitId&&def){const ratio=e.maxHp>0?clamp(e.hp/e.maxHp,0,1):0;e.unitId=id;e.name=def.name;e.maxHp=def.hp;e.hp=def.hp*ratio;e.damage=def.damage;e.attackInterval=def.interval;e.range=def.range/100;e.moveSpeed=def.speed/100;e.armor=def.armor;e.attackType=def.attackType;e.armorType=def.armorType;e.ability=abilityOf(def)??null;attachSkills(e,def);}}
      this.state.dataRevision=RULES.dataRevision;this.state.migrationNotice='旧存档已按文档迁移，原始存档已备份；无法映射的历史Web单位继续标记为兼容单位。';
    }
    this.state.kingBountyPools ??= [0, 0]; this.state.sourceSkillJobs??=[]; this.state.nagaScriptCasters??={}; this.state.darkArthasCasters??={}; this.state.brightArthasHandles??={}; this.state.aesaraHandles??={}; this.state.teamLeakFlags??=[false,false];
    if(!this.state.skeletonKingGate)skeletonKingGate(this).legacyUnknown=true;
    migrateBoxRewardProgress(this,{legacySnapshot:true});
    for (const p of this.state.players) {
      p.builderId??=RULES.defaultBuilderId;
      p.sourceFarmRawcode??=null;
      p.relocationsRemaining=relocationRemaining(p);
      p.nagaFarmerGoldRate=farmerGoldRate(p,units);
      p.heroAltarCount=this._heroAltarCount(p);
      for(const b of p.buildings.filter(b=>!b.construction))this._recordSourceCompletion(p,units[b.unitId]);
      for(const b of p.buildings.filter(b=>!b.construction))this._initializeSourceClassBuilding(b);
      restoreEggHistory(p,{wave:this.state.wave,buildings:p.buildings,unitsById:units});
      for(const b of p.buildings)if(!b.construction&&!b.boxLimitTransferred)this._recordLimitOrigins(b,units[b.unitId]);
      if(p.workers>rule('maxWorkers',7)||p.lumberLevel>rule('maxLumberLevel',15)){p.workers=Math.min(p.workers,rule('maxWorkers',7));p.lumberLevel=Math.min(p.lumberLevel,rule('maxLumberLevel',15));this.state.migrationNotice=`旧存档已限制为${RULES.maxWorkers}小精灵、${RULES.maxLumberLevel}级科技；原进度已保留备份。`;}
      const tasks=this._economyTasks(p);tasks.workerQueue=tasks.workerQueue.slice(0,Math.max(0,rule('maxWorkers',7)-p.workers));if(tasks.lumberTask?.targetLevel>rule('maxLumberLevel',15))tasks.lumberTask=null;
      p.popUsed = this._population(p);
      for (const m of MERCENARIES) this._mercenarySlot(p, m);
    }
    for(const e of this.state.entities){
      const def=units[e.unitId]??mercs[e.unitId]??UNIT_TEMPLATES[e.combatRawcode];
      if(!e.skillSpecs&&def)attachSkills(e,def);
      else if(def&&isV14(def)&&refreshSourceSkills(e,def)){e.status??={};e.status.sourceSkillsRestoredAt=this.state.time;}
      if(isV14(def)&&def.heroFamily)e.isNativeHero=['STR','AGI','INT'].includes(def.sourceRawFields?.Primary);
      e.skillStates??={};e.buffs??=[];
    }
    // JSON stores retained handles separately; surviving units must share the
    // live object again so later healing, movement and death update one handle.
    for(const e of [...this.state.entities,...this.state.kings])if(this.state.brightArthasHandles[e.id])this.state.brightArthasHandles[e.id]=e;
    for(const e of [...this.state.entities,...this.state.kings])if(this.state.aesaraHandles[e.id])this.state.aesaraHandles[e.id]=e;
    for(const j of this.state.sourceSkillJobs)if(['huskar_unyielding','huskar_duel_immune'].includes(j.type)){const e=[...this.state.entities,...this.state.kings].find(e=>e.id===j.sourceId);if(e)j.source=e;}
    for(const j of this.state.sourceSkillJobs)if(isSkeletonKingJobType(j.type)){const e=this.state.entities.find(e=>e.id===j.sourceId);if(e)j.source=e;}
    if (saved.version === 1) {
      this.state.map = { id: MAP.id, version: MAP.version, topology: '2x2-crossbar-stem' };
      for (const e of this.state.entities) {
        this._ensureWorld(e);
        if (e.side === 'monster') {
          if (e.status.leaked) { e.status.enteredStem = Math.abs(e.worldX - kingWorld(e.battleTeam).x) <= 2 && e.worldY >= 16; e.nav = { mode: 'monster', routeId: e.sourceLaneId, path: navigationPath(worldPoint(e), this._kingPosition(e.battleTeam), e.battleTeam, e.radius), index: 1, distance: 0 }; }
          else this._planMonsterRoute(e);
        } else if (e.laneId >= 8) this._planSupport(e);
        else this._planReturn(e);
      }
      this.state.kings.forEach(k => { const p = kingWorld(k.team); k.worldX = p.x; k.worldY = p.y; k.radius ??= .8; });
      this._log('旧存档已迁移到连续路线地图。');
    }
    return this;
  }
  static fromSnapshot(saved) { return new Game(saved.options).restore(saved); }
}

export default Game;
