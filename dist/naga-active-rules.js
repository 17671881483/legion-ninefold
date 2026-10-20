import { V14_ABILITIES } from './v14-reference.js';

// Four closed source units: h0UE, h0UF, h0UG and h0UH/h2A4. Remaining
// Naga abilities stay outside this registry until their native effects close.
const ruleDefinitions = {
  A1CO: { name: '战吼', hook: 'damage', once: true, summon: 'h0UD', count: 3, addedAbility: 'A1CP', sourceLines: [40612, 40636] },
  A1CQ: { name: '鱼人袭击', hook: 'damage', once: true, lifeFraction: .5, summon: 'h0UE', count: 3, sourceLines: [40637, 40661] },
  A1CS: { name: '冲锋', hook: 'proximity', manaCost: 0, cooldown: 1, range: 800, proximityRange: 600, targetKind: 'enemy',
    radius: 300, damage: 77, duration: 1, sourceLines: [39092, 39097, 39351, 39353, 43610, 43635] },
  A1CT: { name: '海洋治愈', hook: 'damage-order', manaCost: 10, cooldown: 14, radius: 700, healFraction: .05, targetKind: 'none', sourceLines: [39412, 39428, 40939, 40943] },
  A1CU: { name: '潮汐之泉', hook: 'damage-order', manaCost: 13, cooldown: 10, targetKind: 'none', duration: 5,
    addedAbilities: ['A1CV', 'A1CW'], sourceLines: [39404, 39411, 40934, 40938, 43800, 43805] },
  A1D7: { name: '虚幻', hook: 'damage-order', manaCost: 13, cooldown: 15, targetKind: 'none', duration: 5, sourceLines: [35148, 35177, 40924, 40928] },
  A1D8: { name: '冲刺', hook: 'damage-order', manaCost: 15, cooldown: 17, range: 1200, targetKind: 'point',
    riders: 7, spacing: 150, length: 800, radius: 250, damage: 137, stunLevel: 1, duration: .4, sourceLines: [35179, 35247, 40929, 40933] },
  A1D9: { name: '盾甲', hook: 'hit', chance: .16, victimAttackFraction: .7, sourceLines: [35248, 35255, 42327, 42331] },
  A1CN: { name: '撕咬', hook: 'hit', chance: .15, damage: 20, sourceLines: [42338, 42344] },
  A1DD: { name: '毒素吐息', hook: 'damage-order', manaCost: 11, cooldown: 0, range: 500, targetKind: 'point',
    forward: 400, radius: 400, damage: 66, sourceLines: [39381, 39398, 40914, 40918] },
  A1DP: { name: '水晶箭', hook: 'damage-order', manaCost: 10, cooldown: 5, range: 800, targetKind: 'enemy',
    damage: 135, stunDuration: 2, heroStunDuration: 2, sourceLines: [40903, 40907] },
  A1DQ: { name: '潮汐斩', hook: 'damage-order', manaCost: 15, cooldown: 8, range: 1000, targetKind: 'point',
    radius: 300, damage: 145, stunLevel: 2, duration: .2, sourceLines: [32981, 33019, 39369, 39371, 40876, 40880] },
  A1DR: { name: '冰盾', hook: 'damage', chance: .25, duration: 3, attackFactors: { pierce: .7, magic: .7 },
    status: 'partial', partial: 'A1DS原生AIdd对未在已提取字段中明确命名的其他攻击分类默认行为尚未核定；不按全伤害30%减免处理。',
    sourceLines: [40908, 40913] },
};
const descriptions = {
  A1CO: '首次受到有效敌对伤害时移除本技能，召唤3只鱼人奴隶并各自附加A1CP：900范围3%吸血；h2AE外观实际召唤同型。并非战斗开场或11%嗜血。',
  A1CQ: '首次受到有效敌对伤害时移除本技能，直接将生命设为最大值50%，召唤3只鱼人掠夺者；当前伤害随后继续扣除。',
  A1CS: '部署后首次有敌人进入600范围时只发令一次；追踪目标冲锋约1秒，结束在目标当前坐标300范围造成77点混乱攻击/通用伤害。任一参与者死亡也执行结束伤害。',
  A1CT: '敌对伤害事件中优先让受害者发出原生施法指令；700范围存活非无敌友军恢复5%最大生命，10魔法、14秒原生冷却，手动共用冷却。',
  A1CU: '敌对伤害事件中按受害者优先原生发令；在当前位置召唤5秒固定潮汐之泉，500范围15点每秒回血、5%攻击光环。出生脚本还因Qs别名给予自身10%法术抗性，并向600内已有潮汐之力光环的友军永久发放同级抗性。',
  A1D7: '敌对伤害事件中按受害者优先原生发令，13魔法、15秒冷却。获得5秒伤害免疫，仍可攻击；与手动施法共用冷却。',
  A1D8: '向指定方向同时产生7路幻影骑士，横向间隔150；沿800长度按0.04秒推进、末步前销毁，实际最远回调720。每一路对沿途250范围每名敌人各造成一次137点通用伤害，幸存者使用A0I7第1级眩晕。施法者死亡不取消幻影。',
  A1D9: '实际攻击命中时16%概率追加受害者当前攻击状态值70%的混乱攻击/通用伤害。该技能是攻击触发，未执行文案中的受到伤害反伤。',
  A1CN: '实际攻击命中时15%概率向该目标追加20点混乱攻击/通用伤害。',
  A1DD: '受伤或造成敌对伤害时按受害者优先发原生指令；朝目标方向前方400码点为圆心、半径400，对其中敌人造成66点混乱攻击/通用伤害。源分支没有附加文案中的每秒5点毒素，物编没有额外冷却。',
  A1DP: '敌对伤害事件中按受害者优先发原生firebolt指令；800范围存活有机敌军受到135点法术/魔法伤害并眩晕2秒，原生英雄同为2秒。机械、建筑、魔免与无敌目标不符合原生目标条件，10魔法、5秒共享原生冷却。',
  A1DQ: '固定施法目标点：虚体按0.04秒推进，0.2秒配置于末步之前约0.16秒执行结束，在该点300范围造成145点混乱攻击/通用伤害，并调用A0I7第2级（普通2秒、原生英雄1秒）控制；施法者死亡不取消虚体。',
  A1DR: '受到有效敌对伤害时25%概率添加或刷新3秒冰盾A1DS。已核定对象字段的穿刺与魔法攻击承伤×0.7；法术伤害字段DataB为1，混乱/通用伤害不按全伤害减免处理。原生AIdd其他隐含攻击分类尚未核定。',
};
export const NAGA_ACTIVE_RULES = Object.freeze(Object.fromEntries(Object.entries(ruleDefinitions).map(([id, rule]) => [id, Object.freeze({
  id, status: 'implemented', active: ['A1CS', 'A1CT', 'A1CU', 'A1D7', 'A1D8', 'A1DD', 'A1DP', 'A1DQ'].includes(id),
  cooldownMode: rule.cooldown === undefined ? null : 'shared_native', description: descriptions[id], effectText: descriptions[id], ...rule,
  ...(['A1CS','A1CT','A1CU','A1D7','A1D8','A1DD','A1DQ'].includes(id)?{status:'partial',partial:'伤害事件中的IssueOrder至原生施法效果、连续命令仲裁和嵌套命令是否支付费用尚缺原生运行证据；Web按顺序同步派发，已核定脚本主体与计时可用。'}:{}),
})])));

