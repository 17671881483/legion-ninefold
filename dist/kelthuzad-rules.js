import { V14_ABILITIES } from './v14-reference.js';

// Literal v14.1A5 source. This module does not implement native AOre by
// guessing HP, mana, death-event order, or other abilities' cooldown resets.
// The host may supply nativeReincarnation(game, entity, descriptor) to bridge it.
export const KELTHUZAD_COMBAT_TYPES = Object.freeze(['h0PI', 'h0TD', 'h0WT']);
export const KELTHUZAD_BUILDING_TYPES = Object.freeze(['h0PJ', 'h0TC', 'h0WU']);
export const KELTHUZAD_JOB_TYPES = Object.freeze(['kelthuzad_decay', 'kelthuzad_chain_rearm', 'kelthuzad_chain_pull', 'kelthuzad_shadow_crack', 'kelthuzad_remove_ability']);
export const isKelthuzadJobType = type => KELTHUZAD_JOB_TYPES.includes(type);
const rule = (id, sourceLines, description, extra = {}) => {
  const a = V14_ABILITIES[id], f = a.resolved_fields;
  return Object.freeze({ id, name: a.name, status: 'implemented', sourceLines, description, manaCost: Number(f.Cost1 ?? 0), cooldown: Number(f.Cool1 ?? 0), range: Number(f.Rng1 ?? 0), ...extra });
};
export const KELTHUZAD_ACTIVE_RULES = Object.freeze({
  A0ZZ: rule('A0ZZ', '39053-39083,39551-39552,42252-42271,42566-42570', '单位目标暗影裂隙：3秒后按目标届时最大生命造成80%混乱攻击/通用伤害；只有原生英雄为30%，并非按Boss标记判断。目标死亡取消，施法者普通死亡不取消；可对同一目标叠多个任务。实际攻击伤害事件中优先由攻击者发unflamingattack订单，失败不改由受害者释放。', { targetKind: 'enemy', autoOrder: 'unflamingattack', cooldownPolicy: 'shared_native', status: 'partial', partial: '原生单位订单的排队、行走、覆盖和前摇由宿主处理；真实RemoveUnit后保留句柄的计时行为尚未核定。主延迟、目标死亡取消及原生英雄比例已核定。' }),
});
export const KELTHUZAD_RULES = Object.freeze({
  A0ZP: rule('A0ZP', '4449,28649-28658,43216-43238,43650-43654', '死亡与忠诚为显示/需求标记，不是独立触发器。护命匣注册时直接枚举原玩家h0M0与n02S：存在即将次数由1增至2，并给这些巫妖王A0ZV(+10护甲)、A0ZW(+100平攻)、A0ZY标记。脚本没有额外30%攻速。', { status: 'marker' }),
  A0ZQ: rule('A0ZQ', '43160-43238', '独立受伤监听在事件伤害≥当时正生命时扣一次number，立即召唤1只h0CZ僵尸王和2只h0CL食尸鬼王，无定时生命。次数1或2；最后次安排1.01秒后移除原生A0ZU并销毁此监听。复活依赖原生AOre，不在JASS中建新自己或刷新其他技能冷却。', { status: 'partial', partial: 'A0ZU DataA1=0.01、Cast1=1、Cool1=3600已核定；原生非英雄复活的生命/魔法恢复、死亡事件及冷却交互由nativeReincarnation宿主桥接，未实现该桥时不会伪造复活。' }),
  A0ZR: rule('A0ZR', '1193,43014-43158', '部署立即授予A0ZS。一次实际普攻伤害消耗该能力，3秒后重加；从受害者500范围按组次序找首个距其>100的活敌人，先复制原事件伤害，再把二者以每0.04秒60码拉向固定中点，进入100范围后各造成300通用伤害。次目标移动时每次眩晕3级，主目标仅到达时眩晕3级；不是随机两人。', { status: 'partial', partial: 'SetUnitPosition的原地图碰撞/路径修正与原生眩晕目标限制由宿主提供。脚本不设拉拽超时，原地图不可达中点可能永久暂停；未虚构兜底时限。' }),
  A0ZS: rule('A0ZS', '1193,43107-43158', '锁链预备能力：原生AEar为自身提供50%基础远程攻击；首次实际普攻伤害事件移除A0ZS和B071，3秒后重加。目标字段含self而无friend，仅自身受益。', { preserveNativeKind: true }),
  A0ZN: rule('A0ZN', '42978-43012,43639-43642', '部署时魔法设为最大值；每1秒对自身700范围的敌人造成目标最大生命2.5%的混乱攻击/通用伤害，不设最低生命保护。施法者死亡或能力移除后停止。', { radius: 700 }),
  A0ZO: rule('A0ZO', '39553-39554,42561-42565', '原生AUfn对象为500主目标伤害+250范围伤害，40蓝、5秒冷却；实际攻击伤害事件先由攻击者发frostnova订单，否则受害者反发。其spell effect脚本另对自己造成200点ATTACK_TYPE_NORMAL/普通伤害；文案的200范围伤害和冻结5秒不能替代对象字段。', { preserveNativeKind: true, nativeOrderOnly: true, targetKind: 'enemy', autoOrder: 'frostnova', cooldownPolicy: 'shared_native', status: 'partial', partial: '原生AUfn伤害/减速及施法订单由宿主执行；模块只处理已核定的额外自伤，未虚构原生字段未载明的冻结5秒。' }),
  A0ZU: rule('A0ZU', '43195,43231-43232', '原生AOre辅助：DataA1=0.01、Cast1=1、Cool1=3600；最后次致死前事件安排1.01秒后移除。由原生宿主负责复活，不按技能文案假设1秒后满状态并刷新全部冷却。', { status: 'partial', nativeAbility: 'AOre', partial: '非英雄AOre恢复与事件顺序未在本包JASS定义；已暴露原生字段和桥接回调。' }),
  A0ZV: rule('A0ZV', '28653-28654,43208-43209,43651-43652', '死亡与忠诚授予的原生AIde：护甲+10；编译器保持原生passive_stats，仅结算一次。', { preserveNativeKind: true }),
  A0ZW: rule('A0ZW', '28655-28656,43210-43211,43653-43654', '死亡与忠诚授予的原生AIat：平攻+100，由本模块按首次授予结算一次；建筑上的标记经A0ZY带到后续战斗体。'),
  A0ZY: rule('A0ZY', '28657-28658,43212-43213,43226,43650', '死亡与忠诚的Asph球体标记，无脚本攻速加成；原建筑持有此标记时，非护命匣战斗体部署获得A0ZV/A0ZW。', { status: 'marker', preserveNativeKind: true }),
  ...KELTHUZAD_ACTIVE_RULES,
});
export const KELTHUZAD_REINCARNATION_DESCRIPTOR = Object.freeze({ abilityId: 'A0ZU', nativeAbility: 'AOre', dataA: .01, castTime: 1, cooldown: 3600, fields: Object.freeze({ ...V14_ABILITIES.A0ZU.resolved_fields }), baseFields: Object.freeze({ ...V14_ABILITIES.AOre.resolved_fields }), status: 'partial' });

