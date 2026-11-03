import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Game} from '../dist/engine.js';
import {UNIT_TEMPLATES} from '../dist/data.js';
import {recordEggCompletion} from '../dist/egg-rules.js';
import {compileSkills,castManualSourceSkill,manualSourceSkills,tickSourceScriptJobs,beforeSourceDamage,initializeSourceClassCombat} from '../dist/skills.js';
const clone=x=>JSON.parse(JSON.stringify(x)),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`),ok=r=>assert.equal(r.ok,true,r.message);
const jobs=(g,type)=>g.state.sourceSkillJobs.filter(j=>j.type===type),has=(e,id)=>e.skillSpecs.some(s=>s.id===id);
function skills(e,ids){e.skillSpecs=compileSkills({abilityIds:ids,skillVersion:'v14.1A5',distanceScale:1/3});e.skillStates=Object.fromEntries(ids.map(id=>[id,{readyAt:0,casts:0}]));}
function fixture(ids=['A1SP','A1SV']){
 const g=new Game({mode:'sandbox',seed:61});g.state.phase='combat';g.state.wave=31;g.state.time=10;g.state.entities=[];g._spawnQueue=[];g._aiAct=()=>{};g._sourceDamageTriggerDepth=1;for(const p of g.state.players)p.eggHistory.firstWaveClosed=true;for(const k of g.state.kings)k.worldX=k.worldY=10000;
 const p={x:5,y:8},make=(dx=.5,side='monster',code='h03E')=>{const e=g._entity(UNIT_TEMPLATES[code],{side,ownerId:side==='defender'?0:4,sourceNativeOwnerId:side==='defender'?8:9,userData:side==='defender'?1:5,team:side==='defender'?0:1,battleTeam:0,laneId:0,sourceLaneId:0,worldX:p.x+dx,worldY:p.y});e.hp=e.maxHp=10000;e.mana=e.maxMana=1000;e.armor=0;e.sourceArmorTypeRaw='none';e.armorType='unarmored';e.ability=null;e.hpRegen=e.manaRegen=e.moveSpeed=0;e.attackCd=99999;e.buffs=[];e.traits=[];skills(e,[]);g.state.entities.push(e);return e;};
 const a=make(0,'defender','h0W3'),t=make();skills(a,ids);
 return {g,a,t,p,make,cast:(id,target=t)=>castManualSourceSkill(g,a,id,id==='A1SP'?{target}:{point:{x:target.worldX,y:target.worldY}}),at:n=>{g.state.time=n;tickSourceScriptJobs(g);},kill:e=>g._killUnit(e),bond:(b={unitId:'v14_n087'})=>initializeSourceClassCombat(g,b,a)};
}

test('source evidence fixes rain soul bond and B080 event assignment',()=>{
 const p=JSON.parse(readFileSync(new URL('../reference/anduin-evidence.json',import.meta.url))),b=readFileSync(new URL('../reference/v14-source/raw_extracted/war3map.j',import.meta.url)),lines=b.toString('latin1').split('\n');assert.equal(createHash('sha256').update(b).digest('hex'),p.source.sha256);for(const x of p.sourceEvidence)assert.equal(lines[x.line-1].replace(/\r$/,''),x.text);assert.equal(p.abilities.A1SP.Cost1,'18');assert.equal(p.abilities.A1ST.DataA1,'50.0');assert.equal(p.abilities.A1SU.DataB1,'0.01');assert.equal(p.units.n087.type,'ancient');assert.equal(p.units.h0W3.type,'giant');
});
test('manual rain is an enemy-unit spell and souls are a point spell with exact fees',()=>{
 const f=fixture();assert.deepEqual(manualSourceSkills(f.g,f.a).map(s=>[s.id,s.targetKind,s.manaCost,s.cooldown]),[['A1SP','enemy',18,30],['A1SV','point',18,15]]);ok(f.cast('A1SP'));near(f.a.mana,982);near(f.a.skillStates.A1SP.readyAt,40);assert.equal(f.cast('A1SP').ok,false);ok(f.cast('A1SV'));near(f.a.mana,964);near(f.a.skillStates.A1SV.readyAt,25);
});
test('formal cast command enforces ownership pause and enemy-unit target',()=>{
 const f=fixture(['A1SP']);assert.equal(f.g.command('cast',{entityId:f.a.id,skillId:'A1SP',targetId:f.t.id,playerId:1}).ok,false);f.g.state.paused=true;assert.equal(f.g.command('cast',{entityId:f.a.id,skillId:'A1SP',targetId:f.t.id}).ok,false);f.g.state.paused=false;ok(f.g.command('cast',{entityId:f.a.id,skillId:'A1SP',targetId:f.t.id}));assert.equal(jobs(f.g,'anduin_rain').length,1);
});
test('invalid targets range mana silence and death do not pay or create jobs',()=>{
 for(const mode of ['ally','dead','Avul','Aloc','range','mana','silence','casterDead']){const f=fixture(['A1SP']);if(mode==='ally')f.t.side=f.a.side;if(mode==='dead')f.t.hp=0;if(['Avul','Aloc'].includes(mode))skills(f.t,[mode]);if(mode==='range')f.t.worldX+=10;if(mode==='mana')f.a.mana=17;if(mode==='silence')f.a.status.silenceUntil=11;if(mode==='casterDead')f.a.hp=0;const mana=f.a.mana;assert.equal(f.cast('A1SP').ok,false,mode);near(f.a.mana,mana);assert.equal(f.g.state.sourceSkillJobs.length,0,mode);}
});
test('ancient spell effects return after native payment rather than create projectiles',()=>{
 const f=fixture();f.a.isAncient=true;ok(f.cast('A1SP'));ok(f.cast('A1SV'));near(f.a.mana,964);assert.equal(f.g.state.sourceSkillJobs.length,0);assert.equal(f.a.status.anduinCast.scriptApplied,false);
});
test('rain starts at one second then damages20 and heals caster50 for ten ticks',()=>{
 const f=fixture(['A1SP']);f.a.hp=1000;ok(f.cast('A1SP'));f.at(10.999);near(f.t.hp,10000);near(f.a.hp,1000);f.at(11);near(f.t.hp,9980);near(f.a.hp,1050);f.at(20);near(f.t.hp,9800);near(f.a.hp,1500);assert.equal(jobs(f.g,'anduin_rain').length,0);
});
test('rain stays at the target casting position and heals only its caster',()=>{
 const f=fixture(['A1SP']),friend=f.make(.4,'defender'),late=f.make(1.5),outside=f.make(1.501);friend.hp=f.a.hp=1000;ok(f.cast('A1SP'));f.t.worldX+=4;f.a.worldX+=5;f.at(11);near(f.t.hp,10000);near(late.hp,9980);near(outside.hp,10000);near(friend.hp,1000);near(f.a.hp,1050);
});
test('rain healing clamps at maximum and still occurs when no enemy is hit',()=>{
 const f=fixture(['A1SP']);f.a.hp=9990;ok(f.cast('A1SP'));f.t.worldX+=5;f.at(11);near(f.a.hp,10000);near(f.t.hp,10000);
});
test('rain excludes allies dead locust Avul and includes enemy king in300radius',()=>{
 const f=fixture(['A1SP']),friend=f.make(.5,'defender'),dead=f.make(),inv=f.make(),loc=f.make();dead.hp=0;skills(inv,['Avul']);skills(loc,['Aloc']);const k=f.g.state.kings[1];k.worldX=f.p.x+.5;k.worldY=f.p.y;k.hp=10000;k.armorType='unarmored';k.sourceArmorTypeRaw='none';ok(f.cast('A1SP'));f.at(11);near(k.hp,9980);near(friend.hp,10000);near(inv.hp,10000);near(loc.hp,10000);near(dead.hp,0);
});
test('rain is magic weapon damage, handles magic immunity and native resistance',()=>{
 const f=fixture(['A1SP']),immune=f.make(),resist=f.make();skills(immune,['Amim']);skills(resist,['A19A']);f.t.armor=999;const events=[],hurt=f.g._hurt.bind(f.g);f.g._hurt=(t,n,e,o)=>{events.push(o);return hurt(t,n,e,o);};ok(f.cast('A1SP'));f.at(11);near(f.t.hp,9980);near(immune.hp,10000);near(resist.hp,9988);assert.ok(events.every(o=>o.spell&&o.weapon&&o.attackType==='magic'&&o.nativeDamageType==='magic'));
});
test('weapon classification triggers the independent Malygos20 rider',()=>{
 const f=fixture(['A1SP','A1Q0']);ok(f.cast('A1SP'));f.at(11);near(f.t.hp,9960);
});
test('dead caster retains rain damage without resurrecting from its life setter',()=>{
 const f=fixture(['A1SP']);ok(f.cast('A1SP'));f.kill(f.a);f.at(20);near(f.t.hp,9800);near(f.a.hp,0);assert.equal(f.g.state.sourceSkillJobs.length,0);
});
test('independent overlapping rains each keep ten ticks and50healing',()=>{
 const f=fixture(['A1SP']);f.a.hp=1000;ok(f.cast('A1SP'));f.a.skillStates.A1SP.readyAt=0;ok(f.cast('A1SP'));f.at(20);near(f.t.hp,9600);near(f.a.hp,2000);
});
test('six soul auxiliaries spawn on a250circle with one common forward angle',()=>{
 const f=fixture(['A1SV']),rng=f.g._rng;ok(f.cast('A1SV'));const js=jobs(f.g,'anduin_soul');assert.equal(js.length,6);for(const [i,j]of js.entries()){near(j.dummy.worldX,f.p.x+Math.cos(i*Math.PI/3)*250/300);near(j.dummy.worldY,f.p.y+Math.sin(i*Math.PI/3)*250/300);near(j.angle,0);assert.equal(j.dummy.combatRawcode,'e008');assert.equal(j.dummy.isSummon,false);assert.equal(j.dummy.userData,0);assert.equal(j.dummy.nav,undefined);}assert.equal(f.g._rng,rng);assert.equal(f.g.state.entities.length,2);
});
test('souls jump80immediately take nine steps and finish at point36 without another hit',()=>{
 const f=fixture(['A1SV']);f.t.worldX=f.p.x;f.t.worldY=f.p.y+1;ok(f.cast('A1SV'));const j=jobs(f.g,'anduin_soul')[0],start=j.dummy.worldY;f.at(10);near(j.dummy.worldY,start+80/300);assert.equal(j.steps,1);f.at(10.32);near(j.dummy.worldY,start+720/300);assert.equal(j.steps,9);const hp=f.t.hp;f.at(10.36);near(f.t.hp,hp);assert.equal(j.dummy.status.sourceRemoved,true);assert.equal(jobs(f.g,'anduin_soul').length,0);
});
test('each trajectory hits a target once while six overlapping trajectories can hit separately',()=>{
 const f=fixture(['A1SV']);f.t.worldX=f.p.x+1;ok(f.cast('A1SV'));f.at(10.36);near(f.t.hp,10000-6*(10000*.08+365));
});
test('soul collision uses250radius and snapshots maxlife on each trajectory hit',()=>{
 const f=fixture(['A1SV']);f.t.worldX=6.1;f.t.worldY=f.p.y+250/300;const outside=f.make(1.1);outside.worldY=f.p.y+250/300+.001;ok(f.cast('A1SV',{worldX:6,worldY:8}));const js=jobs(f.g,'anduin_soul');for(const j of js.slice(1))j.done=true;f.at(10);near(f.t.hp,8835);near(outside.hp,10000);f.t.maxHp=20000;f.at(10.36);near(f.t.hp,8835);
});
test('soul hit groups mark immune targets before damage so later loss of immunity cannot rehit',()=>{
 const f=fixture(['A1SV']);skills(f.t,['Amim']);ok(f.cast('A1SV'));const js=jobs(f.g,'anduin_soul');for(const j of js.slice(1))j.done=true;f.at(10);near(f.t.hp,10000);assert.ok(js[0].hitIds.includes(f.t.id));skills(f.t,[]);f.at(10.36);near(f.t.hp,10000);
});
test('widget death stops only that trajectory and removes its auxiliary',()=>{
 const f=fixture(['A1SV']);ok(f.cast('A1SV'));const js=jobs(f.g,'anduin_soul');f.at(10);f.kill(js[0].dummy);assert.equal(js[0].dummy.status.sourceRemoved,true);f.at(10.36);assert.equal(js[0].steps,1);assert.ok(js.slice(1).every(j=>j.steps===9));
});
test('caster death does not cancel the six soul trajectories',()=>{
 const f=fixture(['A1SV']);f.t.worldX=f.p.x+1;ok(f.cast('A1SV'));f.kill(f.a);f.at(10.36);near(f.t.hp,3010);assert.equal(f.g.state.sourceSkillJobs.length,0);
});
test('coarse soul catchup preserves chronological damage callbacks',()=>{
 const one=fixture(['A1SV']),two=fixture(['A1SV']);const capture=f=>{const calls=[],hurt=f.g._hurt.bind(f.g);f.g._hurt=(t,n,e,o)=>{calls.push([Number(f.g.state.time.toFixed(4)),t.id,n]);return hurt(t,n,e,o);};return calls;};const a=capture(one),b=capture(two);ok(one.cast('A1SV'));ok(two.cast('A1SV'));one.at(10.36);for(let i=0;i<=36;i++)two.at(10+i*.01);assert.deepEqual(a,b);near(one.t.hp,two.t.hp);
});
test('automatic target-first orders do not fall back to attacker when target has no mana',()=>{
 const f=fixture();skills(f.t,['A1SP','A1SV']);f.t.mana=0;f.g._sourceDamageTriggerDepth=0;beforeSourceDamage(f.g,f.t,1,f.a);near(f.a.mana,1000);assert.equal(f.t.status.anduinOrderA1SP.outcome,'failed');assert.equal(f.t.status.anduinOrderA1SV.outcome,'failed');assert.equal(f.g.state.sourceSkillJobs.length,0);
});
test('automatic soul order precedes rain and consumes the shared18mana budget',()=>{
 const f=fixture();f.a.mana=18;f.g._sourceDamageTriggerDepth=0;beforeSourceDamage(f.g,f.t,1,f.a);near(f.a.mana,0);assert.equal(jobs(f.g,'anduin_soul').length,6);assert.equal(jobs(f.g,'anduin_rain').length,0);assert.equal(f.a.status.anduinOrderA1SV.order,'unloadallcorpses');assert.equal(f.a.status.anduinOrderA1SP.outcome,'failed');
});
test('zero self allied A2Y7 and disabled main listeners never auto cast',()=>{
 for(const mode of ['zero','self','ally','A2Y7','suppressed']){const f=fixture();f.g._sourceDamageTriggerDepth=mode==='suppressed'?1:0;if(mode==='ally')f.t.side=f.a.side;if(mode==='A2Y7')skills(f.a,['A1SP','A1SV','A2Y7']);beforeSourceDamage(f.g,mode==='self'?f.a:f.t,mode==='zero'?0:1,f.a);assert.equal(f.g.state.sourceSkillJobs.length,0,mode);near(f.a.mana,1000);}
});
test('will aura reduces ordinary spell and universal positive enemy damage by30percent',()=>{
 for(const options of [{spell:false},{spell:true,magic:true},{spell:true,universal:true}]){const f=fixture(['A1SQ']);f.g._sourceDamageTriggerDepth=0;near(f.g._hurt(f.a,100,f.t,options),70);near(f.a.hp,9930);}
});
test('will covers400radius with live allies and does not stack multiple sources',()=>{
 const f=fixture(['A1SQ']),friend=f.make(400/300,'defender'),outside=f.make(400/300+.001,'defender'),second=f.make(0,'defender');skills(second,['A1SQ']);f.g._sourceDamageTriggerDepth=0;near(f.g._hurt(friend,100,f.t),70);near(f.g._hurt(outside,100,f.t),100);near(f.g._hurt(f.t,100,f.a),100);
});
test('the existing8percent attack aura and5armor aura remain active',()=>{
 const f=fixture(['A1SQ','A1SR']),friend=f.make(1,'defender');const a=f.g._auraEffects(friend,[f.a]);near(a.damageMultiplier,1.08);near(a.armor,5);
});
test('explicit B080 buff applies without a living caster and respects expiration',()=>{
 const f=fixture([]);f.g._sourceDamageTriggerDepth=0;f.a.buffs=[{key:'B080',expiresAt:11}];near(f.g._hurt(f.a,100,f.t),70);f.g.state.time=11;near(f.g._hurt(f.a,100,f.t),100);
});
test('will excludes dead aura sources and suppressed A2Y7 or allied events',()=>{
 for(const mode of ['deadAura','suppressed','A2Y7','ally']){const f=fixture(['A1SQ']),friend=f.make(.4,'defender');f.g._sourceDamageTriggerDepth=mode==='suppressed'?1:0;if(mode==='deadAura')f.a.hp=0;if(mode==='A2Y7')skills(f.t,['A2Y7']);if(mode==='ally')f.t.side=friend.side;near(f.g._hurt(friend,100,f.t),100);}
});
test('box shield scales the local damage first and will writes70percent of that value',()=>{
 const f=fixture(['A1SQ','A2ZG']);f.g._sourceDamageTriggerDepth=0;near(f.g._hurt(f.a,100,f.t,{spell:true,universal:true}),59.5);near(f.a.status.anduinWillReduction.amount,85);
});
test('bond registers from the building and executes exactly once after one second',()=>{
 const f=fixture([]),v=f.make(100,'defender','h0PZ');f.bond();f.bond();assert.equal(jobs(f.g,'anduin_bond').length,1);f.at(10.999);assert.equal(has(v,'A1ST'),false);f.at(11);assert.ok(has(v,'A1ST'));assert.ok(has(f.a,'A1ST'));assert.ok(has(v,'A1SU'));assert.equal(jobs(f.g,'anduin_bond').length,0);
});
test('combat-only bond icon cannot substitute for a missing building registration',()=>{
 const f=fixture(['A1SS']);f.make(0,'defender','h0PZ');f.bond({unitId:'v14_h08L'});f.at(11);assert.equal(has(f.a,'A1ST'),false);
});
test('bond requires the same native owner and matching userdata rather than distance',()=>{
 const f=fixture([]),wrongOwner=f.make(.1,'defender','h0PZ'),wrongTag=f.make(.1,'defender','h0PZ'),matching=f.make(100,'defender','h0PZ');wrongOwner.sourceNativeOwnerId=9;wrongTag.userData=2;matching.ownerId=3;f.bond();f.at(11);assert.equal(has(wrongOwner,'A1ST'),false);assert.equal(has(wrongTag,'A1ST'),false);assert.ok(has(matching,'A1ST'));
});
test('appearance fallback only happens when no base Varian object exists',()=>{
 const f=fixture([]),base=f.make(0,'defender','h0PZ'),skin=f.make(0,'defender','h0XC');base.userData=2;base.hp=0;f.bond();f.at(11);assert.equal(has(skin,'A1ST'),false);assert.equal(has(f.a,'A1ST'),false);assert.deepEqual(f.a.status.anduinBond.enumeratedIds,[base.id]);
 const k=fixture([]),v=k.make(0,'defender','h0XC');k.bond();k.at(11);assert.ok(has(v,'A1ST'));assert.ok(has(k.a,'A1ST'));
});
test('dead matching Varian is eligible and its retained handle receives permanent abilities',()=>{
 const f=fixture([]),v=f.make(0,'defender','h0PZ');f.bond();f.kill(v);f.g.state.entities=f.g.state.entities.filter(e=>e!==v);f.at(11);assert.ok(has(v,'A1ST'));assert.ok(has(f.a,'A1ST'));near(v.hp,0);
});
test('bond applies all matches idempotently with50armor and self-only1percent regen',()=>{
 const f=fixture([]),v=f.make(0,'defender','h0PZ'),v2=f.make(0,'defender','h0PZ'),friend=f.make(.2,'defender');f.bond();f.at(11);for(const e of [f.a,v,v2]){assert.equal(e.skillSpecs.filter(s=>s.id==='A1ST').length,1);near(f.g._auraEffects(e,[f.a,v,v2]).armor,50);near(f.g._auraEffects(e,[f.a,v,v2]).healRate,100);}near(f.g._auraEffects(friend,[f.a,v,v2]).healRate,0);
});
test('one-shot bond does not rescan if Varian only arrives later',()=>{
 const f=fixture([]);f.bond();f.at(11);const v=f.make(0,'defender','h0PZ');f.at(20);assert.equal(has(v,'A1ST'),false);assert.equal(has(f.a,'A1ST'),false);
});
test('removing the original bond ability after registration does not cancel its timer',()=>{
 const f=fixture(['A1SS']),v=f.make(0,'defender','h0PZ');f.bond();skills(f.a,[]);f.at(11);assert.ok(has(v,'A1ST'));assert.ok(has(f.a,'A1ST'));
});
test('pause freezes rain souls and the one-shot bond',()=>{
 const f=fixture();ok(f.cast('A1SP'));ok(f.cast('A1SV'));f.bond();f.g.state.paused=true;const snap=clone(f.g.snapshot());f.g.tick(3);assert.deepEqual(clone(f.g.snapshot()),snap);
});
test('save restore rebinds simultaneous jobs and preserves hit groups and dynamic abilities',()=>{
 const f=fixture(),v=f.make(0,'defender','h0PZ');ok(f.cast('A1SP'));ok(f.cast('A1SV'));f.bond();f.at(10.04);const g=Game.fromSnapshot(clone(f.g.snapshot()));g._sourceDamageTriggerDepth=1;const a=g.state.entities.find(e=>e.id===f.a.id);assert.ok(g.state.sourceSkillJobs.filter(j=>j.type.startsWith('anduin_')).every(j=>j.source===a));g.state.time=20;tickSourceScriptJobs(g);f.at(20);near(g.state.entities.find(e=>e.id===f.t.id).hp,f.t.hp);assert.ok(has(a,'A1ST'));assert.ok(has(g.state.entities.find(e=>e.id===v.id),'A1SU'));assert.equal(g.state.sourceSkillJobs.length,0);
});
test('a saved removed dead caster retains one shared handle across all six souls',()=>{
 const f=fixture(['A1SV']);ok(f.cast('A1SV'));f.kill(f.a);f.g.state.entities=f.g.state.entities.filter(e=>e!==f.a);const g=Game.fromSnapshot(clone(f.g.snapshot())),js=jobs(g,'anduin_soul');assert.ok(js.every(j=>j.source===js[0].source));g._sourceDamageTriggerDepth=1;g.state.time=11;tickSourceScriptJobs(g);assert.ok(g.state.entities.find(e=>e.id===f.t.id).hp<10000);
});
test('continuous rounds keep timers while sandbox reset clears them',()=>{
 const f=fixture(['A1SP']);ok(f.cast('A1SP'));const j=jobs(f.g,'anduin_rain')[0];f.g.state.mode='standard';f.g._advanceContinuous();assert.ok(f.g.state.sourceSkillJobs.includes(j));const z=fixture();ok(z.cast('A1SV'));ok(z.g.command('sandboxReset'));assert.equal(z.g.state.sourceSkillJobs.length,0);
});
test('actual history unlocks605gold direct Anduin upgrade without box training',()=>{
 const g=new Game({mode:'sandbox'}),p=g.state.players[0];p.roster=['v14_h08L'];p.entitlements.h220=1;ok(g.command('build',{unitId:'v14_h08L',col:2,row:4}));ok(g.command('sandboxComplete'));const b=p.buildings[0];assert.equal(g.command('upgrade',{buildingId:b.id,unitId:'v14_n087'}).ok,false);recordEggCompletion(p,UNIT_TEMPLATES.hA0B,{buildingId:'completed-tirion',wave:1});assert.equal(p.technologies.R0FM,1);const gold=p.gold;ok(g.command('upgrade',{buildingId:b.id,unitId:'v14_n087'}));near(gold-p.gold,605);ok(g.command('sandboxComplete'));ok(g.command('ready'));const e=g.state.entities.find(e=>e.buildingId===b.id);assert.equal(e.combatRawcode,'h0W3');assert.deepEqual(manualSourceSkills(g,e).map(s=>s.id),['A1SP','A1SV']);assert.ok(jobs(g,'anduin_bond').some(j=>j.sourceId===e.id));
});
test('natural arena ticks complete both skills with finite state and no auxiliary army members',()=>{
 const f=fixture();f.g.state.roundMode='arena';f.g.state.arenaRemaining=120;ok(f.cast('A1SP'));ok(f.cast('A1SV'));f.g.tick(11);assert.equal(f.g.state.sourceSkillJobs.length,0);assert.equal(f.g.state.entities.some(e=>e.combatRawcode==='e008'),false);assert.ok(f.t.hp<10000);assert.ok(Number.isFinite(f.t.hp));
});

test('dead Varian handle survives save and still blocks skin fallback with wrong userdata',()=>{
 const f=fixture([]),v=f.make(0,'defender','h0PZ'),skin=f.make(0,'defender','h0XC');v.userData=2;f.bond();f.kill(v);f.g.state.entities=f.g.state.entities.filter(e=>e!==v);const g=Game.fromSnapshot(clone(f.g.snapshot()));g.state.time=11;tickSourceScriptJobs(g);assert.equal(has(g.state.entities.find(e=>e.id===skin.id),'A1ST'),false);assert.deepEqual(g.state.entities.find(e=>e.id===f.a.id).status.anduinBond.enumeratedIds,[v.id]);
});
test('removed Varian handles no longer block skin fallback',()=>{
 const f=fixture([]),v=f.make(0,'defender','h0PZ'),skin=f.make(0,'defender','h0XC');f.bond();f.kill(v);v.status.sourceRemoved=true;f.g.state.entities=f.g.state.entities.filter(e=>e!==v);f.at(11);assert.ok(has(skin,'A1ST'));
});
test('soul move requests respect the host wall while the fixed nine callbacks still complete',()=>{
 const f=fixture(['A1SV']);ok(f.cast('A1SV'));const j=jobs(f.g,'anduin_soul')[0],start=j.dummy.worldX;f.at(10.36);assert.equal(j.steps,9);assert.ok(j.dummy.worldX<start+720/300);assert.ok(j.dummy.worldX>start);assert.equal(j.dummy.status.sourceRemoved,true);
});

test('will changes the event result while later alchemist threshold still reads original local damage',()=>{
 const f=fixture(['A1SQ']),alchemist=f.make(.3,'defender','n091');alchemist.hp=2580;f.g._sourceDamageTriggerDepth=0;near(f.g._hurt(alchemist,100,f.t,{spell:true,universal:true}),70);near(alchemist.hp,2510);assert.ok(alchemist.buffs.some(b=>b.key==='alchemist-chemical-rage'));
});
test('bond grants belong to combat handles and are not written back into the building',()=>{
 const f=fixture([]),b={id:'anduin-building',unitId:'v14_n087',permanentAbilityIds:[]};f.g.state.players[0].buildings=[b];f.a.buildingId=b.id;f.make(0,'defender','h0PZ');f.bond(b);f.at(11);assert.ok(has(f.a,'A1ST'));assert.deepEqual(b.permanentAbilityIds,[]);const next=f.make(0,'defender','h0W3');initializeSourceClassCombat(f.g,b,next);assert.equal(has(next,'A1ST'),false);assert.ok(jobs(f.g,'anduin_bond').some(j=>j.sourceId===next.id));
});
