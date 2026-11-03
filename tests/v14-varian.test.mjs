import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Game} from '../dist/engine.js';
import {UNIT_TEMPLATES} from '../dist/data.js';
import {recordEggCompletion} from '../dist/egg-rules.js';
import {compileSkills,initializeSourceClassCombat,sourceDamageListeners,sourceRegisteredDamageEvent,sourceClassAttackDamageEvent,tickSourceScriptJobs,sourceAuraEffects,sourceWeapon,sourceAttackStart,sourceOnHit} from '../dist/skills.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-4,`${a} != ${b}`),clone=x=>JSON.parse(JSON.stringify(x)),has=(e,id)=>e.skillSpecs.some(s=>s.id===id);
const skills=(e,ids)=>{e.skillSpecs=compileSkills({abilityIds:ids,skillVersion:'v14.1A5',distanceScale:1/3});e.skillStates=Object.fromEntries(ids.map(id=>[id,{readyAt:0,casts:0}]));};
const jobs=(g,type)=>g.state.sourceSkillJobs.filter(j=>j.type===type&&!j.done);
function fixture(ids=['A11V','A11W','A11X','A11Y']){
 const g=new Game({mode:'sandbox',seed:62});g.state.entities=[];g.state.sourceSkillJobs=[];g.state.phase='combat';g.state.wave=31;g.state.time=10;g._random=()=>.25;g._sourceDamageTriggerDepth=1;g._aiAct=()=>{};for(const k of g.state.kings)k.worldX=k.worldY=10000;
 const make=(dx=.5,side='monster',code='h03E')=>{const e=g._entity(UNIT_TEMPLATES[code],{side,team:side==='defender'?0:1,battleTeam:0,ownerId:side==='defender'?0:4,laneId:0,sourceLaneId:0,worldX:5+dx,worldY:8});e.hp=e.maxHp=10000;e.mana=0;e.maxMana=120;e.damage=100;e.armor=0;e.armorType='unarmored';e.sourceArmorTypeRaw='none';e.attackCd=99999;e.moveSpeed=e.speed=e.hpRegen=e.manaRegen=0;e.ability=null;e.buffs=[];e.traits=[];e.isNativeHero=e.isHero=false;e.sourceRawFields={...e.sourceRawFields,damage_min_1:'90',damage_max_1:'110',damage_avg_1:'100'};skills(e,[]);g.state.entities.push(e);return e;};
 const a=make(0,'defender','h0PZ'),t=make();skills(a,ids);initializeSourceClassCombat(g,{unitId:'v14_h0Q0'},a);
 return {g,a,t,make,event:(n=0)=>sourceRegisteredDamageEvent(g,a,sourceDamageListeners(g,a),n),at:n=>{g.state.time=n;tickSourceScriptJobs(g);},attack:(n=100,options={})=>sourceClassAttackDamageEvent(g,t,a,options,n)};
}
test('source evidence pins404lines and native fields without tooltip defaults',()=>{
 const e=JSON.parse(readFileSync(new URL('../reference/varian-evidence.json',import.meta.url))),b=readFileSync(new URL('../reference/v14-source/raw_extracted/war3map.j',import.meta.url)),lines=b.toString('latin1').split('\n');assert.equal(createHash('sha256').update(b).digest('hex'),e.source.sha256);for(const r of e.sourceEvidence)assert.equal(lines[r.line-1].replace(/\r$/,''),r.text);assert.equal(e.abilities.A11T.DataA1,'1.5');assert.equal(e.abilities.A121.Area1,'600.0');assert.equal(e.abilities.A11Q.Cost1,undefined);assert.equal(e.abilities.A11Z.DataC1,undefined);
});
test('all three posture icons register only at deployment and no initial form is invented',()=>{
 const f=fixture();assert.equal(jobs(f.g,'varian_listener').length,1);assert.equal(f.a.status.varian.form,undefined);initializeSourceClassCombat(f.g,{unitId:'v14_h0Q0'},f.a);assert.equal(jobs(f.g,'varian_listener').length,1);
 for(const ids of [['A11V','A11W'],['A11V','A11X'],['A11W','A11X']])assert.equal(jobs(fixture(ids).g,'varian_listener').length,0);
 const z=fixture([]);skills(z.a,['A11V','A11W','A11X']);initializeSourceClassCombat(z.g,null,z.a);assert.equal(jobs(z.g,'varian_listener').length,0);
});
test('event health includes exact66and33 boundaries and zero damage can change form',()=>{
 for(const [hp,form]of [[6600,'armed'],[6599,'mastery'],[3300,'mastery'],[3299,'blades']]){const f=fixture();f.a.hp=hp;near(f.event(0),0);assert.equal(f.a.status.varian.form,form);}
});
test('real damage changes posture from pre-subtraction health not after it crosses threshold',()=>{
 const f=fixture();f.a.hp=6700;f.g._hurt(f.a,200,f.t,{spell:true});assert.equal(f.a.status.varian.form,'armed');near(f.a.hp,6500);f.g._hurt(f.a,1,f.t,{spell:true});assert.equal(f.a.status.varian.form,'mastery');near(f.a.hp,6499);
});
test('registration persists after the three icons are removed and does not require A11Y for stats',()=>{
 const f=fixture(['A11V','A11W','A11X']);skills(f.a,[]);f.event();assert.equal(has(f.a,'A11O'),true);assert.equal(jobs(f.g,'varian_armed').length,0);f.a.hp=5000;f.event();near(f.a.damage,200);assert.equal(jobs(f.g,'varian_spin').length,0);
});
test('high form adds15armor30regen and physical evasion rather than universal immunity',()=>{
 const f=fixture();f.event();const aura=sourceAuraEffects(f.g,f.a,[f.a]);near(aura.armor,15);near(aura.healRate,30);near(f.g._hurt(f.a,100,f.t),0);near(f.g._hurt(f.a,100,f.t,{spell:true}),100);
});
test('initial zero timer casts600radius30percent roar for6seconds',()=>{
 const f=fixture(),friend=f.make(2,'defender'),outside=f.make(2.001,'defender');f.event();assert.equal(f.a.buffs.length,0);f.at(10);near(sourceAuraEffects(f.g,friend,[]).damage,.3);near(sourceAuraEffects(f.g,outside,[]).damage,0);assert.equal(friend.buffs[0].expiresAt,16);assert.equal(f.t.buffs.length,0);assert.deepEqual(f.a.status.varian.lastCommand.missingNativeFields,['Cost1','Cool1']);near(f.a.mana,0);
});
test('five second howl reduces enemy attack30percent2seconds and requests0point1stun',()=>{
 const f=fixture();f.event();f.at(10);f.at(15);assert.equal(has(f.a,'A121'),false);assert.equal(has(f.a,'A11Q'),true);near(sourceAuraEffects(f.g,f.t,[]).damage,-.3);near(f.t.buffs[0].expiresAt,17);near(f.t.status.stunUntil,15.1);
});
test('howl can fail under silence while the independent stun loop still runs',()=>{
 const f=fixture();f.event();f.at(10);f.a.status.silenceUntil=30;f.at(15);assert.equal(f.a.status.varian.lastCommand.status,'blocked');assert.equal(f.t.buffs.length,0);near(f.t.status.stunUntil,15.1);
});
test('howl and dummy stun respect immune targets and organic target restriction',()=>{
 const f=fixture(),immune=f.make(.6),mechanical=f.make(.7);skills(immune,['Amim']);mechanical.traits=['mechanical'];f.event();f.at(15);assert.equal(immune.buffs.length,0);assert.equal(immune.status.stunUntil,undefined);assert.equal(mechanical.status.stunUntil,undefined);assert.ok(mechanical.buffs.some(b=>b.key==='BNht'));
});
test('armed timer stops below66but stored handle prevents reinitialization on reentry',()=>{
 const f=fixture();f.event();f.at(10);f.a.hp=5000;f.event();f.at(15);assert.equal(jobs(f.g,'varian_armed').length,0);assert.equal(has(f.a,'A121'),false);f.a.hp=9000;f.event();assert.equal(jobs(f.g,'varian_armed').length,0);assert.equal(has(f.a,'A11O'),true);
});
test('mastery adds and removes100attack exactly once including secondary weapon journal',()=>{
 const f=fixture();f.a.hp=5000;f.event();f.event();near(f.a.damage,200);near(f.a.sourcePassiveStatBonuses.A11S.flatDamage,100);f.a.weapon2={...f.a.weapon2,rangeN2:'180',dmgplus2:'50',dice2:'1',sides2:'1',cool2:'1',targs2:'enemies',weapTp2:'normal'};f.a.weapon1={...f.a.weapon1,weapsOn:'2'};f.a.weapon2.weapsOn='2';near(sourceWeapon(f.a,f.t).damage,151);f.a.hp=2000;f.event();near(f.a.damage,100);assert.equal(f.a.sourcePassiveStatBonuses.A11S,undefined);
});
test('mastery storm starts0point04and deals75times6 nonweapon damage while caster can move',()=>{
 const f=fixture();f.a.hp=5000;f.event();f.at(10.039);near(f.t.hp,10000);f.at(10.04);near(f.t.hp,9994);f.at(13);near(f.t.hp,9550);assert.equal(jobs(f.g,'varian_spin').length,0);near(f.a.mana,0);assert.equal(f.a.status.sourcePaused,undefined);
});
test('storm follows caster and does not stop merely because form changed',()=>{
 const f=fixture(),later=f.make(4);f.a.hp=5000;f.event();f.at(10.04);f.a.worldX=9;f.a.hp=2000;f.event();f.at(10.08);near(f.t.hp,9994);near(later.hp,9994);assert.equal(jobs(f.g,'varian_spin').length,1);
});
test('reentering mastery creates another independent storm and death cancels both',()=>{
 const f=fixture();f.a.hp=5000;f.event();f.a.hp=2000;f.event();f.a.hp=5000;f.event();assert.equal(jobs(f.g,'varian_spin').length,2);f.g._killUnit(f.a);f.at(14);near(f.t.hp,10000);assert.equal(f.g.state.sourceSkillJobs.length,0);
});
test('low form grants150percent haste and only self40percent lifesteal',()=>{
 const f=fixture(),friend=f.make(.2,'defender');f.a.hp=2000;f.event();const own=sourceAuraEffects(f.g,f.a,[f.a]),other=sourceAuraEffects(f.g,friend,[f.a]);near(own.haste,1.5);near(own.lifesteal,.4);near(other.lifesteal,0);assert.equal(f.a.status.varian.doubleRage,true);
});
test('weapon events gain rage but nonweapon spells do not and maximum clamps',()=>{
 const f=fixture();f.attack();near(f.a.mana,1);f.attack(10,{spell:true});near(f.a.mana,1);f.attack(10,{spell:true,weapon:true});near(f.a.mana,2);f.a.hp=2000;f.event();f.attack();near(f.a.mana,4);f.a.mana=119;f.attack();near(f.a.mana,120);f.at(15);f.a.mana=0;f.attack();near(f.a.mana,1);
});
test('old rage timer can clear a later low-form window because leaving does not cancel timers',()=>{
 const f=fixture();f.a.hp=2000;f.event();f.at(11);f.a.hp=5000;f.event();assert.equal(f.a.status.varian.doubleRage,undefined);f.at(12);f.a.hp=2000;f.event();assert.equal(jobs(f.g,'varian_rage_end').length,2);f.at(15);assert.equal(f.a.status.varian.doubleRage,false);f.attack();near(f.a.mana,1);
});
test('mastery rerolls unmitigated attack and inclusive>=26clap centers on target',()=>{
 const f=fixture(),nearTarget=f.make(1.4),nearCaster=f.make(-.9);f.a.hp=5000;f.event();const rolls=[.5,.26];f.g._random=()=>rolls.shift()??.5;near(f.attack(2),200);near(f.t.hp,9875);near(nearTarget.hp,9875);near(nearCaster.hp,10000);assert.equal(f.t.buffs.length,0);assert.equal(f.t.status.stunUntil,undefined);near(f.a.mana,1);
});
test('mastery rollbelow26hasno clap and damage event rewrite ignores existing enemy armor',()=>{
 const f=fixture();f.a.hp=5000;f.event();f.t.armor=100;const rolls=[.5,.2599];f.g._random=()=>rolls.shift()??.5;near(f.g._hurt(f.t,2,f.a),200);near(f.t.hp,9800);
});
test('mastery uses main attack bounds even for weapon2 and does not invent missing bounds',()=>{
 const f=fixture();f.a.hp=5000;f.event();f.a.weaponsOn=2;near(f.attack(2),195);delete f.a.sourceRawFields.damage_min_1;near(f.attack(7),7);assert.equal(f.a.status.varian.attackBoundary,'missing-native-attack-bounds');
});
test('Varian localP8nowcontinues into bronze A150 rather than discarding prior branch',()=>{
 const f=fixture();f.a.hp=5000;f.event();f.a.combatRawcode='h0QR';f.a.skillSpecs.push(...compileSkills({abilityIds:['A150'],skillVersion:'v14.1A5',distanceScale:1/3}));f.g._random=()=>.25;near(f.attack(1),292.5);near(f.a.status.bronzeDamage.localP8,195);assert.equal(f.a.status.bronzeDamage.boundary,undefined);
});
test('zero and allied weapon events still grant rage while per-attacker busy suppresses nested ones',()=>{
 const f=fixture();f.t.side=f.a.side;f.attack(0);near(f.a.mana,1);f.a.status.sourceNativeAttackBusy=true;f.attack();near(f.a.mana,1);
});
test('lethal branch caps total life1500keepsmanaanddoesnotzero the current event',()=>{
 const f=fixture();f.a.hp=1000;f.a.mana=100;near(f.g._hurt(f.a,1100,f.t,{spell:true}),1100);near(f.a.hp,400);near(f.a.mana,100);assert.equal(f.a.invulnerable,true);assert.equal(has(f.a,'A11Z'),true);assert.equal(f.a.status.varian.form,undefined);assert.equal(f.a.status.varian.deathUsed,true);near(f.a.worldX,f.t.worldX);near(f.t.status.stunUntil,11);
});
test('lethal with no nearbyenemy neither makes invulnerable nor addsonehitbash',()=>{
 const f=fixture();f.a.hp=1000;f.a.mana=100;f.t.worldX=50;f.g._hurt(f.a,1100,f.t,{spell:true});near(f.a.hp,400);assert.equal(f.a.invulnerable,false);assert.equal(has(f.a,'A11Z'),false);assert.equal(jobs(f.g,'varian_invulnerability').length,0);
});
test('lethal can still kill if current damage exceeds rewritten life',()=>{
 const f=fixture();f.a.hp=1000;f.a.mana=100;f.g._hurt(f.a,2000,f.t,{spell:true});assert.ok(f.a.hp<=0);assert.equal(f.a.invulnerable,false);assert.equal(jobs(f.g,'varian_listener').length,0);
});
test('rescue selects highestattack within500andties selectlater eligible enemy',()=>{
 const f=fixture(),a=f.make(.8),b=f.make(1),outside=f.make(2),inv=f.make(.5),dead=f.make(.7);f.t.damage=90;a.damage=b.damage=200;outside.damage=999;inv.damage=999;skills(inv,['Avul']);dead.damage=999;dead.hp=0;f.a.hp=1000;f.a.mana=100;f.event(1000);assert.equal(f.a.targetId,b.id);near(f.a.worldX,b.worldX);
});
test('rescue control is nativeA0I7 and does not fabricate magicimmunitypiercing or1secondhero stun',()=>{
 for(const mode of ['immune','hero','mechanical']){const f=fixture();f.a.hp=1000;f.a.mana=100;if(mode==='immune')skills(f.t,['Amim']);if(mode==='hero')f.t.isNativeHero=true;if(mode==='mechanical')f.t.traits=['mechanical'];f.event(1000);assert.equal(f.a.invulnerable,true);if(mode==='hero')near(f.t.status.stunUntil,10.5);else assert.equal(f.t.status.stunUntil,undefined);}
});
test('invulnerability endsat4secondsandrescue isonlyonce percombat handle',()=>{
 const f=fixture();f.a.hp=1000;f.a.mana=100;f.g._hurt(f.a,1100,f.t,{spell:true});near(f.g._hurt(f.a,100,f.t,{spell:true}),0);f.at(13.999);assert.equal(f.a.invulnerable,true);f.at(14);assert.equal(f.a.invulnerable,false);f.g._hurt(f.a,2000,f.t,{spell:true});assert.ok(f.a.hp<=0);
});
test('A11Zisconsumedbyindependentweapon event evenifamountzero',()=>{
 const f=fixture();f.a.hp=1000;f.a.mana=100;f.event(1000);assert.equal(has(f.a,'A11Z'),true);f.attack(0);assert.equal(has(f.a,'A11Z'),false);
});
test('onehitbashiscapturedatattackstart before eventremoves ability',()=>{
 const f=fixture();f.a.hp=1000;f.a.mana=100;f.event(1000);const hit=sourceAttackStart(f.g,f.a,f.t);assert.ok(hit.procs.some(s=>s.id==='A11Z'));f.attack();assert.equal(has(f.a,'A11Z'),false);sourceOnHit(f.g,f.a,f.t,f.g.state.entities,100,hit.procs);assert.ok(f.t.buffs.some(b=>b.key==='B044'&&b.stun));
});
test('paused natural ticks freeze all clocks and saved jobs rebindlive body without doubled stats',()=>{
 const f=fixture();f.a.hp=5000;f.event();f.g.state.paused=true;f.g.tick(1);near(f.g.state.time,10);const g=Game.fromSnapshot(clone(f.g.snapshot())),a=g.state.entities.find(e=>e.id===f.a.id);for(const j of g.state.sourceSkillJobs)assert.equal(j.source,a);near(a.damage,200);g.state.time=10.04;tickSourceScriptJobs(g);near(g.state.entities.find(e=>e.id===f.t.id).hp,9994);a.hp=2000;sourceRegisteredDamageEvent(g,a,sourceDamageListeners(g,a),0);near(a.damage,100);
});
test('restoring legacy save doesnotinvent posture history or recreate expired armed handle',()=>{
 const f=fixture();f.event();f.at(10);f.a.hp=5000;f.event();f.at(15);const g=Game.fromSnapshot(clone(f.g.snapshot())),a=g.state.entities.find(e=>e.id===f.a.id);a.hp=9000;sourceRegisteredDamageEvent(g,a,sourceDamageListeners(g,a),0);assert.equal(jobs(g,'varian_armed').length,0);
});
test('coarse storm callbacks equal fine steps with overlapping storm timers',()=>{
 const a=fixture(),b=fixture();for(const f of[a,b]){f.a.hp=5000;f.event();f.a.hp=2000;f.event();f.a.hp=5000;f.event();}a.at(13);for(let n=1;n<=300;n++)b.at(10+n*.01);near(a.t.hp,b.t.hp);near(a.t.hp,9100);
});
test('actual history unlocks700gold direct Varian upgrade and creates registered combat form',()=>{
 const g=new Game({mode:'sandbox'}),p=g.state.players[0],ok=r=>assert.equal(r.ok,true,r.message);p.roster=['v14_h08L'];p.entitlements.h210=1;ok(g.command('build',{unitId:'v14_h08L',col:2,row:4}));ok(g.command('sandboxComplete'));const b=p.buildings[0];assert.equal(g.command('upgrade',{buildingId:b.id,unitId:'v14_h0Q0'}).ok,false);for(const code of ['h00W','hA0B'])recordEggCompletion(p,UNIT_TEMPLATES[code],{buildingId:'completed-'+code,wave:1});assert.equal(p.technologies.R07M,1);assert.equal(p.technologies.R07N,1);const gold=p.gold;ok(g.command('upgrade',{buildingId:b.id,unitId:'v14_h0Q0'}));near(gold-p.gold,700);ok(g.command('sandboxComplete'));ok(g.command('ready'));const e=g.state.entities.find(e=>e.buildingId===b.id);assert.equal(e.combatRawcode,'h0PZ');assert.ok(jobs(g,'varian_listener').some(j=>j.sourceId===e.id));assert.equal(e.status.varian.form,undefined);
});
test('appearance uses same posture listener and Anduin grants survive every form change',()=>{
 const f=fixture();f.a.combatRawcode='h0XC';f.a.skillSpecs.push(...compileSkills({abilityIds:['A1ST','A1SU'],skillVersion:'v14.1A5',distanceScale:1/3}));for(const hp of [9000,5000,2000,9000]){f.a.hp=hp;f.event();assert.ok(has(f.a,'A1ST')&&has(f.a,'A1SU'));const aura=sourceAuraEffects(f.g,f.a,[f.a]);near(aura.armor,hp>=6600?65:50);near(aura.healRate,hp>=6600?130:100);}
});
test('saved lethal invulnerability deadline survives and expires on restored live handle',()=>{
 const f=fixture();f.a.hp=1000;f.a.mana=100;f.event(1000);const g=Game.fromSnapshot(clone(f.g.snapshot())),a=g.state.entities.find(e=>e.id===f.a.id);assert.equal(a.invulnerable,true);assert.equal(a.status.varian.deathUsed,true);g.state.time=14;tickSourceScriptJobs(g);assert.equal(a.invulnerable,false);assert.equal(has(a,'A11Z'),true);
});
test('continuous waves retain posture state and sandboxreset removes all registered timers',()=>{
 const f=fixture();f.event();const j=jobs(f.g,'varian_listener')[0];f.g.state.mode='standard';f.g._advanceContinuous();assert.ok(f.g.state.sourceSkillJobs.includes(j));const z=fixture();z.a.hp=5000;z.event();assert.equal(z.g.command('sandboxReset').ok,true);assert.equal(z.g.state.sourceSkillJobs.length,0);
});
test('natural arena ticks run mastery storm without adding auxiliary soldiers or nonfinite state',()=>{
 const f=fixture();f.g.state.roundMode='arena';f.g.state.arenaRemaining=120;f.g._spawnQueue=[];f.a.hp=5000;f.event();f.g.tick(4);assert.equal(jobs(f.g,'varian_spin').length,0);assert.equal(jobs(f.g,'varian_listener').length,1);near(f.t.hp,9550);assert.equal(f.g.state.entities.length,2);assert.ok(f.g.state.entities.every(e=>Number.isFinite(e.hp)&&Number.isFinite(e.damage)));
});