const raw = e => e?.combatRawcode ?? e?.sourceRawcode ?? e?.rawcode;
const pos = e => ({ x: e.worldX ?? e.x ?? 0, y: e.worldY ?? e.y ?? 0 });
const distance = (a, b) => Math.hypot(pos(a).x - pos(b).x, pos(a).y - pos(b).y);
const scale = e => (e.distanceScale ?? 1 / 3) / 100;
const st = e => e.status ??= {};
const has = (e, id) => Array.isArray(e?.skillSpecs) ? e.skillSpecs.some(s => s.id === id) : (e?.abilityIds ?? []).includes(id);
const alive = e => !!e && e.hp > .405 && !e.status?.kelthuzadRemoved && !e.status?.yseraRemoved && !e.status?.illidanRemoved;
const hostile = (source, target) => source?.side !== target?.side && source?.battleTeam === target?.battleTeam;
const invulnerable = (e, api) => !!(e.invulnerable || has(e, 'Avul') || api.scriptInvulnerable?.(e));
const all = g => { const seen = new Set(); return [...(g.state.entities ?? []), ...(g.state.kings ?? [])].filter(e => !seen.has(e.id) && seen.add(e.id)); };
const find = (g, id) => all(g).find(e => e.id === id);
const now = g => g._kelthuzadEventAt ?? g.state.time;
const enqueue = (g, job) => { g.state.sourceSkillJobs ??= []; g.state.sourceSkillJobs.push(job); return job; };
const capture = e => ({ id: e.id, combatRawcode: raw(e), ownerId: e.ownerId, buildingId: e.buildingId, side: e.side, team: e.team, battleTeam: e.battleTeam, laneId: e.laneId, sourceLaneId: e.sourceLaneId, skillVersion: e.skillVersion, distanceScale: e.distanceScale, worldX: pos(e).x, worldY: pos(e).y, facing: e.facing ?? 0, hp: e.hp, maxHp: e.maxHp, mana: e.mana, maxMana: e.maxMana, skillSpecs: (e.skillSpecs ?? []).map(s => ({ ...s })), skillStates: JSON.parse(JSON.stringify(e.skillStates ?? {})), status: { kelthuzadRemoved: !!e.status?.kelthuzadRemoved } });
const sourceOf = (g, job) => find(g, job.sourceId) ?? job.source;
const state = (e, id) => { e.skillStates ??= {}; return e.skillStates[id] ??= { readyAt: 0, casts: 0 }; };
const atEvent = (g, at, fn) => { const old = g._kelthuzadEventAt; g._kelthuzadEventAt = at; try { return fn(); } finally { if (old === undefined) delete g._kelthuzadEventAt; else g._kelthuzadEventAt = old; } };
const damage = (g, target, amount, source, api) => alive(target) && source && !source.status?.kelthuzadRemoved && !invulnerable(target, api) ? api.universalDamage(g, target, amount, source) : 0;
function addAbility(g, e, id, api) {
  if (has(e, id)) return false;
  if (api.addAbility) api.addAbility(g, e, id);
  else { e.skillSpecs ??= (e.abilityIds ?? []).map(id => ({ id })); e.skillSpecs.push(api.compileAbility?.(g, e, id) ?? { id, status: KELTHUZAD_RULES[id]?.status ?? 'implemented' }); }
  if (Array.isArray(e.abilityIds) && !e.abilityIds.includes(id)) e.abilityIds.push(id);
  state(e, id); return true;
}
function removeAbility(g, e, id, api) {
  api.removeAbility?.(g, e, id);
  if (Array.isArray(e.skillSpecs)) e.skillSpecs = e.skillSpecs.filter(s => s.id !== id);
  if (Array.isArray(e.abilityIds)) e.abilityIds = e.abilityIds.filter(s => s !== id);
  delete e.skillStates?.[id]; delete e.abilityLevels?.[id];
}
function grantAlliance(g, e, api) {
  addAbility(g, e, 'A0ZV', api);
  const addedAttack = addAbility(g, e, 'A0ZW', api);
  if (addedAttack) {
    if (api.applyAttackLevel) api.applyAttackLevel(g, e, 'A0ZW', 0, 1);
    else if (Number.isFinite(e.damage)) e.damage += 100;
    st(e).kelthuzadAllianceAttackApplied = true;
  }
  addAbility(g, e, 'A0ZY', api);
}
function ownedUnits(g, e, codes, api) {
  if (api.getOwnedUnitsOfRawcode) return [...new Set(codes.flatMap(code => api.getOwnedUnitsOfRawcode(g, e, code) ?? []))];
  return [...all(g).filter(u => u.ownerId === e.ownerId), ...(g.state.players?.find(p => p.id === e.ownerId)?.buildings ?? [])].filter(u => codes.includes(raw(u)));
}

