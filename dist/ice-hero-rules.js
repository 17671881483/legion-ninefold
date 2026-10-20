import { V14_ABILITIES } from './v14-reference.js';

const nativeBoundary = '原生ANcl同事件多条IssueTargetOrder的取消/施法前摇及原地图SetUnitPosition寻路尚未闭合；只按已核定脚本执行已接受的施法，不能声称原生命令仲裁完全一致。';
const rule = (id, extra) => {
  const ability = V14_ABILITIES[id], fields = ability.resolved_fields;
  return Object.freeze({ id, name: ability.name, active: true, status: 'partial', targetKind: 'point',
    manaCost: Number(fields.Cost1), cooldown: Number(fields.Cool1), range: Number(fields.Rng1),
    autoOrder: fields.DataF1, cooldownMode: 'shared_native', cooldownPolicy: 'shared_native', partial: nativeBoundary,
    sourceRawcodes: ['n06I', 'h0SL'], sourceVersion: 'v14.1A5', ...extra, effectText: extra.description });
};
export const ICE_HERO_RULES = Object.freeze({
  A19O: rule('A19O', { damage: 125, radius: 100, length: 600, duration: 1, interval: .04,
    sourceLines: [33582, 33639, 39462, 39463, 41079, 41083],
    description: '从施法者位置向选定方向放出冰箭，600/1秒配置、0秒首跳及每0.04秒移动；末步之前结束，实际到576码。沿途100范围每名敌人仅受一次125点普通攻击/魔法伤害，不附加文案中的3秒持续效果。' }),
  A19P: rule('A19P', { damage: 185, radius: 200, length: 600, duration: 1, interval: .04,
    sourceLines: [33640, 33695, 39464, 39465, 41084, 41088],
    description: '雪球从施法者位置出发，600/1秒配置，实际最远576码；沿途200范围每名敌人仅受一次185点普通攻击/魔法伤害，不按文案先前移300码或持续3秒。' }),
  A19Q: rule('A19Q', { damage: 45, radius: 800, pulses: 15, interval: .2, duration: 3,
    sourceLines: [33696, 33749, 39466, 39467, 41089, 41093],
    description: '在施法时选定的固定坐标800半径内，每0.2秒对当时存活非Avul敌人造成225/5=45点普通攻击/魔法伤害，持续3秒共15跳，单个始终在场的目标累计675点。施法者死亡不结束。' }),
  A19R: rule('A19R', { damage: 150, radius: 400, length: 800, duration: 1, interval: .04, offsets: [100, -100],
    delayedSeconds: 3, cycloneAbility: 'S007', cycloneDuration: 3,
    sourceLines: [33750, 33839, 39468, 39469, 41094, 41098],
    description: '两道龙卷从左右各100码处沿800/1秒配置推进，实际最远768码。每道对400范围每名敌人各记录一次：立即150点普通攻击/魔法伤害，发S007原生飓风指令，再独立于3秒后追加150点同类伤害；并非每秒150。S007有机敌军含空中目标、普通与原生英雄均3秒，机械、建筑、魔免及无敌目标受原生目标限制。' }),
});

const ids = Object.keys(ICE_HERO_RULES);
const position = e => ({ x: e.worldX ?? e.x ?? 0, y: e.worldY ?? e.y ?? 0 });
const distance = (a, b) => Math.hypot(position(a).x - position(b).x, position(a).y - position(b).y);
const scale = e => (e.distanceScale ?? 1 / 3) / 100;
const has = (e, id, api = {}) => api.hasAbility ? api.hasAbility(e, id)
  : Array.isArray(e?.skillSpecs) ? e.skillSpecs.some(s => s.id === id) : (e?.abilityIds ?? []).includes(id);
const sameTeam = (a, b) => a?.team !== undefined && b?.team !== undefined ? a.team === b.team : a?.side === b?.side;
const alive = e => !!e && e.hp > 0 && !e.status?.deathCounted && !e.status?.sourceDeathHandled;
const avul = e => !!e.invulnerable || !!e.nativeInvulnerable || !!e.status?.yseraHidden
  || e.skillSpecs?.some(s => s.id === 'Avul' || s.kind === 'invulnerability');
const all = game => {
  const seen = new Set();
  return [...(game.state.entities ?? []), ...(game.state.kings ?? [])].filter(e => !seen.has(e.id) && seen.add(e.id));
};
const find = (game, id) => all(game).find(e => e.id === id);
const ancient = e => (e.traits ?? []).some(t => String(t).toLowerCase() === 'ancient')
  || String(e.sourceRawFields?.type ?? e.unitType ?? '').split(',').includes('ancient');
const nearby = (game, source, point, radius) => all(game).filter(e => alive(e) && !sameTeam(source, e) && !avul(e)
  && (source.battleTeam === undefined || e.battleTeam === undefined || source.battleTeam === e.battleTeam)
  && distance(point, e) <= radius + 1e-8);
