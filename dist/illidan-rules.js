import { V14_ABILITIES } from './v14-reference.js';

// v14.1A5 war3map.j 34653–35146. Native orders are dispatched by the damage
// event at 40947–40976; A1B7 is dispatched by an actual attack at 42350–42352.
// The host owns entities and damage. All state and timer jobs here are JSON data.
export const ILLIDAN_COMBAT_TYPES = Object.freeze(['h0SY', 'h0VW']);
export const ILLIDAN_NORMAL_ABILITIES = Object.freeze(['A1B6', 'A1B7', 'A1B8', 'A1B9', 'A1BA', 'A1BB', 'A1BC']);
export const ILLIDAN_DEMON_ABILITIES = Object.freeze(['A1BD', 'A1BE', 'A1BF']);
export const ILLIDAN_JOB_TYPES = Object.freeze(['illidan_parasite', 'illidan_fright', 'illidan_flame', 'illidan_morph', 'illidan_flame_pair', 'illidan_eye', 'illidan_frenzy']);
export const isIllidanJobType = type => ILLIDAN_JOB_TYPES.includes(type);
const rule = (id, sourceLines, description, extra = {}) => {
  const ability = V14_ABILITIES[id], f = ability.resolved_fields;
  return Object.freeze({ id, name: ability.name, manaCost: Number(f.Cost1 ?? 0), cooldown: Number(f.Cool1 ?? 0), range: Number(f.Rng1 ?? 0), status: 'implemented', sourceLines, description, ...(ability.base_code === 'ANcl' ? { autoOrder: f.DataF1, cooldownPolicy: 'shared_native' } : {}), ...extra });
};
const nativeOrderBoundary = '自动分支连续IssueOrder到原生spell effect事件的排队、覆盖和施法前摇尚缺宿主运行证据；已按源码顺序派发并共享原生费用/冷却，不虚构第二套自动冷却。';
export const ILLIDAN_ACTIVE_RULES = Object.freeze({
  A1BA: rule('A1BA', '34820-34867,39432-39433,40947-40951', '以自身当前坐标为圆心，600范围造成75点混乱攻击/通用伤害，0至12秒共13跳；跟随施法者移动，死亡立即停止。原生施法与自动命令共享8蓝、18秒冷却。', { targetKind: 'enemy', radius: 600, status: 'partial', partial: nativeOrderBoundary }),
  A1BB: rule('A1BB', '34869-34976,39435-39436,40952-40956', '变为恶魔并暂停2.5秒，随后召唤两只无定时生命的艾辛诺斯烈焰；两只均死亡后恢复人形技能。最多完成6次召唤；第6次恢复后再次施法会消耗原生费用并移除此技能。原生费用18蓝、冷却30秒。', { targetKind: 'none', status: 'partial', partial: nativeOrderBoundary + '施法者在2.5秒暂停期间被RemoveUnit后，原生计时回调访问已移除句柄的行为亦未核定。' }),
  A1BE: rule('A1BE', '34978-34996,39426-39427,40967-40971', '召唤两只n06W暗影恶魔，无定时生命；实际对象费用5蓝、冷却13秒。原对象没有沉默技能，未按文案虚构10%沉默。', { targetKind: 'none', status: 'partial', partial: nativeOrderBoundary }),
  A1BF: rule('A1BF', '34998-35068,39429-39430,40972-40976', '固定施法时起点与目标方向，在150/300/450/600码四个位置各建立半径200圆；各圆0秒215伤害、1至12秒每跳10伤害，重叠圆分别结算。死亡立即停止。实际费用13蓝、冷却20秒。', { targetKind: 'point', radius: 200, status: 'partial', partial: nativeOrderBoundary }),
});
export const ILLIDAN_RULES = Object.freeze({
  A1B6: rule('A1B6', '34653-34691,43778-43791', '实际由击杀事件20%触发，每层A1BD增加1点平攻，上限200级；战斗体和原建筑分别递增。恶魔切回人形会清除战斗体A1BD，原建筑保留；并非攻击吸血。'),
  A1B7: rule('A1B7', '34693-34767,42350-42352', '首次实际普攻后立即移除标记，从400范围敌人按组枚举次序取最多3名；0至8秒每秒20通用伤害，第9秒或目标死亡时对目标200范围爆炸75。不是随机取人；施法者普通死亡不取消寄生。'),
  A1B9: rule('A1B9', '34769-34818', '敌人每次进入400范围后，每0.03秒检查B07R；前99次检查内出现该buff即造成一次50通用伤害，离开再进入可再次触发。25%移速/攻速降低由A1B8原生光环提供；600范围-3甲来自另一个A1BJ，不重复叠加。', { status: 'partial', partial: '原生B07R光环刷新和离圈驻留时间未在JASS中定义；宿主提供nativeBuffActive时使用真实buff，否则仅按当前原生光环范围推导。' }),
  A1BC: rule('A1BC', '34869-34901,35070-35146,43787-43789', '人形死亡后创建满血同型恶魔，魔法15，移除原人形；仅此新恶魔有一次生命下穿20%时的15秒狂暴：攻速状态+1、A1BH平攻+50。新恶魔没有再次复活监听。保留灵魂击杀叠层，死亡不凭文案增加沉默。', { status: 'partial', partial: '死亡时无A1BD会执行先添加再SetUnitAbilityLevel(0)，其原生等级结果尚缺宿主证据；不把未知等级伪装成确定的额外攻击。已移除旧句柄的寄生/变形计时行为亦留明确边界。' }),
  A1BD: rule('A1BD', '34653-34691,34869-34901,35114-35146,43778-43781', '灵魂层辅助原生AIat：第1至200级分别增加1至200点平攻；由伊利丹源模块按等级差应用一次，切回人形时从战斗体移除，原建筑保留。', { levels: 200, flatAttackPerLevel: 1 }),
  A1BH: rule('A1BH', '35070-35112', '仅死亡创建恶魔的生命下穿20%狂暴添加：原生AIat增加50点平攻；15秒计时结束移除，死亡分支仅销毁监听。攻速状态+1另由源模块结算。', { flatAttack: 50 }),
  ...ILLIDAN_ACTIVE_RULES,
});

