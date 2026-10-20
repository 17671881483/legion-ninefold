// SingedIsHero/SingedGetLevel and the two independent triggers in the parsed
// v14.1A5 war3map.j (36602–36614, 37029–37127, 40592, 41929).
export const ALCHEMIST_RULES = {
  rawcodeLevels: { n091: 1, n092: 2, n093: 3, h0XH: 1, h0XI: 2, h0XJ: 3 },
  chemicalRage: { threshold: .25, duration: 5, haste: [.5, 1, 1.5], armor: [2, 3, 5],
    hasteAbilities: ['A2Z4', 'A2Z5', 'A2Z6'], sourceLines: [37029, 37077] },
  // One integer draw and an elseif ladder: the outcomes are mutually exclusive.
  alchemyGold: { weights: [[2, 5, 10], [2, 8, 12], [4, 10, 15]], gold: [5, 2, 1],
    sourceLines: [37078, 37127] },
};

const RAGE_KEY = 'alchemist-chemical-rage';
const rawcode = entity => entity?.combatRawcode ?? entity?.sourceRawcode ?? entity?.rawcode ?? entity?.unitId;
const levelOf = entity => ALCHEMIST_RULES.rawcodeLevels[rawcode(entity)] ?? 0;

export const ALCHEMIST_ACTIVE_RULES = {
  A2Z0: { name: '医疗气雾', manaCost: 8, cooldown: 8, radius: [300, 400, 500], heal: [10, 10, 20],
    pulses: [5, 15, 15], interval: 1, cloudHealPerSecond: [10, 10, 15], cloudDamagePerSecond: [10, 10, 15],
    cloudPulses: 40, cloudInterval: .2, sourceLines: [36615, 36823] },
  A2Z1: { name: '酸性炸弹', manaCost: 12, cooldown: 11, range: 1000, targetCount: 2,
    damage: [10, 20, 30], pulses: 5, interval: 1, poolRadius: 325, poolDamage: [15, 25, 35],
    poolPulses: 7, poolInterval: 1, armor: [2, 3, 3], armorDuration: 2, sourceLines: [36824, 36993] },
};

const position = entity => ({ x: entity.worldX ?? entity.x ?? 0, y: entity.worldY ?? entity.y ?? 0 });
const distance = (a, b) => Math.hypot(position(a).x - position(b).x, position(a).y - position(b).y);
const alive = entity => !!entity && entity.hp > 0 && !entity.status?.deathCounted && !entity.status?.sourceDeathHandled;
const invulnerable = entity => entity.invulnerable || entity.nativeInvulnerable || entity.skillSpecs?.some(s => s.id === 'Avul' || s.kind === 'invulnerability');
const scale = source => (source.distanceScale ?? 1 / 3) / 100;
const find = (game, id) => game.state.entities.find(e => e.id === id) ?? game.state.kings?.find(e => e.id === id);
const snapshotSource = source => ({ id: source.id, ownerId: source.ownerId, team: source.team, side: source.side,
  battleTeam: source.battleTeam, combatRawcode: rawcode(source), distanceScale: source.distanceScale,
  skillVersion: source.skillVersion, sourceVersion: source.sourceVersion, attackType: 'chaos' });
const hasAbility = (entity, id, api) => api.hasAbility ? api.hasAbility(entity, id)
  : Array.isArray(entity.skillSpecs) ? entity.skillSpecs.some(s => s.id === id) : (entity.abilityIds ?? []).includes(id);
