import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Game} from '../dist/engine.js';
import {UNIT_TEMPLATES} from '../dist/data.js';
import {V14_ABILITIES} from '../dist/v14-reference.js';
import {compileSkills,initializeSourceClassCombat,tickSourceScriptJobs} from '../dist/skills.js';
import {isReincarnating,countsForBattle,REINCARNATION_DEFAULTS} from '../dist/reincarnation-rules.js';
import {isEntityVisible} from '../dist/renderer.js';
import {laneToWorld} from '../dist/layout.js';

const clone=x=>JSON.parse(JSON.stringify(x));
function skills(e,ids){e.skillSpecs=compileSkills({skillVersion:'v14.1A5',distanceScale:1/3,abilityIds:ids});e.skillStates=Object.fromEntries(ids.map(id=>[id,{readyAt:0,casts:0}]));}
function fixture(ids=['A18C'],side='defender'){
 const g=new Game({mode:'sandbox',seed:71});g.state.phase='combat';g.state.time=10;g.state.entities=[];g.state.sourceSkillJobs=[];g._spawnQueue=[];g._aiAct=()=>{};
 const point=laneToWorld(0,3,6);
 const make=(team,x)=>{const e=g._entity(UNIT_TEMPLATES.h03E,{side:team===0?'defender':'monster',ownerId:team===0?0:4,team,battleTeam:0,laneId:0,sourceLaneId:0,worldX:point.x+x,worldY:point.y});e.hp=e.maxHp=1000;e.mana=0;e.maxMana=100;e.hpRegen=e.manaRegen=e.moveSpeed=0;e.attackCd=e.abilityCd=9999;e.ability=null;e.buffs=[];e.traits=[];e.armor=0;e.armorType='unarmored';e.sourceArmorTypeRaw='none';skills(e,[]);g.state.entities.push(e);return e;};
 const a=make(side==='defender'?0:1,0),enemy=make(side==='defender'?1:0,.8);skills(a,ids);
 return {g,a,enemy,at:time=>{g.state.time=time;tickSourceScriptJobs(g);},kill:()=>g._hurt(a,2000,enemy,{spell:true,scripted:true})};
}