const raw = e => e?.combatRawcode ?? e?.sourceRawcode ?? e?.rawcode;
const pos = e => ({ x: e.worldX ?? e.x ?? 0, y: e.worldY ?? e.y ?? 0 });
const dist = (a, b) => Math.hypot(pos(a).x - pos(b).x, pos(a).y - pos(b).y);
const scale = e => (e.distanceScale ?? 1) / 100;
const facing = e => Number.isFinite(e.facing) ? e.facing : 0;
const alive = e => !!e && e.hp > .405 && !e.status?.illidanRemoved && !e.status?.yseraRemoved;
const has = (e, id) => Array.isArray(e?.skillSpecs) ? e.skillSpecs.some(s => s.id === id) : (e?.abilityIds ?? []).includes(id);
const st = e => e.status ??= {};
const skillState = (e, id) => { e.skillStates ??= {}; return e.skillStates[id] ??= { readyAt: 0, casts: 0 }; };
const find = (g, id) => g.state.entities.find(e => e.id === id) ?? g.state.kings?.find(e => e.id === id);
const all = g => { const ids = new Set(); return [...g.state.entities, ...(g.state.kings ?? [])].filter(e => !ids.has(e.id) && ids.add(e.id)); };
const now = g => g._illidanEventAt ?? g.state.time;
const addJob = (g, job) => { g.state.sourceSkillJobs ??= []; g.state.sourceSkillJobs.push(job); return job; };
const snapshot = e => ({ id: e.id, ownerId: e.ownerId, buildingId: e.buildingId, side: e.side, team: e.team, battleTeam: e.battleTeam, laneId: e.laneId, sourceLaneId: e.sourceLaneId, combatRawcode: raw(e), skillVersion: e.skillVersion, distanceScale: e.distanceScale, facing: facing(e), worldX: pos(e).x, worldY: pos(e).y, hp: e.hp, maxHp: e.maxHp, skillSpecs: (e.skillSpecs ?? []).map(s => ({ ...s })), status: { illidanRemoved: !!e.status?.illidanRemoved } });
const sourceOf = (g, job) => find(g, job.sourceId) ?? job.source;
const invulnerable = (e, api) => !!(e.invulnerable || api.scriptInvulnerable?.(e) || has(e, 'Avul'));
const enemy = (s, t) => !!s && !!t && s.side !== t.side && s.battleTeam === t.battleTeam;
const selected = (g, source, center, radius, api) => all(g).filter(t => enemy(source, t) && alive(t) && !invulnerable(t, api) && dist(center, t) <= radius + 1e-8);
function atEvent(g, at, fn) { const old = g._illidanEventAt; g._illidanEventAt = at; try { return fn(); } finally { if (old === undefined) delete g._illidanEventAt; else g._illidanEventAt = old; } }
function damage(g, source, target, amount, api) { if (source && !source.status?.illidanRemoved && alive(target) && !invulnerable(target, api)) return api.universalDamage(g, target, amount, source); return 0; }
function areaDamage(g, source, center, radius, amount, api) { for (const target of selected(g, source, center, radius, api)) damage(g, source, target, amount, api); }
const buildingOf = (g, e, api) => api.getBuilding?.(g, e) ?? g.state.players?.[e.ownerId]?.buildings?.find(b => b.id === e.buildingId);
const maxLevel = id => Number(V14_ABILITIES[id]?.resolved_fields.levels ?? 1);
const attackValue = (id, level) => level > 0 ? Number(V14_ABILITIES[id]?.resolved_fields[`DataA${level}`] ?? V14_ABILITIES[id]?.resolved_fields.DataA1 ?? 0) : 0;
const abilityLevel = (e, id) => Number(e?.abilityLevels?.[id] ?? (has(e, id) ? 1 : 0));
function addAbility(g, e, id, api) {
  if (has(e, id)) return false;
  e.skillSpecs ??= (e.abilityIds ?? []).map(id => ({ id }));
  const spec = api.compileAbility?.(g, e, id) ?? { id, name: V14_ABILITIES[id]?.name ?? id, status: ILLIDAN_RULES[id]?.status ?? 'marker', kind: 'illidan_source' };
  e.skillSpecs.push(spec); e.abilityLevels ??= {}; e.abilityLevels[id] = 1;
  if (Array.isArray(e.abilityIds) && !e.abilityIds.includes(id)) e.abilityIds.push(id);
  delete e.skillStates?.[id]; return true;
}
function setAttackLevel(g, e, id, level, api) {
  const next = Math.min(maxLevel(id), Math.max(0, Math.trunc(level))), status = st(e);
  status.illidanAppliedAttackLevels ??= {};
  const old = status.illidanAppliedAttackLevels[id] ?? 0;
  e.abilityLevels ??= {}; e.abilityLevels[id] = next;
  if (old !== next) {
    if (api.applyAttackLevel) api.applyAttackLevel(g, e, id, old, next);
    else if (Number.isFinite(e.damage)) e.damage += attackValue(id, next) - attackValue(id, old);
    status.illidanAppliedAttackLevels[id] = next;
  }
  if (id === 'A1BD') status.illidanSoulLevel = next;
  return next;
}
function removeAbility(g, e, id, api) {
  if (id === 'A1BD' || id === 'A1BH') setAttackLevel(g, e, id, 0, api);
  if (Array.isArray(e.skillSpecs)) e.skillSpecs = e.skillSpecs.filter(s => s.id !== id);
  if (Array.isArray(e.abilityIds)) e.abilityIds = e.abilityIds.filter(s => s !== id);
  delete e.skillStates?.[id]; delete e.abilityLevels?.[id];
}
function alternate(g, e, delta, api) {
  const status = st(e), depth = status.illidanAlternateDepth ?? 0;
  status.illidanAlternateDepth = depth + delta;
  if (delta > 0 && depth === 0) {
    for (const id of ILLIDAN_NORMAL_ABILITIES) removeAbility(g, e, id, api);
    for (const id of ILLIDAN_DEMON_ABILITIES) {
      const added = addAbility(g, e, id, api);
      if (id === 'A1BD' && added) setAttackLevel(g, e, id, 1, api);
    }
  } else if (delta < 0 && status.illidanAlternateDepth === 0) {
    for (const id of ILLIDAN_NORMAL_ABILITIES) addAbility(g, e, id, api);
    for (const id of ILLIDAN_DEMON_ABILITIES) removeAbility(g, e, id, api);
  }
}

