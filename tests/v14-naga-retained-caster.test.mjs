import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../dist/engine.js';
import { UNIT_TEMPLATES } from '../dist/data.js';
import { compileSkills, tickSourceScriptJobs } from '../dist/skills.js';

function fixture(abilities = ['A2Y5']) {
  const game = new Game({ mode: 'sandbox', seed: 72 }); game.state.phase = 'combat';
  const actor = game._entity({ ...UNIT_TEMPLATES.h2YS, abilityIds: abilities }, {
    ownerId: 0, team: 0, side: 'defender', battleTeam: 0, sourceLaneId: 0, laneId: 0, worldX: 10, worldY: 10,
  });
  actor.mana = 100;
  const enemies = [10.5, 10.7, 10.9].map(worldX => {
    const enemy = game._entity(UNIT_TEMPLATES.h00L, { ownerId: null, team: 1, side: 'monster', battleTeam: 0,
      sourceLaneId: 0, laneId: 0, worldX, worldY: 10 });
    enemy.skillSpecs = []; enemy.hp = enemy.maxHp = 100000; return enemy;
  });
  game.state.entities = [actor, ...enemies];
  game._hurt(enemies[0], 1, actor, { spell: true, universal: true });
  return { game, actor, enemies };
}
function killAndClean(game, actor, enemy) {
  game._hurt(actor, actor.hp + 1, enemy, { spell: true, universal: true });
  game._clearDead();
  assert.equal(game.state.entities.some(e => e.id === actor.id), false);
  assert.equal(game.state.nagaScriptCasters[actor.id], actor);
}

test('retained dead ripple caster shares its mana and script cooldown across all target timers', () => {
  const { game, actor, enemies } = fixture();
  assert.equal(game.state.sourceSkillJobs.length, 3); assert.equal(actor.mana, 85);
  killAndClean(game, actor, enemies[0]);
  actor.status.sourcePaused = true; actor.status.stunUntil = 100;
  game.state.time = 12; tickSourceScriptJobs(game);
  assert.equal(actor.mana, 70); assert.equal(actor.skillStates.A2Y5.casts, 2); assert.equal(actor.skillStates.A2Y5.readyAt, 24);
  assert.equal(game.state.sourceSkillJobs.length, 3, 'all old target timers produce only one new shared cast');
  assert.ok(game.state.sourceSkillJobs.every(job => job.sourceId === actor.id && job.nextAt === 13));
  assert.equal(enemies[0].hp, 100000 - 1 - 75); assert.equal(enemies[1].hp, 100000 - 75);
  assert.ok(actor.hp <= 0, 'direct source scripts do not resurrect the dead caster');
});

test('hurricane and ripple timers share one retained caster and independently keyed script cooldowns', () => {
  const { game, actor, enemies } = fixture(['A2Y1', 'A2Y5']);
  assert.equal(actor.mana, 65); assert.equal(game.state.sourceSkillJobs.length, 4);
  killAndClean(game, actor, enemies[0]);
  game.state.time = 15; tickSourceScriptJobs(game);
  assert.equal(actor.mana, 30); assert.equal(actor.skillStates.A2Y1.casts, 2); assert.equal(actor.skillStates.A2Y5.casts, 2);
  assert.equal(actor.skillStates.A2Y1.readyAt, 30); assert.equal(actor.skillStates.A2Y5.readyAt, 27);
  assert.equal(Object.keys(game.state.nagaScriptCasters).length, 1);
  assert.equal(game.state.nagaScriptCasters[actor.id], actor);
});

test('restore rebinds authoritative live mana at death and preserves dead-source continuation exactly', () => {
  const { game, actor, enemies } = fixture();
  const restored = Game.fromSnapshot(game.snapshot());
  const restoredActor = restored.state.entities.find(e => e.id === actor.id), restoredEnemy = restored.state.entities.find(e => e.id === enemies[0].id);
  assert.notEqual(restored.state.nagaScriptCasters[actor.id], restoredActor, 'JSON saves do not preserve object aliases');
  actor.mana = restoredActor.mana = 41;
  killAndClean(game, actor, enemies[0]); killAndClean(restored, restoredActor, restoredEnemy);
  assert.equal(restored.state.nagaScriptCasters[actor.id].mana, 41);
  assert.deepEqual(restored.snapshot(), game.snapshot());
  const resumedDead = Game.fromSnapshot(restored.snapshot());
  for (const g of [game, restored, resumedDead]) { g.state.time = 12; tickSourceScriptJobs(g); }
  assert.equal(resumedDead.state.nagaScriptCasters[actor.id].mana, 26);
  assert.equal(resumedDead.state.nagaScriptCasters[actor.id].skillStates.A2Y5.casts, 2);
  assert.deepEqual(restored.snapshot(), game.snapshot()); assert.deepEqual(resumedDead.snapshot(), game.snapshot());
});

