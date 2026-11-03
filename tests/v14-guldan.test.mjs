import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Game} from '../dist/engine.js';
import {UNIT_TEMPLATES} from '../dist/data.js';
import {recordEggCompletion} from '../dist/egg-rules.js';
import {compileSkills,castManualSourceSkill,manualSourceSkills,tickSourceScriptJobs,beforeSourceDamage} from '../dist/skills.js';
const clone=x=>JSON.parse(JSON.stringify(x)),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`),ok=r=>assert.equal(r.ok,true,r.message);
const jobs=(g,type)=>g.state.sourceSkillJobs.filter(j=>j.type===type);
function skills(e,ids){e.skillSpecs=compileSkills({abilityIds:ids,skillVersion:'v14.1A5',distanceScale:1/3});e.skillStates=Object.fromEntries(ids.map(id=>[id,{readyAt:0,casts:0}]));}
function fixture(ids=['A1QL','A1QM','A1QN']){
 const g=new Game({mode:'sandbox',seed:59});g.state.phase='combat';g.state.wave=31;g.state.time=10;g.state.entities=[];g._spawnQueue=[];g._aiAct=()=>{};g._sourceDamageTriggerDepth=1;for(const p of g.state.players)p.eggHistory.firstWaveClosed=true;for(const k of g.state.kings)k.worldX=k.worldY=10000;
 const p={x:5,y:8},make=(dx=.5,side='monster',code='h03E')=>{const e=g._entity(UNIT_TEMPLATES[code],{side,ownerId:side==='defender'?0:4,sourceNativeOwnerId:side==='defender'?8:9,userData:side==='defender'?1:5,team:side==='defender'?0:1,battleTeam:0,laneId:0,sourceLaneId:0,worldX:p.x+dx,worldY:p.y});e.hp=e.maxHp=10000;e.mana=e.maxMana=1000;e.armor=0;e.sourceArmorTypeRaw='none';e.armorType='unarmored';e.ability=null;e.hpRegen=e.manaRegen=e.moveSpeed=0;e.attackCd=99999;e.buffs=[];e.traits=[];skills(e,[]);g.state.entities.push(e);return e;};
 const a=make(0,'defender','h0VR'),t=make();skills(a,ids);
 return {g,a,t,p,make,cast:(id,target=t)=>castManualSourceSkill(g,a,id,id==='A1QN'?{}:{point:{x:target.worldX,y:target.worldY}}),at:n=>{g.state.time=n;tickSourceScriptJobs(g);},kill:e=>g._killUnit(e)};
}

test('source evidence fixes spell bindings timers direct life and absence of charm calls',()=>{
 const p=JSON.parse(readFileSync(new URL('../reference/guldan-evidence.json',import.meta.url))),b=readFileSync(new URL('../reference/v14-source/raw_extracted/war3map.j',import.meta.url)),lines=b.toString('latin1').split('\n');assert.equal(createHash('sha256').update(b).digest('hex'),p.source.sha256);for(const x of p.sourceEvidence)assert.equal(lines[x.line-1].replace(/\r$/,''),x.text);assert.equal(lines.filter(x=>x.includes('NewGuldanSetOwner')).length,1);assert.equal(p.abilities.A1QL.Cost1,'15');assert.equal(p.units.n07V.type,'ancient');assert.equal(p.units.h0VR.type,'giant');
});
test('three manual skills expose exact costs cooldowns and point or immediate targeting',()=>{
 const f=fixture();assert.deepEqual(manualSourceSkills(f.g,f.a).map(s=>[s.id,s.targetKind,s.manaCost,s.cooldown]),[['A1QL','point',15,13],['A1QM','point',16,16],['A1QN','none',11,9]]);for(const s of manualSourceSkills(f.g,f.a)){near(s.range,500/300);assert.equal(s.status,'partial');}ok(f.cast('A1QL'));near(f.a.mana,985);near(f.a.skillStates.A1QL.readyAt,23);assert.equal(f.cast('A1QL').ok,false);
});
test('point spells reject range nonfinite positions resource and control failures without payment',()=>{
 for(const mode of ['range','mana','zero','silence','pause','dead','nan']){const f=fixture(['A1QL']);if(mode==='range')f.t.worldX+=5;if(mode==='mana')f.a.mana=14;if(mode==='zero')f.a.abilityLevels={A1QL:0};if(mode==='silence')f.a.status.silenceUntil=11;if(mode==='pause')f.a.status.sourcePaused=true;if(mode==='dead')f.a.hp=0;if(mode==='nan')f.t.worldX=NaN;const mana=f.a.mana;assert.equal(f.cast('A1QL').ok,false,mode);near(f.a.mana,mana);assert.equal(f.g.state.sourceSkillJobs.length,0);}
});
test('ancient building bodies pay native cost but suppress all three script bodies',()=>{
 for(const id of ['A1QL','A1QM','A1QN']){const f=fixture([id]);f.a.unitType='ancient';ok(f.cast(id));assert.ok(f.a.mana<1000);assert.equal(f.a.status.guldanCast.scriptApplied,false);assert.equal(f.g.state.sourceSkillJobs.length,0);near(f.t.hp,10000);}
});
test('nested spell effect suppression retains payment and cooldown without executing script',()=>{
 const f=fixture(['A1QN']);f.g._sourceAbilityEffectDepth=1;ok(f.cast('A1QN'));near(f.a.mana,989);near(f.a.skillStates.A1QN.readyAt,19);near(f.t.hp,10000);assert.equal(f.g.state.sourceSkillJobs.length,0);
});
test('arrows launch at zero one two seconds and spend no script random draws',()=>{
 const f=fixture(['A1QL']);let draws=0;f.g._random=()=>{draws++;return .5;};ok(f.cast('A1QL'));assert.deepEqual(jobs(f.g,'guldan_launch').map(j=>j.nextAt),[10,11,12]);assert.equal(jobs(f.g,'guldan_arrow').length,0);f.at(10);assert.equal(jobs(f.g,'guldan_arrow').length,1);assert.equal(jobs(f.g,'guldan_launch').length,2);f.at(10.999);assert.equal(jobs(f.g,'guldan_arrow').length,0);f.at(11);assert.equal(jobs(f.g,'guldan_arrow').length,1);f.at(12);assert.equal(jobs(f.g,'guldan_launch').length,0);assert.equal(draws,0);
});
test('each arrow makes four160moves finishes at point16 and removes dummy at point20',()=>{
 const f=fixture(['A1QL']);ok(f.cast('A1QL'));f.at(10);const j=jobs(f.g,'guldan_arrow')[0];near(j.dummy.worldX,f.p.x+160/300);assert.equal(j.steps,1);assert.equal(j.dummy.combatRawcode,'e008');assert.equal(j.dummy.isSummon,false);assert.equal(j.dummy.userData,0);assert.equal(j.dummy.nav,undefined);f.at(10.12);assert.equal(j.steps,4);near(j.dummy.worldX,f.p.x+640/300);f.at(10.16);assert.equal(j.phase,'cleanup');assert.equal(j.dummy.status.sourceRemoved,undefined);near(j.finishedAt,10.16);f.at(10.2);assert.equal(j.dummy.status.sourceRemoved,true);assert.equal(f.g.state.entities.some(e=>e.combatRawcode==='e008'),false);
});
test('arrow collision is200radius and each target takes101only once per arrow',()=>{
 const f=fixture(['A1QL']),edge=f.make(160/300);edge.worldY+=200/300;const outside=f.make(160/300);outside.worldY+=200/300+.001;ok(f.cast('A1QL'));f.at(10.2);near(f.t.hp,9899);near(edge.hp,9899);near(outside.hp,10000);f.at(12.2);near(f.t.hp,9697);near(edge.hp,9697);near(outside.hp,10000);
});
test('later arrows use current caster position and original fixed target point',()=>{
 const f=fixture(['A1QL']);f.t.worldX=f.p.x+1;ok(f.cast('A1QL'));f.at(10.2);f.a.worldY+=1;f.t.worldX+=4;f.at(11);const j=jobs(f.g,'guldan_arrow')[0];near(j.angle,-Math.PI/4);near(j.dummy.worldX,f.p.x+Math.cos(-Math.PI/4)*160/300);near(j.dummy.worldY,f.p.y+1+Math.sin(-Math.PI/4)*160/300);
});
test('arrow and rain are nonweapon spell magic events with native resistance and no azure rider',()=>{
 const f=fixture(['A1QL','A1QM','A1Q0']),immune=f.make(),resist=f.make(),inv=f.make(),friend=f.make(.5,'defender');skills(immune,['Amim']);skills(resist,['A19A']);skills(inv,['Avul']);let events=[];const hurt=f.g._hurt.bind(f.g);f.g._hurt=(t,n,e,o)=>{events.push(o);return hurt(t,n,e,o);};ok(f.cast('A1QL'));f.at(10.2);near(f.t.hp,9899);near(resist.hp,10000-101*.6);near(immune.hp,10000);near(inv.hp,10000);near(friend.hp,10000);assert.ok(events.every(o=>o.spell&&!o.weapon&&o.attackType==='spells'&&o.nativeDamageType==='magic'));ok(f.cast('A1QM'));f.at(11.2);near(f.t.hp,10000-101*2-26);
});
test('no arrow probability draw or conversion occurs even with zero random values',()=>{
 const f=fixture(['A1QL']);f.g._random=()=>0;const owner=f.t.ownerId,id=f.t.id;ok(f.cast('A1QL'));f.at(12.2);near(f.t.hp,9697);assert.equal(f.t.ownerId,owner);assert.equal(f.t.id,id);assert.equal(f.g.state.entities.length,2);
});
test('shared caster hit group is replaced by a second overlapping launch',()=>{
 const f=fixture(['A1QL']);ok(f.cast('A1QL'));f.at(10);const first=f.a.status.guldanArrowGroup;assert.ok(first.hitIds.includes(f.t.id));f.a.skillStates.A1QL.readyAt=0;f.at(10.02);ok(f.cast('A1QL'));f.at(10.02);assert.notEqual(f.a.status.guldanArrowGroup,first);near(f.t.hp,9798);f.at(10.04);near(f.t.hp,9798);
});
test('widget death stops that arrow movement but delayed launches still execute',()=>{
 const f=fixture(['A1QL']);ok(f.cast('A1QL'));f.at(10);const j=jobs(f.g,'guldan_arrow')[0];f.kill(j.dummy);assert.equal(j.phase,'cleanup');f.at(10.2);assert.equal(j.steps,1);assert.equal(j.dummy.status.sourceRemoved,true);f.at(11);assert.equal(jobs(f.g,'guldan_arrow').length,1);
});
test('caster death leaves delayed launches and native magic damage alive',()=>{
 const f=fixture(['A1QL']);ok(f.cast('A1QL'));f.kill(f.a);f.at(12.2);near(f.t.hp,9697);assert.equal(f.g.state.sourceSkillJobs.length,0);
});
test('rain has a fixed400radius and exactly16ticks with the first one after1second',()=>{
 const f=fixture(['A1QM']),edge=f.make(.5+400/300),outside=f.make(.5+400/300+.001);ok(f.cast('A1QM'));f.at(10.999);near(f.t.hp,10000);f.at(11);near(f.t.hp,9974);near(edge.hp,9974);near(outside.hp,10000);f.a.worldX+=10;f.at(26);near(f.t.hp,10000-26*16);near(edge.hp,10000-26*16);assert.equal(jobs(f.g,'guldan_rain').length,0);
});
test('independent rain casts overlap and survive caster death',()=>{
 const f=fixture(['A1QM']);ok(f.cast('A1QM'));f.a.skillStates.A1QM.readyAt=0;ok(f.cast('A1QM'));f.kill(f.a);f.at(26);near(f.t.hp,10000-26*32);assert.equal(f.g.state.sourceSkillJobs.length,0);
});
test('rain enumerates current units every tick rather than retaining initial targets',()=>{
 const f=fixture(['A1QM']);ok(f.cast('A1QM'));f.t.worldX+=5;f.at(11);near(f.t.hp,10000);f.t.worldX-=5;f.at(12);near(f.t.hp,9974);
});
test('drain directly subtracts30percent current life through magic immunity armor and shields',()=>{
 const f=fixture(['A1QN']);f.t.hp=3000;f.t.armor=999;f.t.status.shield=1000;skills(f.t,['Amim','A0I5']);let damageEvents=0;f.g._hurt=()=>{damageEvents++;throw Error('direct drain must not use damage');};const before=f.g.state.players[0].stats.damage;ok(f.cast('A1QN'));near(f.t.hp,2100);near(f.t.status.shield,1000);near(f.a.status.guldanDrain.total,900);near(f.g.state.players[0].stats.damage,before);assert.equal(damageEvents,0);assert.equal(jobs(f.g,'guldan_heal').length,1);
});
test('drain excludes allies dead locust Avul and out of400radius but includes enemy king',()=>{
 const f=fixture(['A1QN']),edge=f.make(400/300),outside=f.make(400/300+.001),inv=f.make(),locust=f.make(),dead=f.make(),friend=f.make(.3,'defender');skills(inv,['Avul']);skills(locust,['Aloc']);dead.hp=0;const king=f.g.state.kings[1];king.worldX=f.p.x+.7;king.worldY=f.p.y;king.hp=1000;ok(f.cast('A1QN'));near(f.t.hp,7000);near(edge.hp,7000);near(king.hp,700);for(const e of [outside,inv,locust,friend])near(e.hp,10000);near(dead.hp,0);near(f.a.status.guldanDrain.total,6300);
});
test('drain crossing the native death threshold settles a null-source death once',()=>{
 const f=fixture(['A1QN']);f.t.hp=.5;let calls=0;const settle=f.g._settleDeath.bind(f.g);f.g._settleDeath=(t,k)=>{calls++;assert.equal(k,null);return settle(t,k);};ok(f.cast('A1QN'));near(f.t.hp,0);near(f.a.status.guldanDrain.total,.15);assert.equal(calls,1);assert.equal(f.t.status.deathCounted,true);
});
test('healing divides each sixth among all current allies including full-health units',()=>{
 const f=fixture(['A1QN']),hurt=f.make(.3,'defender'),full=f.make(.4,'defender');f.t.hp=6000;f.a.hp=1000;hurt.hp=1000;ok(f.cast('A1QN'));near(f.t.hp,4200);f.at(10.999);near(f.a.hp,1000);f.at(11);near(f.a.hp,1100);near(hurt.hp,1100);near(full.hp,10000);f.at(16);near(f.a.hp,1600);near(hurt.hp,1600);near(full.hp,10000);assert.equal(jobs(f.g,'guldan_heal').length,0);
});
test('healing uses fixed600radius center and current recipient count on each tick',()=>{
 const f=fixture(['A1QN']),friend=f.make(1.8,'defender'),outside=f.make(2.001,'defender');f.a.hp=friend.hp=outside.hp=1000;f.t.hp=6000;ok(f.cast('A1QN'));f.a.worldX+=5;f.at(11);near(friend.hp,1300);near(f.a.hp,1000);near(outside.hp,1000);outside.worldX=f.p.x+1.9;f.at(12);near(friend.hp,1450);near(outside.hp,1150);
});
test('empty healing ticks are consumed and dead caster is not resurrected',()=>{
 const f=fixture(['A1QN']);f.t.hp=6000;ok(f.cast('A1QN'));f.kill(f.a);f.at(12);const friend=f.make(.2,'defender');friend.hp=1000;f.at(16);near(friend.hp,2200);near(f.a.hp,0);assert.equal(f.g.state.sourceSkillJobs.length,0);
});
test('independent drains use remaining current health and keep separate healing budgets',()=>{
 const f=fixture(['A1QN']);f.t.hp=1000;f.a.hp=1000;ok(f.cast('A1QN'));f.a.skillStates.A1QN.readyAt=0;ok(f.cast('A1QN'));near(f.t.hp,490);assert.deepEqual(jobs(f.g,'guldan_heal').map(j=>j.total),[300,210]);f.at(16);near(f.a.hp,1510);
});
test('zero self allied A2Y7 and suppressed main damage never auto cast',()=>{
 for(const mode of ['zero','self','ally','A2Y7','suppressed']){const f=fixture();f.g._sourceDamageTriggerDepth=mode==='suppressed'?1:0;if(mode==='ally')f.t.side=f.a.side;if(mode==='A2Y7')skills(f.a,['A1QL','A1QM','A1QN','A2Y7']);beforeSourceDamage(f.g,mode==='self'?f.a:f.t,mode==='zero'?0:1,f.a);assert.equal(f.g.state.sourceSkillJobs.length,0,mode);near(f.a.mana,1000);}
});
test('automatic orders use damaged caster first and do not fall back after failure',()=>{
 const f=fixture(['A1QM']);skills(f.t,['A1QM']);f.t.mana=0;f.g._sourceDamageTriggerDepth=0;beforeSourceDamage(f.g,f.t,1,f.a);assert.equal(f.t.status.guldanOrderA1QM.outcome,'failed');near(f.a.mana,1000);assert.equal(f.g.state.sourceSkillJobs.length,0);
});
test('automatic fallback follows arrow rain drain order and respects30mana budget',()=>{
 const f=fixture();f.a.mana=30;f.g._sourceDamageTriggerDepth=0;beforeSourceDamage(f.g,f.t,1,f.a);near(f.a.mana,4);assert.equal(jobs(f.g,'guldan_launch').length,3);assert.equal(jobs(f.g,'guldan_rain').length,0);assert.equal(jobs(f.g,'guldan_heal').length,1);assert.equal(f.a.status.guldanOrderA1QM.outcome,'failed');near(f.t.hp,7000);
});
test('formal immediate cast command uses ownership and shared cooldown',()=>{
 const f=fixture(['A1QN']);assert.equal(f.g.command('cast',{entityId:f.a.id,skillId:'A1QN',playerId:1}).ok,false);ok(f.g.command('cast',{entityId:f.a.id,skillId:'A1QN',playerId:0}));near(f.a.mana,989);assert.equal(f.g.command('cast',{entityId:f.a.id,skillId:'A1QN',playerId:0}).ok,false);
});
test('coarse timer catchup matches individual frames across all three arrow launches',()=>{
 const a=fixture(['A1QL']),b=fixture(['A1QL']);ok(a.cast('A1QL'));ok(b.cast('A1QL'));a.at(12.2);for(let n=0;n<=220;n++)b.at(10+n*.01);near(a.t.hp,9697);near(a.t.hp,b.t.hp);assert.equal(a.g.state.sourceSkillJobs.length,b.g.state.sourceSkillJobs.length);
});
test('pause freezes all queued callbacks and cooldowns',()=>{
 const f=fixture();ok(f.cast('A1QL'));ok(f.cast('A1QM'));ok(f.cast('A1QN'));f.g.state.paused=true;const snapshot=clone(f.g.snapshot());f.g.tick(4);near(f.g.state.time,10);assert.deepEqual(clone(f.g.snapshot()),snapshot);
});
test('save restore rebinds source and auxiliary handles while retaining hit groups and budgets',()=>{
 const f=fixture();ok(f.cast('A1QL'));ok(f.cast('A1QM'));ok(f.cast('A1QN'));f.at(10.04);const g=Game.fromSnapshot(clone(f.g.snapshot()));g._sourceDamageTriggerDepth=1;const source=g.state.entities.find(e=>e.id===f.a.id);for(const j of g.state.sourceSkillJobs.filter(j=>j.type.startsWith('guldan_')))assert.equal(j.source,source);assert.ok(source.status.guldanArrowGroup.hitIds.includes(f.t.id));g.state.time=26;tickSourceScriptJobs(g);f.at(26);near(g.state.entities.find(e=>e.id===f.t.id).hp,f.t.hp);near(source.hp,f.a.hp);near(source.mana,f.a.mana);assert.equal(g.state.sourceSkillJobs.length,0);
});
test('save restore of a dead caster shares one retained handle between future launches',()=>{
 const f=fixture(['A1QL']);ok(f.cast('A1QL'));f.kill(f.a);f.g.state.entities=f.g.state.entities.filter(e=>e!==f.a);const g=Game.fromSnapshot(clone(f.g.snapshot())),js=jobs(g,'guldan_launch');assert.equal(js[0].source,js[1].source);assert.equal(js[0].source,js[2].source);g._sourceDamageTriggerDepth=1;g.state.time=12.2;tickSourceScriptJobs(g);near(g.state.entities.find(e=>e.id===f.t.id).hp,9697);
});
test('continuous rounds retain timers and sandbox reset discards them',()=>{
 const f=fixture(['A1QM']);ok(f.cast('A1QM'));const j=jobs(f.g,'guldan_rain')[0];f.g.state.mode='standard';f.g._advanceContinuous();assert.ok(f.g.state.sourceSkillJobs.includes(j));const z=fixture();ok(z.cast('A1QL'));ok(z.g.command('sandboxReset'));assert.equal(z.g.state.sourceSkillJobs.length,0);
});
test('actual completion history enables520gold direct upgrade and all three combat skills',()=>{
 const g=new Game({mode:'sandbox'}),p=g.state.players[0];p.roster=['v14_h0C2'];p.entitlements.h220=1;ok(g.command('build',{unitId:'v14_h0C2',col:2,row:4}));ok(g.command('sandboxComplete'));const b=p.buildings[0];assert.equal(g.command('upgrade',{buildingId:b.id,unitId:'v14_n07V'}).ok,false);recordEggCompletion(p,UNIT_TEMPLATES.h1CC,{buildingId:'completed-durotan',wave:1});assert.equal(p.technologies.R0AK,1);const gold=p.gold;ok(g.command('upgrade',{buildingId:b.id,unitId:'v14_n07V'}));near(gold-p.gold,520);ok(g.command('sandboxComplete'));ok(g.command('ready'));const e=g.state.entities.find(e=>e.buildingId===b.id);assert.equal(e.combatRawcode,'h0VR');assert.deepEqual(manualSourceSkills(g,e).map(s=>s.id),['A1QL','A1QM','A1QN']);
});
test('natural arena ticks finish all active skills without auxiliary fighters or nonfinite state',()=>{
 const f=fixture();f.g.state.roundMode='arena';f.g.state.arenaRemaining=120;for(const id of ['A1QL','A1QM','A1QN'])ok(f.cast(id));f.g.tick(17);assert.equal(f.g.state.sourceSkillJobs.length,0);assert.equal(f.g.state.entities.some(e=>e.combatRawcode==='e008'),false);assert.ok(f.t.hp<7000);assert.ok(Number.isFinite(f.t.hp));
});
