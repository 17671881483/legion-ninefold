/** Runtime configuration versus the checked-in source workbook snapshot. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { UNITS, BUILDERS, PROPHET_POOLS, HERO_ENTRIES, ARCHIVE_UNITS, HEROES, MERCENARIES, WAVES, RULES, REFERENCE, ECONOMY } from '../dist/data.js';
import { WORKBOOK_REFERENCE, WORKBOOK_UNITS, WORKBOOK_BUILDERS, WORKBOOK_POOLS, WORKBOOK_HERO_ENTRIES, WORKBOOK_ARCHIVE, WORKBOOK_MERCENARIES, WORKBOOK_WAVES, WORKBOOK_UPGRADE_EDGES } from '../dist/workbook-reference.js';
import { DOCUMENT_RULES, DOCUMENT_ECONOMY } from '../dist/document-rules.js';
const snapshot = JSON.parse(await readFile(new URL('../reference/workbook-source.json', import.meta.url), 'utf8'));
const oldSnapshot = JSON.parse(await readFile(new URL('../reference/map-source.json', import.meta.url), 'utf8'));
const n = (v, fallback = 0) => v === undefined || v === null || v === '' ? fallback : Number(v);
const near = (a, b) => assert(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
const averageDamage = fields => n(fields.dmgplus1) + n(fields.dice1) * (n(fields.sides1) + 1) / 2;
const sourceFields = rawcode => ({...snapshot.sourceUnits[rawcode]?.fields, ...snapshot.sourceUnits[rawcode]?.weaponFields});
const active = UNITS.filter(u => !u.legacy), byId = Object.fromEntries(active.map(u => [u.id, u]));
let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`✓ ${name}`); }

test('runtime identifies the actual workbook and historical x3 source with content hashes', () => {
  for (const key of ['name', 'sha256', 'sourceVersion', 'sourceMode', 'sourceUrl', 'mapSha256']) assert.equal(REFERENCE[key], snapshot.document[key]);
  assert.equal(REFERENCE.sourceMode, 'x3'); assert.equal(REFERENCE.dataRevision, WORKBOOK_REFERENCE.dataRevision);
  assert.match(REFERENCE.sha256, /^[a-f0-9]{64}$/); assert.match(REFERENCE.mapSha256, /^[a-f0-9]{64}$/);
  for (const hash of Object.values(REFERENCE.sourceFiles)) assert.match(hash, /^[a-f0-9]{64}$/);
  assert.equal(REFERENCE.distanceScale, 1 / 3); assert.match(REFERENCE.waveCountPolicy, /不再/);
});

test('all 313 playable source stages are active and both historical catalogs are save-only', () => {
  assert.equal(active.length, 313); assert.deepEqual(active, WORKBOOK_UNITS);
  assert.equal(UNITS.filter(u => u.legacy).length, 103);
  assert.equal(new Set(UNITS.map(u => u.id)).size, UNITS.length);
  assert(UNITS.filter(u => u.legacy).every(u => !u.randomPool && !u.isBase));
  assert(HEROES.every(u => u.legacy));
  assert.deepEqual(ARCHIVE_UNITS, WORKBOOK_ARCHIVE); assert.equal(ARCHIVE_UNITS.length, 2);
  assert(ARCHIVE_UNITS.every(u => !byId[u.id] && u.playable === false));
});

test('each source stage keeps building price/population separate from combat object stats', () => {
  for (const u of active) {
    const building = sourceFields(u.sourceRawcode);
    assert.equal(u.cost, n(building.goldcost), u.id); assert.equal(u.woodCost, n(building.lumbercost), u.id);
    assert.equal(u.population, Math.max(1, n(building.fused, 1)), u.id);
    assert.equal(u.sourcePoints, n(building.points), u.id);
    assert.equal(u.provenance, '5.0dJF-workbook');
    if (u.morphProxy) { assert.equal(u.combatRawcode, null); continue; }
    const combat = sourceFields(u.combatRawcode);
    assert.equal(u.hp, n(combat.HP)); assert.equal(u.sourceHP, n(combat.HP)); assert.equal(u.armor, n(combat.def));
    near(u.damage, averageDamage(combat)); near(u.sourceDamage, averageDamage(combat));
    if (combat.cool1 != null) assert.equal(u.interval, n(combat.cool1)); near(u.range, n(combat.rangeN1) / 3); near(u.speed, n(combat.spd) / 3);
    assert.equal(u.sourceRawFields.HP, combat.HP);
  }
  const tree = byId.b_h01C; assert.equal(tree.hp, 115); assert.equal(tree.sourceRawFields.realHP, 420);
});

test('17 source builders retain their reachable rosters and share the ten altar entries', () => {
  assert.deepEqual(BUILDERS, WORKBOOK_BUILDERS); assert.equal(BUILDERS.length, 17);
  assert.equal(new Set(BUILDERS.map(b => b.id)).size, 17);
  for (const b of BUILDERS) {
    assert(b.rosterIds.every(id => byId[id]), b.id); assert.deepEqual(b.heroEntryIds, HERO_ENTRIES);
    if (b.mode === 'race' || b.mode === 'morph') assert.equal(b.rosterIds.length, 6);
  }
  assert.equal(BUILDERS.filter(b => b.mode === 'prophet').length, 1); assert.equal(BUILDERS.filter(b => b.mode === 'morph').length, 1);
});

test('the prophet has 90 candidates in six distinct fifteen-option tiers', () => {
  assert.deepEqual(PROPHET_POOLS, WORKBOOK_POOLS); assert.equal(PROPHET_POOLS.length, 6);
  assert.equal(new Set(PROPHET_POOLS.flat()).size, 90);
  for (let index = 0; index < 6; index++) {
    assert.equal(PROPHET_POOLS[index].length, 15);
    assert(PROPHET_POOLS[index].every(id => byId[id]?.randomPool && byId[id].tier === index + 1));
  }
  assert.equal(active.filter(u => u.morphProxy).length, 6);
  assert(active.filter(u => u.morphProxy).every(u => u.morphTargets.length === 15));
});

test('ten source heroes expose eleven reachable levels and no unresolved capitalized alias', () => {
  assert.deepEqual(HERO_ENTRIES, WORKBOOK_HERO_ENTRIES); assert.equal(HERO_ENTRIES.length, 10);
  const visited = new Set();
  for (const entryId of HERO_ENTRIES) {
    let current = byId[entryId]; assert(current.heroEntry); assert.equal(current.cost, 25); assert.equal(current.population, 1);
    assert.deepEqual(current.requires, ['u00Q', 'u004']);
    for (let level = 1; level <= 11; level++) {
      assert(current.hero); assert.equal(current.heroLevel, level); assert(!visited.has(current.id)); visited.add(current.id);
      const next = current.upgrades.map(id => byId[id]).filter(u => u.hero && u.heroLevel === level + 1);
      if (level < 11) { assert.equal(next.length, 1, current.id); current = next[0]; }
      else assert.equal(next.length, 0);
    }
  }
  assert.equal(visited.size, 110); assert.equal(active.filter(u => u.hero).length, 110);
});

test('every resolved upgrade is playable while the 99 exact H0DC references stay unavailable', () => {
  const unresolved = WORKBOOK_UPGRADE_EDGES.filter(e => !e.resolved), resolved = WORKBOOK_UPGRADE_EDGES.filter(e => e.resolved);
  assert.equal(WORKBOOK_UPGRADE_EDGES.length, 314); assert.equal(resolved.length, 215); assert.equal(unresolved.length, 99);
  for (const edge of unresolved) { assert.equal(edge.toRawcode, 'H0DC'); assert.equal(edge.toId, null); }
  for (const u of active) assert(u.upgrades.every(id => byId[id]), u.id);
  for (const edge of resolved) {
    assert(byId[edge.toId], edge.toId); assert.equal(edge.cost, byId[edge.toId].cost); assert.equal(edge.woodCost, byId[edge.toId].woodCost);
    if (byId[edge.fromId]) assert(byId[edge.fromId].upgrades.includes(edge.toId), `${edge.fromId} → ${edge.toId}`);
  }
});

test('all 35 system waves use source counts and unscaled combat values', () => {
  assert.deepEqual(WAVES, WORKBOOK_WAVES); assert.equal(WAVES.length, 35);
  for (const w of WAVES) {
    const values = snapshot.sheets['35波怪物'].rows.find(row => row.values[0] === w.id).values;
    assert.equal(w.sourceRawcode, values[1]); assert.equal(w.count, values[3]); assert.equal(w.referenceCount, values[3]);
    assert.equal(w.hp, values[5]); assert.equal(w.armor, n(values[7]));
    near(w.damage, n(values[10]) + n(values[11]) * (n(values[12]) + 1) / 2);
    assert.equal(w.interval, values[13]); near(w.range, values[14] / 3);
  }
  assert.equal(WAVES[0].count, 36); for (const wave of [10, 20, 30]) assert.equal(WAVES[wave - 1].count, 3);
  assert.equal(RULES.monsterMultiplier, 3); assert.equal(RULES.webMonsterHpScale, 1); assert.equal(RULES.webMonsterDamageScale, 1);
});

test('24 purchasable mercenaries retain their actual shop prices, stock and unlock stages', () => {
  assert.deepEqual(MERCENARIES, WORKBOOK_MERCENARIES); assert.equal(MERCENARIES.length, 24);
  for (const m of MERCENARIES) {
    const source = snapshot.sheets['木怪与国王商品'].rows.find(row => row.values[3] === m.sourceRawcode); assert(source, m.id);
    const fields = sourceFields(m.sourceRawcode);
    assert.equal(m.wood, n(fields.lumbercost)); assert.equal(m.income, n(fields.points));
    assert.equal(m.stockMax, n(fields.stockMax)); assert.equal(m.cooldown, n(fields.stockRegen));
    assert.equal(m.hp, n(fields.HP)); near(m.damage, averageDamage(fields));
    assert([1, 10, 15].includes(m.unlock));
  }
});

test('source economy stops at seven workers and fifteen two-resource research levels', () => {
  assert.equal(ECONOMY, DOCUMENT_ECONOMY); assert.equal(RULES.lumberLevels, ECONOMY.lumberLevels);
  assert.equal(RULES.maxWorkers, 7); assert.equal(RULES.maxLumberLevel, 15); assert.equal(ECONOMY.lumberLevels.length, 15);
  assert.deepEqual(ECONOMY.worker, { gold: 50, wood: 0, duration: 20, queueLimit: 3, militaryRequirement: 350 });
  assert.deepEqual(ECONOMY.lumberLevels.map(row => row.militaryRequirement), [600,1200,1200,1200,1600,1600,1600,2000,2000,2000,null,null,null,null,null]);
  for (const row of ECONOMY.lumberLevels) {
    const local = row.level <= 8 ? row.level : row.level - 8, source = oldSnapshot.economySources.upgrades[row.sourceUpgrade];
    assert.equal(row.gold, n(source.goldbase) + n(source.goldmod) * (local - 1)); assert.equal(row.wood, row.gold);
    assert.equal(row.duration, n(source.timebase) + n(source.timemod) * (local - 1)); assert.equal(row.extended, false);
  }
  assert.equal(RULES.gatheringCycleSeconds, 10); assert.equal(RULES.lumberBasePayload, 2);
  assert.equal(RULES.lumberBasicPayloadPerLevel, 1); assert.equal(RULES.lumberAdvancedPayloadPerLevel, 2);
});

test('population, farm, source king and round controls replace the earlier Web overrides', () => {
  assert.equal(RULES.initialPopulation, 15); assert.equal(RULES.maxPopulation, 300);
  assert.equal(RULES.farmCost, 24); assert.equal(RULES.farmWoodCost, 80); assert.equal(RULES.farmTrainingSeconds, 5); assert.equal(RULES.farmPopulation, 8);
  assert.equal(RULES.kingInitialHp, 5000); assert.equal(RULES.kingDamage, 60); assert.equal(RULES.kingArmor, 5); assert.equal(RULES.kingRegen, 3);
  assert.deepEqual(RULES.kingHpUpgradeIncrements, Array.from({length:20}, (_,i) => 450 + 25*i)); assert.match(RULES.kingHpUpgradeMappingPolicy, /非魔兽引擎实测/);
  assert.deepEqual(RULES.arenaAfterWaves, [10,20]); assert.equal(RULES.arenaBattleLimitSeconds, 120); assert.equal(RULES.overtimeStartWave, 31);
  assert.equal(RULES.sellRatio, .5); assert.deepEqual(RULES.rerollCosts, [0,100,200,300,400]);
  for (const key of ['maxWorkers','maxLumberLevel','monsterMultiplier','kingHealAmount']) assert.equal(RULES[key], DOCUMENT_RULES[key]);
});

test('damage matrix remains grounded in the map Misc armor columns', () => {
  const armorColumns = { light: 0, medium: 1, heavy: 2, fortified: 3, hero: 5, unarmored: 7 };
  for (const attack of ['normal', 'pierce', 'magic', 'siege', 'chaos', 'hero']) {
    const label = `DamageBonus${attack[0].toUpperCase()}${attack.slice(1)}`;
    const line = oldSnapshot.misc.split(/\r?\n/).find(line => line.startsWith(`${label}=`)); assert(line);
    const values = line.split('=')[1].split(',').map(Number);
    for (const [armor, index] of Object.entries(armorColumns)) assert.equal(RULES.attackMultipliers[attack][armor], values[index]);
  }
});
console.log(`\n${passed} reference suites passed.`);
