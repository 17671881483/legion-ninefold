import { UNITS, MERCENARIES, LEGACY_MERCENARIES, WAVES, RULES, HEROES } from './data.js';
import { MAP, laneToWorld, worldToLane, kingWorld, spawnWarpWorld, supportWorld, routePoints, isWalkable, isSegmentWalkable, constrainPoint, closestWalkable, navigationPath } from './layout.js';

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

/** Deterministic, DOM-free simulation. tick receives real elapsed seconds; speed is applied here. */
export class Game {
  constructor(options = {}) {
    this.options = { seed: options.seed ?? 42, difficulty: options.difficulty ?? 'normal' };
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
      phase: 'build', wave: 1, timer: this.buildDuration(1), time: 0, dataRevision: RULES.dataRevision ?? '5.0dJF-web9',
      speed: 1, paused: false, winner: null, difficulty: this.options.difficulty, seed: this.options.seed,
      players: names.map((name, id) => ({ id, name, team: id < 4 ? 0 : 1,
        gold: initialGold, wood: rule('initialWood', 40), income: rule('initialIncome', 5),
        workers: rule('initialWorkers', 1), lumberLevel: 0, buildings: [], roster: this._roster(),
        mercStocks: Object.fromEntries(MERCENARIES.map(m => [m.id, { stock: this._mercenaryMaxStock(m), nextReadyAt: null }])),
        populationCap: rule('initialPopulation', 40), popUsed: rule('initialWorkers', 1), heroId: null, healUsed: false, rerolls: 0, stats: { kills: 0, leaks: 0, warps: 0, sent: 0, damage: 0, goldEarned: 0, wavesHeld: 0 }
      })),
      kings: [0, 1].map(team => ({ team, hp: rule('kingInitialHp', 12000), maxHp: rule('kingInitialHp', 12000),
        attack: rule('kingDamage', 135), regen: rule('kingRegen', 4), healCharges: rule('kingHealCharges', 4),
        armor: rule('kingArmor', 8), armorType: 'hero', attackType: 'hero', autoUpgradeCount: 0, healBlockedUntil: 0,
        hpLevel: 0, attackLevel: 0, regenLevel: 0, attackCd: 0, worldX: kingWorld(team).x, worldY: kingWorld(team).y, radius: .8 })),
      entities: [], events: [], logs: [], pendingSends: [], kingBountyPools: [0, 0],
      metrics: { spawned: 0, killed: 0, leaked: 0 },
    };
    this._log('九倍军团战：建造军团，发展木材，与队友共同守护国王。');
    this._log('每路普通怪物 = 基础数量 × 9；Boss 独立配置。此为可调参数的 Web 玩法原型。');
    for (let id = 1; id < 8; id++) this._aiBuild(this.state.players[id], true);
  }

  _random() {
    let t = this._rng = (this._rng + 0x6D2B79F5) >>> 0;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
  _uid(prefix = 'e') { return `${prefix}${++this._id}`; }
  _pick(items) { return items.length ? items[Math.floor(this._random() * items.length)] : undefined; }
  _roster() {
    const pool = baseUnits.length >= 6 ? baseUnits : UNITS.filter(u => !u.legacy && !u.upgradeFrom);
    const result = [];
    for (let tier = 1; tier <= 6; tier++) {
      const group = pool.filter(u => value(u, ['tier', 'level'], 1) === tier);
      const picked = this._pick(group.length ? group : pool.filter(u => !result.includes(u.id)));
      if (picked) result.push(picked.id);
    }
    return result;
  }
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
  _population(p) { return p.workers * rule('workerPopulation', 1) + p.buildings.reduce((sum, b) => sum + value(units[b.unitId], ['population'], 1), 0) + (p.heroId ? value(heroes[p.heroId], ['population'], 3) : 0); }
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

  /** Preparation time for the wave about to start. Arena/overtime remain Web rounds. */
  buildDuration(wave = this.state?.wave ?? 1) {
    if (wave === 1) return rule('firstBuildSeconds', 80);
    if (wave === 31) return 60;
    if (wave >= 32) return 50;
    return 40 + Math.floor(wave / 2);
  }
  _mercenaryLocked(m) {
    const unlock = value(m, ['unlock', 'unlockWave', 'wave', 'minWave'], 1);
    return this.state.wave < unlock || (this.state.wave === unlock && m.unlockPhase === 'combat' && this.state.phase === 'build');
  }
  _mercenaryMaxStock(m) { return Math.max(1, Math.floor(value(m, ['stockMax', 'maxStock'], MERCENARY_MAX_STOCK))); }
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
      progress: slot.stock >= maxStock ? 1 : clamp(1 - remaining / cooldown, 0, 1), locked };
  }
  _armorFactor(armor) {
    return armor >= 0 ? 1 / (1 + .06 * armor) : 1 + (.06 * Math.abs(armor)) / (1 + .06 * Math.abs(armor));
  }
  _typeMultiplier(attackType, armorType) { return number(RULES.attackMultipliers?.[attackType]?.[armorType], 1); }
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
    return { damageMultiplier: 1 + damage, attackSpeedMultiplier: (1 + speed) * Math.max(.05, 1 - slow), armor, healRate, slow };
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

  command(type, payload = {}) {
    if (type === 'restart') { const fresh = new Game({ ...this.options, ...payload }); Object.assign(this, fresh); return this._result(true, '已重新开始'); }
    if (this.state.phase === 'ended') return this._result(false, '本局已结束，请重新开始');
    if (type === 'pause') { this.state.paused = payload.value === undefined ? !this.state.paused : !!payload.value; return this._result(true, this.state.paused ? '已暂停' : '继续战斗'); }
    if (type === 'speed') { this.state.speed = clamp(number(payload.value, 1), .5, 4); return this._result(true, `${this.state.speed} 倍速`); }
    const p = this._getPlayer(payload);
    if (!p) return this._result(false, '玩家不存在');
    switch (type) {
      case 'build': {
        if (this.state.phase !== 'build') return this._result(false, '战斗中无法建造');
        const u = units[payload.unitId];
        if (!u || !p.roster.includes(u.id)) return this._result(false, '该兵种不在当前兵种池中');
        const col = Number(payload.col), row = Number(payload.row);
        if (!Number.isInteger(col) || !Number.isInteger(row) || col < 0 || col >= 6 || row < 0 || row >= 8) return this._result(false, '请选择 6 × 8 建造区内的位置');
        if (p.buildings.some(b => b.col === col && b.row === row)) return this._result(false, '此位置已有单位');
        if (this._population(p) + value(u, ['population'], 1) > p.populationCap) return this._result(false, '人口不足，请扩建营地');
        const cost = this._cost(u);
        if (p.gold + 1e-8 < cost) return this._result(false, `需要 ${cost} 金币`);
        p.gold -= cost;
        const building = { id: this._uid('b'), unitId: u.id, col, row, spent: cost, totalSpent: cost };
        p.buildings.push(building);
        this._event('build', { laneId: p.id, x: col + .5, y: row + 4.5 }, u.name);
        return this._result(true, `已建造 ${u.name}`);
      }
      case 'upgrade': {
        if (this.state.phase !== 'build') return this._result(false, '战斗中无法升级兵种');
        const found = this._building(payload.buildingId);
        if (!found || found.p.id !== p.id) return this._result(false, '请选择自己的建筑');
        const { b } = found, old = units[b.unitId], allowed = this._upgradeIds(old);
        const u = units[payload.unitId ?? allowed[0]];
        if (!u || !allowed.includes(u.id)) return this._result(false, '该升级分支不可用');
        if (this._population(p) - value(old, ['population'], 1) + value(u, ['population'], 1) > p.populationCap) return this._result(false, '人口不足，请扩建营地');
        const cost = value(u, ['upgradeCost', 'upgradeGold'], this._cost(u));
        if (p.gold + 1e-8 < cost) return this._result(false, `升级需要 ${cost} 金币`);
        p.gold -= cost; b.unitId = u.id; b.spent = (b.spent ?? this._cost(old)) + cost; b.totalSpent = b.spent;
        this._event('upgrade', { laneId: p.id, x: b.col + .5, y: b.row + 4.5 }, u.name);
        return this._result(true, `已升级为 ${u.name}`);
      }
      case 'sell': {
        if (this.state.phase !== 'build') return this._result(false, '战斗中无法出售');
        const found = this._building(payload.buildingId);
        if (!found || found.p.id !== p.id) return this._result(false, '请选择自己的建筑');
        const refund = Math.floor((found.b.spent ?? this._cost(units[found.b.unitId])) * rule('sellRatio', .8));
        p.gold += refund; p.buildings = p.buildings.filter(b => b.id !== found.b.id);
        return this._result(true, `出售获得 ${refund} 金币`);
      }
      case 'farm': {
        if (p.populationCap >= rule('maxPopulation', 160)) return this._result(false, '营地人口已达上限');
        const cost = rule('farmCost', 75); if (p.gold < cost) return this._result(false, `扩建营地需要 ${cost} 金币`);
        p.gold -= cost; p.populationCap = Math.min(rule('maxPopulation', 160), p.populationCap + rule('farmPopulation', 20));
        return this._result(true, `人口上限提升至 ${p.populationCap}`);
      }
      case 'worker': {
        if (this._population(p) + rule('workerPopulation', 1) > p.populationCap) return this._result(false, '人口不足，请扩建营地');
        if (p.workers >= rule('maxWorkers', 10)) return this._result(false, '小精灵已达上限');
        const cost = rule('workerCostBase', 50) + Math.max(0, p.workers - 1) * rule('workerCostStep', 25);
        if (p.gold < cost) return this._result(false, `招募需要 ${cost} 金币`);
        p.gold -= cost; p.workers++;
        return this._result(true, `小精灵 ${p.workers}/${rule('maxWorkers', 10)}`);
      }
      case 'lumber': {
        if (p.lumberLevel >= rule('maxLumberLevel', 30)) return this._result(false, '伐木科技已达上限');
        const cost = rule('lumberUpgradeCostBase', 70) + p.lumberLevel * rule('lumberUpgradeCostStep', 20);
        if (p.gold < cost) return this._result(false, `需要 ${cost} 金币`);
        p.gold -= cost; p.lumberLevel++;
        return this._result(true, `伐木科技 Lv.${p.lumberLevel}`);
      }
      case 'reroll': {
        if (this.state.phase !== 'build') return this._result(false, '请在备战期切兵');
        if (p.rerolls >= rule('rerollCount', 6)) return this._result(false, '本局切兵次数已用尽');
        const cost = rule('rerollCost', 25);
        if (p.wood < cost) return this._result(false, `切兵需要 ${cost} 木材`);
        p.wood -= cost; p.rerolls++; p.roster = this._roster();
        return this._result(true, `新兵种已就绪，下次切兵 ${rule('rerollCost', 25)} 木材`);
      }
      case 'merc': {
        const m = mercs[payload.mercId]; if (!m) return this._result(false, '木怪不存在');
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
        p.wood -= cost; p.income += value(m, ['income', 'incomeGain'], Math.max(1, Math.floor(cost / 25)));
        const send = { id: this._uid('send'), mercId: m.id, senderId: p.id, laneId: null, dispatch: true, wave: this.state.wave + (this.state.phase === 'combat' ? 1 : 0), count: 1 };
        this.state.pendingSends.push(send); p.stats.sent++;
        if (p.id === 0) this._log(`${p.name} 派出 ${m.name}，将于第 ${send.wave} 波开战时平均分配至敌军各路。`);
        return this._result(true, `${m.name} 已排队，收入增加`);
      }
      case 'king': {
        const king = this.state.kings[p.team], stat = payload.stat;
        if (!['hp', 'attack', 'regen'].includes(stat)) return this._result(false, '请选择生命、攻击或恢复');
        const cost = rule('kingUpgradeCost', 80), key = `${stat}Level`;
        const cap = number(RULES.kingUpgradeCaps?.[stat], rule('kingUpgradeMax', 15));
        if (king[key] >= cap) return this._result(false, '当前阶段已达上限');
        if (p.wood < cost) return this._result(false, `国王强化需要 ${cost} 木材`);
        p.wood -= cost; p.income += rule('kingIncome', 3); king[key]++;
        if (stat === 'hp') { king.maxHp += rule('kingHpPerUpgrade', 1200); king.hp += rule('kingHpPerUpgrade', 1200); }
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
        const amount = Math.min(king.maxHp - king.hp, rule('kingHealAmount', 10000)); king.hp += amount;
        king.healBlockedUntil = this.state.time + rule('kingHealLockSeconds', 2);
        this._event('heal', { laneId: 8 + p.team, x: 3, y: 11.5 }, `+${amount}`);
        this._log(`${p.name} 治疗国王，队伍剩余 ${king.healCharges} 次。`);
        return this._result(true, '国王获得治疗');
      }
      case 'interfere': {
        if (this.state.phase !== 'combat') return this._result(false, '战斗时才可干扰');
        if ((p.interfereUntil ?? 0) > this.state.time) return this._result(false, '干扰技能冷却中');
        const lane = Number(payload.laneId ?? p.id);
        if (!Number.isInteger(lane) || lane < 0 || lane > 9) return this._result(false, '路线不存在');
        const defendingTeam = lane >= 8 ? lane - 8 : lane < 4 ? 0 : 1;
        if (defendingTeam !== p.team) return this._result(false, '只能干扰进攻己方的怪物');
        p.interfereUntil = this.state.time + rule('interfereCooldown', 12); p.interfereCooldown = rule('interfereCooldown', 12);
        let count = 0;
        for (const e of this.state.entities) if (e.laneId === lane && e.side === 'monster' && e.hp > 0) {
          e.attackCd = Math.max(e.attackCd, .8); e.status.stunUntil = this.state.time + .28; e.targetId = null; count++;
        }
        this._event('interfere', { laneId: lane, x: 3, y: 6 }, `干扰 ${count}`);
        return this._result(true, `已重置 ${count} 只怪物的攻击`);
      }
      case 'hero': {
        if (this.state.phase !== 'build') return this._result(false, '请在备战期招募英雄');
        const hero = heroes[payload.heroId]; if (!hero) return this._result(false, '英雄不存在');
        if (p.heroId) return this._result(false, '每位玩家只能招募一位英雄');
        if (this._population(p) + value(hero, ['population'], 3) > p.populationCap) return this._result(false, '人口不足，请扩建营地');
        const cost = this._cost(hero); if (p.gold < cost) return this._result(false, `英雄需要 ${cost} 金币`);
        if (this.state.wave < value(hero, ['unlockWave'], 1)) return this._result(false, '英雄尚未解锁');
        p.gold -= cost; p.heroId = hero.id;
        return this._result(true, `英雄 ${hero.name} 已加入军团`);
      }
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
    s.events = s.events.filter(e => s.time - e.time < 2.5);
    for (const p of s.players) {
      for (const m of MERCENARIES) this._mercenarySlot(p, m);
      p.interfereCooldown = Math.max(0, (p.interfereUntil ?? 0) - s.time);
      const rate = rule('workerBaseWoodPerSecond', 1.5) * (1 + p.lumberLevel * rule('lumberRateStep', .12));
      const difficulty = p.team === 1 ? ({ easy: .85, normal: 1, hard: 1.18 }[this.options.difficulty] ?? 1) : 1;
      p.wood += p.workers * rate * dt * difficulty;
    }
    this._aiTimer -= dt;
    if (this._aiTimer <= 0) { this._aiTimer = 1.4; for (let i = 1; i < 8; i++) this._aiAct(s.players[i]); }
    if (s.phase === 'build') {
      for (const king of s.kings) king.hp = Math.min(king.maxHp, king.hp + king.regen * dt);
      s.timer = Math.max(0, s.timer - dt); if (s.timer <= 0) this._startCombat(); return; }
    this._roundTime += dt; s.timer = this._roundTime;
    while (this._spawnQueue.length && this._spawnQueue[0].at <= this._roundTime) {
      const next = this._spawnQueue.shift(); this._spawnMonster(next);
    }
    this._updateEntities(dt);
    this._updateKings(dt);
    this._clearDead();
    if (s.phase === 'ended') return;
    this._transferDefenders();
    this._warpTimer += dt;
    if (this._warpTimer >= 1 - 1e-9) { this._warpTimer = Math.max(0, this._warpTimer - 1); this._warpDefenders(); }
    if (!this._spawnQueue.length && !s.entities.some(e => e.side === 'monster' && e.hp > 0)) this._endCombat();
    // A very long stalled wave receives visible reinforcements, preserving actual combat.
    if (this._roundTime > 100 && !this._overtime) {
      this._overtime = true; this._log('战斗持续过久：双方获得狂暴，攻击速度提升。');
      for (const e of s.entities) e.status.frenzy = true;
    }
  }
  _waveData() {
    return WAVES.find(w => Number(w.wave ?? w.id ?? w.number) === this.state.wave) ?? WAVES[Math.min(this.state.wave - 1, WAVES.length - 1)] ?? {};
  }
  _startCombat() {
    if (this.state.phase !== 'build') return;
    const s = this.state, w = this._waveData();
    s.phase = 'combat'; s.timer = 0; s.entities = []; this._spawnQueue = []; this._roundTime = 0; this._settledLanes = []; this._overtime = false; this._warpTimer = 0; this._battleAuras = [[], []];
    const boss = !!(w.boss ?? w.isBoss ?? this.state.wave % 10 === 0);
    const baseCount = value(w, ['baseCount', 'quantity'], boss ? 1 : 5);
    // New reference waves carry an explicit adapted count. Old data still works.
    const monsterCount = Math.max(0, Math.floor(value(w, ['count'], boss ? value(w, ['bossCount'], baseCount) : baseCount * rule('monsterMultiplier', 9))));
    s.waveInfo = { ...w, baseHp: w.hp, baseDamage: w.damage, hp: w.hp * (boss ? 1 : rule('webMonsterHpScale', .25)), damage: w.damage * (boss ? 1 : rule('webMonsterDamageScale', .20)), isBoss: boss, actualCount: monsterCount };
    for (const p of s.players) {
      p.roundLeaks = 0; p.supportAnnounced = false;
      for (const b of p.buildings) this._spawnDefender(units[b.unitId], p, b.col + .5, b.row + 4.5, b.id);
      if (p.heroId && heroes[p.heroId]) this._spawnDefender(heroes[p.heroId], p, 3, 8.7, `hero-${p.id}`, true);
      for (let i = 0; i < monsterCount; i++) this._spawnQueue.push({ at: (i + 1) * rule('spawnInterval', .1), laneId: p.id, wave: w, boss,
        x: clamp(3 + (i % 6 - 2.5) * (rule('spawnSpreadWidth', 1.8) / 5) + (this._random() - .5) * .04, 3 - rule('spawnSpreadWidth',1.8)/2, 3 + rule('spawnSpreadWidth',1.8)/2), y: .3 });
    }
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
    const hp = value(def, ['hp', 'health', 'maxHp'], 180);
    const rawAbility = abilityOf(def);
    const ability = rawAbility ? { ...rawAbility, radius: rawAbility.radius > 10 ? rawAbility.radius / 100 : rawAbility.radius } : null;
    const e = {
      id: this._uid(), unitId: def.id ?? 'unit', name: def.name ?? '战士',
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
    return e;
  }
  _spawnDefender(def, player, x, y, buildingId, isHero = false) {
    if (!def) return;
    const e = this._entity(def, { team: player.team, side: 'defender', laneId: player.id,
      ownerId: player.id, sourceLaneId: player.id, x, y, buildingId, isHero });
    this._ensureWorld(e); e.status.activated = false; e.routeMode = 'guard';
    e.nav = { mode: 'guard', routeId: player.id, path: [], index: 0, distance: 0, goal: spawnWarpWorld(player.id), interrupted: false };
    this.state.entities.push(e);
  }
  _spawnMonster(entry) {
    const s = this.state, defendingTeam = entry.laneId < 4 ? 0 : 1;
    const extraScale = Math.pow(1.12, Math.max(0, s.wave - WAVES.length));
    let def = entry.merc ?? entry.wave ?? {};
    const boss = !!entry.boss;
    let e = this._entity(def, { unitId: entry.merc?.id ?? `wave-${s.wave}`, name: def.name ?? (boss ? '远古首领' : '系统怪'),
      side: 'monster', team: 1 - defendingTeam, laneId: entry.laneId, sourceLaneId: entry.laneId,
      x: entry.x, y: entry.y, ownerId: null, senderId: entry.senderId ?? null, isMerc: !!entry.merc, isBoss: boss,
      reward: value(def, ['reward', 'bounty', 'goldReward'], entry.merc ? 3 : 1), color: def.color ?? (entry.merc ? '#e7a446' : '#e56c78'),
      shape: def.shape ?? (boss ? 'hex' : entry.merc ? 'diamond' : 'circle'), radius: boss ? .42 : value(def, ['radius'], .21) });
    if (!entry.merc) {
      const hp = value(def, ['hp', 'health', 'monsterHp'], 45 + s.wave * 18) * extraScale * (boss ? 1 : rule('webMonsterHpScale', .25));
      e.hp = hp; e.maxHp = hp; e.damage = value(def, ['damage', 'attack'], 4 + s.wave * 2.2) * extraScale * (boss ? 1 : rule('webMonsterDamageScale', .20));
      e.moveSpeed = value(def, ['moveSpeed', 'speed'], 55) / (Number.isFinite(def.sourceSpeed) ? 100 : 75); e.range = value(def, ['range', 'attackRange'], 55) / 100;
    }
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
    if (e.acquisitionRange === undefined) e.acquisitionRange = Math.max(4.5, e.range + 1);
    this._syncLocal(e);
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
    if (e.status.leaked || e.laneId >= 8) { e.nav = { mode: 'monster', routeId: e.sourceLaneId, path: navigationPath(worldPoint(e), kingWorld(e.battleTeam), e.battleTeam, e.radius), index: 1, distance: 0, interrupted: false }; return; }
    const source = e.sourceLaneId;
    const exit = laneToWorld(source, e.x, 12);
    const trunk = routePoints(source).slice(2);
    const path = [worldPoint(e), exit, { x: exit.x, y: 16 }, ...trunk.map(p => ({ ...p })), kingWorld(e.battleTeam)];
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
      if (e.hp <= 0) continue;
      if (e.expiresAt && e.expiresAt <= now) { e.hp = 0; continue; }
      this._ensureWorld(e); const team = e.battleTeam, battle = battles[team];
      battle.push(e); this._worldEntities.set(e.id, e);
      const key = `${Math.floor(e.worldX)},${Math.floor(e.worldY)}`, grid = this._spatial[team];
      if (!grid.has(key)) grid.set(key, []); grid.get(key).push(e);
      if (e.ability?.type?.startsWith('aura_')) battle.auras.push(e);
      if (e.side === 'monster') monsterCounts[e.team]++;
    }
    this._battleAuras = battles.map(battle => battle.auras);
    this._monsterPressure = monsterCounts.map(count => RULES.webCongestionEnabled ? clamp(1 + Math.max(0, count - rule('webCongestionThreshold', 130)) / rule('webCongestionStep', 50), 1, rule('webCongestionMax', 7)) : 1);
    this.state.congestion = monsterCounts.map((count, team) => ({ attackingTeam: team, count, attackIntervalFactor: this._monsterPressure[team] }));
    for (const e of entities) {
      if (e.hp <= 0) continue;
      this._ensureWorld(e);
      const battle = battles[e.battleTeam], st = e.status;
      if (st.poisonUntil > now) this._hurt(e, number(st.poisonDps, 0) * dt, st.poisonOwner, true);
      if (e.hp <= 0) continue;
      e.attackCd -= dt; e.abilityCd -= dt;
      this._applyHealingAura(e, battle.auras, dt);
      this._passiveAbility(e, battle, dt);
      if (e.hp <= 0 || (st.stunUntil ?? 0) > now) continue;
      const aggro = Math.max(e.range, number(e.acquisitionRange, Math.max(4.5, e.range + 1)));
      let target = this._worldEntities.get(e.targetId);
      if (target && (target.hp <= 0 || target.battleTeam !== e.battleTeam || target.side === e.side || distance(e, target) > aggro * 1.25 || (e.nav?.mode === 'support' && distance(target, e.nav.anchor) > aggro * 1.25))) target = null;
      if (!target && (st.nextSenseAt ?? 0) <= now) {
        st.nextSenseAt = now + .4;
        let best = Infinity;
        for (const other of this._nearby(e, aggro)) {
          if (other.id === e.id || other.hp <= 0 || other.side === e.side) continue;
          const delta = distance(e, other);
          if (delta < best && delta <= aggro && !(e.nav?.mode === 'support' && distance(other, e.nav.anchor) > aggro * 1.25) && this._canSegment(worldPoint(e), worldPoint(other), e.battleTeam, 0)) { target = other; best = delta; }
        }
      }
      e.targetId = target?.id ?? null;
      if (target) {
        if (e.side === 'defender' && !e.status.activated) { e.status.activated = true; if (e.nav?.mode === 'guard') this._planReturn(e); }
        if (e.side === 'defender' && e.nav?.mode !== 'support') e.routeMode = 'guard';
        if (e.nav) e.nav.interrupted = true;
        const reach = e.range + e.radius + target.radius;
        if (distance(e, target) <= reach && this._canSegment(worldPoint(e), worldPoint(target), e.battleTeam, 0)) {
          if (e.attackCd <= 0) this._attack(e, target, battle);
        } else this._chase(e, target, battle, dt);
      } else if (e.side === 'monster') {
        const king = this.state.kings[e.battleTeam], position = kingWorld(e.battleTeam);
        if (distance(e, position) <= e.range + e.radius + (king.radius ?? .8) && this._canSegment(worldPoint(e), position, e.battleTeam, 0)) {
          if (e.attackCd <= 0) {
            const kingTarget = { ...king, side: 'defender' }, attackAuras = this._auraEffects(e, battle.auras), kingAuras = this._auraEffects(kingTarget, battle.auras);
            const dmg = e.damage * attackAuras.damageMultiplier * this._typeMultiplier(e.attackType, king.armorType ?? 'hero') * this._armorFactor(this._effectiveArmor(king, kingAuras.armor)); king.hp -= dmg;
            const haste = attackAuras.attackSpeedMultiplier * (e.status.frenzy ? 1.6 : 1);
            e.attackCd = Math.max(.15, e.attackInterval / haste) * (this._monsterPressure?.[e.team] ?? 1);
            this._event('hit', { laneId: 8 + e.battleTeam, worldX: position.x, worldY: position.y }, `−${Math.round(dmg)}`, { king: true, fromWorldX: e.worldX, fromWorldY: e.worldY });
          }
        } else this._followNav(e, battle, dt);
      } else if (e.side === 'defender') {
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
    for (const a of battle.auras ?? []) if (a.side !== e.side && a.hp > 0 && a.ability.type === 'aura_slow' && distance(a, e) <= number(a.ability.radius, 2)) auraSlow = Math.max(auraSlow, number(a.ability.value, .15));
    const step = Math.min(delta, e.moveSpeed * slow * (1 - auraSlow) * dt);
    let repelX = 0, repelY = 0;
    for (const a of this._nearby(e, 1)) {
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
    if (e.nav) e.nav.distance += distance(from, next);
    this._syncLocal(e);
  }
  _attack(e, target, lane) {
    const ability = e.ability, type = ability?.type;
    const attackAuras = this._auraEffects(e, lane.auras), targetAuras = this._auraEffects(target, lane.auras);
    let damage = e.damage * attackAuras.damageMultiplier, haste = attackAuras.attackSpeedMultiplier;
    if (type === 'crit' && this._random() < number(ability.chance, .2)) damage *= number(ability.value, 2);
    if (type === 'swarm') damage *= 1 + Math.min(4, lane.filter(a => a.side === e.side && a.race === e.race && a.id !== e.id && a.hp > 0 && distance(a, e) <= number(ability.radius, 1.5)).length) * number(ability.value, .08);
    if (e.status.frenzy) haste *= 1.6;
    e.attackCd = Math.max(.15, e.attackInterval / haste) * (e.side === 'monster' ? (this._monsterPressure?.[e.team] ?? 1) : 1);
    const multiplier = this._typeMultiplier(e.attackType, target.armorType);
    const armor = this._effectiveArmor(target, targetAuras.armor);
    const armorFactor = this._armorFactor(armor);
    const dealt = damage * multiplier * armorFactor;
    this._hurt(target, dealt, e);
    this._event(e.range > 1 ? 'projectile' : 'hit', target, `${Math.round(dealt)}`, { fromX: e.x, fromY: e.y, fromWorldX: e.worldX, fromWorldY: e.worldY, color: e.color });
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
    if (target.hp <= 0 || damage <= 0) return;
    let actual = damage;
    if ((target.status.shield ?? 0) > 0 && !pure) { const absorbed = Math.min(actual, target.status.shield); target.status.shield -= absorbed; actual -= absorbed; }
    target.hp -= actual;
    if (!pure && target.ability?.type === 'thorns' && attacker?.hp > 0 && attacker.range < 1.3) this._hurt(attacker, actual * number(target.ability.value, .15), target, true);
    if (attacker?.ownerId !== undefined && attacker.ownerId !== null) { const p = this.state.players[attacker.ownerId]; if (p) p.stats.damage += actual; }
    if (target.hp <= 0 && target.ability?.type === 'revive' && !target.status.revived) {
      target.status.revived = true; target.hp = target.maxHp * clamp(number(target.ability.value, .35), .1, 1);
      target.status.stunUntil = this.state.time + .6; this._event('revive', target, '复生'); return;
    }
    if (target.hp <= 0 && !target.status.deathCounted) {
      target.status.deathCounted = true;
      if (target.side === 'monster') {
        const ownerId = attacker?.ownerId ?? target.sourceLaneId;
        const p = this.state.players[ownerId];
        if (attacker?.isKing) {
          // Both king treasuries receive a kill bounty; each is divided at payout.
          this.state.kingBountyPools ??= [0, 0];
          for (const team of [0, 1]) this.state.kingBountyPools[team] += target.reward;
        } else if (p && p.team !== target.team) { p.gold += target.reward; p.stats.kills++; p.stats.goldEarned += target.reward; }
        this.state.metrics.killed++;
      }
      this._event('death', target, target.side === 'monster' ? `+${target.reward}` : '阵亡', { color: target.color });
    }
  }
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
      if (e.hp <= 0 || e.side !== 'defender' || e.status.warped || !this._settledLanes.includes(e.sourceLaneId)) continue;
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
      const position = kingWorld(k.team), auras = this._battleAuras?.[k.team] ?? [];
      const kingTarget = { ...k, ...position, side: 'defender' }, kingAuras = this._auraEffects(kingTarget, auras);
      k.hp = Math.min(k.maxHp, k.hp + (k.regen + kingAuras.healRate) * dt); k.attackCd -= dt;
      if (k.attackCd <= 0) {
        const reach = rule('kingRange', 250) / 100 + (k.radius ?? .8);
        const enemies = this._nearby({ ...position, battleTeam: k.team }, reach + .5)
          .filter(e => e.side === 'monster' && e.hp > 0 && distance(e, position) <= reach + e.radius && this._canSegment(position, worldPoint(e), k.team, 0))
          .sort((a, b) => distance(a, position) - distance(b, position));
        if (enemies.length) {
          k.attackCd = rule('kingInterval', .85) / ((1 + (k.autoUpgradeCount ?? 0) * rule('kingAttackSpeedPerFourWaves', .1)) * kingAuras.attackSpeedMultiplier);
          const target = enemies[0], targetAuras = this._auraEffects(target, auras);
          const dealt = k.attack * kingAuras.damageMultiplier * this._typeMultiplier(k.attackType ?? 'hero', target.armorType) * this._armorFactor(this._effectiveArmor(target, targetAuras.armor));
          this._hurt(target, dealt, { side: 'defender', team: k.team, isKing: true });
          this._event('kingAttack', target, `${Math.round(k.attack)}`, { fromWorldX: position.x, fromWorldY: position.y, color: k.team ? '#fb7185' : '#60a5fa' });
          if (this.state.wave >= 7) for (const e of enemies.slice(1, 5)) if (distance(e, target) < 1.4) this._hurt(e, k.attack * kingAuras.damageMultiplier * .35 * this._typeMultiplier(k.attackType ?? 'hero', e.armorType) * this._armorFactor(this._effectiveArmor(e, this._auraEffects(e, auras).armor)), { side: 'defender', team: k.team, isKing: true });
        }
      }
      if (k.hp < k.maxHp * .16 && k.healCharges > 0) {
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
    for (const e of this.state.entities) if (e.expiresAt && e.expiresAt <= this.state.time) e.hp = 0;
    this.state.entities = this.state.entities.filter(e => e.hp > 0);
  }
  _endCombat() {
    const s = this.state;
    const listedReward = RULES.waveRewards?.[s.wave - 1];
    const bonus = Number.isFinite(listedReward) ? listedReward * ([10, 20, 30].includes(s.wave) ? 2 : 1) : rule('incomeBase', 22) + s.wave * rule('incomePerWave', 8);
    for (const p of s.players) {
      const teamSize = s.players.filter(v => v.team === p.team).length;
      const kingShare = Math.floor((s.kingBountyPools?.[p.team] ?? 0) / Math.max(1, teamSize));
      const gold = p.income + bonus + kingShare; p.gold += gold; p.stats.goldEarned += gold;
    }
    s.kingBountyPools = [0, 0];
    if (s.wave % 4 === 0) {
      for (const k of s.kings) { k.armor = (k.armor ?? rule('kingArmor', 8)) + rule('kingArmorPerFourWaves', 2); k.autoUpgradeCount = (k.autoUpgradeCount ?? 0) + 1; }
      this._log('国王获得周期强化：护甲 +2，累计攻击速度 +10%。');
    }
    this._log(`第 ${s.wave} 波结束：发放永久收入、${bonus} 金币守护奖励与国王杀敌分红，阵亡军团将在下波复归。`);
    if (s.wave >= WAVES.length) {
      const ratios = s.kings.map(k => k.hp / k.maxHp);
      const power = [0, 1].map(team => s.players.filter(p => p.team === team).reduce((sum, p) => sum + p.buildings.reduce((v, b) => v + (b.spent ?? this._cost(units[b.unitId])), 0) + (p.heroId ? this._cost(heroes[p.heroId]) : 0), 0));
      s.winner = Math.abs(ratios[0] - ratios[1]) > 1e-7 ? (ratios[0] > ratios[1] ? 0 : 1) : power[0] === power[1] ? -1 : power[0] > power[1] ? 0 : 1;
      s.phase = 'ended'; this._log('终焉波完成，按国王生命比例与总兵力判定胜负。'); return;
    }
    s.wave++; s.phase = 'build'; s.timer = this.buildDuration(s.wave); s.entities = [];
    for (let i = 1; i < 8; i++) this._aiAct(s.players[i]);
  }

  _isFront(u) { return u && (['tank', 'frontline'].includes(u.role) || value(u, ['range'], 100) < 100); }
  _hasArea(u) { return ['aoe','splash','cleave','chain','multishot','burn','stomp','poison_aura'].includes(u?.ability?.type); }
  _combatPower(u) {
    if (!u) return 0;
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
        if (cost + reserve <= p.gold && value(u,['population'],1)+p.workers <= p.populationCap)
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
    let attempts=opening?8:2;
    while(attempts-->0){
      const built=p.buildings.map(b=>units[b.unitId]), frontCount=built.filter(u=>this._isFront(u)).length;
      const frontHp=built.filter(u=>this._isFront(u)).reduce((n,u)=>n+u.hp,0);
      const damage=built.reduce((n,u)=>n+this._combatPower(u),0);
      const needFront=frontCount<Math.max(1,Math.ceil(built.length*.35)) || frontHp<damage*2.1;
      const hasArea=built.some(u=>this._hasArea(u)), options=[];
      const reserve=this.state.wave<=2?0:35;
      for(const id of p.roster){const u=units[id];if(u&&this._cost(u)<=p.gold-reserve&&this._population(p)+u.population<=p.populationCap){
        let score=this._combatPower(u)/this._cost(u);
        if(needFront)score*=this._isFront(u)?3:.25;else score*=this._isFront(u)?.8:1.4;
        if(!hasArea&&this._hasArea(u))score*=2.8;
        if(u.ability?.type?.startsWith('aura_'))score*=built.length>=6?1.5:.6;
        options.push({type:'build',u,cost:this._cost(u),score});
      }}
      for(const b of p.buildings)for(const id of this._upgradeIds(units[b.unitId])){const u=units[id],old=units[b.unitId];
        if(this._cost(u)>p.gold-reserve||this._population(p)-old.population+u.population>p.populationCap)continue;
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
    if (this.state.phase === 'build') {
      if (p.workers < Math.min(rule('maxWorkers', 10), 2 + Math.floor(this.state.wave / 2)) && p.gold > rule('workerCost', 50) + 80 && this._random() < .34) this.command('worker', { playerId: p.id });
      if (p.lumberLevel < this.state.wave && p.wood > 180 && p.gold > 180 && this._random() < .24) this.command('lumber', { playerId: p.id });
      if (!p.heroId && this.state.wave >= 5 && p.gold > 400) {
        const preferred = p.buildings.filter(b=>this._isFront(units[b.unitId])).length >= p.buildings.length/2 ? 'aura_damage' : 'aura_armor';
        const h = HEROES.find(h=>h.ability?.type===preferred) ?? HEROES[0];
        if(h)this.command('hero',{playerId:p.id,heroId:h.id});
      }
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
    if (this.state.phase === 'combat' && this._random() < .06) this.command('interfere', { playerId: p.id, laneId: this.state.entities.some(e => e.side === 'monster' && e.laneId === 8 + p.team) ? 8 + p.team : p.id });
  }

  snapshot() {
    return copy({ version: 2, mapId: MAP.id, mapVersion: MAP.version, options: this.options, state: this.state, rng: this._rng >>> 0, id: this._id,
      spawnQueue: this._spawnQueue, aiTimer: this._aiTimer, roundTime: this._roundTime, settledLanes: this._settledLanes, overtime: this._overtime, warpTimer: this._warpTimer, monsterPressure: this._monsterPressure });
  }
  restore(saved) {
    if (!saved || ![1, 2].includes(saved.version) || !saved.state?.players || saved.state.players.length !== 8 || saved.state.kings?.length !== 2) throw new Error('存档格式不匹配');
    if (saved.version === 2 && (saved.mapId !== MAP.id || saved.mapVersion !== MAP.version)) throw new Error('存档地图版本不匹配');
    const data = copy(saved); this.options = data.options ?? this.options; this.state = data.state;
    this._rng = data.rng >>> 0; this._id = data.id ?? 0; this._spawnQueue = data.spawnQueue ?? [];
    this._aiTimer = data.aiTimer ?? 0; this._roundTime = data.roundTime ?? 0; this._settledLanes = data.settledLanes ?? []; this._overtime = data.overtime ?? false; this._warpTimer = data.warpTimer ?? 0; this._monsterPressure = data.monsterPressure;
    this._spatial = null; this._worldEntities = null; this._battleAuras = [[], []];
    for (const k of this.state.kings) {
      k.armor ??= rule('kingArmor', 8); k.armorType ??= 'hero'; k.attackType ??= 'hero'; k.autoUpgradeCount ??= 0; k.healBlockedUntil ??= 0;
    }
    this.state.kingBountyPools ??= [0, 0];
    for (const p of this.state.players) for (const m of MERCENARIES) this._mercenarySlot(p, m);
    if (saved.version === 1) {
      this.state.map = { id: MAP.id, version: MAP.version, topology: '2x2-crossbar-stem' };
      for (const e of this.state.entities) {
        this._ensureWorld(e);
        if (e.side === 'monster') {
          if (e.status.leaked) { e.status.enteredStem = Math.abs(e.worldX - kingWorld(e.battleTeam).x) <= 2 && e.worldY >= 16; e.nav = { mode: 'monster', routeId: e.sourceLaneId, path: navigationPath(worldPoint(e), kingWorld(e.battleTeam), e.battleTeam, e.radius), index: 1, distance: 0 }; }
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
