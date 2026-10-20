import { V14_ABILITIES } from './v14-reference.js';

// war3map.j 37128–37920, plus the death hook at 42054–42057.
// This module owns the source timers and form state. Damage, native dummy stun,
// entity creation and removal are supplied by the host, without importing skills.
export const YSERA_FORMS = Object.freeze({ building: 'h0YM', human: 'h0YN', dragon: 'h0YO' });
export const YSERA_JOB_TYPES = Object.freeze(['ysera_slow_restore', 'ysera_armor_restore', 'ysera_dragon_return', 'ysera_death_awaken', 'ysera_nightmare_finish', 'ysera_entangle', 'ysera_mind_disrupt', 'ysera_mind_destroy', 'ysera_green_breath', 'ysera_nightmare']);
export const isYseraJobType = type => YSERA_JOB_TYPES.includes(type);
const rule = (id, form, sourceLines, description, extra = {}) => {
  const a = V14_ABILITIES[id], f = a.resolved_fields;
  return Object.freeze({ id, name: a.name, form, manaCost: Number(f.Cost1 ?? 0), cooldown: Number(f.Cool1 ?? 0), range: Number(f.Rng1 ?? 0), status: 'implemented', sourceLines, description, ...extra });
};
export const YSERA_ACTIVE_RULES = Object.freeze({
  A2YA: rule('A2YA', 'human', '37372-37396,37912-37917', '选定地点180范围当时的敌人，每秒受到30点混乱攻击/通用伤害，共4次；使用原生A0I7第4级控制，原生英雄时长减半且受其目标类型限制；施法忙碌4.2秒。'),
  A2YB: rule('A2YB', 'human', '37397-37420,37910-37911', '在当前朝向前方480码、半径320码区域，筛选非原生英雄、非建筑、非召唤敌人，造成200点混乱攻击/通用伤害并调用原生A0I7第3级控制；不是受伤会醒来的原生睡眠；忙碌3.2秒。'),
  A2YC: rule('A2YC', 'human', '37433-37536,37904-37905,37995-38025,42054-42057', '450范围震荡：250内200伤害，外圈100伤害；控制调用A0I7第1级，移速设为原值65%持续4秒。创建16秒龙形战斗体，人形隐藏无敌；龙死亡或到期后按龙生命比例返回人形，最低10%。人形正常死亡3秒后可永久龙形苏醒。伤害事件内变形开启无敌与正在结算的致死伤害交互，尚缺原生运行证据。', { status: 'partial', partial: '主伤害事件内开启无敌是否取消当前致死伤害、尸体父体能否被返还逻辑复原，尚缺原生宿主证据。' }),
  A2YD: rule('A2YD', 'human', '37537-37628,37907-37909', '锁定主目标及其450范围最多另外两名敌人，0/1/2秒各造成90点混乱攻击/通用伤害；每跳刷新移速65%持续1.5秒，忙碌3.2秒。伤害后的死亡检查保留施法者死亡后下一跳的源行为。'),
  A2YE: rule('A2YE', 'dragon', '37630-37662,37898-37899', '按每跳当前坐标和朝向，0/1/2/3秒对前方650长、260宽矩形敌人造成150点混乱攻击/通用伤害；忙碌4.2秒。PauseUnitEx(0.5)被截断为A0I7等级0，其原生实际等级尚未核定，未虚构0.5秒绝对眩晕。', { status: 'partial', partial: 'A0I7 SetUnitAbilityLevel(0)的原生等级语义未核定；主伤害、矩形、四跳与调度已核定。' }),
  A2YF: rule('A2YF', 'dragon', '37663-37719,37895-37897', '固定施法时的起点和朝向，在0/1/2/3/4秒对650长、240宽矩形造成160点混乱攻击/通用伤害；护甲+60和施法忙碌持续5.2秒。'),
  A2YG: rule('A2YG', 'dragon', '37748-37797,37900-37901', '自身无敌并暂停4秒，每0.6秒独立随机选1200范围一名敌人，造成180点混乱攻击/通用伤害，共6次；同一敌人可重复选中。每次刷新移速70%持续2秒；忙碌4.2秒。'),
});