test('A18C uses its own 2s/3600s map overrides and the documented scoped ACrn cost fallback',()=>{
 const f=V14_ABILITIES.A18C.resolved_fields,evidence=JSON.parse(readFileSync(new URL('../reference/reincarnation-evidence.json',import.meta.url)));
 assert.equal(f.code,'ACrn');assert.equal(Number(f.DataA1),2);assert.equal(Number(f.Cast1),2);assert.equal(Number(f.Cool1),3600);assert.equal(f.Cost1,undefined);
 assert.equal(REINCARNATION_DEFAULTS.manaCost,0);assert.equal(REINCARNATION_DEFAULTS.mapInheritanceVerified,false);
 assert.deepEqual(evidence.nativeDefaults.map(s=>s.ACrn.fields.cost),['{0,0,0,0}','{0,0,0,0}']);
 for(const s of evidence.nativeDefaults)assert.match(s.gitBlobSha,/^[a-f0-9]{40}$/);
});
test('A18C lethal damage retains the dead handle without ordinary death or bounty',()=>{
 const f=fixture(['A18C'],'monster'),p=f.g.state.players[0],gold=p.gold,kills=p.stats.kills;f.kill();
 assert.equal(isReincarnating(f.a),true);assert.equal(f.a.hp,0);assert.equal(f.a.status.sourceDeathHandled,undefined);assert.equal(f.a.status.deathCounted,undefined);
 assert.equal(p.gold,gold);assert.equal(p.stats.kills,kills);assert.equal(f.g.state.metrics.killed,0);assert.equal(f.g.state.events.some(e=>e.type==='death'),false);
 assert.equal(countsForBattle(f.a),true);assert.equal(isEntityVisible(f.a),true);f.g._clearDead();assert.ok(f.g.state.entities.includes(f.a));
});
test('A18C waits two seconds and restores the same body with its actual ability event ID',()=>{
 const f=fixture();f.a.buildingId='earth-blessed';f.a.userData=7;f.a.status.customCounter=3;f.a.skillStates.other={readyAt:99,casts:2};const identity=[f.a.id,f.a.ownerId,f.a.worldX,f.a.worldY,f.a.buildingId,f.a.userData];
 f.kill();assert.equal(f.a.status.reincarnation.abilityId,'A18C');assert.equal(f.a.status.reincarnation.manaSource,'ACrn-versioned-default');assert.equal(f.a.status.reincarnation.nativeVerificationPending,true);
 assert.equal(f.a.skillStates.A18C.readyAt,3610);assert.equal(f.a.skillStates.A18C.casts,1);assert.equal(f.a.skillStates.A14E,undefined);
 f.at(11.999);assert.equal(f.a.hp,0);f.at(12);assert.equal(f.a.hp,1000);assert.equal(f.a.mana,100);
 assert.deepEqual([f.a.id,f.a.ownerId,f.a.worldX,f.a.worldY,f.a.buildingId,f.a.userData],identity);assert.equal(f.a.status.customCounter,3);assert.deepEqual(f.a.skillStates.other,{readyAt:99,casts:2});
 assert.deepEqual(f.g.state.events.filter(e=>e.type==='revive').map(e=>e.skillId),['A18C','A18C']);assert.equal(f.g.state.entities.length,2);
});
test('A18C repeat fatal damage during its 3600s cooldown is terminal',()=>{
 const f=fixture(['A18C'],'monster');f.kill();f.at(12);f.kill();assert.equal(isReincarnating(f.a),false);assert.equal(f.a.status.deathCounted,true);assert.equal(f.a.status.sourceDeathHandled,true);assert.equal(f.g.state.metrics.killed,1);assert.equal(f.a.skillStates.A18C.casts,1);
 f.g._clearDead();assert.equal(f.g.state.entities.includes(f.a),false);
});
test('A18C can trigger again at its actual cooldown boundary rather than a fabricated once-per-wave flag',()=>{
 const f=fixture();f.kill();f.at(12);f.at(3610);f.kill();assert.equal(isReincarnating(f.a),true);assert.equal(f.a.status.reincarnation.count,2);assert.equal(f.a.skillStates.A18C.readyAt,7210);f.at(3612);assert.equal(f.a.hp,1000);
});
test('A18C is passive at zero mana and does not clear existing stun or silence',()=>{
 const f=fixture();f.a.status.stunUntil=f.a.status.silenceUntil=99;f.kill();assert.equal(isReincarnating(f.a),true);assert.equal(f.a.mana,0);f.at(12);assert.equal(f.a.hp,1000);assert.equal(f.a.status.stunUntil,99);assert.equal(f.a.status.silenceUntil,99);
});
test('A18C shares the .405 lethal threshold only while present with positive level in v14',()=>{
 for(const hp of [.405,.4,0]){const f=fixture();f.a.hp=hp;f.g._settleDeath(f.a,f.enemy);assert.equal(isReincarnating(f.a),true,String(hp));}
 const above=fixture();above.a.hp=.406;above.g._settleDeath(above.a,above.enemy);assert.equal(isReincarnating(above.a),false);
 for(const mode of ['absent','zero-level','legacy','removed']){const f=fixture();if(mode==='absent')skills(f.a,[]);if(mode==='zero-level')f.a.abilityLevels={A18C:0};if(mode==='legacy')f.a.skillVersion='legacy';if(mode==='removed')f.a.status.sourceRemoved=true;f.kill();assert.equal(isReincarnating(f.a),false,mode);assert.equal(f.a.status.deathCounted,true,mode);}
});
test('granting A18C to a terminal corpse does not retroactively resurrect it',()=>{
 const f=fixture([]);f.kill();skills(f.a,['A18C']);f.g._settleDeath(f.a,f.enemy);f.at(12);assert.equal(isReincarnating(f.a),false);assert.ok(f.a.hp<=0);
});
test('A18C never registers the mummy-specific delayed ability removal',()=>{
 const f=fixture();f.a.permanentAbilityIds=['A18C'];initializeSourceClassCombat(f.g,{sourceRawcode:'earth-blessed',abilityIds:['A18C']},f.a);f.kill();f.at(12.01);
 assert.equal(f.a.hp,1000);assert.ok(f.a.skillSpecs.some(s=>s.id==='A18C'));assert.deepEqual(f.a.permanentAbilityIds,['A18C']);assert.equal(f.a.status.mummyRemoval,undefined);assert.equal(f.a.status.mummyDeploymentRegistered,undefined);assert.equal(f.g.state.sourceSkillJobs.some(j=>j.type==='mummy_remove'),false);
});
test('A18C uses the widget-death path to stop blade while ordinary unit-death waits until the final death',()=>{
 const f=fixture(['A18C','A1TZ','A0IA']);f.a.combatRawcode='h0JJ';f.a.mana=100;
 assert.equal(f.g.command('cast',{entityId:f.a.id,skillId:'A1TZ',playerId:0}).ok,true);const blade=f.g.state.sourceSkillJobs.find(j=>j.type==='maiev_blade');assert.ok(blade);
 f.kill();assert.equal(blade.done,true);assert.equal(f.g.state.sourceSkillJobs.some(j=>j.type==='skeleton_king_revive'),false);assert.equal(f.a.status.sourceDeathHandled,undefined);
 f.g._settleDeath(f.a,f.enemy);assert.equal(f.a.skillStates.A18C.casts,1);f.at(12);f.kill();assert.equal(f.a.status.sourceDeathHandled,true);assert.equal(f.g.state.sourceSkillJobs.filter(j=>j.type==='skeleton_king_revive').length,1);
});
test('multiple reincarnation skills choose the first available skill and keep separate cooldowns',()=>{
 for(const order of [['A14E','A18C'],['A18C','A14E']]){
  const f=fixture(order),[first,second]=order;f.kill();assert.equal(f.a.status.reincarnation.abilityId,first);assert.equal(f.a.status.reincarnation.selectionMode,'first-available-skill-order');assert.equal(f.a.skillStates[second].casts,0);
  assert.equal(f.a.skillStates[first].readyAt,10+(first==='A18C'?3600:240));f.at(12);f.kill();assert.equal(f.a.status.reincarnation.abilityId,second);assert.equal(f.a.skillStates[second].readyAt,12+(second==='A18C'?3600:240));assert.equal(f.a.skillStates[first].casts,1);
  f.at(14);f.kill();assert.equal(isReincarnating(f.a),false);assert.equal(f.a.status.deathCounted,true);
 }
});
test('a disabled or cooling first skill cannot block an available second reincarnation',()=>{
 for(const order of [['A14E','A18C'],['A18C','A14E']])for(const disabled of [true,false]){const f=fixture(order),[first,second]=order;if(disabled)f.a.abilityLevels={[first]:0};else f.a.skillStates[first].readyAt=9999;f.kill();assert.equal(f.a.status.reincarnation.abilityId,second);assert.equal(f.a.skillStates[first].casts,0);assert.equal(f.a.skillStates[second].casts,1);}
});
test('mummy removal of A14E cannot remove an independently granted A18C',()=>{
 const f=fixture(['A18C','A14E']);initializeSourceClassCombat(f.g,{unitId:'v14_n062'},f.a);f.kill();f.at(12.01);assert.equal(f.a.hp,1000);assert.equal(f.a.skillSpecs.some(s=>s.id==='A14E'),false);assert.ok(f.a.skillSpecs.some(s=>s.id==='A18C'));assert.equal(f.a.skillStates.A18C.readyAt,3610);assert.equal(f.a.status.mummyRemoval.abilityId,'A14E');
});
test('A18C waiting state ignores further damage, attacks, movement and regeneration',()=>{
 const f=fixture();f.a.attackCd=0;f.a.hpRegen=f.a.manaRegen=100;f.a.moveSpeed=10;f.kill();const point=[f.a.worldX,f.a.worldY],hp=f.enemy.hp;
 assert.equal(f.g._hurt(f.a,100,f.enemy),0);assert.equal(f.g._killUnit(f.a),false);f.g._updateEntities(1);assert.equal(f.a.hp,0);assert.equal(f.a.mana,0);assert.equal(f.enemy.hp,hp);assert.deepEqual([f.a.worldX,f.a.worldY],point);assert.equal(f.a.skillStates.A18C.casts,1);
});
test('A18C snapshot during waiting retains actual ability, absolute deadline and cooldown',()=>{
 const f=fixture();f.kill();f.at(11);const g=Game.fromSnapshot(clone(f.g.snapshot())),a=g.state.entities.find(e=>e.id===f.a.id);
 assert.equal(isReincarnating(a),true);assert.equal(a.status.reincarnation.abilityId,'A18C');assert.equal(a.status.reincarnation.reviveAt,12);assert.equal(a.skillStates.A18C.readyAt,3610);
 g.state.time=12;tickSourceScriptJobs(g);f.at(12);assert.deepEqual(clone(g.snapshot()),clone(f.g.snapshot()));
});
test('A18C save after return preserves its long cooldown and does not grant a fresh life',()=>{
 const f=fixture();f.kill();f.at(12);const g=Game.fromSnapshot(clone(f.g.snapshot())),a=g.state.entities.find(e=>e.id===f.a.id);assert.equal(a.skillStates.A18C.readyAt,3610);g._killUnit(a);assert.equal(a.status.deathCounted,true);assert.equal(isReincarnating(a),false);
});
test('removal or timed-life expiry cancels A18C waiting without recreating a body',()=>{
 for(const mode of ['removed','expired']){const f=fixture();f.kill();if(mode==='removed')f.a.status.sourceRemoved=true;else f.a.expiresAt=11;f.at(12);assert.equal(f.a.hp,0);assert.equal(f.a.status.reincarnation.phase,'cancelled');assert.equal(f.a.status.reincarnation.reason,mode);f.g._clearDead();assert.equal(f.g.state.entities.includes(f.a),false);}
});
test('last A18C waiting monster or arena fighter keeps its battle active',()=>{
 for(const arena of [false,true]){const f=fixture(['A18C'],arena?'defender':'monster');if(arena){f.g.state.roundMode='arena';f.g.state.arenaRemaining=100;}f.kill();f.g._step(.1);assert.equal(f.g.state.phase,'combat');assert.equal(f.g.state.entities.includes(f.a),true);if(arena)assert.equal(f.g.state.arenaResult,undefined);else assert.equal(f.g._settledLanes.includes(0),false);}
});
test('continuous waves retain the waiting A18C body and its original deadline',()=>{
 const f=fixture();f.g.state.mode='standard';f.g.state.wave=31;f.kill();f.g._advanceContinuous();assert.equal(f.g.state.wave,32);assert.equal(f.g.state.entities.find(e=>e.id===f.a.id),f.a);assert.equal(f.a.status.reincarnation.reviveAt,12);f.at(12);assert.equal(f.a.hp,1000);assert.equal(f.a.status.reincarnation.abilityId,'A18C');
});