test('the live entity wins over a detached saved handle before a timer can auto-cast', () => {
  const { game, actor } = fixture(), restored = Game.fromSnapshot(game.snapshot());
  const live = restored.state.entities.find(e => e.id === actor.id);
  live.mana = 14; restored.state.nagaScriptCasters[actor.id].mana = 100;
  restored.state.time = 12; tickSourceScriptJobs(restored);
  assert.equal(live.mana, 14); assert.equal(live.skillStates.A2Y5.casts, 1);
  assert.deepEqual(restored.state.nagaScriptCasters, {}, 'the completed timers release their retained handle');
});

test('completed or cancelled timers prune dead handles without retaining prior-round casters', () => {
  const { game, actor, enemies } = fixture(); actor.mana = 0;
  killAndClean(game, actor, enemies[0]);
  game.state.nagaScriptCasters.orphan = { id: 'orphan' };
  game.state.time = 5; tickSourceScriptJobs(game);
  assert.equal(game.state.sourceSkillJobs.length, 0); assert.deepEqual(game.state.nagaScriptCasters, {});
  const next = fixture(); next.game.state.sourceSkillJobs = []; tickSourceScriptJobs(next.game);
  assert.deepEqual(next.game.state.nagaScriptCasters, {});
});

test('an incomplete old attribution snapshot continues timer damage without inventing missing caster mana', () => {
  const { game, enemies } = fixture(); game.state.nagaScriptCasters = {};
  game.state.entities = enemies; game.state.sourceSkillJobs = [{ type: 'target_pulses', sourceId: 'old-source', targetId: enemies[0].id,
    damage: 15, interval: 1, remaining: 1, nextAt: 1, source: { id: 'old-source', ownerId: 0, side: 'defender', team: 0, battleTeam: 0,
      skillVersion: 'v14.1A5', combatRawcode: 'h2YS', skillSpecs: compileSkills({ skillVersion: 'v14.1A5', abilityIds: ['A2Y5'] }) } }];
  game.state.time = 1; assert.doesNotThrow(() => tickSourceScriptJobs(game));
  assert.equal(enemies[0].hp, 100000 - 1 - 15); assert.equal(game.state.sourceSkillJobs.length, 0);
  assert.deepEqual(game.state.nagaScriptCasters, {});
});

test('Naga source boundaries remain partial while the proved timer bodies remain operational', () => {
  const skills = compileSkills({ skillVersion: 'v14.1A5', abilityIds: ['A2Y0', 'A2Y1', 'A2Y5'] });
  for (const s of skills) { assert.equal(s.sourceCasterBoundaryStatus, 'partial'); assert.match(s.effectText, /FlushChildHashtable.*RemoveUnit/); }
  assert.equal(skills[0].status, 'unresolved');
  for (const s of skills.slice(1)) { assert.equal(s.status, 'partial'); assert.equal(s.runtimeImplemented, true); }
});

test('source scripts retain real unit handles, do not reject dead casters and only cancel ripple on target death', () => {
  const source = readFileSync(new URL('../reference/v14-source/raw_extracted/war3map.j', import.meta.url), 'utf8');
  const auto = source.match(/function NagaTryAutoCast takes[\s\S]*?endfunction/)[0];
  assert.match(auto, /if Bc==null then/); assert.match(auto, /LoadBoolean\(O,bi,at\) or GetUnitState\(Bc,UNIT_STATE_MANA\)<bg/);
  assert.equal(/UNIT_TYPE_DEAD|UNIT_STATE_LIFE|IsUnitPaused/.test(auto), false);
  const loop = source.match(/function LoopDamage takes[\s\S]*?endfunction/)[0];
  assert.match(loop, /SaveUnitHandle\(O,GetHandleId\(t\),0,Pf\)/); assert.match(loop, /TriggerRegisterDeathEvent\(t,Om\)/);
  assert.equal(loop.includes('TriggerRegisterDeathEvent(t,Pf)'), false);
  const hurricane = source.match(/function NagaChieftainTideHurricaneTimer takes[\s\S]*?endfunction/)[0];
  assert.match(hurricane, /LoadUnitHandle\(O,BF,StringHash\("hero"\)\)/); assert.equal(hurricane.includes('UNIT_TYPE_DEAD'), false);
  assert.match(source, /if GetOwningPlayer\(i\)==Player\(8\) or GetOwningPlayer\(i\)==Player\(9\) then[\s\S]*?call FlushChildHashtable\(O,GetHandleId\(i\)\)/);
  assert.match(source, /set RS=CreateTrigger\(\)\s+call DisableTrigger\(RS\)[\s\S]*?function A_SushuiDelayUnit/);
});