const activeIds = new Set(['A1CS', 'A1CT', 'A1CU', 'A1D7', 'A1D8', 'A1DD', 'A1DP', 'A1DQ']);
// Trig_allabilityActions disables itself around these script branches. ANfb
// crystal arrow is a native spell effect and remains enabled during that time.
const allAbilityScriptIds = new Set(['A1CS', 'A1CT', 'A1CU', 'A1D7', 'A1D8', 'A1DD', 'A1DQ']);
export const isNagaActiveAbility = id => activeIds.has(id);
const has = (e, id) => Array.isArray(e?.skillSpecs) ? e.skillSpecs.some(s => s.id === id) : (e?.abilityIds ?? []).includes(id);
const raw = e => e?.combatRawcode ?? e?.sourceRawcode ?? e?.rawcode;
const pos = e => ({ x: e.worldX ?? e.x ?? 0, y: e.worldY ?? e.y ?? 0 });
const dist = (a, b) => Math.hypot(pos(a).x - pos(b).x, pos(a).y - pos(b).y);
const scale = e => (e.distanceScale ?? 1 / 3) / 100;
const alive = e => !!e && e.hp > 0 && !e.status?.deathCounted && !e.status?.sourceDeathHandled;
const invulnerable = e => e.invulnerable || e.nativeInvulnerable || e.status?.yseraHidden || e.skillSpecs?.some(s => s.id === 'Avul' || s.kind === 'invulnerability');
const find = (g, id) => g.state.entities.find(e => e.id === id) ?? g.state.kings?.find(e => e.id === id);
const sourceCopy = e => ({ id: e.id, ownerId: e.ownerId, team: e.team, side: e.side, battleTeam: e.battleTeam, combatRawcode: raw(e),
  skillVersion: e.skillVersion, sourceVersion: e.sourceVersion, distanceScale: e.distanceScale, attackType: 'chaos' });
