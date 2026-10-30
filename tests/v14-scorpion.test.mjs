import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Game} from '../dist/engine.js';
import {UNIT_TEMPLATES} from '../dist/data.js';
import {compileSkills,sourceAttackStart,sourceOnHit,tickSourceSkills,beforeSourceDamage} from '../dist/skills.js';
import {scorpionSpread} from '../dist/scorpion-rules.js';
import {laneToWorld} from '../dist/layout.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const clone=x=>JSON.parse(JSON.stringify(x));
const skills=(e,ids)=>{e.skillSpecs=compileSkills({abilityIds:ids,skillVersion:'v14.1A5',distanceScale:1/3});e.skillStates=Object.fromEntries(ids.map(id=>[id,{readyAt:0,casts:0}]));};
const ok=r=>assert.equal(r.ok,true,r.message);
function fixture(){
 const g=new Game({mode:'sandbox',seed:39});g.state.entities=[];g.state.phase='combat';g.state.time=10;g._random=()=>.99;g._aiAct=()=>{};for(const k of g.state.kings){k.worldX=k.worldY=10000;}
 const p=laneToWorld(0,3,6);
 const make=(dx=.2,side='monster',raw='h03E')=>{const e=g._entity(UNIT_TEMPLATES[raw],{ownerId:side==='defender'?0:4,team:side==='defender'?0:1,side,battleTeam:0,laneId:0,sourceLaneId:0,worldX:p.x+dx,worldY:p.y});e.hp=e.maxHp=5000;e.mana=e.maxMana=100;e.armor=0;e.sourceArmorTypeRaw='none';e.armorType='unarmored';e.ability=null;e.attackCd=e.abilityCd=1000;e.hpRegen=e.manaRegen=e.moveSpeed=0;e.buffs=[];e.traits=[];e.isNativeHero=e.isHero=false;skills(e,[]);g.state.entities.push(e);return e;};
 const a=make(0,'defender','h0PU'),t=make(),b=make(.3);skills(a,['A10I']);
 const hit=(options={spell:true},amount=10)=>g._hurt(t,amount,a,options);
 return {g,a,t,b,make,hit};
}
test('source evidence pins main guards, precedence, dummy order and missing native fields',()=>{
 const e=JSON.parse(readFileSync(new URL('../reference/scorpion-evidence.json',import.meta.url))),bytes=readFileSync(new URL('../reference/v14-source/raw_extracted/war3map.j',import.meta.url)),lines=bytes.toString('latin1').split('\n');assert.equal(createHash('sha256').update(bytes).digest('hex'),e.source.sha256);for(const row of e.sourceEvidence)assert.equal(lines[row.line-1].replace(/\r$/,''),row.text);assert.equal(e.abilities.A10G.DataD1,'9');assert.equal(e.abilities.A10H.DataA1,undefined);assert.equal(e.units.e00W.targs1,undefined);assert.equal(e.units.h0PU.weapTp1,'missile');
});
test('nova triggers every positive hostile damage type, without spending native spell resources',()=>{
 for(const options of [{},{spell:true},{spell:true,universal:true},{spell:true,nativeDamageType:'slow_poison'},{spell:true,nativeDamageType:'shadow_strike'}]){const f=fixture();f.hit(options);near(f.t.hp,4990);near(f.b.hp,4850);near(f.a.mana,100);assert.equal(f.a.skillStates.A10I.casts,0);assert.equal(f.a.status.scorpionShadowstrikeRequest.outcome,'native-unresolved');assert.equal(f.a.status.scorpionSpread.radius,250);}
});
test('missile branch requires exactly slow_poison and applies no invented direct damage',()=>{
 for(const type of ['normal','poison','shadow_strike','slow_poison']){const f=fixture();skills(f.a,['A10H']);f.hit({spell:true,nativeDamageType:type});assert.equal(!!f.a.status.scorpionSpread,type==='slow_poison');near(f.b.hp,5000);if(type==='slow_poison')assert.equal(f.a.status.scorpionSpread.requests[0].abilityId,'A10G');}
});
test('128 and250 boundaries exclude primary and use victim position, not source position',()=>{
 for(const [ids,radius,type]of [[['A10H'],128,'slow_poison'],[['A10I'],250,'magic']]){const f=fixture();skills(f.a,ids);f.t.worldX+=10;f.b.worldX=f.t.worldX+radius/300;const outside=f.make();outside.worldX=f.b.worldX+.001;f.hit({spell:true,nativeDamageType:type});assert.deepEqual(f.a.status.scorpionSpread.targetIds,[f.b.id]);near(f.t.hp,4990);near(outside.hp,5000);}
});
test('both abilities use128 radius with150 nova damage even on non-poison event',()=>{
 const f=fixture();skills(f.a,['A10H','A10I']);f.b.worldX=f.t.worldX+128/300;const outside=f.make(.2+129/300);f.hit();near(f.b.hp,4850);near(outside.hp,5000);assert.equal(f.a.status.scorpionSpread.radius,128);
});
test('SelectRange excludes dead Avul allies and other battles but permits mechanical and magic immune',()=>{
 for(const mode of ['dead','Avul','ally','battle','mechanical','immune']){const f=fixture();if(mode==='dead')f.b.hp=0;if(mode==='Avul')skills(f.b,['Avul']);if(mode==='ally')f.b.side=f.a.side;if(mode==='battle')f.b.battleTeam=1;if(mode==='mechanical')f.b.traits=['mechanical'];if(mode==='immune')skills(f.b,['Amim']);const hp=f.b.hp;f.hit();near(f.b.hp,hp-(['mechanical','immune'].includes(mode)?150:0));assert.equal(f.a.status.scorpionSpread.targetIds.includes(f.b.id),['mechanical','immune'].includes(mode));}
});
test('nova uses normal type and armor reduction rather than spell/magic damage',()=>{
 const f=fixture();f.b.armor=10;f.b.sourceArmorTypeRaw='fort';const expected=150*f.g._typeMultiplier('normal',f.b.armorType,'fort')*f.g._armorFactor(10);f.hit();near(f.b.hp,5000-expected);
});
test('shadowstrike prioritizes source and never falls back when native outcome is unresolved',()=>{
 for(const mode of ['source','target','both']){const f=fixture();skills(f.a,mode==='target'?[]:['A10H']);skills(f.t,mode==='source'?[]:['A10I']);f.a.mana=0;f.hit();assert.equal(!!f.a.status.scorpionShadowstrikeRequest,mode!=='target');assert.equal(!!f.t.status.scorpionShadowstrikeRequest,mode==='target');assert.equal(f.t.skillStates.A10I?.casts??0,0);}
});
test('main listener filters zero friendly self null A2Y7 and nested events',()=>{
 for(const mode of ['zero','ally','self','null','A2Y7','nested']){const f=fixture();let source=f.a,amount=10;if(mode==='zero')amount=0;if(mode==='ally')f.t.side=f.a.side;if(mode==='self')source=f.t;if(mode==='null')source=null;if(mode==='A2Y7')skills(f.a,['A10I','A2Y7']);if(mode==='nested')f.g._sourceDamageTriggerDepth=1;beforeSourceDamage(f.g,f.t,amount,source,{});assert.equal(f.a.status.scorpionSpread,undefined);assert.equal(f.a.status.scorpionShadowstrikeRequest,undefined);}
});
test('150 nested weapon hit runs independent listeners without recursively spreading',()=>{
 const f=fixture();skills(f.a,['A10I','A0IN']);const third=f.make(.4);f.a.mana=0;f.hit();near(f.b.hp,4850);near(third.hp,4850);near(f.a.mana,2);assert.equal(f.a.status.scorpionSpread.requests.length,2);assert.equal(f.g._sourceDamageTriggerDepth,0);
});
test('group is snapshotted before damage; request position is read after that target damage',()=>{
 const f=fixture(),second=f.make(.4);let n=0;const report=scorpionSpread(f.g,f.a,f.t,250,{nativeDamage:(g,t,amount,source,opts)=>{assert.equal(amount,150);assert.deepEqual(opts,{attackType:'normal',damageType:'normal',weapon:true});n++;if(n===1){f.make(.5);second.hp=0;second.worldX+=20;t.worldX+=1;}}});assert.deepEqual(report.targetIds,[f.b.id,second.id]);assert.equal(n,2);near(report.requests[0].position.x,f.b.worldX);near(report.requests[1].position.x,second.worldX);
});
test('lethal150 still records e00W after damage and does not fabricate native attack or poison',()=>{
 const f=fixture();f.a.userData=7;f.b.hp=100;const count=f.g.state.entities.length;f.hit();assert.ok(f.b.hp<=0);const r=f.a.status.scorpionSpread.requests[0];assert.equal(r.dummyRawcode,'e00W');assert.equal(r.userData,7);assert.equal(r.group,'JH');assert.equal(r.ownerId,f.a.ownerId);assert.equal(r.facing,270);assert.equal(r.summoned,true);assert.equal(r.timedLife,5);assert.equal(r.timedLifeBuff,'BHwe');assert.equal(r.order,'attack');assert.equal(r.materialized,false);assert.equal(f.g.state.entities.length,count);assert.equal(f.b.buffs.length,0);
});
test('shell checks damaged units melee type, independently of damage source weapon or event type',()=>{
 for(const ownMelee of [true,false])for(const sourceMelee of [true,false]){const f=fixture();skills(f.a,[]);skills(f.t,['A10J']);f.t.isMeleeAttacker=ownMelee;f.a.isMeleeAttacker=sourceMelee;f.g._random=()=>0;f.hit({spell:true});assert.equal(!!f.t.status.scorpionShell,ownMelee);if(ownMelee){assert.equal(f.t.status.scorpionShell.request.targetId,f.a.id);assert.equal(f.t.status.scorpionShell.request.ownerId,f.t.ownerId);}}
});
test('shell real probability includes30 endpoint and excludes just above30',()=>{
 for(const [draw,success]of [[0,true],[.3,true],[.300001,false],[.999,false]]){const f=fixture();skills(f.a,[]);skills(f.t,['A10J']);f.t.isMeleeAttacker=true;let draws=0;f.g._random=()=>{draws++;return draw;};f.hit();assert.equal(draws,1);assert.equal(!!f.t.status.scorpionShell.request,success);near(f.a.hp,5000);}
});
test('real scorpion combat forms are ranged; shell does not roll for their default weapons',()=>{
 for(const code of ['h0PU','h0SZ']){const f=fixture(),body=f.make(.2,'monster',code);skills(body,['A10J']);let draws=0;f.g._random=()=>{draws++;return 0;};f.g._hurt(body,10,f.a,{spell:true});assert.equal(body.status.scorpionShell,undefined);assert.equal(draws,0);}
});
test('disabled secondary weapon does not classify unit as melee; enabled normal weapon does',()=>{
 for(const enabled of [false,true]){const f=fixture();skills(f.a,[]);skills(f.t,['A10J']);f.t.weapon1={weapsOn:enabled?3:1,weapTp1:'missile'};f.t.weapon2={weapsOn:enabled?3:1,weapTp2:'normal'};f.g._random=()=>0;f.hit();assert.equal(!!f.t.status.scorpionShell,enabled);}
});
test('shell can follow source nova in same event and requests are bounded to latest event',()=>{
 const f=fixture();skills(f.t,['A10J']);f.t.isMeleeAttacker=true;f.g._random=()=>0;f.hit();assert.ok(f.a.status.scorpionSpread);assert.ok(f.t.status.scorpionShell.request);for(let i=0;i<10;i++)f.hit();assert.equal(f.a.status.scorpionSpread.requests.length,1);assert.equal(f.g.state.entities.length,3);
});
test('A10G remains a partial continuous poison adapter without claiming native damage classification',()=>{
 const f=fixture();skills(f.a,['A10G','A10H']);const s=f.a.skillSpecs[0];assert.equal(s.status,'partial');assert.equal(s.kind,'poison');assert.ok(s.effectText.includes('原生'));const procs=sourceAttackStart(f.g,f.a,f.t).procs;assert.equal(procs.length,1);sourceOnHit(f.g,f.a,f.t,f.g.state.entities,10,procs);assert.equal(f.t.buffs.length,1);near(f.t.buffs[0].move,-.3);near(f.t.buffs[0].haste,-.2);near(f.t.buffs[0].dps,10);f.g._worldEntities=new Map(f.g.state.entities.map(e=>[e.id,e]));tickSourceSkills(f.g,f.t,f.g.state.entities,.1);near(f.t.hp,4999);assert.equal(f.a.status.scorpionSpread,undefined);
});
test('JSON restore preserves latest requests and native random continuation',()=>{
 const f=fixture();skills(f.t,['A10J']);f.t.isMeleeAttacker=true;delete f.g._random;f.hit();const g=Game.fromSnapshot(clone(f.g.snapshot())),a=g.state.entities.find(e=>e.id===f.a.id),t=g.state.entities.find(e=>e.id===f.t.id);assert.deepEqual(a.status.scorpionSpread,f.a.status.scorpionSpread);f.hit();g._hurt(t,10,a,{spell:true});assert.equal(g._rng,f.g._rng);assert.deepEqual(g.state.entities.map(e=>e.hp),f.g.state.entities.map(e=>e.hp));assert.deepEqual(t.status.scorpionShell,f.t.status.scorpionShell);
});
test('real desert upgrade chain deploys emerald scorpion with partial rules and no fabricated native cast button',()=>{
 const g=new Game({mode:'sandbox',builderId:'v14_builder_u01X',seed:39}),p=g.state.players[0];ok(g.command('build',{unitId:'v14_n05Q',col:1,row:1}));ok(g.command('sandboxComplete'));const b=p.buildings[0];for(const unitId of ['v14_n05R','v14_n05S']){ok(g.command('upgrade',{buildingId:b.id,unitId}));ok(g.command('sandboxComplete'));}ok(g.command('ready'));const a=g.state.entities.find(e=>e.buildingId===b.id);assert.equal(a.combatRawcode,'h0PU');assert.deepEqual(a.skillSpecs.filter(s=>['A10G','A10I','A10J'].includes(s.id)).map(s=>s.status),['partial','partial','partial']);assert.equal(g.unitSkillStatus(a.id).length,0);
});
test('natural weapon attacks trigger nova; game pause produces no event or resource consumption',()=>{
 const f=fixture();f.a.attackCd=0;f.a.damage=10;f.g.state.paused=true;f.g.tick(1);assert.equal(f.a.status.scorpionSpread,undefined);f.g.state.paused=false;for(let n=0;n<50&&!f.a.status.scorpionSpread;n++)f.g.tick(.05);assert.ok(f.a.status.scorpionSpread);assert.ok(f.b.hp<5000||f.t.hp<4850);near(f.a.mana,100);
});
