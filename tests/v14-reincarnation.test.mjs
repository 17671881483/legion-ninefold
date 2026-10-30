import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Game} from '../dist/engine.js';
import {UNIT_TEMPLATES} from '../dist/data.js';
import {V14_ABILITIES} from '../dist/v14-reference.js';
import {compileSkills,initializeSourceClassCombat,tickSourceScriptJobs} from '../dist/skills.js';
import {isReincarnating,countsForBattle,REINCARNATION_DEFAULTS} from '../dist/reincarnation-rules.js';
import {isEntityVisible} from '../dist/renderer.js';
import {laneToWorld} from '../dist/layout.js';
const clone=x=>JSON.parse(JSON.stringify(x)),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`),ok=r=>assert.equal(r.ok,true,r.message);
const has=(e,id)=>e.skillSpecs.some(s=>s.id===id);
function setSkills(e,ids){e.skillSpecs=compileSkills({skillVersion:'v14.1A5',distanceScale:1/3,abilityIds:ids});e.skillStates=Object.fromEntries(ids.map(id=>[id,{readyAt:0,casts:0}]));}
function fixture({building='n061',side='defender'}={}){
 const g=new Game({mode:'sandbox',seed:17});g.state.phase='combat';g.state.time=10;g.state.entities=[];g.state.sourceSkillJobs=[];g._spawnQueue=[];g._random=()=>.99;g._aiAct=()=>{};
 const p=laneToWorld(0,3,6);
 const make=(code,side,dx)=>{const e=g._entity(UNIT_TEMPLATES[code],{side,ownerId:side==='defender'?0:4,team:side==='defender'?0:1,battleTeam:0,laneId:0,sourceLaneId:0,worldX:p.x+dx,worldY:p.y});e.hp=e.maxHp=1000;e.mana=17;e.maxMana=100;e.hpRegen=e.manaRegen=e.moveSpeed=0;e.attackCd=e.abilityCd=9999;e.ability=null;e.buffs=[];e.traits=[];e.armor=0;e.armorType='unarmored';e.sourceArmorTypeRaw='none';setSkills(e,[]);g.state.entities.push(e);return e;};
 const a=make(building==='n062'?'h0QE':building==='n07O'?'h0UX':'h0QD',side,0),enemy=make('h03E',side==='defender'?'monster':'defender',.8);setSkills(a,building==='n061'?['A14E']:['A14E','A14F']);if(building)initializeSourceClassCombat(g,{unitId:'v14_'+building},a);
 const at=time=>{g.state.time=time;tickSourceScriptJobs(g);},kill=()=>g._hurt(a,2000,enemy,{spell:true,scripted:true});return{g,a,enemy,make,at,kill};
}
test('ACrn fallback is explicit versioned evidence; custom delay/cooldown are not replaced',()=>{
 const evidence=JSON.parse(readFileSync(new URL('../reference/reincarnation-evidence.json',import.meta.url))),b=readFileSync(new URL('../reference/v14-source/raw_extracted/war3map.j',import.meta.url)),lines=b.toString('latin1').split('\n');assert.equal(createHash('sha256').update(b).digest('hex'),evidence.source.sha256);for(const row of evidence.sourceEvidence)assert.equal(lines[row.line-1].replace(/\r$/,''),row.text);
 const research=JSON.parse(readFileSync(new URL('../reference/kodo-native-research.json',import.meta.url))),f=V14_ABILITIES.A14E.resolved_fields;
 assert.equal(f.code,'ACrn');assert.equal(f.Cost1,undefined);assert.equal(Number(f.DataA1),2);assert.equal(Number(f.Cool1),240);assert.equal(REINCARNATION_DEFAULTS.manaCost,0);assert.equal(REINCARNATION_DEFAULTS.mapInheritanceVerified,false);
 for(const s of research.sources){assert.equal(s.entries.ACrn.fields.cost,'{0,0,0,0}');assert.match(s.gitBlobSha,/^[a-f0-9]{40}$/);}
});
test('lethal normal damage retains a dead handle without unit-death callbacks or bounty',()=>{
 const f=fixture({side:'monster'}),p=f.g.state.players[0],gold=p.gold,kills=p.stats.kills;f.kill();assert.equal(f.a.hp,0);assert.equal(isReincarnating(f.a),true);assert.equal(f.a.status.deathCounted,undefined);assert.equal(f.a.status.sourceDeathHandled,undefined);assert.equal(p.gold,gold);assert.equal(p.stats.kills,kills);assert.equal(f.g.state.metrics.killed,0);f.g._clearDead();assert.ok(f.g.state.entities.includes(f.a));
});
test('native death threshold reaches .405 only for the scoped positive-level ability',()=>{
 for(const hp of [.405,.4,0]){const f=fixture();f.a.hp=hp;f.g._settleDeath(f.a,f.enemy);assert.equal(isReincarnating(f.a),true,String(hp));}
 const f=fixture();f.a.hp=.406;f.g._settleDeath(f.a,f.enemy);assert.equal(isReincarnating(f.a),false);
 const n=fixture();setSkills(n.a,[]);n.a.hp=.1;n.g._settleDeath(n.a,n.enemy);assert.equal(n.a.hp,.1);
});
test('two-second delay restores the SAME entity, building link, owner and location',()=>{
 const f=fixture(),id=f.a.id;f.a.buildingId='kept';const point=[f.a.worldX,f.a.worldY];f.kill();f.at(11.999);assert.equal(f.a.hp,0);f.at(12);assert.equal(f.a.hp,1000);assert.equal(f.a.mana,100);assert.equal(f.a.id,id);assert.equal(f.a.buildingId,'kept');assert.equal(f.a.ownerId,0);assert.deepEqual([f.a.worldX,f.a.worldY],point);assert.equal(f.g.state.entities.length,2);assert.equal(f.a.status.reincarnation.completedAt,12);
});
test('cooldown starts at fatal damage; another death during cooldown is terminal',()=>{
 const f=fixture({side:'monster'});f.kill();assert.equal(f.a.skillStates.A14E.readyAt,250);assert.equal(f.a.skillStates.A14E.casts,1);f.at(12);f.kill();assert.equal(isReincarnating(f.a),false);assert.equal(f.a.status.deathCounted,true);assert.equal(f.g.state.metrics.killed,1);f.g._clearDead();assert.equal(f.g.state.entities.includes(f.a),false);
});
test('ordinary mummy has no invented once-per-wave gate; it can reincarnate after240s',()=>{
 const f=fixture();f.kill();f.at(12);assert.equal(has(f.a,'A14E'),true);f.at(250);f.kill();assert.equal(isReincarnating(f.a),true);assert.equal(f.a.status.reincarnation.count,2);assert.equal(f.a.skillStates.A14E.readyAt,490);f.at(252);assert.equal(f.a.hp,1000);
});
test('zero current mana is accepted using ACrn default, not a fabricated90mana cost',()=>{
 const f=fixture();f.a.mana=0;f.kill();assert.equal(isReincarnating(f.a),true);assert.equal(f.a.mana,0);assert.equal(f.a.status.reincarnation.manaSource,'ACrn-versioned-default');f.at(12);assert.equal(f.a.mana,100);
});
test('passive reincarnation is not rejected by stun or silence and keeps script state',()=>{
 const f=fixture();f.a.status.stunUntil=99;f.a.status.silenceUntil=99;f.a.status.sourceCustomCounter=7;f.a.skillStates.other={readyAt:100,casts:3};f.kill();f.at(12);assert.equal(f.a.hp,1000);assert.equal(f.a.status.sourceCustomCounter,7);assert.deepEqual(f.a.skillStates.other,{readyAt:100,casts:3});
});
test('zero ability level, absent ability, legacy version and removed handles never start',()=>{
 for(const mode of ['level','absent','legacy','removed']){const f=fixture();if(mode==='level')f.a.abilityLevels={A14E:0};if(mode==='absent')setSkills(f.a,[]);if(mode==='legacy')f.a.skillVersion='legacy';if(mode==='removed')f.a.status.sourceRemoved=true;f.kill();assert.equal(isReincarnating(f.a),false,mode);assert.equal(f.a.status.deathCounted,true,mode);}
});
test('terminal old corpses do not retroactively resurrect when an ability is added',()=>{
 const f=fixture();setSkills(f.a,[]);f.kill();setSkills(f.a,['A14E']);f.g._settleDeath(f.a,f.enemy);f.at(100);assert.ok(f.a.hp<=0);assert.equal(isReincarnating(f.a),false);
});
test('KillUnit follows reincarnation but cannot repeatedly kill a waiting unit',()=>{
 const f=fixture();assert.equal(f.g._killUnit(f.a),true);assert.equal(isReincarnating(f.a),true);assert.equal(f.g._killUnit(f.a),false);assert.equal(f.a.skillStates.A14E.casts,1);
});
test('waiting unit rejects further damage and does not perform normal attacks or regeneration',()=>{
 const f=fixture();f.a.attackCd=0;f.a.hpRegen=f.a.manaRegen=100;f.a.moveSpeed=10;f.kill();const hp=f.enemy.hp,pos=[f.a.worldX,f.a.worldY],mana=f.a.mana;assert.equal(f.g._hurt(f.a,100,f.enemy),0);f.g._updateEntities(1);assert.equal(f.a.hp,0);assert.equal(f.enemy.hp,hp);assert.equal(f.a.mana,mana);assert.deepEqual([f.a.worldX,f.a.worldY],pos);assert.equal(f.a.pendingAttack,null);
});
test('repeated settlement delivers widget listeners only once',()=>{
 const f=fixture({building:'n062'});let draws=0;f.g._random=()=>{draws++;return .99;};f.kill();const before=draws;f.g._settleDeath(f.a,f.enemy);f.g._settleDeath(f.a,null);assert.equal(draws,before);assert.equal(f.a.skillStates.A14E.casts,1);assert.equal(f.g.state.sourceSkillJobs.find(j=>j.type==='mummy_remove').removeAt,12.01);assert.equal(f.g.state.sourceSkillJobs.find(j=>j.type==='mummy_super').done,true);
});
test('pharaoh and Jack revive before2.01s removal; coarse tick keeps that order',()=>{
 for(const building of ['n062','n07O'])for(const coarse of [false,true]){const f=fixture({building});f.kill();if(!coarse){f.at(12);assert.equal(f.a.hp,1000);assert.equal(has(f.a,'A14E'),true);}f.at(12.01);assert.equal(f.a.hp,1000);assert.equal(has(f.a,'A14E'),false);assert.equal(f.a.skillStates.A14E,undefined);assert.equal(f.a.status.reincarnation.completedAt,12);assert.equal(f.a.status.mummyRemoval.at,12.01);assert.equal(f.g.state.sourceSkillJobs.some(j=>j.type==='mummy_super'),false);}
});
test('blessed ally revives, loses ability, can be blessed again with a new cooldown',()=>{
 const f=fixture({building:'n062'}),friend=f.make('h03E','defender',.4);f.a.mana=100;f.at(15);assert.equal(has(friend,'A14E'),true);f.g._hurt(friend,2000,f.enemy,{spell:true});assert.equal(isReincarnating(friend),true);f.at(17);assert.equal(friend.hp,1000);f.at(17.01);assert.equal(has(friend,'A14E'),false);f.a.mana=100;f.at(20);assert.equal(has(friend,'A14E'),true);assert.equal(friend.skillStates.A14E.readyAt,0);f.g._killUnit(friend);assert.equal(isReincarnating(friend),true);assert.equal(friend.status.reincarnation.count,2);
});
test('snapshot duringwait preserves delay and rebinds removal to the same live handle',()=>{
 const f=fixture({building:'n062'});f.kill();f.at(11);const g=Game.fromSnapshot(clone(f.g.snapshot())),a=g.state.entities.find(e=>e.id===f.a.id),j=g.state.sourceSkillJobs.find(j=>j.type==='mummy_remove');assert.equal(j.source,a);assert.equal(isReincarnating(a),true);g.state.time=12.01;tickSourceScriptJobs(g);assert.equal(a.hp,1000);assert.equal(has(a,'A14E'),false);assert.equal(a.status.reincarnation.count,1);
});
test('save afterrevival preserves240s cooldown rather than granting a fresh extra life',()=>{
 const f=fixture();f.kill();f.at(12);const g=Game.fromSnapshot(clone(f.g.snapshot())),a=g.state.entities.find(e=>e.id===f.a.id);assert.equal(a.skillStates.A14E.readyAt,250);g._killUnit(a);assert.equal(a.status.deathCounted,true);
});
test('clearDead and UI retain the waiting marker but discard a true terminal corpse',()=>{
 const f=fixture();assert.equal(isEntityVisible(f.a),true);f.kill();assert.equal(isEntityVisible(f.a),true);assert.equal(countsForBattle(f.a),true);f.g._clearDead();assert.ok(f.g.state.entities.includes(f.a));f.at(12);f.kill();assert.equal(isEntityVisible(f.a),false);assert.equal(countsForBattle(f.a),false);
});
test('removed or expired waiting unit cannot return or keep combat alive',()=>{
 for(const type of ['removed','expired']){const f=fixture();f.kill();if(type==='removed')f.a.status.sourceRemoved=true;else f.a.expiresAt=11;f.at(12);assert.equal(f.a.hp,0);assert.equal(isReincarnating(f.a),false);assert.equal(f.a.status.reincarnation.phase,'cancelled');f.g._clearDead();assert.equal(f.g.state.entities.includes(f.a),false);}
});
test('an absent removed handle is never recreated by the revival clock',()=>{
 const f=fixture();f.kill();f.g.state.entities=f.g.state.entities.filter(e=>e!==f.a);f.at(12);assert.equal(f.g.state.entities.length,1);assert.equal(f.a.hp,0);
});
test('last reincarnating monster prevents wave completion and lane settlement',()=>{
 const f=fixture({side:'monster'});f.kill();f.g._step(.1);assert.equal(f.g.state.phase,'combat');assert.equal(f.g.state.entities.includes(f.a),true);assert.equal(f.g._settledLanes.includes(0),false);for(let i=0;i<20;i++)f.g._step(.1);assert.equal(f.a.status.reincarnation.phase,'revived');assert.equal(f.g.state.phase,'combat');
});
test('last arena fighter waiting forreincarnation does not lose the arena',()=>{
 const f=fixture();f.g.state.roundMode='arena';f.g.state.arenaRemaining=100;f.kill();f.g._step(.1);assert.equal(f.g.state.roundMode,'arena');assert.equal(f.g.state.phase,'combat');assert.equal(f.g.state.arenaResult,undefined);
});
test('continuous waves carry the waiting entity and its absolute deadline',()=>{
 const f=fixture();f.g.state.mode='standard';f.g.state.wave=31;f.kill();f.g._advanceContinuous();assert.equal(f.g.state.wave,32);assert.equal(f.g.state.entities.find(e=>e.id===f.a.id),f.a);assert.equal(f.a.status.reincarnation.reviveAt,12);f.at(12);assert.equal(f.a.hp,1000);
});
test('main death skill side effects happen only on the final terminal death',()=>{
 const f=fixture();setSkills(f.a,['A14E','A0IA']);f.a.combatRawcode='h0JJ';f.kill();assert.equal(f.g.state.sourceSkillJobs.some(j=>j.type==='skeleton_king_revive'),false);assert.equal(f.a.status.sourceDeathHandled,undefined);assert.equal(f.g.state.events.some(e=>e.type==='death'),false);f.at(12);f.kill();assert.equal(f.a.status.sourceDeathHandled,true);assert.equal(f.g.state.events.filter(e=>e.type==='death').length,1);assert.equal(f.g.state.sourceSkillJobs.filter(j=>j.type==='skeleton_king_revive').length,1);
});
test('formal mummy construction and arena conversion use native ability without a fake generic revive',()=>{
 const g=new Game({mode:'sandbox',builderId:'v14_builder_u01X',seed:17});ok(g.command('build',{unitId:'v14_n061',col:1,row:1}));ok(g.command('sandboxComplete'));const b=g.state.players[0].buildings[0];ok(g.command('ready'));let a=g.state.entities.find(e=>e.buildingId===b.id);assert.equal(a.combatRawcode,'h0QD');assert.notEqual(a.ability?.type,'revive');g._killUnit(a);assert.equal(isReincarnating(a),true);g.state.time+=2;tickSourceScriptJobs(g);near(a.hp,a.maxHp);g._startArena();a=g.state.entities.find(e=>e.buildingId===b.id);g._killUnit(a);assert.equal(isReincarnating(a),true);
});