const all = game => {
  const seen = new Set();
  return [...game.state.entities, ...(game.state.kings ?? [])].filter(entity => {
    if (seen.has(entity.id)) return false;
    seen.add(entity.id); return true;
  });
};
const selected = (game, source, origin, radius, friendly, api = {}) => all(game).filter(entity => {
  const preDamageSelf = entity.id === source.id && api.preDamageHp > 0 && !entity.status?.deathCounted;
  return (alive(entity) || preDamageSelf) && !invulnerable(entity)
    && (source.battleTeam === undefined || entity.battleTeam === undefined || source.battleTeam === entity.battleTeam)
    && (friendly ? entity.team === source.team : entity.team !== source.team)
    && distance(origin, entity) <= radius + 1e-8;
});
const stateFor = (entity, id) => (entity.skillStates ??= {})[id] ??= { readyAt: 0, manualReadyAt: 0, casts: 0 };
const enqueue = (game, job) => { game.state.sourceSkillJobs ??= []; game.state.sourceSkillJobs.push(job); return job; };
const jobBase = (game, source, type) => ({ id: game._uid('alchemy-job'), type, sourceId: source.id, source: snapshotSource(source), level: levelOf(source) || 1 });
const damage = (game, target, amount, source, api, at = game.state.time) => {
  if (typeof api.universalDamage !== 'function') throw new TypeError('Alchemist abilities require api.universalDamage(game,target,amount,source)');
  const previous = game._alchemistEventAt;
  game._alchemistEventAt = at;
  try { return api.universalDamage(game, target, amount, source); }
  finally {
    if (previous === undefined) delete game._alchemistEventAt;
    else game._alchemistEventAt = previous;
  }
};
const heal = (game, target, amount) => { const actual = Math.min(amount, Math.max(0, target.maxHp - target.hp)); target.hp += actual; if (actual > 0) game._event?.('heal', target, `+${actual}`); };

function lowestAlly(game, source, radius, api = {}) {
  let lowest = null, lowestFraction = 1.01;
  for (const entity of selected(game, source, source, radius, true, api)) {
    const hp = entity.id === source.id && Number.isFinite(api.preDamageHp) ? api.preDamageHp : entity.hp;
    if (hp / entity.maxHp < lowestFraction) { lowest = entity; lowestFraction = hp / entity.maxHp; }
  }
  return lowest ?? source;
}

/** Manual and damage-triggered casts have separate native/hashtable cooldowns. */
export function castAlchemistAbility(game, entity, id, choice = {}, api = {}) {
  const rule = ALCHEMIST_ACTIVE_RULES[id], mode = choice.mode ?? 'manual', now = game.state.time;
  if (!rule || !entity || !hasAbility(entity, id, api)) return { ok: false, message: '该单位没有此炼金术士技能' };
  if (entity.status?.deathCounted || entity.status?.sourceDeathHandled || mode !== 'auto' && !alive(entity)) return { ok: false, message: '施法单位已阵亡' };
  const state = stateFor(entity, id), cooldownKey = mode === 'auto' ? 'readyAt' : 'manualReadyAt';
  if ((state[cooldownKey] ?? 0) > now) return { ok: false, message: '技能冷却中' };
  if (entity.mana < rule.manaCost) return { ok: false, message: '魔法不足' };
  const level = levelOf(entity) || 1;
  entity.mana -= rule.manaCost; state[cooldownKey] = now + rule.cooldown; state.casts = (state.casts ?? 0) + 1;
  // The source ignores the manual spell target/point and selects its own units.
  if (id === 'A2Z0') {
    const radius = rule.radius[level - 1] * scale(entity), target = lowestAlly(game, entity, radius, api);
    enqueue(game, { ...jobBase(game, entity, 'alchemist_mist'), targetId: target.id, targetPoint: position(target), radius,
      heal: rule.heal[level - 1], cloudHeal: rule.cloudHealPerSecond[level - 1] * rule.cloudInterval,
      cloudDamage: rule.cloudDamagePerSecond[level - 1] * rule.cloudInterval,
      nextAt: now, interval: rule.interval, remaining: rule.pulses[level - 1] });
  } else {
    const candidates = selected(game, entity, entity, rule.range * scale(entity), false);
    for (let index = 0; index < rule.targetCount && candidates.length; index++) {
      const [target] = candidates.splice(Math.min(candidates.length - 1, Math.floor(game._random() * candidates.length)), 1);
      enqueue(game, { ...jobBase(game, entity, 'alchemist_acid_target'), targetId: target.id, targetPoint: position(target),
        damage: rule.damage[level - 1], poolDamage: rule.poolDamage[level - 1], armor: rule.armor[level - 1],
        radius: rule.poolRadius * scale(entity), nextAt: now + rule.interval, interval: rule.interval, remaining: rule.pulses });
    }
  }
  game._event?.('cast', entity, rule.name, { skillId: id });
  return { ok: true, message: `已施放${rule.name}`, skillId: id };
}