const units = g => [...g.state.entities, ...(g.state.kings ?? [])];
const range = (g, source, point, radius, allies, vulnerable = true) => units(g).filter(e => alive(e)
  && (e.battleTeam === undefined || source.battleTeam === undefined || e.battleTeam === source.battleTeam)
  && (allies ? e.team === source.team : e.team !== source.team) && (!vulnerable || !invulnerable(e)) && dist(e, point) <= radius + 1e-8);
const enqueue = (g, job) => { g.state.sourceSkillJobs ??= []; g.state.sourceSkillJobs.push(job); return job; };
const jobBase = (g, e, type) => ({ id: g._uid('naga-job'), type, sourceId: e.id, source: sourceCopy(e) });
const damage = (g, e, amount, source, api) => {
  if (!api.universalDamage) throw new TypeError('Naga scripts require api.universalDamage(game,target,amount,source)');
  return api.universalDamage(g, e, amount, source);
};
const removeAbility = (e, id) => { if (Array.isArray(e.skillSpecs)) e.skillSpecs = e.skillSpecs.filter(s => s.id !== id); if (Array.isArray(e.abilityIds)) e.abilityIds = e.abilityIds.filter(code => code !== id); };
const inject = (g, e, id, api) => {
  if (!api.addAbility) throw new TypeError('Naga summons require api.addAbility(game,entity,abilityId)');
  api.addAbility(g, e, id);
};
const spawn = (g, source, code, extra, api) => {
  if (!api.spawnUnit) throw new TypeError('Naga summons require api.spawnUnit(game,source,rawcode,extra)');
  return api.spawnUnit(g, source, code, extra);
};
const move = (g, e, point, api) => { if (api.moveUnit) api.moveUnit(g, e, point); else { e.worldX = point.x; e.worldY = point.y; g._syncLocal?.(e); } };

function stun(g, source, target, level, api, at = g.state.time) {
  // VertigoTarget uses A0I7, not PauseUnitEx: no animation-freeze side effect.
  if (!alive(target) || invulnerable(target) || target.traits?.includes('mechanical') || target.skillSpecs?.some(s => s.kind === 'immunity')) return;
  const fields = V14_ABILITIES.A0I7.resolved_fields;
  const duration = Number(fields[`${target.isNativeHero ? 'HeroDur' : 'Dur'}${level}`] ?? 0);
  target.status ??= {};
  if (api.vertigoTarget) {
    const previous = target.status.stunUntil ?? 0;
    api.vertigoTarget(g, source, target, level);
    // Catch-up dispatch must retain the original timer's expiry rather than
    // extending it by the host frame's delay. Preserve other longer controls.
    if ((target.status.stunUntil ?? 0) > previous) target.status.stunUntil = Math.max(previous, at + duration);
  } else target.status.stunUntil = Math.max(target.status.stunUntil ?? 0, at + duration);
}

/** PassiveSkill's Qs typo is A1CU: its owner permanently receives A1CG lv1. */
export function initializeNagaUnit(g, e) {
  e.status ??= {};
  if (has(e, 'A1CU') && !e.status.nagaHaloInitialized) {
    e.status.nagaHaloInitialized = true; e.status.nagaSpellResistance = .1;
    enqueue(g, { ...jobBase(g, e, 'naga_active_halo'), radius: 600 * scale(e), nextAt: g.state.time, interval: 1 });
  }
}