const snapshot = e => ({ id: e.id, ownerId: e.ownerId, team: e.team, side: e.side, battleTeam: e.battleTeam,
  laneId: e.laneId, sourceLaneId: e.sourceLaneId, combatRawcode: e.combatRawcode ?? e.sourceRawcode,
  sourceVersion: e.sourceVersion, provenance: e.provenance, skillVersion: e.skillVersion, distanceScale: e.distanceScale,
  hp: e.hp, maxHp: e.maxHp, attackType: 'normal', worldX: position(e).x, worldY: position(e).y,
  abilityIds: e.skillSpecs?.map(s => s.id) ?? [...(e.abilityIds ?? [])], traits: [...(e.traits ?? [])],
  status: { deathCounted: !!e.status?.deathCounted, sourceDeathHandled: !!e.status?.sourceDeathHandled } });
const enqueue = (game, job) => { game.state.sourceSkillJobs ??= []; game.state.sourceSkillJobs.push(job); return job; };
const baseJob = (game, e, type) => ({ id: game._uid('ice-job'), type, sourceId: e.id, source: snapshot(e) });
function atEventTime(game, at, callback) {
  const previous = game._iceEventAt; game._iceEventAt = at;
  try { return callback(); }
  finally { if (previous === undefined) delete game._iceEventAt; else game._iceEventAt = previous; }
}
const damage = (game, source, target, amount, api, at = game.state.time) => {
  if (typeof api.nativeDamage !== 'function') throw new TypeError('Ice hero scripts require api.nativeDamage(game,target,amount,source,options)');
  return atEventTime(game, at, () => api.nativeDamage(game, target, amount, source, { attackType: 'normal', damageType: 'magic' }));
};
export const isIceHeroAbility = id => !!ICE_HERO_RULES[id];
export const isIceHeroJobType = type => typeof type === 'string' && type.startsWith('ice_');
export const isIceHeroCycloned = (e, now) => (e?.status?.cycloneUntil ?? 0) > now;
export const canIceHeroCastAbility = (e, id, api = {}) => isIceHeroAbility(id) && !!e && has(e, id, api);

/** The native order pays before the shared SPELL_EFFECT trigger can suppress its body. */
export function castIceHeroAbility(game, e, id, params = {}, api = {}) {
  const r = ICE_HERO_RULES[id], now = game._iceEventAt ?? game.state.time;
  if (!r || !e || !has(e, id, api)) return { ok: false, reason: '当前单位没有此冰系技能' };
  if (!alive(e) || e.status?.sourcePaused || e.sourcePaused || e.status?.yseraHidden || e.status?.yseraPaused || e.status?.illidanPaused
    || e.status?.stunUntil > now || e.status?.yseraSleepingUntil > now || isIceHeroCycloned(e, now)) return { ok: false, reason: '单位当前无法施法' };
  const st = (e.skillStates ??= {})[id] ??= { readyAt: 0, casts: 0 };
  if ((st.readyAt ?? 0) > now + 1e-8) return { ok: false, reason: '技能冷却中' };
  if (!Number.isFinite(e.mana) || e.mana < r.manaCost) return { ok: false, reason: '魔法不足' };
  const point = params.point ?? (params.target ? position(params.target) : null);
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return { ok: false, reason: '请选择施法位置' };
  if (params.target && (params.mode === 'auto' || !params.point)
    && (!alive(params.target) || sameTeam(e, params.target) || avul(params.target) || isIceHeroCycloned(params.target, now))) return { ok: false, reason: '请选择可施法的敌人' };
  if (distance(e, point) > r.range * scale(e) + 1e-8) return { ok: false, reason: '超出原生施法距离', nativeOrderBoundary: params.mode === 'auto' };
  e.mana -= r.manaCost; st.readyAt = now + r.cooldown; st.casts = (st.casts ?? 0) + 1;
  game._event?.('cast', e, r.name, { skillId: id, sourceMode: params.mode ?? 'manual' });
  if ((game._sourceAbilityEffectDepth ?? 0) > 0) return { ok: true, skillId: id, scriptSuppressed: true };
  game._sourceAbilityEffectDepth = (game._sourceAbilityEffectDepth ?? 0) + 1;
  try {
    // All four bodies return immediately for UNIT_TYPE_ANCIENT, after the
    // native cast has already paid. n06I is a building; h0SL is its giant form.
    if (ancient(e)) return { ok: true, skillId: id, ancientSuppressed: true };
    if (id === 'A19Q') {
      enqueue(game, { ...baseJob(game, e, 'ice_frost_control'), point: { ...point }, radius: r.radius * scale(e),
        damage: r.damage, remaining: r.pulses, interval: r.interval, nextAt: now + r.interval });
    } else {
      const origin = position(e), angle = Math.atan2(point.y - origin.y, point.x - origin.x);
      for (const offset of r.offsets ?? [0]) {
        const x = origin.x - Math.sin(angle) * offset * scale(e), y = origin.y + Math.cos(angle) * offset * scale(e);
        enqueue(game, { ...baseJob(game, e, 'ice_charge'), abilityId: id, dummy: { id: game._uid('ice-dummy'), team: e.team,
          side: e.side, battleTeam: e.battleTeam, laneId: e.laneId, sourceLaneId: e.sourceLaneId, worldX: x, worldY: y, radius: 0 },
          vx: Math.cos(angle), vy: Math.sin(angle), length: r.length * scale(e), step: r.length * scale(e) / r.duration * r.interval,
          traveled: 0, radius: r.radius * scale(e), damage: r.damage, hitIds: [], nextAt: now, interval: r.interval, removeAt: now + 1 });
      }
    }
    return { ok: true, skillId: id };
  } finally { game._sourceAbilityEffectDepth--; }
}