/** Called by each damage event, damaged unit first and damage source second. */
export function tryAlchemistAutoCast(game, entity, api = {}) {
  if (!levelOf(entity) || entity.status?.deathCounted || entity.status?.sourceDeathHandled) return false;
  const level = levelOf(entity), mist = ALCHEMIST_ACTIVE_RULES.A2Z0;
  const target = lowestAlly(game, entity, mist.radius[level - 1] * scale(entity), api);
  const targetHp = target.id === entity.id && Number.isFinite(api.preDamageHp) ? api.preDamageHp : target.hp;
  if (hasAbility(entity, 'A2Z0', api) && targetHp / target.maxHp < .99 && castAlchemistAbility(game, entity, 'A2Z0', { mode: 'auto' }, api).ok) return true;
  const acid = ALCHEMIST_ACTIVE_RULES.A2Z1;
  return hasAbility(entity, 'A2Z1', api) && selected(game, entity, entity, acid.range * scale(entity), false).length > 0
    && castAlchemistAbility(game, entity, 'A2Z1', { mode: 'auto' }, api).ok;
}

function startMedicalCloud(game, mist, point, source, allowDeadSource = false, at = game._alchemistEventAt ?? game.state.time) {
  if (mist.completed) return;
  mist.completed = true;
  const rule = ALCHEMIST_ACTIVE_RULES.A2Z0;
  enqueue(game, { ...jobBase(game, source, 'alchemist_medical_cloud'), source: mist.source,
    ...point, radius: mist.radius, heal: mist.cloudHeal, damage: mist.cloudDamage,
    allowDeadSource, nextAt: at, interval: rule.cloudInterval, remaining: rule.cloudPulses });
}

function acidArmor(game, target, armor, at) {
  target.status ??= {}; target.buffs ??= [];
  if ((target.status.alchemistAcidArmorUntil ?? 0) > at + 1e-8) return;
  const key = 'alchemist-acid-armor', expiresAt = at + ALCHEMIST_ACTIVE_RULES.A2Z1.armorDuration;
  target.status.alchemistAcidArmorUntil = expiresAt;
  target.buffs = [...target.buffs.filter(buff => buff.key !== key), { key, skillId: 'A2Z1', armor: -armor, expiresAt }];
}

function poolPulse(game, pool, source, at, api) {
  for (const target of selected(game, source, pool, pool.radius, false)) {
    damage(game, target, pool.damage, source, api, at);
    acidArmor(game, target, pool.armor, at);
  }
}

function startAcidPool(game, bomb, point, source, api, at = game.state.time) {
  if (bomb.completed) return;
  bomb.completed = true;
  const rule = ALCHEMIST_ACTIVE_RULES.A2Z1;
  const pool = enqueue(game, { ...jobBase(game, source, 'alchemist_acid_pool'), source: bomb.source,
    ...point, radius: bomb.radius, damage: bomb.poolDamage, armor: bomb.armor,
    nextAt: at + rule.poolInterval, interval: rule.poolInterval, remaining: rule.poolPulses - 1 });
  // SingedAcidPoolDamage is called directly before registering the 1s timer.
  poolPulse(game, pool, source, at, api);
}

/** true retains this serializable job; false discards it. */
export function tickAlchemistJob(game, job, api = {}) {
  if (!job?.type?.startsWith('alchemist_') || job.completed || job.cancelled) return false;
  const liveSource = find(game, job.sourceId), source = liveSource ?? job.source, now = game.state.time;
  if (!job.allowDeadSource && !alive(liveSource)) return false;
  if (!source) return false;
  while (job.remaining > 0 && job.nextAt <= now + 1e-8 && !job.completed && !job.cancelled) {
    const at = job.nextAt;
    if (job.type === 'alchemist_mist' || job.type === 'alchemist_acid_target') {
      const target = find(game, job.targetId);
      if (!alive(target)) {
        if (job.type === 'alchemist_mist') startMedicalCloud(game, job, target ? position(target) : job.targetPoint, source, false, at);
        else startAcidPool(game, job, target ? position(target) : job.targetPoint, source, api, at);
        break;
      }
      job.targetPoint = position(target); job.remaining--; job.nextAt += job.interval;
      if (job.type === 'alchemist_mist') for (const ally of selected(game, source, target, job.radius, true)) heal(game, ally, job.heal);
      else {
        damage(game, target, job.damage, source, api, at);
        if (!job.completed && (!alive(target) || job.remaining === 0)) startAcidPool(game, job, position(target), source, api, at);
      }
    } else {
      job.remaining--; job.nextAt += job.interval;
      if (job.type === 'alchemist_medical_cloud') {
        for (const target of selected(game, source, job, job.radius, true)) heal(game, target, job.heal);
        for (const target of selected(game, source, job, job.radius, false)) damage(game, target, job.damage, source, api, at);
      } else if (job.type === 'alchemist_acid_pool') poolPulse(game, job, source, at, api);
    }
    if (!job.allowDeadSource && !alive(find(game, job.sourceId))) return false;
  }
  return !job.completed && !job.cancelled && job.remaining > 0;
}