/** Input damage was already calculated before this source event's orders. */
export function nagaBeforeDamage(g, target, actual, attacker, api = {}) {
  if (!(actual > 0) || !attacker || target.team === attacker.team) return;
  for (const id of ['A1CO', 'A1CQ']) if (has(target, id)) {
    const rule = NAGA_ACTIVE_RULES[id]; removeAbility(target, id);
    if (id === 'A1CQ') target.hp = target.maxHp * .5;
    const code = id === 'A1CO' && raw(target) === 'h2AE' ? 'h2AE' : rule.summon;
    for (let n = 0; n < rule.count; n++) {
      const summoned = spawn(g, target, code, { isSummon: true, worldX: pos(target).x, worldY: pos(target).y }, api);
      if (summoned && rule.addedAbility) inject(g, summoned, rule.addedAbility, api);
    }
  }
  const issueDamageOrder = id => {
    // The source elseif only checks ability ownership; a failed native order
    // on the damaged unit does not fall through to the attacking unit.
    const caster = has(target, id) ? target : has(attacker, id) ? attacker : null;
    if (caster) castNagaAbility(g, caster, id, { mode: 'auto', target: caster === target ? attacker : target, point: pos(caster === target ? attacker : target) }, api);
  };
  for (const id of ['A1DQ', 'A1DP']) issueDamageOrder(id);
  if (has(target, 'A1DR') && g._random() * 100 <= 25) { target.status ??= {}; target.status.nagaIceShieldUntil = g.state.time + 3; }
  for (const id of ['A1DD', 'A1D7', 'A1D8', 'A1CU', 'A1CT']) issueDamageOrder(id);
}

export function nagaIncomingDamage(g, target, amount, attacker, options = {}) {
  if ((target.status?.nagaPhantomUntil ?? 0) > g.state.time) return 0;
  let result = amount;
  if (!options.universal && (options.magic && options.spell || options.nativeDamageType === 'magic' || options.attackType === 'spells') && target.status?.nagaSpellResistance) result *= 1 - target.status.nagaSpellResistance;
  if ((target.status?.nagaIceShieldUntil ?? 0) > g.state.time && !options.universal) {
    const attackType = options.attackType ?? (!options.spell ? attacker?.attackType : undefined);
    result *= NAGA_ACTIVE_RULES.A1DR.attackFactors[attackType] ?? 1;
  }
  return result;
}

export function nagaOnHit(g, caster, target, api = {}) {
  if (!caster || !target || caster.team === target.team) return;
  if (has(caster, 'A1D9') && g._random() * 100 <= 16) damage(g, target, Math.max(0, target.damage ?? 0) * .7, caster, api);
  if (has(caster, 'A1CN') && g._random() * 100 <= 15) damage(g, target, 20, caster, api);
}

/** Only the real first-enemy-in-600 proximity registration runs from ticks. */
export function tickNagaUnit(g, e, api = {}) {
  initializeNagaUnit(g, e);
  if (!alive(e) || !has(e, 'A1CS') || e.status.nagaChargeProximityUsed) return;
  const target = range(g, e, e, 600 * scale(e), false, false)[0];
  if (!target) return;
  e.status.nagaChargeProximityUsed = true;
  castNagaAbility(g, e, 'A1CS', { mode: 'auto', target }, api);
}