// Called after the host has installed the final runtime skill list. The source
// template must never refill a mirror's deliberately empty skillSpecs.
export function registerIllidanSource(g, e, api = {}) {
  if (!ILLIDAN_COMBAT_TYPES.includes(raw(e)) || e.illidanReincarnated || e.isIllusion && !(e.skillSpecs?.length) || st(e).illidanRegistered) return false;
  if (!['A1B6', 'A1B9', 'A1BC'].some(id => has(e, id))) return false;
  const status = st(e); status.illidanRegistered = true; status.illidanRegisteredAt = e.createdAt ?? g.state.time;
  status.illidanSoulRegistered = has(e, 'A1B6'); status.illidanAuraRegistered = has(e, 'A1B9'); status.illidanDeathReviveRegistered = has(e, 'A1BC');
  status.illidanAuraInsideIds = []; status.illidanObservedHp = e.hp;
  const building = buildingOf(g, e, api), stored = building?.status?.illidanSoulLevel ?? building?.illidanSoulLevel ?? building?.abilityLevels?.A1BD ?? (has(building, 'A1BD') ? 1 : 0);
  if (stored > 0) { addAbility(g, e, 'A1BD', api); setAttackLevel(g, e, 'A1BD', stored, api); }
  else if (has(e, 'A1BD')) setAttackLevel(g, e, 'A1BD', abilityLevel(e, 'A1BD'), api);
  return true;
}

