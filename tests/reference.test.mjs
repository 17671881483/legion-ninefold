/** Static source integrity checks. Run: node tests/reference.test.mjs */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const moduleURLs = new Map();
async function moduleURL(file) {
  if (moduleURLs.has(file.href)) return moduleURLs.get(file.href);
  let source = await readFile(file, 'utf8');
  for (const match of [...source.matchAll(/\bfrom\s+(['"])(\.{1,2}\/[^'"]+)\1/g)]) {
    source = source.replaceAll(match[0], `from '${await moduleURL(new URL(match[2], file))}'`);
  }
  const encoded = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  moduleURLs.set(file.href, encoded); return encoded;
}
const { UNITS, MERCENARIES, LEGACY_MERCENARIES, WAVES, RULES, REFERENCE, ECONOMY } = await import(await moduleURL(new URL('../dist/data.js', import.meta.url)));
const { MAP_REFERENCE, MAP_UNITS, MAP_MERCENARIES, MAP_WAVES } = await import(await moduleURL(new URL('../dist/map-reference.js', import.meta.url)));
const snapshot = JSON.parse(await readFile(new URL('../reference/map-source.json', import.meta.url), 'utf8'));
const n = (v, fallback = 0) => v === undefined || v === null || v === '' ? fallback : Number(v);
const near = (a, b) => assert(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
const averageDamage = fields => n(fields.dmgplus1) + n(fields.dice1) * (n(fields.sides1) + 1) / 2;
let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`✓ ${name}`); }

test('reference provenance retains the actual historical x3 map identity and hashes', () => {
  assert.deepEqual(REFERENCE, MAP_REFERENCE);
  assert.equal(REFERENCE.sourceMode, 'x3');
  assert.equal(REFERENCE.sourceUrl, snapshot.sourceUrl);
  assert.equal(REFERENCE.mapSha256, snapshot.mapSha256);
  assert.match(REFERENCE.mapSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(REFERENCE.sourceFiles, snapshot.sourceFiles);
  assert(Object.keys(REFERENCE.sourceFiles).length >= 6);
  for (const hash of Object.values(REFERENCE.sourceFiles)) assert.match(hash, /^[a-f0-9]{64}$/);
  assert.match(REFERENCE.waveCountPolicy, /15A2/);
  assert.equal(REFERENCE.distanceScale, 1 / 3);
});

test('worker training source is e003 at h023 with fixed 50 gold, zero wood and twenty seconds', () => {
  assert.equal(ECONOMY.sourceWorkerRawcode, 'e003'); assert.equal(ECONOMY.sourceTownHallRawcode, 'h023');
  const worker = snapshot.economySources.worker, hall = snapshot.economySources.townHall;
  assert.equal(worker.rawcode, 'e003'); assert.equal(hall.rawcode, 'h023'); assert.equal(hall.fields.Trains, 'e003');
  assert.deepEqual(ECONOMY.worker, { gold: 50, wood: 0, duration: 20, queueLimit: 3 });
  assert.equal(ECONOMY.worker.gold, n(worker.fields.goldcost)); assert.equal(ECONOMY.worker.wood, n(worker.fields.lumbercost)); assert.equal(ECONOMY.worker.duration, n(worker.fields.bldtm));
  assert.equal(RULES.workerCostBase, 50); assert.equal(RULES.workerCostStep, 0); assert.equal(RULES.workerWoodCost, 0);
  assert.equal(RULES.workerTrainingSeconds, 20); assert.equal(RULES.workerQueueLimit, 3);
});

test('lumber cost and duration tables preserve source levels 1-15 and label 16-30 as Web extension', () => {
  assert.equal(ECONOMY.lumberLevels.length, 30); assert.equal(RULES.lumberLevels, ECONOMY.lumberLevels);
  assert.equal(ECONOMY.sourceMaxLumberLevel, 15); assert.equal(ECONOMY.targetMaxLumberLevel, 30);
  assert.equal(snapshot.economySources.townHall.fields.Researches, 'R003,R00H');
  for (const row of ECONOMY.lumberLevels) {
    assert.equal(row.sourceUpgrade, row.level <= 8 ? 'R003' : 'R00H');
    const source = snapshot.economySources.upgrades[row.sourceUpgrade], local = row.level <= 8 ? row.level : row.level - 8;
    assert.equal(row.gold, n(source.goldbase) + n(source.goldmod) * (local - 1));
    assert.equal(row.wood, n(source.lumberbase) + n(source.lumbermod) * (local - 1));
    assert.equal(row.duration, n(source.timebase) + n(source.timemod) * (local - 1));
    assert.equal(row.extended, row.level > 15);
    if (row.level <= 15) { assert.equal(row.sourceLevel, local); assert(local <= source.maxlevel); }
    else assert.equal(row.sourceLevel, undefined);
  }
  for (const [level, cost, duration] of [[1,60,18],[8,200,32],[9,200,35],[15,260,35],[16,270,35],[30,410,35]]) {
    const row = ECONOMY.lumberLevels[level - 1]; assert.equal(row.level, level); assert.equal(row.gold, cost); assert.equal(row.wood, cost); assert.equal(row.duration, duration);
  }
});

test('24 source base units across six tiers and 25 upgrades are isolated from 54 legacy units', () => {
  const active = UNITS.filter(u => !u.legacy), legacy = UNITS.filter(u => u.legacy), bases = active.filter(u => u.randomPool);
  assert.equal(active.length, 49); assert.equal(legacy.length, 54); assert.equal(UNITS.length, 103);
  assert.deepEqual(active, MAP_UNITS);
  assert.equal(bases.length, 24); assert.equal(active.filter(u => !u.randomPool).length, 25);
  assert(legacy.every(u => !u.randomPool && !u.isBase));
  assert.equal(new Set(UNITS.map(u => u.id)).size, UNITS.length);
  for (let tier = 1; tier <= 6; tier++) {
    const actual = bases.filter(u => u.tier === tier).map(u => u.sourceRawcode).sort();
    assert.deepEqual(actual, [...snapshot.baseTiers[tier - 1]].sort());
  }
  const activeIds = new Set(active.map(u => u.id));
  for (const u of active) {
    assert(u.upgrades.every(id => activeIds.has(id)), `${u.id} points to an unavailable upgrade`);
    assert.deepEqual([...u.upgrades.map(id => id.slice(4)), ...(u.omittedUpgradeRawcodes ?? [])].sort(), [...u.sourceUpgradeRawcodes].sort());
  }
});

test('building costs and combat HP, armor and dice damage come from separate original forms', () => {
  for (const u of MAP_UNITS) {
    assert.equal(u.combatRawcode, snapshot.combatPairs[u.sourceRawcode]);
    const building = snapshot.units[u.sourceRawcode].fields, combat = snapshot.units[u.combatRawcode].fields;
    assert.equal(u.cost, n(building.goldcost)); assert.equal(u.population, Math.max(1, n(building.fused, 1)));
    assert.equal(u.hp, n(combat.HP)); assert.equal(u.sourceHP, n(combat.HP));
    assert.equal(u.armor, n(combat.def)); near(u.damage, averageDamage(combat)); near(u.sourceDamage, averageDamage(combat));
    assert.equal(u.interval, n(combat.cool1));
    near(u.range, n(combat.rangeN1) / 3); near(u.speed, n(combat.spd) / 3);
    assert.equal(u.sourceRange, n(combat.rangeN1)); assert.equal(u.sourceSpeed, n(combat.spd));
    assert.equal(u.provenance, '5.0dJF-static');
    assert.equal(u.sourceRawFields.HP, combat.HP);
  }
  const tree = MAP_UNITS.find(u => u.sourceRawcode === 'h01C');
  assert.equal(tree.hp, 115); assert.equal(tree.sourceRawFields.realHP, 420); assert.equal(tree.damage, 12);
});

test('source skill metadata explicitly distinguishes adapted and omitted behavior', () => {
  let adapted = 0, omitted = 0;
  for (const u of [...MAP_UNITS, ...MAP_MERCENARIES, ...MAP_WAVES]) {
    const implemented = u.sourceAbilities.filter(a => a.implemented).map(a => a.rawcode).sort();
    const missing = u.sourceAbilities.filter(a => !a.implemented).map(a => a.rawcode).sort();
    const weaponEffects = u.abilityCoverage.implemented.filter(id => id.startsWith('weapon:'));
    assert.deepEqual(u.abilityCoverage.implemented.filter(id => !id.startsWith('weapon:')).sort(), implemented);
    for (const effect of weaponEffects) {
      assert.equal(effect, 'weapon:outer-splash');
      const fields = snapshot.units[u.combatRawcode ?? u.sourceRawcode].fields;
      assert.match(fields.weapTp1, /splash/); assert(n(fields.Qarea1) > 0);
      assert.equal(u.ability.type, 'splash'); near(u.ability.radius, n(fields.Qarea1) / 3); near(u.ability.value, n(fields.Qfact1));
    }
    assert.deepEqual([...u.abilityCoverage.omitted].sort(), missing);
    adapted += implemented.length; omitted += missing.length;
    if (u.ability?.sourceRawcode) assert(implemented.includes(u.ability.sourceRawcode));
  }
  assert(adapted > 0); assert(omitted > 0);
});

test('mechanical-only Regicide stays omitted while only generic enemy critical strikes are adapted', () => {
  const ballista = MAP_MERCENARIES.find(m => m.sourceRawcode === 'h055'); assert(ballista);
  const regicide = ballista.sourceAbilities.find(a => a.rawcode === 'A037'); assert(regicide);
  assert.equal(regicide.fields.targs1, 'mechanical'); assert.equal(regicide.implemented, false);
  assert.equal(ballista.ability, null); assert(ballista.abilityCoverage.omitted.includes('A037'));
  assert(!ballista.abilityCoverage.implemented.includes('A037'));
  const criticals = [...MAP_UNITS, ...MAP_MERCENARIES, ...MAP_WAVES].filter(u => u.ability?.type === 'crit');
  assert.deepEqual(criticals.map(u => [u.id, u.ability.sourceRawcode]).sort(), [['map_h00W', 'A00C'], ['map_h01F', 'A00L']]);
  for (const unit of criticals) {
    const ability = unit.sourceAbilities.find(a => a.rawcode === unit.ability.sourceRawcode); assert(ability);
    assert.equal(ability.fields.targs1, 'enemies');
  }
});

test('35 wave counts use x3-to-Web9 only for ordinary waves; special-wave quantities stay intact', () => {
  assert.deepEqual(WAVES, MAP_WAVES); assert.equal(WAVES.length, 35);
  const bounty = [3,3,4,5,5,5,6,6,5,51,5,6,7,12,9,8,10,8,10,86,10,9,11,11,9,12,12,23,14,123,0,0,0,0,0];
  for (let i = 0; i < WAVES.length; i++) {
    const w = WAVES[i], row = snapshot.waves[i], special = [10, 20, 30].includes(i + 1) || i + 1 >= 31;
    const referenceCount = n(row.system_creeps_per_active_lane);
    assert.equal(w.id, i + 1); assert.equal(w.sourceRawcode, row.unit_rawcode);
    assert.equal(w.referenceCount, referenceCount); assert.equal(w.count, referenceCount * (special ? 1 : 3));
    assert(Number.isInteger(w.count)); assert.equal(w.boss, special); assert.equal(w.specialWave, special);
    near(w.baseCount * 9, referenceCount * 3);
    assert.equal(w.hp, n(row.slk_HP)); assert.equal(w.sourceHP, n(row.slk_HP));
    near(w.damage, n(row.slk_dmgplus1) + n(row.slk_dice1) * (n(row.slk_sides1) + 1) / 2);
    assert.equal(w.bounty, bounty[i]); assert.equal(w.sourceBounty, bounty[i]);
    near(w.range, w.sourceRange / 3); near(w.speed, w.sourceSpeed / 3);
  }
  assert.equal(RULES.webMonsterHpScale, .25); assert.equal(RULES.webMonsterDamageScale, .20);
});

test('24 markets retain source wood, income, stock, regen and combat-phase unlock stages', () => {
  assert.deepEqual(MERCENARIES, MAP_MERCENARIES); assert.equal(MERCENARIES.length, 24); assert.equal(LEGACY_MERCENARIES.length, 8);
  assert.equal(new Set(MERCENARIES.map(m => m.id)).size, 24);
  for (const m of MERCENARIES) {
    const row = snapshot.mercenaries.find(v => v.rawcode === m.sourceRawcode); assert(row);
    assert.equal(m.wood, n(row.lumbercost)); assert.equal(m.income, n(row.points));
    assert.equal(m.stockMax, n(row.stockMax)); assert.equal(m.cooldown, n(row.stockRegen));
    assert.equal(m.sourceStockMax, m.stockMax); assert.equal(m.sourceStockRegen, m.cooldown);
    assert(m.cooldown >= 3 && m.cooldown <= 120); assert([1, 2, 3].includes(m.stockMax));
    const stage = row.shopRawcode === 'h05C' ? 1 : row.shopRawcode === 'h0AZ' ? 10 : row.shopRawcode === 'h0B0' ? 15 : null;
    assert.equal(m.unlock, stage); if (stage > 1) assert.equal(m.unlockPhase, 'combat');
    assert.match(m.initialStockPolicy, /Web/);
    const raw = snapshot.units[m.sourceRawcode].fields;
    assert.equal(m.hp, n(raw.HP)); near(m.damage, averageDamage(raw));
    near(m.range, m.sourceRange / 3); near(m.speed, m.sourceSpeed / 3);
    assert.equal(m.sourceBounty, n(raw.level, 1));
  }
  assert.deepEqual([...new Set(MERCENARIES.map(m => m.unlock))].sort((a, b) => a - b), [1, 10, 15]);
});

test('damage matrix matches the original Misc columns, including siege and hero armor', () => {
  const armorColumns = { light: 0, medium: 1, heavy: 2, fortified: 3, hero: 5, unarmored: 7 };
  for (const attack of ['normal', 'pierce', 'magic', 'siege', 'chaos', 'hero']) {
    const label = `DamageBonus${attack[0].toUpperCase()}${attack.slice(1)}`;
    const line = snapshot.misc.split(/\r?\n/).find(line => line.startsWith(`${label}=`)); assert(line);
    const values = line.split('=')[1].split(',').map(Number);
    for (const [armor, index] of Object.entries(armorColumns)) assert.equal(RULES.attackMultipliers[attack][armor], values[index]);
  }
  assert.equal(RULES.attackMultipliers.siege.fortified, 1.25);
});

console.log(`\n${passed} reference suites passed.`);
