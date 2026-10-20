import { RULES, UNIT_TEMPLATES, UNITS } from './data.js';

// These fallbacks are the literal registrations and branches in war3map.j,
// rather than tooltip estimates (4050–4073, 15256–15458, 19152–19171).
const FLYING_RAWCODE = 'h0OU';
const TREASURE_CODES = ['h0V3', 'h0V4', 'h0V5', 'h0V6', 'h0V7', 'h0V8', 'h0V9', 'h0VA', 'h0VB', 'h0VC', 'h0VD', 'h0VE', 'h0VF'];
const rawcode = entity => entity?.combatRawcode ?? entity?.sourceRawcode ?? entity?.rawcode;
const sourceConfig = () => RULES.specialMonsters ?? {};
const sourceUnits = Object.fromEntries(UNITS.flatMap(unit => [[unit.id, unit], [unit.sourceRawcode, unit]]));
const buildingRawcode = def => def?.sourceRawcode ?? def?.rawcode;
const resolveUnit = (id, unitsById) => unitsById?.[id] ?? sourceUnits[id] ?? UNIT_TEMPLATES[id];
const baseCombatRawcode = (entity, unitsById) => {
  const def = resolveUnit(entity.unitId, unitsById);
  const base = resolveUnit(def?.skinBaseRawcode ?? entity.skinBaseRawcode, unitsById);
  return base?.combatRawcode ?? entity.skinBaseRawcode ?? rawcode(entity) ?? def?.combatRawcode;
};
const flyingCounter = game => {
  game.state.specialMonsters ??= {};
  return game.state.specialMonsters.waveFive ??= { spawned: 0, killed: 0 };
};
const activePlayers = game => game.state.players.filter(p => p.id === 0 || game._aiEnabled());
const sourceLifeScale = (game, def, wave) => game._sourceLifeScale?.(def, wave) ?? (wave <= 5 ? 1 : wave <= 10 ? 1.5 : 3);

/** Queue the additional source units; these do not replace the normal wave. */
export function queueSpecialMonsters(game, monsterCount) {
  const wave = game.state.wave, config = sourceConfig(), interval = Number(RULES.spawnInterval ?? .1);
  const players = activePlayers(game);
  const flying = config.waveFive ?? {};
  if (wave === Number(flying.wave ?? 5)) {
    const def = UNIT_TEMPLATES[flying.rawcode ?? FLYING_RAWCODE];
    if (def) for (const p of players) game._spawnQueue.push({
      at: monsterCount * interval, laneId: p.id, wave: def, sourceWave: wave,
      specialKind: 'waveFive', x: 3, y: .3,
    });
  }
  const treasure = config.treasure ?? {};
  const registration = Array.isArray(treasure.byWave)
    ? treasure.byWave.find(entry => Number(entry.wave) === wave)
    : treasure.byWave?.[wave];
  const code = registration?.rawcode ?? (typeof registration === 'string' ? registration : undefined)
    ?? TREASURE_CODES[wave - 7];
  if (wave < 7 || wave > 19 || !code || !UNIT_TEMPLATES[code]) return;
  // RandomSetGoldBoxPlayer chooses a separate living route from each team.
  // ib creates the two treasure monsters on the tick after the final batch.
  for (const team of [0, 1]) {
    const candidates = players.filter(p => p.team === team);
    if (!candidates.length) continue;
    const p = candidates[Math.min(candidates.length - 1, Math.floor(game._random() * candidates.length))];
    game._spawnQueue.push({
      at: (monsterCount + 1) * interval, laneId: p.id, wave: UNIT_TEMPLATES[code], sourceWave: wave,
      specialKind: 'treasure', x: 3, y: .3,
    });
  }
}

/** Apply post-creation source mutations after the engine's ordinary spawn setup. */
export function applySpecialMonsterSpawn(game, entity, entry) {
  if (!entry.specialKind || entity.status?.specialSpawnApplied) return;
  entity.status ??= {};
  entity.status.specialSpawnApplied = true;
  entity.specialKind = entry.specialKind;
  const def = entry.wave;
  if (entry.specialKind === 'waveFive') {
    const config = sourceConfig().waveFive ?? {};
    flyingCounter(game).spawned++;
    entity.maxHp = Number(config.maxHp ?? 3000);
    // The object already has 3000 HP; OR == 1 explicitly restores it too.
    entity.hp = Number(config.laneOneCurrentHp ?? 3000);
    entity.expiresAt = game.state.time + Number(config.lifetimeSeconds ?? 60);
  } else if (entry.specialKind === 'treasure') {
    // Trig_CreateUnitHook applies to these sapper templates too; exported
    // treasure HP is still the unscaled object value, unlike main WAVES HP.
    entity.hp = entity.maxHp = Number(def.baseHp ?? def.hp) * sourceLifeScale(game, def, entry.sourceWave ?? game.state.wave);
  }
}

/**
 * Returns the exclusive flying payout for the caller to pay. Treasure shops
 * belong to the dead monster's userdata route, independently of its killer.
 */
