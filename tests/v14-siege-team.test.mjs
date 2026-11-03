import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Game} from '../dist/engine.js';
import {UNIT_TEMPLATES,MERCENARIES} from '../dist/data.js';
import {compileSkills,sourceClassAttackDamageEvent} from '../dist/skills.js';
import {siegeTeamAttackDamage} from '../dist/siege-team-rules.js';
import {laneToWorld} from '../dist/layout.js';
const clone=x=>JSON.parse(JSON.stringify(x)),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`),ok=r=>assert.equal(r.ok,true,r.message);
function skills(e,ids){e.skillSpecs=compileSkills({abilityIds:ids,skillVersion:'v14.1A5',distanceScale:1/3});e.skillStates=Object.fromEntries(ids.map(id=>[id,{readyAt:0,casts:0}]));}
function fixture(){
 const g=new Game({mode:'sandbox',seed:50});g.state.phase='combat';g.state.time=10;g.state.wave=31;g.state.entities=[];g._spawnQueue=[];g._aiAct=()=>{};for(const k of g.state.kings)k.worldX=k.worldY=10000;
 const point=laneToWorld(0,3,6),make=(dx=.2,side='monster',code='h03E')=>{const e=g._entity(UNIT_TEMPLATES[code],{side,ownerId:side==='defender'?0:null,team:side==='defender'?0:1,battleTeam:0,laneId:0,sourceLaneId:0,worldX:point.x+dx,worldY:point.y});e.hp=e.maxHp=5000;e.armor=0;e.sourceArmorTypeRaw='none';e.armorType='unarmored';e.ability=null;e.hpRegen=e.moveSpeed=e.manaRegen=0;e.attackCd=9999;e.buffs=[];e.traits=[];skills(e,[]);g.state.entities.push(e);return e;};
 const a=make(0,'defender','h0XK'),t=make();skills(a,['A20C']);let draws=0;
 const rolls=(...values)=>{draws=0;g._random=()=>{assert.ok(draws<values.length,'unexpected random draw');return values[draws++];};};
 const event=(options={},amount=100)=>sourceClassAttackDamageEvent(g,t,a,options,amount);
 return{g,a,t,make,rolls,event,draws:()=>draws};
}
test('source evidence pins registered listener and105/420 calls in their original sequence',()=>{
 const p=JSON.parse(readFileSync(new URL('../reference/siege-team-evidence.json',import.meta.url))),b=readFileSync(new URL('../reference/v14-source/raw_extracted/war3map.j',import.meta.url)),lines=b.toString('latin1').split('\n');assert.equal(createHash('sha256').update(b).digest('hex'),p.source.sha256);for(const x of p.sourceEvidence)assert.equal(lines[x.line-1].replace(/\r$/,''),x.text);
});
test('attack event adds105 around the victim, including the primary target',()=>{
 const f=fixture(),b=f.make(.4);f.a.worldX-=10;f.rolls(.9);f.event();near(f.t.hp,4895);near(b.hp,4895);near(f.a.hp,5000);assert.equal(f.draws(),1);assert.deepEqual(f.a.status.siegeFragments.targets,[f.t.id,b.id]);
});
test('25 percent endpoint is inclusive and selects exactly one integer index',()=>{
 for(const [draw,crit]of [[0,true],[.25,true],[.250001,false],[.99999,false]]){const f=fixture(),b=f.make(.4);f.rolls(...(crit?[draw,.99999]:[draw]));f.event();near(f.t.hp,4895);near(b.hp,crit?4475:4895);assert.equal(f.draws(),crit?2:1);assert.equal(f.a.status.siegeFragments.criticalId,crit?b.id:null);}
});
test('critical lower endpoint can choose primary and performs two separate damage calls',()=>{
 const f=fixture(),b=f.make(.4),requests=[];f.rolls(0,0);siegeTeamAttackDamage(f.g,f.a,f.t,{nativeDamage:(g,t,n,s,o)=>requests.push([t.id,n,o.attackType,o.damageType,o.weapon])});
 assert.deepEqual(requests,[[f.t.id,105,'chaos','universal',true],[f.t.id,420,'chaos','universal',true],[b.id,105,'chaos','universal',true]]);
});
test('range400 uses scaled victim position, with exact boundary accepted and beyond rejected',()=>{
 const f=fixture(),inside=f.make(.2+400/300),outside=f.make(.2+400/300+.001);f.rolls(.9);f.event();near(inside.hp,4895);near(outside.hp,5000);
});
test('enemy selection excludes dead Avul and foreign battle units but permits air mechanical and magic immune',()=>{
 const f=fixture(),ally=f.make(.3,'defender'),dead=f.make(.3),inv=f.make(.3),farBattle=f.make(.3),air=f.make(.3),mechanical=f.make(.3),immune=f.make(.3);dead.hp=0;skills(inv,['Avul']);farBattle.battleTeam=1;air.targetType='air';mechanical.traits=['mechanical'];skills(immune,['Amim']);f.rolls(.9);f.event();
 for(const e of [ally,inv,farBattle])near(e.hp,5000);near(dead.hp,0);for(const e of [air,mechanical,immune])near(e.hp,4895);
});
test('empty enemy group consumes neither probability nor index random draws',()=>{
 const f=fixture();f.t.side='defender';f.rolls();f.event();assert.equal(f.draws(),0);assert.deepEqual(f.a.status.siegeFragments.targets,[]);
});
test('ordinary spells do not proc; weapon-classified spells and zero events do',()=>{
 for(const [options,amount,eligible]of [[{spell:true},100,false],[{spell:true,weapon:true},100,true],[{},0,true]]){const f=fixture();f.rolls(...(eligible?[.9]:[]));f.event(options,amount);near(f.t.hp,eligible?4895:5000);assert.equal(f.draws(),eligible?1:0);}
});
test('positive ability level is required, rawcode alone does not grant a proc',()=>{
 for(const kind of ['missing','zero','legacy']){const f=fixture();if(kind==='missing')skills(f.a,[]);if(kind==='zero')f.a.abilityLevels={A20C:0};if(kind==='legacy'){f.a.skillVersion='5.0dJF';f.a.sourceVersion='5.0dJF';f.a.provenance='workbook';}f.rolls();f.event();near(f.t.hp,5000);assert.equal(f.draws(),0);}
});
test('source may be dead and event victim allied; select enemies around that victim',()=>{
 const f=fixture(),b=f.make(.4);f.a.hp=0;f.t.side='defender';f.rolls(.9);f.event();near(f.t.hp,5000);near(b.hp,4895);
});
test('shared attack flag suppresses recursive same-source procs and resets after completion',()=>{
 const f=fixture();f.rolls(.9);f.event();assert.equal(f.draws(),1);assert.equal(f.a.status.sourceNativeAttackBusy,false);f.rolls(.9);f.event();near(f.t.hp,4790);assert.equal(f.draws(),1);
 f.a.status.sourceNativeAttackBusy=true;f.rolls();f.event();assert.equal(f.draws(),0);near(f.t.hp,4790);
});
test('main damage listener suppression does not disable the independent attack listener',()=>{
 const f=fixture();f.g._sourceDamageTriggerDepth=1;f.rolls(.9);f.event();near(f.t.hp,4895);assert.equal(f.g._sourceDamageTriggerDepth,1);
});
test('the shared recursion flag belongs to each source rather than blocking another attacker',()=>{
 const f=fixture(),other=f.make(0,'defender','h0XL');skills(other,['A20C']);f.a.status.sourceNativeAttackBusy=true;f.rolls(.9);sourceClassAttackDamageEvent(f.g,f.t,other,{},10);near(f.t.hp,4895);assert.equal(f.a.status.sourceNativeAttackBusy,true);assert.equal(other.status.sourceNativeAttackBusy,false);
});
test('unit enumeration and critical selection are fixed before any damage callback',()=>{
 const f=fixture(),b=f.make(.4),seen=[];f.rolls(0,.99);siegeTeamAttackDamage(f.g,f.a,f.t,{nativeDamage:(g,t,n)=>{seen.push([t.id,n]);if(t===f.t){g.state.entities=[];b.hp=0;}}});
 assert.deepEqual(seen,[[f.t.id,105],[b.id,105],[b.id,420]]);assert.equal(f.draws(),2);
});
test('base damage killing the chosen target does not transfer the critical to a survivor',()=>{
 const f=fixture(),b=f.make(.4);f.t.hp=50;f.rolls(0,0,.9);f.event();assert.ok(f.t.hp<=0);near(b.hp,4895);assert.equal(f.a.status.siegeFragments.criticalId,f.t.id);assert.equal(f.a.status.siegeFragments.requests.filter(r=>r.amount===420).length,1);assert.equal(f.draws(),3);
});
test('105 and420 bypass ordinary armor and spell immunity through chaos universal damage',()=>{
 const f=fixture();f.t.armor=10000;skills(f.t,['Amim']);f.rolls(0,0);f.event();near(f.t.hp,4475);
});
test('real weapon damage settles fragments before subtracting the original hit',()=>{
 const f=fixture();f.rolls(0,0);const actual=f.g._hurt(f.t,145,f.a,{attackType:'chaos'});near(actual,145);near(f.t.hp,4330);assert.equal(f.draws(),2);assert.equal(f.a.status.sourceNativeAttackBusy,false);
});
test('king in the same battle is included when enemy and in range',()=>{
 const f=fixture(),k=f.g.state.kings[0];k.worldX=f.t.worldX;k.worldY=f.t.worldY;k.side='monster';k.hp=k.maxHp=5000;f.rolls(.9);f.event();near(k.hp,4895);assert.ok(f.a.status.siegeFragments.targets.includes(k.id));
});
test('both mercenary prototypes compile partial and the unstocked variant remains unavailable',()=>{
 const g=new Game({mode:'sandbox',seed:50}),a=MERCENARIES.find(m=>m.combatRawcode==='h0XK'),b=MERCENARIES.find(m=>m.combatRawcode==='h0XL');for(const m of [a,b])assert.equal(compileSkills(m).find(s=>s.id==='A20C').status,'partial');g.command('sandboxWave',{wave:11});const p=g.state.players[0],wood=p.wood,income=p.income;ok(g.command('merc',{mercId:a.id}));assert.equal(p.wood,wood-500);assert.equal(p.income,income+12);assert.equal(g.command('merc',{mercId:b.id}).ok,false);ok(g.command('ready'));g.tick(.2);const e=g.state.entities.find(e=>e.combatRawcode==='h0XK');assert.ok(e);assert.equal(e.skillSpecs.find(s=>s.id==='A20C').kind,'siege_fragments_source');
});
test('snapshot restores ability revision and deterministic future critical results',()=>{
 const f=fixture(),a=Game.fromSnapshot(clone(f.g.snapshot())),b=Game.fromSnapshot(clone(f.g.snapshot()));for(const g of [a,b])sourceClassAttackDamageEvent(g,g.state.entities[1],g.state.entities[0],{},10);assert.deepEqual(clone(a.snapshot()),clone(b.snapshot()));const c=Game.fromSnapshot(clone(a.snapshot()));assert.deepEqual(c.state.entities[0].status.siegeFragments,a.state.entities[0].status.siegeFragments);assert.equal(c.state.entities[0].status.sourceNativeAttackBusy,false);
});
test('natural battle does not fire during pause and gains fragments after resuming',()=>{
 const f=fixture();f.g._random=()=>.9;f.a.attackCd=0;f.a.damage=100;f.g.state.paused=true;f.g.tick(.2);assert.equal(f.a.status.siegeFragments,undefined);f.g.state.paused=false;for(let i=0;i<50&&!f.a.status.siegeFragments;i++)f.g.tick(.05);assert.ok(f.a.status.siegeFragments);assert.ok(f.t.hp<4895);assert.equal(f.a.status.sourceNativeAttackBusy,false);
});