/** Capture target positions and transform/cancel jobs before corpse cleanup. */
export function sourceAlchemistDeath(game, target, killer, api = {}) {
  if (!target) return;
  for (const job of [...(game.state.sourceSkillJobs ?? [])]) {
    if (!job.type?.startsWith('alchemist_') || job.completed || job.cancelled) continue;
    const source = find(game, job.sourceId) ?? job.source;
    if (job.targetId === target.id && source) {
      if (job.type === 'alchemist_mist') startMedicalCloud(game, job, position(target), source, job.sourceId === target.id);
      else if (job.type === 'alchemist_acid_target' && alive(source)) startAcidPool(game, job, position(target), source, api, game._alchemistEventAt ?? game.state.time);
    }
    if (job.sourceId === target.id && !job.completed) job.cancelled = true;
  }
}

/** Call immediately AFTER subtracting the final event damage from target.hp. */
export function alchemistAfterDamage(game, target, actual, api = {}) {
  const level = levelOf(target), now = game.state.time, rule = ALCHEMIST_RULES.chemicalRage;
  const afterDamageHp = Number.isFinite(api.preDamageHp) && Number.isFinite(actual) ? api.preDamageHp - actual : target?.hp;
  if (!level || !Number.isFinite(afterDamageHp) || !(target.maxHp > 0) || afterDamageHp > target.maxHp * rule.threshold) return false;
  target.skillStates ??= {};
  const state = target.skillStates.A2Z2 ??= { readyAt: 0, casts: 0 };
  target.buffs ??= [];
  if (state.activeUntil > now || target.buffs.some(buff => buff.key === RAGE_KEY && buff.expiresAt > now)) return false;
  // The source has neither a mana cost nor an additional cooldown. Its active
  // flag is cleared by the five-second finish timer, even after lethal damage.
  state.activeUntil = now + rule.duration;
  state.casts = (state.casts ?? 0) + 1;
  const buff = { key: RAGE_KEY, skillId: 'A2Z2', sourceId: target.id, ownerId: target.ownerId,
    expiresAt: state.activeUntil, haste: rule.haste[level - 1], armor: rule.armor[level - 1] };
  target.buffs = [...target.buffs.filter(old => old.key !== RAGE_KEY), buff];
  game._event?.('cast', target, '药剂狂暴', { skillId: 'A2Z2' });
  return true;
}

/** Return the independent gold bonus; the caller pays the killer's player. */
export function alchemistDeathReward(game, target, killer) {
  if (!target) return { bonusGold: 0 };
  target.status ??= {};
  if (target.status.alchemistDeathRewardHandled) return { bonusGold: 0 };
  target.status.alchemistDeathRewardHandled = true;
  // This local initializer precedes SingedIsHero and IsUnitEnemy in JASS, so
  // every fresh death event consumes one draw, including non-alchemist kills.
  const roll = Math.min(100, Math.max(1, Math.floor(game._random() * 100) + 1));
  const level = levelOf(killer);
  if (!level || target.team === undefined || killer.team === undefined || target.team === killer.team) return { bonusGold: 0 };
  const rule = ALCHEMIST_RULES.alchemyGold, weights = rule.weights[level - 1];
  let threshold = 0;
  for (let index = 0; index < weights.length; index++) {
    threshold += weights[index];
    if (roll <= threshold) return { bonusGold: rule.gold[index] };
  }
  return { bonusGold: 0 };
}