const raw = e => e?.combatRawcode ?? e?.sourceRawcode ?? e?.rawcode;
const position = e => ({ x: e.worldX ?? e.x, y: e.worldY ?? e.y });
const distance = (a, b) => Math.hypot(position(a).x - position(b).x, position(a).y - position(b).y);
const scale = e => (e.distanceScale ?? 1) / 100;
const facing = e => Number.isFinite(e.facing) ? e.facing : 0;
const radians = e => facing(e) * Math.PI / 180;
const has = (e, id) => Array.isArray(e?.skillSpecs) ? e.skillSpecs.some(s => s.id === id) : (e?.abilityIds ?? []).includes(id);
const alive = e => !!e && e.hp > .405 && !e.status?.yseraRemoved;
const liveEntity = (game, id) => game.state.entities.find(e => e.id === id && !e.status?.yseraRemoved);
const invulnerable = (e, api) => !!(e?.invulnerable || e?.status?.yseraHidden || api.scriptInvulnerable?.(e));
const enemyAlive = (source, target, api) => !!source && alive(target) && source.side !== target.side && source.battleTeam === target.battleTeam && !invulnerable(target, api);
const enemies = (game, source, origin, radius, api) => game.state.entities.filter(t => enemyAlive(source, t, api) && distance(origin, t) <= radius + 1e-8);
const nativeHero = e => e.isNativeHero ?? e.isHero ?? false;
const nativeSummon = e => !!e.isSummon || (e.traits ?? []).includes('summoned');
const state = (e, id) => { e.skillStates ??= {}; return e.skillStates[id] ??= { readyAt: 0, casts: 0 }; };
const addJob = (game, job) => { game.state.sourceSkillJobs ??= []; game.state.sourceSkillJobs.push(job); return job; };
const snapshot = e => ({ id: e.id, ownerId: e.ownerId, buildingId: e.buildingId, side: e.side, team: e.team, battleTeam: e.battleTeam, laneId: e.laneId, sourceLaneId: e.sourceLaneId, combatRawcode: raw(e), skillVersion: e.skillVersion, sourceVersion: e.sourceVersion, distanceScale: e.distanceScale, facing: facing(e), hp: e.hp, maxHp: e.maxHp, mana: e.mana, maxMana: e.maxMana, worldX: position(e).x, worldY: position(e).y, skillSpecs: (e.skillSpecs ?? []).map(s => ({ ...s })), status: { yseraRemoved: !!e.status?.yseraRemoved } });
const casterOf = (game, job) => liveEntity(game, job.sourceId) ?? job.source;
const busy = (game, e, duration) => { e.status ??= {}; e.status.yseraCastBusyUntil = game.state.time + duration; };
const damage = (game, source, target, amount, api) => {
  if (!enemyAlive(source, target, api)) return;
  api.universalDamage(game, target, amount, source);
  api.applyCorrosion?.(game, source, target);
};
const pause = (game, source, target, seconds, api) => api.pauseUnitEx?.(game, source, target, seconds);
function moveSlow(game, target, factor, duration, at = game.state.time) {
  target.status ??= {};
  const previous = target.status.yseraMoveSlow, baseSpeed = previous?.baseSpeed ?? target.moveSpeed;
  const token = (previous?.token ?? 0) + 1;
  target.status.yseraMoveSlow = { token, baseSpeed, factor: Math.max(.1, factor), until: at + duration };
  if (Number.isFinite(baseSpeed)) target.moveSpeed = baseSpeed * Math.max(.1, factor);
  addJob(game, { type: 'ysera_slow_restore', targetId: target.id, token, at: at + duration });
}
function armorDelta(game, target, id, amount, duration) {
  target.status ??= {}; target.status.yseraArmorDeltas ??= {};
  const previous = target.status.yseraArmorDeltas[id], token = (previous?.token ?? 0) + 1;
  if (!previous) target.armor += amount;
  target.status.yseraArmorDeltas[id] = { token, amount, until: game.state.time + duration };
  addJob(game, { type: 'ysera_armor_restore', targetId: target.id, abilityId: id, token, at: game.state.time + duration });
}
function inForwardRect(origin, angle, target, width, length) {
  const p = position(target), dx = p.x - origin.x, dy = p.y - origin.y;
  const along = dx * Math.cos(angle) + dy * Math.sin(angle), across = -dx * Math.sin(angle) + dy * Math.cos(angle);
  return along >= -1e-8 && along <= length + 1e-8 && Math.abs(across) <= width / 2 + 1e-8;
}
function forwardEnemies(game, e, width, length, api, origin = position(e), angle = radians(e)) {
  return game.state.entities.filter(t => enemyAlive(e, t, api) && inForwardRect(origin, angle, t, width * scale(e), length * scale(e)));
}
function randomEnemy(game, e, radius, api) {
  const list = enemies(game, e, e, radius * scale(e), api);
  return list.length ? list[Math.min(list.length - 1, Math.floor(game._random() * list.length))] : null;
}
function removeUnit(game, entity, api) {
  if (!entity) return;
  entity.status ??= {}; entity.status.yseraRemoved = true;
  for (const job of game.state.sourceSkillJobs ?? []) if (job.type.startsWith('ysera_') && job.sourceId === entity.id) job.source = snapshot(entity);
  api.removeUnit(game, entity);
}
function awakeningImpact(game, e, point, api) {
  for (const target of enemies(game, e, point, 450 * scale(e), api)) {
    damage(game, e, target, distance(point, target) <= 250 * scale(e) + 1e-8 ? 200 : 100, api);
    pause(game, e, target, 1.5, api); moveSlow(game, target, .65, 4);
  }
}
function returnDragon(game, job, api) {
  if (job.done) return;
  job.done = true;
  const human = liveEntity(game, job.sourceId), dragon = liveEntity(game, job.dragonId) ?? job.dragon;
  if (human) {
    const point = dragon ? position(dragon) : position(human);
    human.worldX = point.x; human.worldY = point.y; human.facing = dragon ? facing(dragon) : facing(human);
    const fraction = Math.max(.1, dragon?.maxHp > 0 ? dragon.hp / dragon.maxHp : .1);
    human.hp = human.maxHp * fraction; human.invulnerable = false;
    human.status.yseraHidden = false; human.status.yseraPaused = false; human.status.yseraDragonActive = false;
    game._syncLocal?.(human);
  }
  if (dragon) removeUnit(game, dragon, api);
}
function executeAbility(game, e, id, params, api) {
  const now = game.state.time;
  if (id === 'A2YA') {
    busy(game, e, 4.2);
    const point = params.point ?? (params.target ? position(params.target) : { x: position(e).x + Math.cos(radians(e)) * 370 * scale(e), y: position(e).y + Math.sin(radians(e)) * 370 * scale(e) });
    for (const target of enemies(game, e, point, 180 * scale(e), api)) {
      pause(game, e, target, 4, api);
      addJob(game, { type: 'ysera_entangle', sourceId: e.id, source: snapshot(e), targetId: target.id, nextAt: now + 1, count: 0 });
    }
  } else if (id === 'A2YB') {
    busy(game, e, 3.2);
    const point = { x: position(e).x + Math.cos(radians(e)) * 480 * scale(e), y: position(e).y + Math.sin(radians(e)) * 480 * scale(e) };
    for (const target of enemies(game, e, point, 320 * scale(e), api)) if (!nativeHero(target) && !target.isBuilding && !nativeSummon(target)) {
      damage(game, e, target, 200, api); pause(game, e, target, 3, api);
    }
  } else if (id === 'A2YC') {
    busy(game, e, 1.8); const point = position(e), fraction = e.hp / e.maxHp;
    awakeningImpact(game, e, point, api);
    if (!e.status.yseraDragonActive) {
      e.status.yseraDragonActive = true;
      const dragon = api.spawnUnit(game, e, YSERA_FORMS.dragon, { isSummon: true, worldX: point.x, worldY: point.y, facing: facing(e) });
      dragon.status ??= {}; dragon.status.yseraDragonParentId = e.id; dragon.hp = dragon.maxHp * fraction; dragon.mana = 10;
      e.invulnerable = true; e.status.yseraPaused = true; e.status.yseraHidden = true; e.pendingAttack = null;
      addJob(game, { type: 'ysera_dragon_return', sourceId: e.id, source: snapshot(e), dragonId: dragon.id, dragon: snapshot(dragon), at: now + 16 });
    }
  } else if (id === 'A2YD') {
    busy(game, e, 3.2);
    const main = enemyAlive(e, params.target, api) ? params.target : enemies(game, e, e, 700 * scale(e), api)[0];
    if (!main) return;
    const ids = [main.id];
    for (const target of enemies(game, e, main, 450 * scale(e), api)) { if (!ids.includes(target.id)) ids.push(target.id); if (ids.length >= 3) break; }
    addJob(game, { type: 'ysera_mind_disrupt', sourceId: e.id, source: snapshot(e), targetIds: ids, nextAt: now, count: 0 });
  } else if (id === 'A2YE') {
    busy(game, e, 4.2);
    addJob(game, { type: 'ysera_mind_destroy', sourceId: e.id, source: snapshot(e), nextAt: now, count: 0 });
  } else if (id === 'A2YF') {
    busy(game, e, 5.2); armorDelta(game, e, id, 60, 5.2);
    const origin = position(e), angle = radians(e);
    for (const target of forwardEnemies(game, e, 240, 650, api, origin, angle)) damage(game, e, target, 160, api);
    addJob(game, { type: 'ysera_green_breath', sourceId: e.id, source: snapshot(e), origin, angle, nextAt: now + 1, count: 1 });
  } else if (id === 'A2YG') {
    busy(game, e, 4.2); e.invulnerable = true; e.status.yseraPaused = true; e.pendingAttack = null;
    addJob(game, { type: 'ysera_nightmare', sourceId: e.id, source: snapshot(e), nextAt: now + .6, count: 0 });
    addJob(game, { type: 'ysera_nightmare_finish', sourceId: e.id, at: now + 4 });
  }
}

