import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Game} from '../dist/engine.js';
import {UNITS,UNIT_TEMPLATES} from '../dist/data.js';
import {compileSkills,sourceAttackStart,sourceClassAttackDamageEvent,canWeaponTarget} from '../dist/skills.js';
import {Battlefield,isEntityVisible} from '../dist/renderer.js';
import {laneToWorld} from '../dist/layout.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const skills=(e,ids)=>e.skillSpecs=compileSkills({abilityIds:ids,skillVersion:'v14.1A5',distanceScale:1/3});
function fixture(){
 const g=new Game({mode:'sandbox',seed:33});g.state.entities=[];g.state.phase='combat';g.state.time=10;g._random=()=>.99;for(const k of g.state.kings){k.worldX=10000;k.worldY=10000;}
 const p=laneToWorld(0,3,6);
 const make=(side='monster',ids=[],dx=0,code='h03E')=>{const e=g._entity(UNIT_TEMPLATES[code],{ownerId:side==='defender'?0:4,team:side==='defender'?0:1,side,battleTeam:0,laneId:0,sourceLaneId:0,userData:side==='defender'?1:5,worldX:p.x+dx,worldY:p.y});skills(e,ids);e.hp=e.maxHp=3200;e.mana=e.maxMana=100;e.armor=0;e.sourceArmorTypeRaw='none';e.armorType='unarmored';e.ability=null;e.attackCd=e.abilityCd=1000;e.hpRegen=e.manaRegen=0;e.buffs=[];e.traits=[];e.isNativeHero=e.isHero=false;g.state.entities.push(e);return e;};
 const a=make('defender',['A0N5','A0N6'],0,'h0NE'),t=make('monster',[],.2);
 const roll=n=>g._random=()=> (n-.5)/101;
 const hit=(target=t,source=a,options={spell:false})=>g._hurt(target,10,source,options);
 const spirits=()=>g.state.entities.filter(e=>e.status.taurenSpirit);
 return {g,a,t,p,make,roll,hit,spirits};
}
test('Tauren evidence matches source bytes and object data rather than conflicting descriptions',()=>{
 const p=JSON.parse(readFileSync(new URL('../reference/tauren-evidence.json',import.meta.url))),raw=readFileSync(new URL('../reference/v14-source/raw_extracted/war3map.j',import.meta.url)),lines=raw.toString('latin1').split('\n');assert.equal(createHash('sha256').update(raw).digest('hex'),p.source.sha256);for(const x of p.sourceEvidence)assert.equal(lines[x.line-1].replace(/\r$/,''),x.text);assert.equal(p.abilities.A0N7.Dur1,'0.001');assert.equal(p.abilities.A0N7.Cool1,'80.0');assert.equal(p.abilities.A0N7.Cost1,undefined);
});
test('normal stomp draws integers1..101 with exact25/26 boundary',()=>{
 for(const [n,damage]of [[1,110],[25,110],[26,10],[101,10]]){const f=fixture();f.roll(n);f.hit();near(f.t.hp,3200-damage);assert.equal(f.a.status.taurenLastRoll.roll,n);}
});
test('only Avul level1 switches to85/101; level2 does not',()=>{
 for(const [level,n,damage]of [[1,85,110],[1,86,10],[2,26,10]]){const f=fixture();skills(f.a,['A0N5','Avul']);f.a.abilityLevels={Avul:level};f.roll(n);f.hit();near(f.t.hp,3200-damage);}
});
test('stomp requires level1 and weapon damage, including zero effective damage',()=>{
 const f=fixture();f.roll(1);f.a.abilityLevels={A0N5:2};f.hit();assert.equal(f.a.status.taurenLastRoll,undefined);f.a.abilityLevels.A0N5=1;sourceAttackStart(f.g,f.a,f.t);assert.equal(f.a.status.taurenLastRoll,undefined);f.hit(f.t,f.a,{spell:true,universal:true});assert.equal(f.a.status.taurenLastRoll,undefined);skills(f.t,['Amim']);f.hit(f.t,f.a,{spell:true,magic:true,weapon:true});assert.equal(f.a.status.taurenLastRoll.roll,1);
});
test('stomp uses caster center300, organic enemy filter and0.001 duration',()=>{
 const f=fixture();const edge=f.make('monster',[],1),out=f.make('monster',[],1.001),friend=f.make('defender',[],.1),machine=f.make('monster',[],.1),immune=f.make('monster',['Amim'],.1),inv=f.make('monster',['Avul'],.1);machine.traits=['mechanical'];f.roll(1);f.hit();near(edge.hp,3100);near(edge.status.stunUntil,10.001);for(const e of [out,friend,machine,immune,inv]){near(e.hp,3200);assert.equal(e.status.stunUntil,undefined);}
});
test('native stomp adapter ignores armor but retains spell resistance; it is not holy universal damage',()=>{
 const f=fixture();f.t.armor=100;skills(f.t,['Amim']);const plain=f.make('monster',[],.3),resistant=f.make('monster',['A19A'],.4);plain.armor=100;f.roll(1);f.hit();near(f.t.hp,3190);near(plain.hp,3100);near(resistant.hp,3140);
});
test('successful proc re-adds ability and resets80sec cooldown; no proximity recast',()=>{
 const f=fixture();f.roll(1);f.hit();near(f.a.skillStates.A0N7.readyAt,90);f.g.state.time=10.1;f.hit();near(f.t.hp,2980);near(f.a.skillStates.A0N7.readyAt,90.1);assert.equal(f.a.skillSpecs.filter(s=>s.id==='A0N7').length,1);near(f.a.mana,100);assert.equal(f.a.status.taurenStompRequest.missingNativeManaCost,true);
});
test('failed roll retains existing stomp cooldown and blocked cast still re-adds ability',()=>{
 const f=fixture();f.roll(1);f.hit();f.roll(26);f.hit();near(f.a.skillStates.A0N7.readyAt,90);f.a.status.stunUntil=11;f.roll(1);f.hit();near(f.a.skillStates.A0N7.readyAt,0);assert.equal(f.a.status.taurenStompRequest.outcome,'blocked');near(f.t.hp,3070);
});
test('independent attack listener respects own recursion guard but not main damage suppression',()=>{
 const f=fixture();f.roll(1);f.a.status.sourceNativeAttackBusy=true;f.hit();assert.equal(f.a.status.taurenLastRoll,undefined);f.a.status.sourceNativeAttackBusy=false;f.g._sourceDamageTriggerDepth=1;f.g._sourceAbilityEffectDepth=1;f.hit();near(f.t.hp,3080);assert.equal(f.a.skillStates.A0N7.casts,1);
});
test('earlier attack elseif matches suppress stomp without consuming its roll',()=>{
 for(const id of ['A0IN','A0P0','A0PV']){const f=fixture();skills(f.a,['A0N5',id]);let draws=0;f.g._random=()=>{draws++;return 0;};sourceClassAttackDamageEvent(f.g,f.t,f.a,{spell:false},10);assert.equal(f.a.status.taurenSkippedBranch,id);assert.equal(f.a.status.taurenLastRoll,undefined);assert.equal(draws,0);}
});
test('earlier random branch failure continues to stomp; success stops selection',()=>{
 for(const success of [true,false]){const f=fixture();skills(f.a,['A0N5','A0JV']);const seq=success?[.9]:[0,0];f.g._random=()=>seq.shift()??.99;sourceClassAttackDamageEvent(f.g,f.t,f.a,{spell:false},10);assert.equal(!!f.a.status.taurenLastRoll,!success);assert.equal(seq.length,0);}
});
test('death creates fresh same-type9s spirit with source ownership and no corpse buffs',()=>{
 const f=fixture();f.a.damage=999;f.a.maxHp=9999;f.a.buffs=[{key:'test',damage:1,expiresAt:99}];f.a.skillStates.A0N5={casts:9,readyAt:99};f.a.facing=123;f.g._killUnit(f.a);const e=f.spirits()[0];assert.ok(e);assert.notEqual(e.id,f.a.id);assert.equal(e.combatRawcode,'h0NE');near(e.hp,1650);near(e.damage,150);near(e.expiresAt,19);near(e.facing,123);near(e.worldX,f.a.worldX);assert.equal(e.ownerId,0);assert.equal(e.userData,1);assert.equal(e.status.sourceJHMember,1);assert.ok(e.status.sourceJWMember&&e.isSummon&&!e.isIllusion);assert.equal(e.buffs.length,0);assert.equal(e.skillSpecs.some(s=>s.id==='A0N6'),false);assert.ok(['A0N5','Avul','Aloc'].every(id=>e.skillSpecs.some(s=>s.id===id)));
});
test('soul spawn does not require a killer or exclude illusion deaths',()=>{
 const f=fixture();f.a.isIllusion=true;f.g._killUnit(f.a);assert.equal(f.spirits().length,1);assert.equal(f.spirits()[0].isIllusion,false);
});
test('main death disabled or Ju membership prevents ancestor spawn',()=>{
 for(const mode of ['disabled','Ju']){const f=fixture();if(mode==='disabled')f.g._sourceUnitDeathTriggerDepth=1;else f.a.status.sourceJuMember=true;f.g._killUnit(f.a);assert.equal(f.spirits().length,0);}
});
test('fire kill branch takes priority over ancestral soul',()=>{
 const f=fixture();skills(f.t,['A0HW']);f.a.hp=1;f.hit(f.a,f.t);assert.equal(f.spirits().length,0);
});
test('earlier explicit death prototypes do not also spawn a Tauren soul',()=>{
 for(const raw of ['h0PC','h0D3','h2A2','n004']){const f=fixture();f.a.combatRawcode=raw;f.g._killUnit(f.a);assert.equal(f.spirits().length,0);}
});
test('spirit is invulnerable and cannot be selected as a weapon target',()=>{
 const f=fixture();f.g._killUnit(f.a);const e=f.spirits()[0];near(f.g._hurt(e,999,f.t,{spell:true,universal:true}),0);assert.equal(canWeaponTarget(f.t,e),false);assert.equal(canWeaponTarget(e,f.t),true);f.roll(85);sourceClassAttackDamageEvent(f.g,f.t,e,{spell:false},10);near(f.t.hp,3100);
});
test('spirit stays visible but map clicks select terrain rather than the locust body',()=>{
 const f=fixture();f.g._killUnit(f.a);const e=f.spirits()[0];assert.equal(isEntityVisible(e),true);const view=Object.create(Battlefield.prototype);Object.assign(view,{state:{phase:'combat',entities:[e]},camera:{x:e.worldX,y:e.worldY,scale:30},width:500,height:500});const p=view.project(e.worldX,e.worldY);assert.equal(view.hit(p.x,p.y-5).type,'terrain');e.status.sourceLocust=false;assert.equal(view.hit(p.x,p.y-5).entityId,e.id);
});
test('spirit neither receives nor creates unit repulsion',()=>{
 const f=fixture();f.g._killUnit(f.a);const spirit=f.spirits()[0];assert.equal(spirit.radius,0);const plain=f.make('defender',[],0);plain.worldY=spirit.worldY;plain.radius=.3;spirit.moveSpeed=plain.moveSpeed=1;const move=(e,neighbors)=>{const before={x:e.worldX,y:e.worldY};f.g._nearby=()=>neighbors;f.g._canSegment=()=>true;f.g._moveWorld(e,{x:before.x+2,y:before.y},[],.1);return {x:e.worldX-before.x,y:e.worldY-before.y};};near(move(spirit,[plain]).y,0);plain.worldX=spirit.worldX;near(move(plain,[spirit]).y,0);
});
test('spirit expires exactly at9s and never recursively resurrects',()=>{
 const f=fixture();f.g._killUnit(f.a);const e=f.spirits()[0];f.g.state.time=18.999;f.g._clearDead();assert.equal(f.spirits().length,1);f.g.state.time=19;f.g._clearDead();assert.equal(f.spirits().length,0);assert.equal(e.status.sourceDeathHandled,true);f.g._clearDead();assert.equal(f.spirits().length,0);
});
test('paused JSON restoration preserves spirit expiry, abilities and no second revive',()=>{
 const f=fixture();f.g._killUnit(f.a);f.g.state.paused=true;f.g.tick(20);near(f.g.state.time,10);const r=Game.fromSnapshot(JSON.parse(JSON.stringify(f.g.snapshot()))),e=r.state.entities.find(e=>e.status.taurenSpirit);assert.ok(e.status.sourceLocust);assert.equal(e.skillSpecs.some(s=>s.id==='A0N6'),false);near(e.expiresAt,19);r.state.time=19;r._clearDead();assert.equal(r.state.entities.some(e=>e.status.taurenSpirit),false);
});
test('real altar path reaches max Tauren and respawns full abilities for a new sandbox round',()=>{
 const g=new Game({mode:'sandbox',seed:33}),p=g.state.players[0];p.populationCap=300;
 const ok=r=>assert.equal(r.ok,true,r.message),finish=()=>ok(g.command('sandboxComplete'));
 ok(g.command('build',{unitId:'v14_h0DB',col:0,row:0}));finish();const b=p.buildings[0];
 let u=UNITS.find(u=>u.id==='v14_h0N3');for(;;){ok(g.command('upgrade',{buildingId:b.id,unitId:u.id}));finish();if(!u.upgrades.length)break;u=UNITS.find(v=>v.id===u.upgrades[0]);}
 assert.equal(u.id,'v14_n03S');ok(g.command('ready'));let e=g.state.entities.find(e=>e.buildingId===b.id);assert.equal(e.combatRawcode,'h0NE');g._killUnit(e);assert.equal(g.state.entities.filter(e=>e.status.taurenSpirit).length,1);ok(g.command('sandboxReset'));assert.equal(g.state.entities.length,0);ok(g.command('ready'));e=g.state.entities.find(e=>e.buildingId===b.id);assert.ok(e.skillSpecs.some(s=>s.id==='A0N6'));g._killUnit(e);assert.equal(g.state.entities.filter(e=>e.status.taurenSpirit).length,1);
});