export function castNagaAbility(g, e, id, params = {}, api = {}) {
  const rule = NAGA_ACTIVE_RULES[id], now = g.state.time;
  if (!activeIds.has(id) || !has(e, id)) return { ok: false, message: '该单位没有此娜迦技能' };
  if (!alive(e) || e.status?.stunUntil > now || e.status?.sourcePaused || e.sourcePaused || e.status?.yseraPaused || e.status?.yseraHidden) return { ok: false, message: '单位当前无法施法' };
  const state = (e.skillStates ??= {})[id] ??= { readyAt: 0, casts: 0 };
  if ((state.readyAt ?? 0) > now) return { ok: false, message: '技能冷却中' };
  if ((e.mana ?? 0) < rule.manaCost) return { ok: false, message: '魔法不足' };
  const point = params.point ?? (params.target ? pos(params.target) : null);
  if (['A1CS', 'A1DP'].includes(id) && (!alive(params.target) || params.target.team === e.team || dist(e, params.target) > rule.range * scale(e))) return { ok: false, message: '请选择范围内的敌方目标' };
  if (id === 'A1DP' && (invulnerable(params.target) || params.target.isBuilding || params.target.targetType === 'structure'
    || params.target.traits?.some(trait => String(trait).toLowerCase() === 'mechanical') || params.target.skillSpecs?.some(s => s.kind === 'immunity'))) return { ok: false, message: '水晶箭需要可受魔法影响的有机敌人' };
  if (['A1D8', 'A1DD', 'A1DQ'].includes(id) && (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || dist(e, point) > rule.range * scale(e))) return { ok: false, message: '请选择范围内的施法方向或位置' };
  e.mana -= rule.manaCost; state.readyAt = now + rule.cooldown; state.casts = (state.casts ?? 0) + 1;
  const scriptBody = allAbilityScriptIds.has(id);
  if (scriptBody && (g._sourceAbilityEffectDepth ?? 0) > 0) return { ok: true, scriptSuppressed: true, message: `已施放${rule.name}`, skillId: id };
  if (scriptBody) g._sourceAbilityEffectDepth = (g._sourceAbilityEffectDepth ?? 0) + 1;
  try {
    if (id === 'A1CT') {
      for (const ally of range(g, e, e, rule.radius * scale(e), true)) { const amount = Math.min(ally.maxHp - ally.hp, ally.maxHp * rule.healFraction); ally.hp += amount; if (amount > 0) g._event?.('heal', ally, `+${amount}`); }
    } else if (id === 'A1CU') {
      const fountain = spawn(g, e, 'e008', { isSummon: true, worldX: pos(e).x, worldY: pos(e).y, expiresAt: now + rule.duration }, api);
      if (fountain) {
        // e008 is the stationary locust dummy created without any movement order.
        fountain.moveSpeed = 0; fountain.invulnerable = true; fountain.weapon1 = { weapsOn: 0 }; fountain.weapon2 = { weapsOn: 0 };
        for (const ability of rule.addedAbilities) inject(g, fountain, ability, api);
      }
    } else if (id === 'A1D7') {
      e.status ??= {}; e.status.nagaPhantomUntil = now + rule.duration;
    } else if (id === 'A1CS') {
      const initialDistance = dist(e, params.target);
      enqueue(g, { ...jobBase(g, e, 'naga_active_charge'), targetId: params.target.id, targetPoint: pos(params.target),
        distance: initialDistance, step: initialDistance * .04, traveled: 0, radius: rule.radius * scale(e), damage: rule.damage, nextAt: now, interval: .04 });
    } else if (id === 'A1DP') {
      if (!api.nativeDamage) throw new TypeError('Crystal arrow requires api.nativeDamage(game,target,amount,source,options)');
      api.nativeDamage(g, params.target, rule.damage, e, { attackType: 'spells', damageType: 'magic' });
      if (alive(params.target)) { params.target.status ??= {}; params.target.status.stunUntil = Math.max(params.target.status.stunUntil ?? 0, now + rule.stunDuration); }
    } else if (id === 'A1DD') {
      const origin = pos(e), angle = Math.atan2(point.y - origin.y, point.x - origin.x);
      const center = { x: origin.x + Math.cos(angle) * rule.forward * scale(e), y: origin.y + Math.sin(angle) * rule.forward * scale(e) };
      for (const enemy of range(g, e, center, rule.radius * scale(e), false)) damage(g, enemy, rule.damage, e, api);
    } else if (id === 'A1DQ') {
      enqueue(g, { ...jobBase(g, e, 'naga_active_tide_bust'), targetPoint: { ...point }, radius: rule.radius * scale(e), damage: rule.damage,
        stunLevel: rule.stunLevel, traveled: 0, length: dist(e, point), step: dist(e, point) / rule.duration * .04, nextAt: now, interval: .04 });
    } else {
      const origin = pos(e), angle = Math.atan2(point.y - origin.y, point.x - origin.x), spacing = rule.spacing * scale(e);
      for (let n = 0; n < rule.riders; n++) {
        const across = (n - 3) * spacing;
        enqueue(g, { ...jobBase(g, e, 'naga_active_phantom_charge'), x: origin.x - Math.sin(angle) * across, y: origin.y + Math.cos(angle) * across,
          vx: Math.cos(angle), vy: Math.sin(angle), length: rule.length * scale(e), step: rule.length * scale(e) / rule.duration * .04,
          radius: rule.radius * scale(e), damage: rule.damage, stunLevel: rule.stunLevel, traveled: 0, hitIds: [], nextAt: now, interval: .04 });
      }
    }
    g._event?.('cast', e, rule.name, { skillId: id });
    return { ok: true, message: `已施放${rule.name}`, skillId: id };
  } finally {
    if (scriptBody) g._sourceAbilityEffectDepth--;
  }
}