export const isYseraActiveAbility = id => !!YSERA_ACTIVE_RULES[id];
export function canYseraCastAbility(e, id) {
  const r = YSERA_ACTIVE_RULES[id];
  return !!r && has(e, id) && raw(e) === YSERA_FORMS[r.form] && (!e.skillVersion || e.skillVersion === 'v14.1A5');
}
export function castYseraAbility(game, e, id, params = {}, api) {
  if (!canYseraCastAbility(e, id) || !alive(e)) return { ok: false, skillId: id, reason: '当前形态不能释放该技能' };
  const mode = params.mode ?? 'manual', now = game.state.time, r = YSERA_ACTIVE_RULES[id];
  e.status ??= {};
  if (e.status.yseraHidden || e.status.yseraPaused || mode === 'manual' && ((e.status.stunUntil ?? 0) > now || (e.status.yseraSleepingUntil ?? 0) > now)) return { ok: false, skillId: id, reason: '单位当前无法施法' };
  if (mode === 'auto' && ((e.status.yseraCastBusyUntil ?? 0) > now || (e.status.yseraSleepingUntil ?? 0) > now || invulnerable(e, api))) return { ok: false, skillId: id, reason: '施法忙碌或复苏中' };
  const st = state(e, id), cooldownKey = mode === 'auto' ? 'yseraAutoReadyAt' : 'readyAt';
  if ((st[cooldownKey] ?? 0) > now + 1e-8) return { ok: false, skillId: id, reason: '技能冷却中' };
  if (e.mana < r.manaCost) return { ok: false, skillId: id, reason: '魔法不足' };
  const point = params.point ?? (params.target ? position(params.target) : null);
  if (point && (!Number.isFinite(position(point).x) || !Number.isFinite(position(point).y))) return { ok: false, skillId: id, reason: '施法位置无效' };
  if (mode === 'manual' && point && r.range > 0 && distance(e, point) > r.range * scale(e) + 1e-8) return { ok: false, skillId: id, reason: '超出施法距离' };
  e.mana -= r.manaCost; st[cooldownKey] = now + r.cooldown; st.casts = (st.casts ?? 0) + 1;
  game._event?.('cast', e, r.name, { skillId: id, sourceMode: mode });
  executeAbility(game, e, id, params, api);
  return { ok: true, skillId: id };
}
export function tryYseraAutoCast(game, e, api) {
  const now = game.state.time;
  if (!alive(e) || ![YSERA_FORMS.human, YSERA_FORMS.dragon].includes(raw(e)) || invulnerable(e, api) || (e.status?.yseraCastBusyUntil ?? 0) > now || (e.status?.yseraSleepingUntil ?? 0) > now) return null;
  const attempt = (id, condition, target = null) => has(e, id) && condition && castYseraAbility(game, e, id, { mode: 'auto', target }, api).ok;
  if (has(e, 'A2YF')) {
    if (attempt('A2YF', forwardEnemies(game, e, 240, 650, api).length > 0)) return 'A2YF';
    if (attempt('A2YE', forwardEnemies(game, e, 260, 650, api).length > 0)) return 'A2YE';
    if (attempt('A2YG', enemies(game, e, e, 1200 * scale(e), api).length > 0)) return 'A2YG';
  } else {
    if (attempt('A2YC', !e.status?.yseraDragonActive && enemies(game, e, e, 450 * scale(e), api).length > 0)) return 'A2YC';
    const target = randomEnemy(game, e, 700, api);
    if (attempt('A2YD', !!target, target)) return 'A2YD';
    if (attempt('A2YB', forwardEnemies(game, e, 640, 800, api).length > 0)) return 'A2YB';
    if (attempt('A2YA', forwardEnemies(game, e, 700, 740, api).length > 0, target)) return 'A2YA';
  }
  return null;
}