export const isIllidanActiveAbility = id => !!ILLIDAN_ACTIVE_RULES[id];
export const canIllidanCastAbility = (e, id) => ILLIDAN_COMBAT_TYPES.includes(raw(e)) && isIllidanActiveAbility(id) && has(e, id);
export function castIllidanAbility(g, e, id, params = {}, api = {}) {
  const result = reason => ({ ok: !reason, skillId: id, ...(reason ? { reason } : {}) });
  if (!canIllidanCastAbility(e, id)) return result('当前形态没有此技能');
  if (!alive(e) || st(e).illidanPaused || e.status.sourcePaused || e.status.yseraPaused || e.status.yseraHidden || e.status.stunUntil > now(g)) return result('单位当前无法施法');
  const rule = ILLIDAN_ACTIVE_RULES[id], state = skillState(e, id), at = now(g);
  if ((state.readyAt ?? 0) > at + 1e-8) return result('技能冷却中');
  if ((e.mana ?? 0) < rule.manaCost) return result('魔法不足');
  const point = params.point ?? (params.target ? pos(params.target) : null);
  if (rule.targetKind === 'point' && (!Number.isFinite(point?.x) || !Number.isFinite(point?.y))) return result('请选择施法位置');
  if (rule.targetKind === 'enemy' && !params.target) return result('请选择可攻击的敌人');
  if (point && dist(e, point) > rule.range * scale(e) + 1e-8) return result('超出施法范围');
  if (params.target && (!enemy(e, params.target) || !alive(params.target) || invulnerable(params.target, api))) return result('请选择可攻击的敌人');
  e.mana -= rule.manaCost; state.readyAt = at + rule.cooldown; state.casts = (state.casts ?? 0) + 1; state.illidanLastCastMode = params.mode ?? 'manual';
  // Trig_allabilityActions disables its own trigger during a spell effect.
  // A nested native cast can pay its native cost/cooldown without reentering
  // this JASS body. Direct scripted auto-calls in other families own their
  // distinct entry points and do not consult this native spell-effect guard.
  if (g._sourceAbilityEffectDepth > 0) return { ...result(), scriptSuppressed: true };
  g._sourceAbilityEffectDepth = (g._sourceAbilityEffectDepth ?? 0) + 1;
  try {
  if (point && dist(e, point) > 1e-8) e.facing = Math.atan2(point.y - pos(e).y, point.x - pos(e).x) * 180 / Math.PI;
  const base = { sourceId: e.id, source: snapshot(e), nextAt: at, count: 0 };
  if (id === 'A1BA') addJob(g, { ...base, type: 'illidan_flame' });
  if (id === 'A1BB') {
    if ((st(e).illidanAisinosCasts ?? 0) >= 6) removeAbility(g, e, 'A1BB', api);
    else if (!e.isAncient && !(e.traits ?? []).includes('ancient')) {
      alternate(g, e, 1, api); st(e).illidanPaused = true; api.pauseUnit?.(g, e, true);
      addJob(g, { ...base, type: 'illidan_morph', at: at + 2.5 });
    }
  }
  if (id === 'A1BE') for (let i = 0; i < 2; i++) spawn(g, e, 'n06W', {}, api);
  if (id === 'A1BF') {
    const origin = pos(e), angle = Math.atan2(point.y - origin.y, point.x - origin.x);
    for (let i = 1; i <= 4; i++) addJob(g, { ...base, type: 'illidan_eye', center: { x: origin.x + Math.cos(angle) * i * 150 * scale(e), y: origin.y + Math.sin(angle) * i * 150 * scale(e) } });
  }
  return result();
  } finally { g._sourceAbilityEffectDepth--; }
}