/** Called only for an actual hostile damage event, before the event removes HP. */
export function tryIceHeroAutoCast(game, damaged, attacker, api = {}) {
  if (!damaged || !attacker || damaged.id === attacker.id || sameTeam(damaged, attacker)) return [];
  const results = [];
  for (const id of ids) {
    // Source elseif is based on ownership, not on whether the first order succeeds.
    const caster = has(damaged, id, api) ? damaged : has(attacker, id, api) ? attacker : null;
    if (caster) {
      const target = caster === damaged ? attacker : damaged;
      results.push(castIceHeroAbility(game, caster, id, { mode: 'auto', target, point: position(target) }, api));
    }
  }
  return results;
}

function cyclone(game, source, target, at, api) {
  const fields = V14_ABILITIES.S007.resolved_fields;
  const duration = Number(fields[target.isNativeHero ? 'HeroDur1' : 'Dur1']);
  if (typeof api.applyCyclone !== 'function') throw new TypeError('Screaming wind requires api.applyCyclone(game,source,target,abilityId,duration)');
  const previous = target.status?.cycloneUntil ?? 0;
  const applied = atEventTime(game, at, () => api.applyCyclone(game, source, target, 'S007', duration));
  // A catch-up dispatch retains its actual callback time, not the host frame's
  // late time. Keep an unrelated longer existing control intact.
  if (applied !== false && (target.status?.cycloneUntil ?? 0) > previous) target.status.cycloneUntil = Math.max(previous, at + duration);
}

export function tickIceHeroJob(game, job, api = {}) {
  if (!isIceHeroJobType(job?.type) || job.done) return false;
  const source = find(game, job.sourceId) ?? job.source, now = game.state.time;
  if (job.type === 'ice_frost_control') {
    while (job.remaining > 0 && job.nextAt <= now + 1e-8) {
      const at = job.nextAt;
      // Decrement before damage so a recursive death hook cannot duplicate a tick.
      job.remaining--; job.nextAt += job.interval;
      for (const target of nearby(game, source, job.point, job.radius)) damage(game, source, target, job.damage, api, at);
      // Two Blizzard visuals each draw a random radius and a random direction.
      // Preserve those source RNG draws even when the host omits their pixels.
      for (let n = 0; n < 2; n++) { game._random?.(); game._random?.(); }
    }
    return job.remaining > 0;
  }
  if (job.type === 'ice_wind_delayed') {
    if (job.at > now + 1e-8) return true;
    job.done = true;
    const target = find(game, job.targetId);
    if (target) damage(game, source, target, job.damage, api, job.at);
    return false;
  }
  if (job.type !== 'ice_charge') return false;
  while (job.nextAt <= now + 1e-8) {
    const at = job.nextAt;
    if (at >= job.removeAt - 1e-8 || job.traveled + job.step >= job.length - 1e-8) { job.done = true; return false; }
    const point = { x: job.dummy.worldX + job.vx * job.step, y: job.dummy.worldY + job.vy * job.step };
    if (typeof api.setUnitPosition !== 'function') throw new TypeError('Ice charge requires api.setUnitPosition(game,entity,point)');
    api.setUnitPosition(game, job.dummy, point);
    job.traveled += job.step; job.nextAt += job.interval;
    for (const target of nearby(game, source, job.dummy, job.radius)) if (!job.hitIds.includes(target.id)) {
      job.hitIds.push(target.id);
      damage(game, source, target, job.damage, api, at);
      if (job.abilityId === 'A19R') {
        cyclone(game, source, target, at, api);
        // Source creates this timer even if the native cyclone order fails or
        // the initial damage killed its target. The timer tests no such result.
        enqueue(game, { ...baseJob(game, source, 'ice_wind_delayed'), targetId: target.id, damage: job.damage, at: at + 3 });
      }
    }
  }
  return true;
}

/** These timers listen to their virtual dummy's death, never the caster's. */
export function sourceIceHeroDeath(game, target) {
  for (const job of game.state.sourceSkillJobs ?? []) {
    if (!isIceHeroJobType(job.type) || job.done) continue;
    if (job.sourceId === target.id) job.source = snapshot(target);
    if (job.type === 'ice_charge' && job.dummy.id === target.id) job.done = true;
  }
}
