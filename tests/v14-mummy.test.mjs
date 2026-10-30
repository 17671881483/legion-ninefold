import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Game} from '../dist/engine.js';
import {UNIT_TEMPLATES} from '../dist/data.js';
import {compileSkills,initializeSourceClassCombat,tickSourceScriptJobs,sourceDeath} from '../dist/skills.js';
import {mummyCandidates,mummyWidgetDeath} from '../dist/mummy-rules.js';
import {laneToWorld} from '../dist/layout.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`),clone=x=>JSON.parse(JSON.stringify(x)),ok=r=>assert.equal(r.ok,true,r.message);
const has=(e,id)=>e.skillSpecs.some(s=>s.id===id);
function skills(e,ids){e.skillSpecs=compileSkills({abilityIds:ids,skillVersion:'v14.1A5',distanceScale:1/3});e.skillStates=Object.fromEntries(ids.map(id=>[id,{readyAt:0,casts:0}]));}
function fixture(building='n062'){
 const g=new Game({mode:'sandbox',seed:42});g.state.entities=[];g.state.sourceSkillJobs=[];g.state.phase='combat';g.state.time=10;g._random=()=>.99;g._aiAct=()=>{};for(const k of g.state.kings)k.worldX=k.worldY=10000;const p=laneToWorld(0,3,6);
 const make=(dx=.5,code='h03E',side='defender')=>{const e=g._entity(UNIT_TEMPLATES[code],{ownerId:side==='defender'?0:4,team:side==='defender'?0:1,side,battleTeam:0,laneId:0,sourceLaneId:0,worldX:p.x+dx,worldY:p.y});e.hp=e.maxHp=1000;e.mana=e.maxMana=30;e.damage=100;e.armor=0;e.sourceArmorTypeRaw='none';e.armorType='unarmored';e.ability=null;e.attackCd=e.abilityCd=1000;e.hpRegen=e.manaRegen=e.moveSpeed=0;e.buffs=[];e.traits=[];e.isNativeHero=e.isHero=false;skills(e,[]);g.state.entities.push(e);return e;};
 const a=make(0,building==='n061'?'h0QD':building==='n07O'?'h0UX':'h0QE'),t=make();skills(a,['A14E','A14F']);if(building==='n061')skills(a,['A14E']);if(building)initializeSourceClassCombat(g,{unitId:'v14_'+building},a);
 const at=time=>{g.state.time=time;tickSourceScriptJobs(g);},job=()=>g.state.sourceSkillJobs.find(j=>j.sourceId===a.id&&j.type==='mummy_super');return{g,a,t,make,at,job};
}
test('mummy evidence pins exact source lines, cross-form abilities and missing native fields',()=>{
 const e=JSON.parse(readFileSync(new URL('../reference/mummy-evidence.json',import.meta.url))),b=readFileSync(new URL('../reference/v14-source/raw_extracted/war3map.j',import.meta.url)),lines=b.toString('latin1').split('\n');assert.equal(createHash('sha256').update(b).digest('hex'),e.source.sha256);for(const r of e.sourceEvidence)assert.equal(lines[r.line-1].replace(/\r$/,''),r.text);assert.equal(e.abilities.A14E.Cost1,'');assert.equal(e.abilities.A14F.Cost1,'28');assert.equal(e.abilities.A14F.DataF1,'unflamingattack');assert.equal(e.units.n061.abilList,'A008,A118,A1BL');assert.equal(e.units.h0QD.abilList,'A14E');
});
test('ordinary mummy does not gain a script removal listener from its combat ability',()=>{
 const f=fixture('n061');assert.equal(has(f.a,'A14E'),true);assert.equal(f.g.state.sourceSkillJobs.filter(j=>j.type.startsWith('mummy_')).length,0);f.a.hp=0;sourceDeath(f.g,f.a,f.t);f.at(30);assert.equal(has(f.a,'A14E'),true);assert.equal(f.a.hp,0);assert.equal(f.a.status.mummyReincarnationBoundary.nativeRevivalUnresolved,true);
});
test('pharaoh and skin register5s grant timer and own removal listener from building',()=>{
 for(const building of ['n062','n07O']){const f=fixture(building);assert.equal(f.job().nextAt,15);assert.equal(f.g.state.sourceSkillJobs.filter(j=>j.type==='mummy_remove').length,1);initializeSourceClassCombat(f.g,{unitId:'v14_'+building},f.a);assert.equal(f.g.state.sourceSkillJobs.length,2);}
});
test('separate A14E and A14F branches registertwo listeners; absent building and level0 do not',()=>{
 const f=fixture(null);initializeSourceClassCombat(f.g,{unitId:'custom',abilityIds:['A14E','A14F']},f.a);assert.equal(f.g.state.sourceSkillJobs.filter(j=>j.type==='mummy_remove').length,2);const z=fixture(null);initializeSourceClassCombat(z.g,null,z.a);initializeSourceClassCombat(z.g,{unitId:'v14_n062',abilityLevels:{A14F:0}},z.a);assert.equal(z.g.state.sourceSkillJobs.length,0);
});
test('source filter preserves corpse,self,mechanical,illusion and unrelated prototype candidates',()=>{
 const f=fixture();skills(f.a,['A14F']);f.t.hp=0;const b=f.make(.7);b.traits=['mechanical'];const c=f.make(.8);c.isIllusion=true;c.combatRawcode='n061';assert.deepEqual(mummyCandidates(f.g,f.a).map(e=>e.id),[f.a,f.t,b,c].map(e=>e.id));
});
test('source filter rejects summoned,existing ability,four explicit types,enemy and outside600',()=>{
 const f=fixture();f.t.isSummon=true;const tr=f.make(.5);tr.traits=['summoned'];const ab=f.make(.5);skills(ab,['A14E']);for(const code of ['h0PI','h18J','h0JS','h38J'])f.make(.5).combatRawcode=code;f.make(.5,'h03E','monster');const edge=f.make(2),far=f.make(2.00001);assert.deepEqual(mummyCandidates(f.g,f.a).map(e=>e.id),[edge.id]);assert.equal(mummyCandidates(f.g,f.a).includes(far),false);
});
test('n061/n062 exclusion tests caster rather than selected candidate',()=>{
 const f=fixture();f.t.combatRawcode='n062';assert.deepEqual(mummyCandidates(f.g,f.a).map(e=>e.id),[f.t.id]);for(const code of ['n061','n062']){f.a.combatRawcode=code;assert.equal(mummyCandidates(f.g,f.a).length,0);}f.a.combatRawcode='n07O';assert.equal(mummyCandidates(f.g,f.a).length,1);
});
test('reservoir selection consumesone draw per candidate includingfirst,then grants chosen unit',()=>{
 const f=fixture();const b=f.make(.7),c=f.make(.8),draws=[.99,.49,.8];f.g._random=()=>draws.shift();f.at(15);assert.equal(draws.length,0);assert.equal(f.a.status.mummySelection.draws,3);assert.equal(f.a.status.mummySelection.targetId,b.id);assert.equal(has(b,'A14E'),true);assert.equal(has(f.t,'A14E'),false);assert.equal(has(c,'A14E'),false);
});
test('first grant occurs at5s,spends28mana,sets5s cooldown and registers permanent ability',()=>{
 const f=fixture();f.at(14.999);assert.equal(has(f.t,'A14E'),false);f.at(15);assert.equal(has(f.t,'A14E'),true);near(f.a.mana,2);assert.equal(f.a.skillStates.A14F.readyAt,20);assert.equal(f.a.skillStates.A14F.casts,1);assert.deepEqual(f.t.permanentAbilityIds,['A14E']);assert.equal(f.g.state.sourceSkillJobs.filter(j=>j.type==='mummy_remove'&&j.sourceId===f.t.id).length,1);assert.equal(f.a.status.mummySuccesses,1);assert.equal(f.t.status.mummyBlessing.nativeRevivalUnresolved,true);
});
test('four successful commands destroy repeating trigger; empty/failed attempts do not consume cap',()=>{
 const f=fixture();for(let i=0;i<4;i++)f.make(.6+i*.1);for(const time of [15,20,25,30]){f.a.mana=30;f.at(time);}assert.equal(f.job(),undefined);assert.equal(f.a.status.mummySuccesses,4);f.a.mana=30;f.at(100);assert.equal(f.g.state.entities.filter(e=>e!==f.a&&has(e,'A14E')).length,4);assert.equal(f.a.skillStates.A14F.casts,4);
});
test('not enoughmana and native cooldown keep timer retrying without alternate target selection',()=>{
 const f=fixture();f.a.mana=27;f.at(15);assert.equal(f.a.status.mummyOrder.outcome,'mana');assert.equal(f.job().successes,0);assert.equal(f.job().nextAt,20);f.a.mana=30;f.a.skillStates.A14F.readyAt=21;f.at(20);assert.equal(f.a.status.mummyOrder.outcome,'cooldown');f.at(25);assert.equal(f.job().successes,1);
});
test('removing A14F leaves registered timer alive,with missing-ability failure',()=>{
 const f=fixture();skills(f.a,['A14E']);f.at(15);assert.equal(f.a.status.mummyOrder.outcome,'missing-ability');assert.equal(f.job().nextAt,20);skills(f.a,['A14E','A14F']);f.at(20);assert.equal(has(f.t,'A14E'),true);
});
test('stun,pause,silence and removed caster rejectnative order but keep source trigger',()=>{
 for(const flag of ['stunUntil','sourcePaused','silenceUntil','sourceRemoved']){const f=fixture();f.a.status[flag]=flag.endsWith('Until')?99:true;f.at(15);assert.equal(f.a.status.mummyOrder.outcome,'blocked',flag);assert.equal(has(f.t,'A14E'),false);assert.ok(f.job());}
});
test('selected corpse or self fails order without retrying another living friend',()=>{
 for(const self of [false,true]){const f=fixture();if(self)skills(f.a,['A14F']);else f.t.hp=0;f.make(.8);f.at(15);assert.equal(f.a.status.mummyOrder.outcome,'target-rejected');assert.equal(f.a.skillStates.A14F.casts,0);assert.equal(f.a.mana,30);assert.equal(f.job().successes,0);}
});
test('immune/invulnerable targets remain in source lottery but adapted command rejects',()=>{
 for(const mode of ['immune','invulnerable']){const f=fixture();if(mode==='immune')skills(f.t,['Amim']);else f.t.invulnerable=true;assert.equal(mummyCandidates(f.g,f.a).length,1);f.at(15);assert.equal(f.a.status.mummyOrder.outcome,'target-rejected');assert.equal(has(f.t,'A14E'),false);}
});
test('no candidates makes no randomcall and does not spend resources',()=>{
 const f=fixture();skills(f.t,['A14E']);f.g._random=()=>{throw new Error('empty group must not draw');};f.at(15);assert.equal(f.a.status.mummySelection.draws,0);assert.equal(f.a.status.mummyOrder,undefined);assert.equal(f.a.mana,30);assert.equal(f.job().nextAt,20);
});
test('widget death enumerates and draws before terminating supertimer,but never grants',()=>{
 const f=fixture();f.make(.8);let calls=0;f.g._random=()=>{calls++;return .99;};f.g.state.time=12;f.a.hp=0;sourceDeath(f.g,f.a,f.t);assert.equal(f.a.status.mummySelection.draws,2);assert.ok(calls>=2);assert.equal(f.a.status.mummySelection.event,'widget-death');assert.equal(f.job().done,true);assert.equal(f.a.mana,30);assert.equal(has(f.t,'A14E'),false);f.at(15);assert.equal(f.job(),undefined);
});
test('granted target losesA14E after2.01seconds evenafter corpse cleanup; no fabricated resurrection',()=>{
 const f=fixture();f.at(15);f.g.state.time=16;f.t.hp=0;sourceDeath(f.g,f.t,f.a);assert.equal(f.t.status.mummyBlessing.effectActive,false);f.g.state.entities=f.g.state.entities.filter(e=>e!==f.t);f.at(18);assert.equal(has(f.t,'A14E'),true);f.at(18.01);assert.equal(has(f.t,'A14E'),false);assert.deepEqual(f.t.permanentAbilityIds,[]);assert.equal(f.t.hp,0);assert.equal(f.g.state.entities.some(e=>e.id===f.t.id),false);
});
test('death removal applies to re-added ability on same handle,not a refresheddeadline',()=>{
 const f=fixture();f.at(15);f.g.state.time=16;mummyWidgetDeath(f.g,f.t);skills(f.t,[]);f.a.mana=30;f.at(17);skills(f.t,['A14E']);f.t.permanentAbilityIds=['A14E'];f.at(18.01);assert.equal(has(f.t,'A14E'),false);assert.equal(f.t.hp,1000);
});
test('repeated widget events keep earliest timer and onlyh0QD uses spell alternate',()=>{
 for(const code of ['h0QD','h0QE']){const f=fixture();f.t.combatRawcode=code;f.at(15);f.g.state.time=16;mummyWidgetDeath(f.g,f.t);f.g.state.time=17;mummyWidgetDeath(f.g,f.t);assert.equal(!!f.t.status.mummyAnimation,code==='h0QD');f.at(18.01);assert.equal(has(f.t,'A14E'),false);}
});
test('widget callback is distinct from unitdeath and neednot grant kill rewards',()=>{
 const f=fixture();f.at(15);const kills=f.g.state.metrics.killed;f.t.hp=0;mummyWidgetDeath(f.g,f.t);assert.equal(f.t.status.sourceDeathHandled,undefined);assert.equal(f.t.status.deathCounted,undefined);assert.equal(f.g.state.metrics.killed,kills);
});
test('snapshot rebinds live and retired shared handles and retains success/deadline state',()=>{
 const f=fixture();f.at(15);f.g.state.time=16;f.a.hp=0;sourceDeath(f.g,f.a,f.t);f.g.state.entities=f.g.state.entities.filter(e=>e!==f.a);const g=Game.fromSnapshot(clone(f.g.snapshot())),jj=g.state.sourceSkillJobs.filter(j=>j.sourceId===f.a.id),live=g.state.entities.find(e=>e.id===f.t.id);assert.equal(jj[0].source,jj[1].source);assert.equal(g.state.sourceSkillJobs.find(j=>j.sourceId===f.t.id).source,live);g.state.time=18.01;tickSourceScriptJobs(g);assert.equal(has(jj[0].source,'A14E'),false);assert.equal(live.status.mummyBlessing.effectActive,true);
});
test('registered removal does not depend on current ability; no legacy timer invented onload',()=>{
 const f=fixture();skills(f.a,[]);f.a.hp=0;sourceDeath(f.g,f.a,f.t);assert.ok(f.g.state.sourceSkillJobs.find(j=>j.type==='mummy_remove').removeAt);const g=Game.fromSnapshot(clone(f.g.snapshot()));g.state.sourceSkillJobs=[];const g2=Game.fromSnapshot(clone(g.snapshot()));assert.equal(g2.state.sourceSkillJobs.length,0);
});
test('formal five-mummy unlock,pharaoh upgrade and arena deployment preserve script registration',()=>{
 const g=new Game({mode:'sandbox',builderId:'v14_builder_u01X',seed:42}),p=g.state.players[0];for(let col=0;col<5;col++)ok(g.command('build',{unitId:'v14_n061',col,row:1}));ok(g.command('sandboxComplete'));const b=p.buildings[0];ok(g.command('upgrade',{buildingId:b.id,unitId:'v14_n062'}));ok(g.command('sandboxComplete'));ok(g.command('ready'));let a=g.state.entities.find(e=>e.buildingId===b.id);assert.equal(a.combatRawcode,'h0QE');assert.equal(g.state.sourceSkillJobs.filter(j=>j.sourceId===a.id&&j.type==='mummy_super').length,1);assert.equal(g.state.sourceSkillJobs.filter(j=>j.type==='mummy_remove').length,1);g._startArena();a=g.state.entities.find(e=>e.buildingId===b.id);assert.equal(g.state.sourceSkillJobs.filter(j=>j.sourceId===a.id&&j.type==='mummy_super').length,1);
});
test('natural tick,paused time and subsequent deployment use independent five-second cadence',()=>{
 const f=fixture();f.make(5,'h03E','monster');f.g.state.paused=true;f.g.tick(5);assert.equal(has(f.t,'A14E'),false);f.g.state.paused=false;for(let i=0;i<51;i++)f.g.tick(.1);assert.equal(has(f.t,'A14E'),true);const b=f.make(0,'h0QE');skills(b,['A14E','A14F']);initializeSourceClassCombat(f.g,{unitId:'v14_n062'},b);const j=f.g.state.sourceSkillJobs.find(j=>j.sourceId===b.id&&j.type==='mummy_super');near(j.nextAt,f.g.state.time+5);assert.equal(j.successes,0);
});