function finishCharge(g, job, source, target, api) {
  if (job.completed) return;
  job.completed = true; const point = target ? pos(target) : job.targetPoint;
  for (const enemy of range(g, source, point, job.radius, false)) damage(g, enemy, job.damage, source, api);
}

export function tickNagaJob(g, job, api = {}) {
  if (!job?.type?.startsWith('naga_active_') || job.completed) return false;
  const live = find(g, job.sourceId), source = live ?? job.source, now = g.state.time;
  if (job.type === 'naga_active_halo') {
    if (!alive(live)) return false;
    while (job.nextAt <= now + 1e-8) {
      for (const ally of range(g, source, source, job.radius, true)) if (ally.id !== source.id && !ally.status?.nagaSpellResistance) {
        const hasTideBuff = units(g).some(aura => alive(aura) && aura.team === ally.team && has(aura, 'A1CF') && dist(aura, ally) <= 600 * scale(aura));
        if (hasTideBuff) { ally.status ??= {}; ally.status.nagaSpellResistance = .1; }
      }
      job.nextAt += job.interval;
    }
    return true;
  }
  if (job.type === 'naga_active_charge') {
    const target = find(g, job.targetId);
    if (!alive(live) || !alive(target)) { finishCharge(g, job, source, target, api); return false; }
    while (job.nextAt <= now + 1e-8) {
      job.targetPoint = pos(target);
      if (job.traveled + job.step >= job.distance - 1e-8 || dist(live, target) <= job.step + 1e-8) { finishCharge(g, job, source, target, api); return false; }
      const p = pos(live), destination = pos(target), length = dist(live, target) || 1;
      move(g, live, { x: p.x + (destination.x - p.x) / length * job.step, y: p.y + (destination.y - p.y) / length * job.step }, api);
      job.traveled += job.step; job.nextAt += job.interval;
    }
    return true;
  }
  if (job.type === 'naga_active_tide_bust') {
    while (job.nextAt <= now + 1e-8) {
      if (job.traveled + job.step >= job.length - 1e-8) {
        job.completed = true;
        for (const enemy of range(g, source, job.targetPoint, job.radius, false)) {
          damage(g, enemy, job.damage, source, api); if (alive(enemy)) stun(g, source, enemy, job.stunLevel, api, job.nextAt);
        }
        return false;
      }
      job.traveled += job.step; job.nextAt += job.interval;
    }
    return true;
  }
  // ChargeDistance listens to its dummy's death, not the caster's: these
  // seven independent lines continue after their source dies.
  while (job.nextAt <= now + 1e-8) {
    if (job.traveled + job.step >= job.length - 1e-8) return false;
    job.traveled += job.step;
    const point = { x: job.x + job.vx * job.traveled, y: job.y + job.vy * job.traveled };
    for (const enemy of range(g, source, point, job.radius, false)) if (!job.hitIds.includes(enemy.id)) {
      job.hitIds.push(enemy.id); damage(g, enemy, job.damage, source, api);
      if (alive(enemy)) stun(g, source, enemy, job.stunLevel, api, job.nextAt);
    }
    job.nextAt += job.interval;
  }
  return true;
}

/** ChargeDistanceTarget runs its final callback on either participant's death. */
export function sourceNagaDeath(g, target, killer, api = {}) {
  for (const job of [...(g.state.sourceSkillJobs ?? [])]) if (job.type === 'naga_active_charge' && !job.completed && [job.sourceId, job.targetId].includes(target.id)) {
    finishCharge(g, job, find(g, job.sourceId) ?? job.source, job.targetId === target.id ? target : find(g, job.targetId), api);
  }
}
