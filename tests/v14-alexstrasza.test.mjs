import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Game} from '../dist/engine.js';
import {UNITS,UNIT_TEMPLATES} from '../dist/data.js';
import {recordEggCompletion} from '../dist/egg-rules.js';
import {alexstraszaWidgetDeath} from '../dist/alexstrasza-rules.js';
import {compileSkills,castManualSourceSkill,manualSourceSkills,tickSourceScriptJobs,beforeSourceDamage,initializeSourceClassCombat,sourceClassAttackDamageEvent,sourceDeath,sourceAuraEffects} from '../dist/skills.js';
const clone=x=>JSON.parse(JSON.stringify(x)),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`),ok=r=>assert.equal(r.ok,true,r.message);
const jobs=(g,type)=>g.state.sourceSkillJobs.filter(j=>j.type===type&&!j.done),has=(e,id)=>e.skillSpecs.some(s=>s.id===id);
function skills(e,ids){e.skillSpecs=compileSkills({abilityIds:ids,skillVersion:'v14.1A5',distanceScale:1/3});e.skillStates=Object.fromEntries(ids.map(id=>[id,{readyAt:0,casts:0}]));}
function fixture(ids=['A16T'],code='h0QZ'){
 const g=new Game({mode:'sandbox',seed:64});g.state.phase='combat';g.state.wave=31;g.state.time=10;g.state.entities=[];g._spawnQueue=[];g._aiAct=()=>{};g._sourceDamageTriggerDepth=1;for(const p of g.state.players)p.eggHistory.firstWaveClosed=true;for(const k of g.state.kings)k.worldX=k.worldY=10000;
 const point={x:5,y:8},make=(dx=.5,side='monster',raw='h03E')=>{const e=g._entity(UNIT_TEMPLATES[raw],{side,ownerId:side==='defender'?0:4,sourceNativeOwnerId:side==='defender'?8:9,userData:side==='defender'?1:5,team:side==='defender'?0:1,battleTeam:0,laneId:0,sourceLaneId:0,worldX:point.x+dx,worldY:point.y});e.hp=e.maxHp=10000;e.mana=e.maxMana=1000;e.armor=0;e.sourceArmorTypeRaw='none';e.armorType='unarmored';e.ability=null;e.hpRegen=e.manaRegen=e.moveSpeed=0;e.attackCd=99999;e.buffs=[];e.traits=[];skills(e,[]);g.state.entities.push(e);return e;};
 const a=make(0,'defender',code),t=make();skills(a,ids);
 return {g,a,t,make,cast:(id,target=t)=>castManualSourceSkill(g,a,id,id==='A16T'?{point:{x:target.worldX,y:target.worldY}}:{target}),at:n=>{g.state.time=n;tickSourceScriptJobs(g);},kill:e=>g._killUnit(e),register:(ids=['A16S','A16U','A170','A172'])=>initializeSourceClassCombat(g,{sourceRawcode:'test',abilityIds:ids},a),hit:(e,amount=1)=>g._hurt(e,amount,t,{spell:true,universal:true}),attack:(amount=77)=>sourceClassAttackDamageEvent(g,t,a,{weapon:true},amount)};
}
test('source evidence fixes exact callbacks native fields and missing blessing grant',()=>{
 const p=JSON.parse(readFileSync(new URL('../reference/alexstrasza-evidence.json',import.meta.url))),b=readFileSync(new URL('../reference/v14-source/raw_extracted/war3map.j',import.meta.url)),lines=b.toString('latin1').split('\n');assert.equal(createHash('sha256').update(b).digest('hex'),p.source.sha256);for(const x of p.sourceEvidence)assert.equal(lines[x.line-1].replace(/\r$/,''),x.text);assert.equal(p.unusedPurifyFunctionOccurrences,1);assert.equal(p.abilities.A170.Cost1,'15');assert.equal(p.abilities.A16Y.DataB1,'0.3');assert.ok(!p.units.h0QZ.abilList.includes('A170'));assert.ok(!p.units.h0R0.abilList.includes('A16W'));
 const c=JSON.parse(readFileSync(new URL('../reference/content-coverage.json',import.meta.url)));assert.ok(c.playerRuntimeAbilities.some(x=>x.sourceRawcode==='h0R0'&&x.abilityIds.includes('A16W')));for(const scope of ['playerSkills','battleSkills'])for(const id of ['A16S','A16T','A16U','A170','A172','A16V','A16W','A16Z','A16Y'])assert.equal(c[scope].abilities.find(a=>a.rawcode===id).status,'partial',id);
});
test('manual blossom flame and purify expose source mana cooldown and target types',()=>{
 const f=fixture(['A16T','A16V','A16W']);assert.deepEqual(manualSourceSkills(f.g,f.a).map(s=>[s.id,s.targetKind,s.manaCost,s.cooldown]),[['A16T','point',10,15],['A16V','enemy',10,13],['A16W','enemy',20,999]]);
 ok(f.cast('A16T'));near(f.a.mana,990);assert.equal(f.cast('A16T').ok,false);near(f.a.skillStates.A16T.readyAt,25);
});
test('formal cast command enforces ownership and pause before paying',()=>{
 const f=fixture();assert.equal(f.g.command('cast',{entityId:f.a.id,skillId:'A16T',worldX:5,worldY:8,playerId:1}).ok,false);f.g.state.paused=true;assert.equal(f.g.command('cast',{entityId:f.a.id,skillId:'A16T',worldX:5,worldY:8}).ok,false);f.g.state.paused=false;ok(f.g.command('cast',{entityId:f.a.id,skillId:'A16T',worldX:5,worldY:8}));
});
test('invalid enemy targets range resources and control never create paid flame jobs',()=>{
 for(const mode of ['ally','dead','range','mana','silence','paused','Avul','Aloc']){const f=fixture(['A16V']);if(mode==='ally'){f.t.side=f.a.side;f.t.team=f.a.team;}if(mode==='dead')f.t.hp=0;if(mode==='range')f.t.worldX+=5;if(mode==='mana')f.a.mana=9;if(mode==='silence')f.a.status.silenceUntil=11;if(mode==='paused')f.a.status.sourcePaused=true;if(['Avul','Aloc'].includes(mode))skills(f.t,[mode]);const mana=f.a.mana;assert.equal(f.cast('A16V').ok,false,mode);near(f.a.mana,mana);assert.equal(f.g.state.sourceSkillJobs.length,0);}
});
test('ancient spell effects still pay native fees but cannot start script jobs',()=>{
 const f=fixture(['A16T','A16V','A16W']);f.a.isAncient=true;for(const id of ['A16T','A16V','A16W'])ok(f.cast(id));near(f.a.mana,960);assert.equal(f.g.state.sourceSkillJobs.length,0);assert.ok(has(f.a,'A16W'));
});
test('blossom heals60immediately eight times through seven seconds with fixed center',()=>{
 const f=fixture(),friend=f.make(.5,'defender');friend.hp=1000;ok(f.cast('A16T'));f.at(10);near(friend.hp,1060);f.a.worldX+=10;f.t.worldX+=10;f.at(17);near(friend.hp,1480);near(f.t.hp,10000);assert.equal(jobs(f.g,'alex_blossom').length,0);
});
test('blossom600radius includes allies self and king but excludes Avul and dead targets',()=>{
 const f=fixture(),inside=f.make(2.5,'defender'),outside=f.make(2.501,'defender'),inv=f.make(0,'defender'),dead=f.make(0,'defender');inside.hp=outside.hp=inv.hp=f.a.hp=1000;dead.hp=0;skills(inv,['Avul']);const k=f.g.state.kings[0];k.worldX=5.5;k.worldY=8;k.hp=100;ok(f.cast('A16T'));f.at(10);near(inside.hp,1060);near(outside.hp,1000);near(inv.hp,1000);near(dead.hp,0);near(f.a.hp,1060);near(k.hp,160);
});
test('blossom persists after caster death and never raises a dead ally',()=>{
 const f=fixture(),friend=f.make(.5,'defender');friend.hp=1000;ok(f.cast('A16T'));f.kill(f.a);f.at(17);near(friend.hp,1480);near(f.a.hp,0);
});
test('life grant is registered from building abilities, not merely the combat icon',()=>{
 const f=fixture(['A16S']);f.register([]);f.a.hp=5000;f.at(10);assert.equal(jobs(f.g,'alex_grant').length,0);f.register(['A16S']);f.register(['A16S']);assert.equal(jobs(f.g,'alex_scan').length,1);
});
test('life crossing65percent sacrifices half and heals15percent of sacrifice four times',()=>{
 const f=fixture(['A16S']),friend=f.make(.5,'defender');f.register(['A16S']);f.hit(friend,3500);near(f.a.hp,5000);near(friend.hp,6500);assert.equal(f.a.status.sourcePaused,true);f.at(10);near(f.a.hp,5750);near(friend.hp,7250);f.at(13);near(f.a.hp,8000);near(friend.hp,9500);assert.equal(f.a.status.sourcePaused,false);assert.equal(jobs(f.g,'alex_grant').length,0);
});
test('life grant threshold snapshots maximum health at registration',()=>{
 const f=fixture(['A16S']),friend=f.make(.5,'defender');f.register(['A16S']);friend.hp=friend.maxHp=20000;f.hit(friend,7000);assert.equal(jobs(f.g,'alex_grant').length,0);f.hit(friend,6500);assert.equal(jobs(f.g,'alex_grant').length,1);
});
test('successful life watcher stays removed until that unit leaves and reenters600radius',()=>{
 const f=fixture(['A16S']),friend=f.make(.5,'defender');f.register(['A16S']);f.hit(friend,3500);f.at(25);f.a.hp=10000;friend.hp=10000;f.hit(friend,3500);assert.equal(jobs(f.g,'alex_grant').length,0);friend.worldX=20;f.at(26);friend.worldX=5.5;friend.hp=10000;f.at(27);f.hit(friend,3500);assert.equal(jobs(f.g,'alex_grant').length,1);
});
test('cooldown failure retains watcher but expiry belowthreshold doesnot retrigger',()=>{
 const f=fixture(['A16S']),one=f.make(.5,'defender'),two=f.make(.6,'defender');f.register(['A16S']);f.hit(one,3500);f.at(13);f.hit(two,4000);assert.ok(jobs(f.g,'alex_watch').some(j=>j.targetId===two.id));f.at(25);assert.equal(jobs(f.g,'alex_grant').length,0);two.hp=10000;f.hit(two,4000);assert.equal(jobs(f.g,'alex_grant').length,1);
});
test('a watched ally may trigger after leaving range but healing follows current caster position',()=>{
 const f=fixture(['A16S']),friend=f.make(.5,'defender');f.register(['A16S']);friend.worldX=20;f.at(10);f.hit(friend,3500);f.at(10);near(friend.hp,6500);near(f.a.hp,5750);f.a.worldX=20;f.at(13);near(friend.hp,8750);
});
test('grant ignores spell silence and mana but lethal or removed watchers cannot trigger it',()=>{
 const f=fixture(['A16S']),friend=f.make(.5,'defender');f.a.mana=0;f.a.status.silenceUntil=100;f.register(['A16S']);f.hit(friend,3500);near(f.a.mana,0);assert.equal(jobs(f.g,'alex_grant').length,1);
 const x=fixture(['A16S']),t=x.make(.5,'defender');x.register(['A16S']);x.hit(t,20000);assert.equal(jobs(x.g,'alex_grant').length,0);
});
test('grant pulse survives caster death while range and life listeners are removed',()=>{
 const f=fixture(['A16S']),friend=f.make(.5,'defender');f.register(['A16S']);f.hit(friend,3500);f.kill(f.a);f.at(13);near(friend.hp,9500);near(f.a.hp,0);assert.equal(jobs(f.g,'alex_scan').length,0);assert.equal(jobs(f.g,'alex_watch').length,0);
});
test('life links wait0point1 and require matching nativeowner and userdata with no range gate',()=>{
 const f=fixture(['A16U']),wrong=f.make(.1,'defender','h0F1'),far=f.make(100,'defender','h0F1');wrong.userData=2;far.ownerId=3;far.maxHp=far.hp=2000;f.register(['A16U']);f.at(10.099);near(f.a.maxHp,10000);f.at(10.1);near(f.a.maxHp,12000);near(far.maxHp,12000);assert.equal(jobs(f.g,'alex_link').length,1);near(wrong.maxHp,10000);
});
test('the two keeper prototypes link independently in source order',()=>{
 const f=fixture(['A16U']),skin=f.make(.1,'defender','h0MY'),base=f.make(.1,'defender','h0F1');skin.maxHp=skin.hp=2000;base.maxHp=base.hp=3000;f.register(['A16U']);f.at(10.1);near(skin.maxHp,12000);near(base.maxHp,15000);near(f.a.maxHp,15000);assert.deepEqual(f.a.status.alexstrasza.links,[skin.id,base.id]);
});
test('life link averages current life before damage rather than halving incoming damage',()=>{
 const f=fixture(['A16U']),friend=f.make(.1,'defender','h0F1');f.register(['A16U']);f.at(10.1);f.a.hp=1000;friend.hp=5000;f.hit(friend,100);near(f.a.hp,3000);near(friend.hp,2900);f.a.hp=1000;friend.hp=5000;f.hit(f.a,100);near(f.a.hp,2900);near(friend.hp,3000);
});
test('life link timer never continuously balances unequal life',()=>{
 const f=fixture(['A16U']),friend=f.make(.1,'defender','h0F1');f.register(['A16U']);f.at(10.1);f.a.hp=1000;friend.hp=5000;f.at(11);near(f.a.hp,1000);near(friend.hp,5000);
});
test('source death restores partner original maximum and fills it',()=>{
 const f=fixture(['A16U']),friend=f.make(.1,'defender','h0F1');friend.maxHp=friend.hp=2000;f.register(['A16U']);f.at(10.1);friend.hp=500;f.kill(f.a);near(friend.maxHp,2000);near(friend.hp,2000);assert.equal(jobs(f.g,'alex_link').length,0);
});
test('partner death kills source and still creates its registered dragon exactly once',()=>{
 const f=fixture(['A16U','A172']),friend=f.make(.1,'defender','h0F1');f.register(['A16U','A172']);f.at(10.1);f.kill(friend);near(f.a.hp,0);assert.equal(f.g.state.entities.filter(e=>e.combatRawcode==='h0R0').length,1);sourceDeath(f.g,f.a,null);assert.equal(f.g.state.entities.filter(e=>e.combatRawcode==='h0R0').length,1);
});
test('dead keeper remains enumerable without a fabricated resurrection',()=>{
 const f=fixture(['A16U']),friend=f.make(.1,'defender','h0F1');f.register(['A16U']);f.kill(friend);f.g.state.entities=f.g.state.entities.filter(t=>t!==friend);f.at(10.1);near(f.a.maxHp,20000);near(friend.hp,0);f.at(10.13);assert.equal(jobs(f.g,'alex_link').length,0);
});
test('the first eligible keeper is selected once and doesnot rescan later spawns',()=>{
 const f=fixture(['A16U']);f.register(['A16U']);f.at(10.1);f.make(.1,'defender','h0F1');f.at(20);assert.equal(jobs(f.g,'alex_link').length,0);
 const x=fixture(['A16U']),one=x.make(.1,'defender','h0F1'),two=x.make(.2,'defender','h0F1');x.register(['A16U']);x.at(10.1);assert.equal(jobs(x.g,'alex_link')[0].targetId,one.id);near(two.maxHp,10000);
});
test('native-owner mismatch cannot be replaced by same economic player',()=>{
 const f=fixture(['A16U']),friend=f.make(.1,'defender','h0F1');friend.sourceNativeOwnerId=9;f.register(['A16U']);f.at(10.1);assert.equal(jobs(f.g,'alex_link').length,0);
});
test('missing A170 on normal combat body prevents natural blessing despite building registration',()=>{
 const f=fixture(),friend=f.make(.1,'defender');f.register(['A170']);friend.hp=4000;f.hit(friend,100);near(friend.hp,3900);near(f.a.mana,1000);assert.equal(f.a.status.alexstrasza.blessingOrder.ok,false);
});
test('natural blessing orders before its health test and pays on a healthy ally',()=>{
 const f=fixture(['A170']),friend=f.make(.1,'defender');f.register(['A170']);f.hit(friend,100);near(f.a.mana,985);near(friend.hp,9900);near(f.a.skillStates.A170.readyAt,28);assert.equal(f.a.status.alexstrasza.blessingOrder.ok,true);
});
test('a granted natural blessing spends15percent maxlife and heals before current damage',()=>{
 const f=fixture(['A170']),friend=f.make(.1,'defender');f.register(['A170']);friend.hp=5000;f.a.hp=8000;f.hit(friend,100);near(f.a.hp,6500);near(friend.hp,9900);near(f.a.mana,985);
});
test('natural blessing rejects source15percent and still supports self target above it',()=>{
 const f=fixture(['A170']),friend=f.make(.1,'defender');f.register(['A170']);f.a.hp=1500;friend.hp=4000;f.hit(friend,100);near(friend.hp,3900);near(f.a.hp,1500);near(f.a.mana,985);
 const x=fixture(['A170']);x.register(['A170']);x.a.hp=5000;x.hit(x.a,100);near(x.a.hp,9900);
});
test('flame launches3at0onepoint2twopoint4 while paying10andpausing until third',()=>{
 const f=fixture(['A16V']);ok(f.cast('A16V'));near(f.a.mana,990);assert.equal(f.a.status.sourcePaused,true);f.at(10);assert.equal(jobs(f.g,'alex_fireball').length,1);f.at(11.2);assert.equal(jobs(f.g,'alex_fireball').length,1);assert.equal(f.a.status.sourcePaused,true);f.at(12.4);assert.equal(jobs(f.g,'alex_shoot').length,0);assert.equal(f.a.status.sourcePaused,false);f.at(13.6);assert.equal(jobs(f.g,'alex_fireball').length,0);
});
test('flame projectile moves50perstep damages160nonweaponfire and keeps repeated hits',()=>{
 const f=fixture(['A16V']);const calls=[],hurt=f.g._hurt.bind(f.g);f.g._hurt=(t,n,e,o)=>{calls.push(o);return hurt(t,n,e,o);};ok(f.cast('A16V'));f.at(10);const j=jobs(f.g,'alex_fireball')[0];near(j.dummy.worldX,5+50/300);near(f.t.hp,9840);f.at(10.04);near(f.t.hp,9680);assert.ok(calls.every(o=>o.nativeDamageType==='fire'&&o.attackType==='normal'&&!o.weapon));assert.equal(j.dummy.isSummon,false);assert.equal(j.dummy.userData,0);assert.equal(f.g.state.entities.includes(j.dummy),false);
});
test('flame stops at29steps then removesat1point2 without a final damage pass',()=>{
 const f=fixture(['A16V']);f.t.worldX=5;f.t.worldY=8.5;ok(f.cast('A16V'));f.at(10);const j=jobs(f.g,'alex_fireball')[0];f.at(11.12);assert.equal(j.steps,29);near(j.dummy.worldY,8+1450/300);const hp=f.t.hp;f.at(11.16);near(f.t.hp,hp);assert.equal(j.dummy.status.sourceRemoved,undefined);f.at(11.2);assert.equal(j.dummy.status.sourceRemoved,true);
});
test('flame keeps cast angle while later launches use caster new position',()=>{
 const f=fixture(['A16V']);ok(f.cast('A16V'));f.at(10);f.a.worldX=6;f.a.worldY=9;f.t.worldY=11;f.at(11.2);const j=jobs(f.g,'alex_fireball')[0];near(j.angle,0);near(j.dummy.worldX,6+50/300);near(j.dummy.worldY,9);
});
test('caster death doesnot cancel queuedflames while dummywidgetdeath stops its charge',()=>{
 const f=fixture(['A16V']);ok(f.cast('A16V'));f.at(10);const j=jobs(f.g,'alex_fireball')[0];f.kill(j.dummy);f.kill(f.a);f.at(12.4);assert.equal(j.steps,1);assert.equal(jobs(f.g,'alex_fireball').length,1);f.at(13.6);assert.equal(jobs(f.g,'alex_fireball').length,0);
});
test('purify removesability and after1second damages780in900radius900ahead once',()=>{
 const f=fixture(['A16W']),inside=f.make(6),outside=f.make(6.001),friend=f.make(3,'defender');friend.hp=1000;ok(f.cast('A16W'));near(f.a.mana,980);assert.equal(has(f.a,'A16W'),false);assert.equal(f.a.status.sourcePaused,true);f.at(10.999);near(f.t.hp,10000);f.at(11);near(f.t.hp,9220);near(inside.hp,9220);near(outside.hp,10000);near(friend.hp,1000);assert.equal(f.a.status.sourcePaused,false);f.at(20);near(f.t.hp,9220);
});
test('purify uses caster current position and survives casterdeath',()=>{
 const f=fixture(['A16W']),remote=f.make(6);ok(f.cast('A16W'));f.a.worldX=8;f.kill(f.a);f.at(11);near(f.t.hp,10000);near(remote.hp,9220);near(f.a.hp,0);
});
test('automatic blossom precedes flame and targetfirst never fallsback after failure',()=>{
 const f=fixture(['A16T','A16V','A16W']);f.g._sourceDamageTriggerDepth=0;f.a.mana=20;beforeSourceDamage(f.g,f.t,1,f.a);near(f.a.mana,0);assert.equal(jobs(f.g,'alex_blossom').length,1);assert.equal(jobs(f.g,'alex_shoot').length,1);assert.equal(jobs(f.g,'alex_purify').length,0);
 const x=fixture(['A16T']);skills(x.t,['A16T']);x.t.mana=0;x.g._sourceDamageTriggerDepth=0;beforeSourceDamage(x.g,x.t,1,x.a);near(x.a.mana,1000);assert.equal(jobs(x.g,'alex_blossom').length,0);
});
test('zero friendly self and suppressed main damage cannot automatically cast',()=>{
 for(const mode of ['zero','friendly','self','suppressed','A2Y7']){const f=fixture(['A16T']);f.g._sourceDamageTriggerDepth=mode==='suppressed'?1:0;if(mode==='friendly'){f.t.side=f.a.side;f.t.team=f.a.team;}if(mode==='A2Y7')skills(f.a,['A16T','A2Y7']);beforeSourceDamage(f.g,mode==='self'?f.a:f.t,mode==='zero'?0:1,f.a);near(f.a.mana,1000);assert.equal(jobs(f.g,'alex_blossom').length,0);}
});
test('unitdeath spawns a fresh5000hp dragon with copiedowner tag and20secondunlock',()=>{
 const f=fixture(['A172']);f.register(['A172']);f.g.state.alexstraszaArmorStacks={1:7};f.a.mana=3;f.a.facing=45;f.kill(f.a);const d=f.g.state.entities.find(e=>e.combatRawcode==='h0R0');assert.ok(d);near(d.hp,5000);near(d.armor,10);near(d.damage,507);near(d.mana,20);assert.equal(d.sourceNativeOwnerId,8);assert.equal(d.userData,1);assert.equal(d.isSummon,false);assert.equal(d.buildingId,undefined);assert.equal(has(d,'A16W'),false);assert.equal(has(d,'A172'),false);f.at(29.999);assert.equal(has(d,'A16W'),false);f.at(30);assert.equal(has(d,'A16W'),true);f.kill(d);assert.equal(f.g.state.entities.filter(e=>e.combatRawcode==='h0R0').length,1);
});
test('holyappearanceusesitsmodelwithoutinventingflyingmovementorotherstats',()=>{
 const f=fixture(['A172'],'h0WG');f.register(['A172']);f.kill(f.a);const d=f.g.state.entities.find(e=>e.combatRawcode==='h0R0');assert.equal(d.status.alexstrasza.dragon.appearance,'LJQ_alexstrasza02.mdx');assert.equal(d.status.alexstrasza.dragon.scale,undefined);assert.equal(d.sourceRawFields.movetp,'foot');assert.equal(d.targetType,'ground');
});
test('revive registration requires buildinganddoesnotretrofit a combat-only icon',()=>{
 const f=fixture(['A172']);f.register([]);f.kill(f.a);assert.equal(f.g.state.entities.some(e=>e.combatRawcode==='h0R0'),false);
});
test('dynamicpurifyunlockstillwritesdeadhandlewithoutresurrection',()=>{
 const f=fixture(['A172']);f.register(['A172']);f.kill(f.a);const d=f.g.state.entities.find(e=>e.combatRawcode==='h0R0');f.kill(d);f.g.state.entities=f.g.state.entities.filter(e=>e!==d);f.at(30);assert.ok(has(d,'A16W'));near(d.hp,0);
});
test('wrath adds25percent weaponuniversal and preserves original eventamount',()=>{
 const f=fixture(['A16Z']);f.a.damage=100;f.a.sourceRawFields={damage_min_1:'90',damage_max_1:'110',damage_avg_1:'100'};f.g._random=()=>.5;near(f.attack(77),77);near(f.t.hp,9975);near(f.a.status.alexstrasza.wrath.sample,100);
});
test('wrath100heal and inclusive45armor do not require a kill',()=>{
 for(const [roll,armor]of [[.449,0],[.45,1]]){const f=fixture(['A16Z']);f.a.damage=100;f.a.sourceRawFields={damage_min_1:'100',damage_max_1:'100',damage_avg_1:'100'};f.a.hp=1000;f.t.hp=125;const draws=[0,roll];f.g._random=()=>draws.shift();f.attack();near(f.t.hp,100);near(f.a.hp,1100);near(f.a.armor,armor);assert.equal(draws.length,0);}
});
test('wrathaboveattackthresholdskipshealingandsecondrandomdraw',()=>{
 const f=fixture(['A16Z']);f.a.damage=100;f.a.sourceRawFields={damage_min_1:'100',damage_max_1:'100',damage_avg_1:'100'};f.a.hp=1000;f.t.hp=125.01;let draws=0;f.g._random=()=>{draws++;return 1;};f.attack();near(f.a.hp,1000);near(f.a.armor,0);assert.equal(draws,1);
});
test('wrath40capissharedbyuserdataandstillrollsatcap',()=>{
 const f=fixture(['A16Z']);f.a.damage=100;f.a.sourceRawFields={damage_min_1:'100',damage_max_1:'100',damage_avg_1:'100'};f.g.state.alexstraszaArmorStacks={1:39};let calls=0;f.g._random=()=>{calls++;return 1;};f.t.hp=100;f.attack();near(f.a.armor,1);assert.equal(f.g.state.alexstraszaArmorStacks[1],40);f.t.hp=100;f.attack();near(f.a.armor,1);assert.equal(calls,4);f.a.userData=2;f.t.hp=100;f.attack();near(f.a.armor,2);assert.equal(f.g.state.alexstraszaArmorStacks[2],1);
});
test('wrathrespondstozeroandalliedweaponeventsbutnotordinaryspellornestedbusy',()=>{
 const f=fixture(['A16Z']);f.a.damage=100;f.a.sourceRawFields={damage_min_1:'100',damage_max_1:'100',damage_avg_1:'100'};f.t.side=f.a.side;f.t.team=f.a.team;f.attack(0);near(f.t.hp,9975);sourceClassAttackDamageEvent(f.g,f.t,f.a,{spell:true},100);near(f.t.hp,9975);f.a.status.sourceNativeAttackBusy=true;f.attack();near(f.t.hp,9975);
});
test('missingwrathattackboundsretainunknownP8forbronzeratherthanfabricatingdamage',()=>{
 const f=fixture(['A16Z','A150']);f.a.combatRawcode='h0QR';f.a.sourceRawFields={};near(f.attack(77),77);near(f.t.hp,10000);assert.equal(f.a.status.bronzeDamage.boundary,'unimplemented-prior-P8-branch');
});
test('dragonarmorandauraattackhastedifferinradius',()=>{
 const f=fixture(['A16X','A16Y']),inside=f.make(2,'defender'),outside=f.make(2.001,'defender');near(sourceAuraEffects(f.g,inside,[f.a]).armor,1);near(sourceAuraEffects(f.g,inside,[f.a]).haste,.3);near(sourceAuraEffects(f.g,outside,[f.a]).armor,1);near(sourceAuraEffects(f.g,outside,[f.a]).haste,0);near(sourceAuraEffects(f.g,inside,[f.a]).move,0);
});
test('pausedgamefreezesalllifelinksandflametimers',()=>{
 const f=fixture(['A16T','A16V','A172']);f.register(['A172']);ok(f.cast('A16T'));ok(f.cast('A16V'));f.g.state.paused=true;const snap=clone(f.g.snapshot());f.g.tick(3);assert.deepEqual(clone(f.g.snapshot()),snap);
});
test('liveandretainedhandlesrebindaftersnapshotincludingtwoindependentlinks',()=>{
 const f=fixture(['A16T','A16U']),one=f.make(.1,'defender','h0MY'),two=f.make(.2,'defender','h0F1');f.register(['A16U']);f.at(10.1);ok(f.cast('A16T'));f.at(10.1);const restored=Game.fromSnapshot(clone(f.g.snapshot()));restored._sourceDamageTriggerDepth=1;const a=restored.state.entities.find(e=>e.id===f.a.id),t=restored.state.entities.find(e=>e.id===f.t.id),linked=restored.state.entities.find(e=>e.id===one.id);f.a.hp=a.hp=5000;one.hp=linked.hp=10000;f.g._hurt(one,100,f.t,{spell:true,universal:true});restored._hurt(linked,100,t,{spell:true,universal:true});f.at(17.1);restored.state.time=17.1;tickSourceScriptJobs(restored);near(f.a.hp,a.hp);near(one.hp,linked.hp);assert.ok(jobs(restored,'alex_link').every(j=>j.source===a));assert.equal(jobs(restored,'alex_link')[1].target.id,two.id);
});
test('coarseflamecatchuppreservesorderedhitsandmultiplelaunches',()=>{
 const one=fixture(['A16V']),two=fixture(['A16V']);ok(one.cast('A16V'));ok(two.cast('A16V'));one.at(13.6);for(let i=0;i<=360;i++)two.at(10+i*.01);near(one.t.hp,two.t.hp);assert.equal(one.g.state.sourceSkillJobs.length,0);assert.equal(two.g.state.sourceSkillJobs.length,0);
});
test('actualhistoryunlocks600goldred-dragonupgradewithouttrainingandregistersrealcombatbody',()=>{
 const g=new Game({mode:'sandbox'}),p=g.state.players[0];p.roster=['v14_h01B'];p.entitlements.h220=1;ok(g.command('build',{unitId:'v14_h01B',col:2,row:4}));ok(g.command('sandboxComplete'));const b=p.buildings[0];assert.equal(g.command('upgrade',{buildingId:b.id,unitId:'v14_n066'}).ok,false);
 for(const code of ['h0F6','h01N'])recordEggCompletion(p,UNIT_TEMPLATES[code],{buildingId:'completed-'+code,wave:1});assert.equal(p.technologies.R09D,1);const gold=p.gold;ok(g.command('upgrade',{buildingId:b.id,unitId:'v14_n066'}));near(gold-p.gold,600);ok(g.command('sandboxComplete'));ok(g.command('ready'));const e=g.state.entities.find(e=>e.buildingId===b.id);assert.equal(e.combatRawcode,'h0QZ');assert.equal(has(e,'A170'),false);assert.ok(jobs(g,'alex_revive').some(j=>j.sourceId===e.id));assert.deepEqual(manualSourceSkills(g,e).map(s=>s.id),['A16T']);
});
test('fullnormalandholybuildingregistrationsincludeallfourpassiveroutes',()=>{
 for(const code of ['n066','n08E']){const f=fixture([],code==='n066'?'h0QZ':'h0WG');initializeSourceClassCombat(f.g,{unitId:'v14_'+code},f.a);assert.equal(jobs(f.g,'alex_scan').length,1);assert.equal(jobs(f.g,'alex_find').length,2);assert.equal(jobs(f.g,'alex_blessing').length,1);assert.equal(jobs(f.g,'alex_revive').length,1);}
});
test('widgetdeathalonewaitshalfasecondwithoutcreatingdragon',()=>{
 const f=fixture(['A172']);f.register(['A172']);alexstraszaWidgetDeath(f.g,f.a,{});f.at(10.499);assert.equal(jobs(f.g,'alex_revive').length,1);f.at(10.5);assert.equal(jobs(f.g,'alex_revive').length,0);assert.equal(f.g.state.entities.some(e=>e.combatRawcode==='h0R0'),false);
});
test('partnerdeathreenterslinkviakillsourceandrestoresdeadpartnermaximum',()=>{
 const f=fixture(['A16U']),friend=f.make(.1,'defender','h0F1');friend.maxHp=friend.hp=2000;f.register(['A16U']);f.at(10.1);near(friend.maxHp,12000);f.kill(friend);near(friend.hp,0);near(friend.maxHp,2000);near(f.a.hp,0);
});
test('earlierAnduinorderskeeppriorityoverlaterred-dragonorders',()=>{
 const f=fixture(['A1SP','A16T']);f.a.mana=18;f.g._sourceDamageTriggerDepth=0;beforeSourceDamage(f.g,f.t,1,f.a);near(f.a.mana,0);assert.equal(jobs(f.g,'anduin_rain').length,1);assert.equal(jobs(f.g,'alex_blossom').length,0);
});
test('ordinarywaveandcontinuousjoinpreserveplayerarmorwhileaNewGamehasnone',()=>{
 const f=fixture(['A16T']);f.g.state.alexstraszaArmorStacks={1:23};ok(f.cast('A16T'));const j=jobs(f.g,'alex_blossom')[0];f.g.state.mode='standard';f.g._advanceContinuous();assert.ok(f.g.state.sourceSkillJobs.includes(j));assert.equal(f.g.state.alexstraszaArmorStacks[1],23);const restored=Game.fromSnapshot(clone(f.g.snapshot()));assert.equal(restored.state.alexstraszaArmorStacks[1],23);assert.equal(new Game({mode:'sandbox'}).state.alexstraszaArmorStacks,undefined);
 const z=fixture();ok(z.cast('A16T'));ok(z.g.command('sandboxReset'));assert.equal(z.g.state.sourceSkillJobs.length,0);
});
test('naturalarenaticksfinishflameswithfinitecombatstateandnoauxiliaryarmy',()=>{
 const f=fixture(['A16V']);f.g.state.roundMode='arena';f.g.state.arenaRemaining=120;ok(f.cast('A16V'));f.g.tick(4);assert.equal(jobs(f.g,'alex_fireball').length,0);assert.equal(jobs(f.g,'alex_shoot').length,0);assert.equal(f.g.state.entities.some(e=>e.combatRawcode==='e008'),false);assert.ok(f.g.state.entities.every(e=>Number.isFinite(e.hp)&&Number.isFinite(e.damage)));assert.ok(f.t.hp<10000);
});
test('savingaftercastercleanupkeepsonehandleforoverlappinghealingandflames',()=>{
 const f=fixture(['A16T','A16V']);ok(f.cast('A16T'));ok(f.cast('A16V'));f.at(10);f.kill(f.a);f.g.state.entities=f.g.state.entities.filter(e=>e!==f.a);const g=Game.fromSnapshot(clone(f.g.snapshot()));const js=g.state.sourceSkillJobs.filter(j=>j.type.startsWith('alex_'));assert.ok(js.every(j=>j.source===js[0].source));g._sourceDamageTriggerDepth=1;g.state.time=17;tickSourceScriptJobs(g);assert.equal(g.state.sourceSkillJobs.length,0);
});