// Every source branch tests ability presence on the victim before the attacker;
// a victim with insufficient mana still prevents an attacker fallback.
export function tryIllidanAutoCast(g, victim, attacker, api = {}) {
  const casts = [];
  for (const id of ['A1BA', 'A1BB', 'A1BE', 'A1BF']) {
    const source = has(victim, id) ? victim : has(attacker, id) ? attacker : null;
    if (!source) continue;
    const target = source === victim ? attacker : victim;
    const params = { mode: 'auto', ...(ILLIDAN_ACTIVE_RULES[id].targetKind !== 'none' ? { target } : {}) };
    const result = api.issueNativeOrder ? api.issueNativeOrder(g, source, id, params) : castIllidanAbility(g, source, id, params, api);
    if (result?.ok) casts.push({ id, sourceId: source.id });
  }
  return casts;
}
export function illidanOnAttackHit(g, e, target, api = {}) {
  if (!has(e, 'A1B7') || !ILLIDAN_COMBAT_TYPES.includes(raw(e))) return false;
  removeAbility(g, e, 'A1B7', api);
  for (const t of selected(g, e, e, 400 * scale(e), api).slice(0, 3)) addJob(g, { type: 'illidan_parasite', sourceId: e.id, source: snapshot(e), targetId: t.id, targetPoint: pos(t), nextAt: now(g), count: 0 });
  return true;
}
function spawn(g, source, code, extra, api) {
  return api.spawnUnit?.(g, source, code, { worldX: pos(source).x, worldY: pos(source).y, facing: facing(source), isSummon: true, ...extra });
}
function nativeFearBuff(g, target, api) {
  if (api.nativeBuffActive) return !!api.nativeBuffActive(g, target, 'B07R');
  // This fallback deliberately has no invented aura linger timer.
  return g.state.entities.some(e => alive(e) && has(e, 'A1B8') && enemy(e, target) && dist(e, target) <= 400 * scale(e) + 1e-8);
}
function triggerFrenzy(g, e, beforeHp, api) {
  const status = st(e);
  if (!status.illidanFrenzyArmed || status.illidanFrenzyTriggered || !alive(e) || !(beforeHp >= e.maxHp * .2 && e.hp < e.maxHp * .2) || !has(e, 'A1BF')) return false;
  status.illidanFrenzyTriggered = true; status.illidanFrenzyArmed = false;
  const added = addAbility(g, e, 'A1BH', api); if (added) setAttackLevel(g, e, 'A1BH', 1, api);
  e.buffs ??= []; e.buffs.push({ key: 'illidan-demonic-frenzy', skillId: 'A1BH', sourceId: e.id, haste: 1, expiresAt: now(g) + 15 });
  addJob(g, { type: 'illidan_frenzy', sourceId: e.id, source: snapshot(e), at: now(g) + 15 });
  return true;
}
export function illidanAfterDamage(g, target, actual, api = {}) {
  const beforeHp = Number.isFinite(api.preDamageHp) ? api.preDamageHp : target.hp + actual;
  const fired = triggerFrenzy(g, target, beforeHp, api); st(target).illidanObservedHp = target.hp; return fired;
}
export function tickIllidanSource(g, e, api = {}) {
  const status = st(e);
  if (!alive(e)) return;
  triggerFrenzy(g, e, status.illidanObservedHp ?? e.hp, api); status.illidanObservedHp = e.hp;
  if (!status.illidanAuraRegistered) return;
  const inside = all(g).filter(t => enemy(e, t) && alive(t) && dist(e, t) <= 400 * scale(e) + 1e-8).map(t => t.id);
  const previous = new Set(status.illidanAuraInsideIds ?? []);
  for (const id of inside) if (!previous.has(id)) addJob(g, { type: 'illidan_fright', sourceId: e.id, source: snapshot(e), targetId: id, nextAt: now(g) + .03, count: 0 });
  status.illidanAuraInsideIds = inside;
}
function explodeParasite(g, job, api) {
  if (job.done) return;
  job.done = true;
  const target = find(g, job.targetId), source = sourceOf(g, job);
  if (target) job.targetPoint = pos(target);
  if (source && !source.status?.illidanRemoved) areaDamage(g, source, job.targetPoint, 200 * scale(source), 75, api);
}
function soulKill(g, killer, api) {
  if (!killer?.status?.illidanSoulRegistered || !alive(killer) || (g._random?.() ?? Math.random()) * 100 > 20) return;
  const building = buildingOf(g, killer, api), current = abilityLevel(killer, 'A1BD');
  if (current === 0) {
    addAbility(g, killer, 'A1BD', api); setAttackLevel(g, killer, 'A1BD', 1, api);
    if (building && !has(building, 'A1BD')) { addAbility(g, building, 'A1BD', api); setAttackLevel(g, building, 'A1BD', 1, api); }
  } else {
    setAttackLevel(g, killer, 'A1BD', current + 1, api);
    if (building) setAttackLevel(g, building, 'A1BD', abilityLevel(building, 'A1BD') + 1, api);
  }
  if (building) building.illidanSoulLevel = abilityLevel(building, 'A1BD');
}
function reincarnate(g, e, api) {
  const status = st(e); status.illidanDeathReviveRegistered = false;
  const soulLevel = abilityLevel(e, 'A1BD'), fresh = spawn(g, e, raw(e), { isSummon: false, buildingId: e.buildingId, illidanReincarnated: true }, api);
  if (!fresh) return null;
  const freshStatus = st(fresh); freshStatus.illidanRegistered = true; freshStatus.illidanRegisteredAt = fresh.createdAt ?? now(g);
  freshStatus.illidanSoulRegistered = true; freshStatus.illidanDeathReviveRegistered = false; freshStatus.illidanAuraRegistered = false;
  freshStatus.illidanFrenzyArmed = true; freshStatus.illidanObservedHp = fresh.hp; fresh.mana = 15;
  addAbility(g, fresh, 'A1BD', api);
  if (soulLevel > 0) setAttackLevel(g, fresh, 'A1BD', soulLevel, api);
  else {
    const nativeLevel = api.nativeSetAbilityLevel?.(g, fresh, 'A1BD', 0);
    if (Number.isFinite(nativeLevel) && nativeLevel >= 0) setAttackLevel(g, fresh, 'A1BD', nativeLevel, api);
    else { setAttackLevel(g, fresh, 'A1BD', 0, api); freshStatus.illidanSoulLevelUnresolved = { requestedLevel: 0, addedLevel: 1 }; }
  }
  alternate(g, fresh, 1, api);
  status.illidanRemoved = true;
  for (const job of g.state.sourceSkillJobs ?? []) if (isIllidanJobType(job.type) && job.sourceId === e.id) job.source = snapshot(e);
  api.removeUnit?.(g, e); return fresh;
}
// Must be called for every death, including non-Illidan victims and summoned
// flames. Mark jobs done before splash damage to make recursive deaths safe.
export function sourceIllidanDeath(g, target, killer, api = {}) {
  const status = st(target); if (status.illidanDeathHandled) return null; status.illidanDeathHandled = true;
  soulKill(g, killer, api);
  for (const job of g.state.sourceSkillJobs ?? []) {
    if (!isIllidanJobType(job.type) || job.done) continue;
    if (job.type === 'illidan_parasite' && job.targetId === target.id) { job.targetPoint = pos(target); explodeParasite(g, job, api); }
    if (job.type === 'illidan_flame_pair' && job.flameIds.includes(target.id)) {
      job.deadIds ??= []; if (!job.deadIds.includes(target.id)) job.deadIds.push(target.id);
      if (job.deadIds.length >= 2) { job.done = true; const source = sourceOf(g, job); if (source && !source.status?.illidanRemoved) alternate(g, source, -1, api); }
    }
    if (job.sourceId === target.id && ['illidan_flame', 'illidan_eye', 'illidan_fright', 'illidan_frenzy'].includes(job.type)) job.done = true;
    if (job.type === 'illidan_fright' && job.targetId === target.id) job.done = true;
    if (job.sourceId === target.id) job.source = snapshot(target);
  }
  status.illidanSoulRegistered = false; status.illidanAuraRegistered = false;
  return status.illidanDeathReviveRegistered ? reincarnate(g, target, api) : null;
}
export function tickIllidanJob(g, job, api = {}) {
  if (!isIllidanJobType(job.type) || job.done) return false;
  const source = sourceOf(g, job), time = g.state.time;
  if (!source || source.status?.illidanRemoved) return false;
  if (job.type === 'illidan_flame_pair') return true; // Source registers only the two actual death events, never an expiry timer.
  if (job.type === 'illidan_morph') {
    if (time + 1e-8 < job.at) return true;
    st(source).illidanAisinosCasts = (st(source).illidanAisinosCasts ?? 0) + 1;
    if (source.status.illidanAisinosCasts >= 6) removeAbility(g, source, 'A1BB', api);
    source.status.illidanPaused = false; api.pauseUnit?.(g, source, false);
    const flames = []; for (let i = 0; i < 2; i++) { const flame = spawn(g, source, 'n06V', {}, api); if (flame) flames.push(flame.id); }
    addJob(g, { type: 'illidan_flame_pair', sourceId: source.id, source: snapshot(source), flameIds: flames, deadIds: [] });
    return false;
  }
  if (job.type === 'illidan_frenzy') {
    if (!alive(source)) return false;
    if (time + 1e-8 < job.at) return true;
    removeAbility(g, source, 'A1BH', api); source.buffs = (source.buffs ?? []).filter(b => b.key !== 'illidan-demonic-frenzy'); return false;
  }
  if (['illidan_flame', 'illidan_eye', 'illidan_fright'].includes(job.type) && !alive(source)) return false;
  if (job.type === 'illidan_parasite') {
    const target = find(g, job.targetId);
    if (!alive(target)) { explodeParasite(g, job, api); return false; }
    job.targetPoint = pos(target);
  }
  while (job.nextAt <= time + 1e-8) {
    const at = job.nextAt; job.count++;
    if (job.type === 'illidan_fright') {
      const target = find(g, job.targetId);
      if (!alive(source) || !alive(target) || job.count >= 100) return false;
      if (nativeFearBuff(g, target, api)) { job.done = true; atEvent(g, at, () => damage(g, source, target, 50, api)); return false; }
      job.nextAt += .03;
    } else if (job.type === 'illidan_parasite') {
      if (job.count >= 10) { atEvent(g, at, () => explodeParasite(g, job, api)); return false; }
      const target = find(g, job.targetId); if (!alive(target)) { explodeParasite(g, job, api); return false; }
      atEvent(g, at, () => damage(g, source, target, 20, api));
      if (job.done || source.status?.illidanRemoved) return false;
      job.nextAt += 1;
    } else {
      atEvent(g, at, () => areaDamage(g, source, job.type === 'illidan_flame' ? source : job.center, (job.type === 'illidan_flame' ? 600 : 200) * scale(source), job.type === 'illidan_flame' ? 75 : job.count === 1 ? 215 : 10, api));
      if (job.count >= 13 || job.done || !alive(source)) return false;
      job.nextAt += 1;
    }
  }
  return !job.done;
}