// Call once after clone setup, with runtime skillSpecs already finalized. Native
// registration is ability-driven; empty mirror lists never inherit template IDs.
export function registerKelthuzadSource(g, e, api = {}) {
  if (!KELTHUZAD_COMBAT_TYPES.includes(raw(e)) || st(e).kelthuzadRegistered || e.isIllusion && !e.skillSpecs?.length) return false;
  if (!['A0ZN', 'A0ZQ', 'A0ZR', 'A0ZZ'].some(id => has(e, id))) return false;
  const status = st(e), current = now(g), at = Math.max(e.createdAt ?? current, current); status.kelthuzadRegistered = true; status.kelthuzadRegisteredAt = at;
  const restoredExistingUnit = status.sourceSkillsRestoredAt !== undefined && (e.createdAt ?? current) < status.sourceSkillsRestoredAt;
  if (has(e, 'A0ZN')) { if (!restoredExistingUnit) e.mana = e.maxMana; enqueue(g, { type: 'kelthuzad_decay', sourceId: e.id, source: capture(e), nextAt: at + 1 }); }
  if (has(e, 'A0ZR')) { status.kelthuzadChainListening = true; addAbility(g, e, 'A0ZS', api); }
  if (has(e, 'A0ZQ')) {
    const allies = ownedUnits(g, e, ['h0M0', 'n02S'], api); status.kelthuzadAmuletListening = true; status.kelthuzadAmuletCharges = allies.length ? 2 : 1;
    if (allies.length) { addAbility(g, e, 'A0ZY', api); for (const ally of allies) grantAlliance(g, ally, api); }
    addAbility(g, e, 'A0ZU', api);
  }
  // PassiveSkill's separate Pf A0ZY branch also applies to non-Kel combat clones.
  return true;
}
export function applyKelthuzadBuildingAlliance(g, e, building, api = {}) {
  if (!building || !has(building, 'A0ZY') || has(e, 'A0ZQ')) return false;
  // The source copies V/W here, not the Y marker itself.
  addAbility(g, e, 'A0ZV', api); const added = addAbility(g, e, 'A0ZW', api);
  if (added) { if (api.applyAttackLevel) api.applyAttackLevel(g, e, 'A0ZW', 0, 1); else if (Number.isFinite(e.damage)) e.damage += 100; st(e).kelthuzadAllianceAttackApplied = true; }
  return true;
}
// EggWhiteEx's separate award path is deliberately exact: h0M0 checks only
// h0PJ. It does not expand that source condition to Kel'Thuzad skin IDs.
export function kelthuzadEggWhiteAlliance(g, e, api = {}) {
  if (raw(e) !== 'h0M0' || !ownedUnits(g, e, ['h0PJ'], api).length) return false;
  grantAlliance(g, e, api); return true;
}
export function kelthuzadBeforeDamage(g, target, eventDamage, attacker, api = {}) {
  if (!target?.status?.kelthuzadAmuletListening || !(eventDamage >= target.hp) || !(target.hp > 0)) return { triggered: false };
  const status = st(target), remaining = (status.kelthuzadAmuletCharges ?? 0) - 1; status.kelthuzadAmuletCharges = remaining;
  const descriptor = { ...KELTHUZAD_REINCARNATION_DESCRIPTOR, remainingCharges: remaining, eventDamage, preDamageHp: target.hp };
  if (remaining < 0) return { triggered: false, remainingCharges: remaining, descriptor };
  const summons = [];
  for (const code of ['h0CZ', 'h0CL', 'h0CL']) {
    const summoned = api.spawnUnit?.(g, target, code, { isSummon: true, worldX: pos(target).x, worldY: pos(target).y, facing: target.facing ?? 0 });
    if (summoned) summons.push(summoned.id);
  }
  if (remaining <= 0) { status.kelthuzadAmuletListening = false; enqueue(g, { type: 'kelthuzad_remove_ability', sourceId: target.id, source: capture(target), abilityId: 'A0ZU', at: now(g) + 1.01 }); }
  // Source summoning is independent of the native ability's cooldown/readiness.
  const nativeResult = api.nativeReincarnation?.(g, target, descriptor);
  return { triggered: true, remainingCharges: remaining, summons, descriptor, nativeBridgeAvailable: typeof api.nativeReincarnation === 'function', nativeResult };
}
export function kelthuzadOnAttackDamage(g, source, primary, eventDamage, api = {}) {
  if (!source?.status?.kelthuzadChainListening || !has(source, 'A0ZR') || !has(source, 'A0ZS')) return false;
  removeAbility(g, source, 'A0ZS', api); api.removeBuff?.(g, source, 'B071');
  source.buffs = (source.buffs ?? []).filter(b => b.key !== 'B071' && b.buffId !== 'B071');
  enqueue(g, { type: 'kelthuzad_chain_rearm', sourceId: source.id, source: capture(source), at: now(g) + 3 });
  const secondary = all(g).find(t => t.id !== primary.id && hostile(source, t) && alive(t) && !has(t, 'Avul') && distance(t, primary) <= 500 * scale(source) + 1e-8 && distance(t, primary) > 100 * scale(source) + 1e-8);
  if (!secondary) return { triggered: true, secondaryId: null };
  // This damage event happens before the pull trigger is registered.
  damage(g, secondary, eventDamage, source, api);
  const center = { x: (pos(secondary).x + pos(primary).x) / 2, y: (pos(secondary).y + pos(primary).y) / 2 };
  api.pauseUnit?.(g, secondary, true); api.pauseUnit?.(g, primary, true);
  enqueue(g, { type: 'kelthuzad_chain_pull', sourceId: source.id, source: capture(source), firstId: secondary.id, secondId: primary.id, first: capture(secondary), second: capture(primary), firstActive: true, secondActive: true, center, nextAt: now(g) + .04 });
  return { triggered: true, secondaryId: secondary.id };
}
export const isKelthuzadActiveAbility = id => !!KELTHUZAD_ACTIVE_RULES[id];
export const canKelthuzadCastAbility = (e, id) => KELTHUZAD_COMBAT_TYPES.includes(raw(e)) && (isKelthuzadActiveAbility(id) || id === 'A0ZO') && has(e, id);
export function castKelthuzadAbility(g, e, id, params = {}, api = {}) {
  const fail = reason => ({ ok: false, reason, skillId: id });
  if (!canKelthuzadCastAbility(e, id)) return fail('当前单位没有此技能');
  if (id === 'A0ZO') return api.castNativeNova?.(g, e, id, params.target, { mode: params.mode ?? 'manual' }) ?? fail('原生新星宿主尚未提供');
  if (!alive(e) || st(e).sourcePaused || e.status.yseraPaused || e.status.illidanPaused || e.status.yseraHidden || e.status.stunUntil > now(g) || e.status.cycloneUntil > now(g)) return fail('单位当前无法施法');
  const r = KELTHUZAD_ACTIVE_RULES[id], skill = state(e, id), target = params.target;
  if ((skill.readyAt ?? 0) > now(g) + 1e-8) return fail('技能冷却中');
  if ((e.mana ?? 0) < r.manaCost) return fail('魔法不足');
  if (!target || !hostile(e, target) || !alive(target) || invulnerable(target, api)) return fail('请选择可攻击的敌人');
  if (distance(e, target) > r.range * scale(e) + 1e-8) return fail('超出施法范围');
  e.mana -= r.manaCost; skill.readyAt = now(g) + r.cooldown; skill.casts = (skill.casts ?? 0) + 1; skill.kelthuzadLastCastMode = params.mode ?? 'manual';
  if (g._sourceAbilityEffectDepth > 0) return { ok: true, skillId: id, scriptSuppressed: true };
  g._sourceAbilityEffectDepth = (g._sourceAbilityEffectDepth ?? 0) + 1;
  try { enqueue(g, { type: 'kelthuzad_shadow_crack', sourceId: e.id, source: capture(e), targetId: target.id, at: now(g) + 3 }); return { ok: true, skillId: id }; }
  finally { g._sourceAbilityEffectDepth--; }
}
// Only call from an actual attack-damage event. Native orders test attacker
// ability presence first; a failed attacker order never selects the victim.
export function tryKelthuzadAutoCast(g, attacker, victim, api = {}) {
  const outcomes = [];
  for (const id of ['A0ZO', 'A0ZZ']) {
    const caster = has(attacker, id) ? attacker : has(victim, id) ? victim : null;
    if (!caster) continue;
    const target = caster === attacker ? victim : attacker, params = { mode: 'auto', target };
    const result = id === 'A0ZO' ? api.castNativeNova?.(g, caster, id, target, { mode: 'auto' }) ?? { ok: false, reason: '原生新星宿主尚未提供' }
      : api.issueNativeOrder ? api.issueNativeOrder(g, caster, id, params) : castKelthuzadAbility(g, caster, id, params, api);
    outcomes.push({ sourceId: caster.id, skillId: id, ...result });
  }
  return outcomes;
}
// Invoked after the host's native AUfn effect, with native mana/CD already paid.
// It owns only the Trig_allabilityActions extra self-damage, never native nova.
export function kelthuzadNativeSpellEffect(g, e, id, api = {}) {
  if (id !== 'A0ZO') return false;
  if (g._sourceAbilityEffectDepth > 0) return { scriptSuppressed: true };
  g._sourceAbilityEffectDepth = (g._sourceAbilityEffectDepth ?? 0) + 1;
  try { api.nativeDamage(g, e, 200, e, { attackType: 'spells', damageType: 'normal' }); return true; }
  finally { g._sourceAbilityEffectDepth--; }
}
const pullUnit = (g, job, key) => find(g, job[`${key}Id`]) ?? job[key];
function releasePull(g, job, key, source, target, api, arrived) {
  if (!job[`${key}Active`]) return;
  job[`${key}Active`] = false; api.pauseUnit?.(g, target, false);
  damage(g, target, 300, source, api);
  if (arrived && key === 'second') (api.vertigoTarget ?? api.pauseUnitEx)?.(g, source, target, 3);
}
export function sourceKelthuzadDeath(g, target, killer, api = {}) {
  const status = st(target); if (status.kelthuzadDeathHandled) return; status.kelthuzadDeathHandled = true;
  if (status.kelthuzadChainListening) { removeAbility(g, target, 'A0ZS', api); status.kelthuzadChainListening = false; }
  for (const job of g.state.sourceSkillJobs ?? []) {
    if (!isKelthuzadJobType(job.type) || job.done) continue;
    const source = sourceOf(g, job);
    if (job.type === 'kelthuzad_shadow_crack' && job.targetId === target.id) job.done = true;
    if (job.type === 'kelthuzad_chain_pull') {
      for (const key of ['first', 'second']) if (job[`${key}Id`] === target.id) { job[key] = capture(target); releasePull(g, job, key, source, target, api, false); }
      if (!job.firstActive && !job.secondActive) job.done = true;
    }
    if (job.sourceId === target.id) { job.source = capture(target); if (['kelthuzad_decay', 'kelthuzad_chain_rearm'].includes(job.type)) job.done = true; }
  }
}
export function tickKelthuzadJob(g, job, api = {}) {
  if (!isKelthuzadJobType(job.type) || job.done) return false;
  const source = sourceOf(g, job), time = g.state.time;
  if (!source || source.status?.kelthuzadRemoved) return false;
  if (job.type === 'kelthuzad_remove_ability') { if (time + 1e-8 < job.at) return true; removeAbility(g, source, job.abilityId, api); return false; }
  if (job.type === 'kelthuzad_chain_rearm') { if (!alive(source)) return false; if (time + 1e-8 < job.at) return true; addAbility(g, source, 'A0ZS', api); return false; }
  if (job.type === 'kelthuzad_shadow_crack') {
    const target = find(g, job.targetId); if (!alive(target)) return false;
    if (time + 1e-8 < job.at) return true;
    atEvent(g, job.at, () => damage(g, target, target.maxHp * ((target.isNativeHero ?? target.isHero) ? .3 : .8), source, api)); return false;
  }
  if (job.type === 'kelthuzad_decay') {
    if (!alive(source) || !has(source, 'A0ZN')) return false;
    while (job.nextAt <= time + 1e-8) {
      atEvent(g, job.nextAt, () => { for (const target of all(g)) if (hostile(source, target) && distance(source, target) <= 700 * scale(source) + 1e-8) damage(g, target, target.maxHp * .025, source, api); });
      job.nextAt += 1; if (job.done || !alive(source) || !has(source, 'A0ZN')) return false;
    }
    return true;
  }
  while (job.nextAt <= time + 1e-8) {
    const at = job.nextAt; job.nextAt += .04;
    for (const key of ['first', 'second']) {
      if (!job[`${key}Active`]) continue;
      const target = pullUnit(g, job, key); if (!target) { job[`${key}Active`] = false; continue; }
      // A target already dead before this trigger was registered is not a new
      // death event. Source timer code still moves its retained corpse handle.
      if (distance(target, job.center) <= 100 * scale(source) + 1e-8) atEvent(g, at, () => releasePull(g, job, key, source, target, api, true));
      else {
        const from = pos(target), delta = distance(target, job.center), point = { x: from.x + (job.center.x - from.x) / delta * 60 * scale(source), y: from.y + (job.center.y - from.y) / delta * 60 * scale(source) };
        if (api.setUnitPosition) api.setUnitPosition(g, target, point); else { target.worldX = point.x; target.worldY = point.y; }
        if (key === 'first') atEvent(g, at, () => (api.vertigoTarget ?? api.pauseUnitEx)?.(g, source, target, 3));
        job[key] = capture(target);
      }
    }
    if (!job.firstActive && !job.secondActive) return false;
  }
  return true;
}