export function specialMonsterDeath(game, target, killer) {
  const code = rawcode(target), flying = target.specialKind === 'waveFive' || code === FLYING_RAWCODE;
  const treasure = target.specialKind === 'treasure' || target.name === '宝藏怪' && TREASURE_CODES.includes(code);
  if (!flying && !treasure) return { handledBounty: false, gold: 0, wood: 0 };
  target.status ??= {};
  if (target.status.specialDeathHandled) return { handledBounty: flying, gold: 0, wood: 0 };
  target.status.specialDeathHandled = true;
  if (treasure) {
    const p = game.state.players[target.sourceLaneId];
    if (p) {
      const wave = game.state.wave;
      p.treasures ??= [];
      p.treasures.push({ id: game._uid('treasure'), level: wave >= 14 ? 3 : wave >= 10 ? 2 : 1,
        kingArmor: wave >= 14 ? 2 : 1, canLumber: wave >= 14, sourceWave: wave });
      game._log?.(`${p.name} 获得宝藏奖励，可选择金币、木材或强化。`);
    }
    return { handledBounty: false, gold: 0, wood: 0 };
  }
  // qC returns before the global counter when GetKillingUnit has userdata 0.
  // Timed-life expiration therefore never increments the kill count.
  const player = game.state.players[killer?.ownerId];
  if (game.state.wave >= 31 || !player && !killer?.isKing && killer?.unitId !== 'king') return { handledBounty: true, gold: 0, wood: 0 };
  const count = flyingCounter(game);
  count.killed++;
  const reward = count.killed === 1 || count.killed === count.spawned;
  const payout = sourceConfig().waveFive?.firstAndLastKillReward ?? { gold: 80, wood: 150 };
  if (reward) game._log?.(`${player?.name ?? '国王'} ${count.killed === 1 ? '最先' : '最后'}击杀飞行怪物，获得 ${payout.gold} 金币、${payout.wood} 木材。`);
  return { handledBounty: true, gold: reward ? payout.gold : 0, wood: reward ? payout.wood : 0 };
}

/** The source registers n085 at construction START, before it can fight. */
export function farmerGoldRate(player, unitsById = sourceUnits) {
  if (Number.isFinite(player.nagaFarmerGoldRate)) return player.nagaFarmerGoldRate;
  const count = player.buildings.filter(b => b.nagaFarmerIncomeActive !== false && buildingRawcode(resolveUnit(b.unitId, unitsById)) === 'n085').length;
  return count ? 15 + (count - 1) * .5 : 0;
}

export function sourceEconomyBuildStart(game, player, building, def) {
  if (buildingRawcode(def) !== 'n085' || building.nagaFarmerIncomeActive) return;
  // Excluding this handle works whether the caller has already appended it.
  const prior = Number.isFinite(player.nagaFarmerGoldRate) ? player.nagaFarmerGoldRate
    : farmerGoldRate({ ...player, buildings: player.buildings.filter(b => b !== building && b.id !== building.id) });
  player.nagaFarmerGoldRate = prior < 15 ? 15 : prior + .5;
  building.nagaFarmerIncomeActive = true;
}

/** Pass the OLD definition; upgrading starts do not unregister the farmer. */
export function sourceEconomyUpgradeFinish(game, player, building, oldDef) {
  if (buildingRawcode(oldDef) !== 'n085' || building.nagaFarmerIncomeActive === false) return;
  let prior = player.nagaFarmerGoldRate;
  if (!Number.isFinite(prior)) {
    const remaining = player.buildings.filter(b => b !== building && b.id !== building.id);
    prior = farmerGoldRate({ ...player, buildings: [...remaining, { unitId: oldDef.id }] });
  }
  player.nagaFarmerGoldRate = prior === 15 ? 0 : prior > 0 ? prior - .5 : 0;
  building.nagaFarmerIncomeActive = false;
}

/**
 * JASS 5710–5738 counts dead original h0W1 too because of its `or ... and`
 * expression. farmWaveCount retains that deployment count after corpse cleanup.
 * Farm masters h0W0 themselves must still be alive at settlement (19548–19561).
 */
export function applyFarmerRoundReward(game, player, unitsById = sourceUnits) {
  const owned = game.state.entities.filter(e => e.ownerId === player.id && e.side === 'defender');
  const masters = owned.filter(e => e.hp > 0 && rawcode(e) === 'h0W0').length;
  const originalFarmers = Number.isFinite(player.farmWaveCount) ? player.farmWaveCount
    : owned.filter(e => rawcode(e) === 'h0W1').length;
  const skinFarmers = owned.filter(e => rawcode(e) !== 'h0W1' && e.hp > 0 && baseCombatRawcode(e, unitsById) === 'h0W1').length;
  const gold = masters * 3 * (originalFarmers + skinFarmers);
  if (gold > 0) {
    player.gold += gold; player.stats.goldEarned += gold;
    game._log?.(`${player.name} 的娜迦农场主从压榨中获得 ${gold} 金币。`);
  }
  return gold;
}

/** Independent death triggers; the caller pays these bonuses once. */
export function sourceEconomyDeath(game, target, killer, unitsById = sourceUnits) {
  target.status ??= {};
  if (target.status.economyDeathHandled) return { bonusGold: 0, bonusWood: 0 };
  target.status.economyDeathHandled = true;
  const player = game.state.players[killer?.ownerId];
  if (!player) return { bonusGold: 0, bonusWood: 0 };
  // Native combatants are owned by players 8/9 and monsters by 10/11.
  // The Naga trigger includes all four owners, with no wave-31 cutoff.
  const rate = farmerGoldRate(player, unitsById);
  const bonusGold = rate > 0 && game._random() * 100 <= rate ? 1 : 0;
  const def = resolveUnit(killer.unitId, unitsById) ?? UNIT_TEMPLATES[rawcode(killer)];
  const hasLumber = killer.skillSpecs?.some(s => s.id === 'A0LM') || (def?.abilityIds ?? []).includes('A0LM');
  const level = killer.abilityLevels?.A0LM ?? (hasLumber ? 1 : 0);
  // A0LM is inside qC's ordinary-monster else branch, before Dg >= 31.
  const bonusWood = target.side === 'monster' && game.state.wave < 31 && rawcode(target) !== FLYING_RAWCODE
    && target.specialKind !== 'waveFive' && level === 1 && game._random() < .35 ? 1 : 0;
  return { bonusGold, bonusWood };
}