export function sourceYseraDeath(game, e, api) {
  if (![YSERA_FORMS.human, YSERA_FORMS.dragon].includes(raw(e))) return false;
  e.status ??= {}; if (e.status.yseraDeathHandled) return false; e.status.yseraDeathHandled = true;
  for (const job of game.state.sourceSkillJobs ?? []) {
    if (job.sourceId === e.id && job.type.startsWith('ysera_')) job.source = snapshot(e);
    if (job.type === 'ysera_dragon_return' && job.dragonId === e.id) { job.dragon = snapshot(e); returnDragon(game, job, api); }
  }
  if (raw(e) === YSERA_FORMS.human && has(e, 'A2YC') && !e.status.yseraDragonActive && !e.isIllusion) addJob(game, { type: 'ysera_death_awaken', sourceId: e.id, source: snapshot(e), at: game.state.time + 3 });
  return true;
}

export function tickYseraJob(game, job, api) {
  const now = game.state.time;
  if (job.done) return false;
  if (job.type === 'ysera_slow_restore') {
    const target = liveEntity(game, job.targetId), saved = target?.status?.yseraMoveSlow;
    if (!saved || saved.token !== job.token) return false;
    if (now + 1e-8 < job.at) return true;
    if (Number.isFinite(saved.baseSpeed)) target.moveSpeed = saved.baseSpeed;
    delete target.status.yseraMoveSlow; return false;
  }
  if (job.type === 'ysera_armor_restore') {
    const target = liveEntity(game, job.targetId), saved = target?.status?.yseraArmorDeltas?.[job.abilityId];
    if (!saved || saved.token !== job.token) return false;
    if (now + 1e-8 < job.at) return true;
    target.armor -= saved.amount; delete target.status.yseraArmorDeltas[job.abilityId]; return false;
  }
  if (job.type === 'ysera_dragon_return') {
    if (now + 1e-8 < job.at && alive(liveEntity(game, job.dragonId))) return true;
    returnDragon(game, job, api); return false;
  }
  if (job.type === 'ysera_death_awaken') {
    if (now + 1e-8 < job.at) return true;
    const source = casterOf(game, job);
    if (Number.isInteger(source?.ownerId) && source.ownerId >= 0 && source.ownerId < 8 && (!api.isLivingOwner || api.isLivingOwner(game, source))) {
      const dragon = api.spawnUnit(game, source, YSERA_FORMS.dragon, { isSummon: true, worldX: position(source).x, worldY: position(source).y, facing: facing(source) });
      dragon.status ??= {}; dragon.status.yseraDragonActive = false; dragon.status.yseraRevivalCount = 0;
      awakeningImpact(game, dragon, position(source), api);
    }
    if (source) removeUnit(game, source, api);
    return false;
  }
  if (job.type === 'ysera_nightmare_finish') {
    if (now + 1e-8 < job.at) return true;
    const e = liveEntity(game, job.sourceId); if (e) { e.invulnerable = false; e.status.yseraPaused = false; }
    return false;
  }
  const source = casterOf(game, job);
  if (!source || source.status?.yseraRemoved) return false;
  if (job.type === 'ysera_entangle') {
    const target = liveEntity(game, job.targetId); if (!alive(target)) return false;
    while (job.nextAt <= now + 1e-8 && job.count < 4 && alive(target)) { api.universalDamage(game, target, 30, source); job.count++; job.nextAt += 1; }
    return job.count < 4 && alive(target);
  }
  if (job.type === 'ysera_mind_disrupt') {
    while (job.nextAt <= now + 1e-8 && job.count < 3) {
      for (const id of job.targetIds) { const target = liveEntity(game, id); if (enemyAlive(source, target, api)) { damage(game, source, target, 90, api); moveSlow(game, target, .65, 1.5, job.nextAt); } }
      job.count++; job.nextAt += 1;
      // The original checks the caster's death only AFTER applying this pulse.
      if (!alive(source)) return false;
    }
    return job.count < 3;
  }
  if (!alive(source)) return false;
  if (job.type === 'ysera_mind_destroy') {
    while (job.nextAt <= now + 1e-8 && job.count < 4) {
      for (const target of forwardEnemies(game, source, 260, 650, api)) { damage(game, source, target, 150, api); pause(game, source, target, .5, api); }
      job.count++; job.nextAt += 1;
      if (!alive(source)) return false;
    }
    return job.count < 4;
  }
  if (job.type === 'ysera_green_breath') {
    while (job.nextAt <= now + 1e-8 && job.count < 6) {
      job.count++;
      if (job.count <= 5) for (const target of forwardEnemies(game, source, 240, 650, api, job.origin, job.angle)) damage(game, source, target, 160, api);
      job.nextAt += 1;
      if (!alive(source)) return false;
    }
    return job.count < 6;
  }
  if (job.type === 'ysera_nightmare') {
    while (job.nextAt <= now + 1e-8 && job.count < 6) {
      const target = randomEnemy(game, source, 1200, api);
      if (target) { damage(game, source, target, 180, api); moveSlow(game, target, .7, 2, job.nextAt); }
      job.count++; job.nextAt += .6;
      if (!alive(source)) return false;
    }
    return job.count < 6;
  }
  return false;
}
