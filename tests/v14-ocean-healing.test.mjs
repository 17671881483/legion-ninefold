import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Game} from '../dist/engine.js';
import {UNIT_TEMPLATES} from '../dist/data.js';
import {V14_ABILITIES} from '../dist/v14-reference.js';
import {OCEAN_HEALING_RULES,OCEAN_HEALING_NATIVE_REFERENCE,oceanHealingSpellEffect,initializeOceanHealingDeployment,restoreOceanHealing} from '../dist/ocean-healing-rules.js';

const clone=x=>JSON.parse(JSON.stringify(x));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function fixture(){
 const g=new Game({mode:'sandbox',seed:76});g.state.phase='combat';g.state.time=10;g.state.entities=[];g.state.sourceSkillJobs=[];
 const e=g._entity(UNIT_TEMPLATES.h0J5,{ownerId:0,userData:1,team:0,side:'defender',battleTeam:0,laneId:0,worldX:10,worldY:10});
 Object.assign(e,{hp:100,maxHp:1000,mana:100,sourceOceanHealingBonus:25});g.state.entities.push(e);
 const add=(extra={})=>{const t={id:g._uid('ocean-target'),ownerId:0,userData:1,team:0,side:'defender',battleTeam:0,hp:100,maxHp:1000,worldX:10,worldY:10,skillSpecs:[{id:'A07S'}],status:{},...extra};g.state.entities.push(t);return t;};
 const cast=(target=null,id='A0HB')=>oceanHealingSpellEffect(g,e,id,target);
 return {g,e,add,cast};
}
test('raw LF confirms a registered independent effect branch and an uncalled bonus writer',()=>{
 const lines=readFileSync(new URL('../reference/v14-source/raw_extracted/war3map.j',import.meta.url),'latin1').split('\n');
 assert.match(lines[26393-1],/LoadInteger\(K,\$41304842,GetHandleId\(EQ\)\)/);
 assert.match(lines[26395-1],/Ca\*2/);assert.match(lines[26401-1],/,2000,Cd\)/);
 assert.match(lines[26311-1],/GetUnitAbilityLevel\(GetFilterUnit\(\),\$41303753\)>0 and GetUnitUserData\(GetFilterUnit\(\)\)==Ej/);
 assert.match(lines[26471-1],/EVENT_PLAYER_UNIT_SPELL_EFFECT/);assert.match(lines[26472-1],/function A313/);
 assert.match(lines[23063-1],/SaveInteger\(K,\$41304842,GetHandleId\(i\),U2\[Ej\+19\]\*5\)/);
 assert.match(lines[23094-1],/function CountUnitsInGroupEnum_I101/);
 assert.equal(lines.filter(s=>/\bh0xk\b/.test(s)).length,1,'h0xk has only its definition, not a registered/called entry');
 assert.equal(lines.filter(s=>/SaveInteger\(K,\$41304842/.test(s)).length,1);
});
test('A0HB retains native healing and clearly labels missing map cooldown and unreachable bonus registration',()=>{
 const f=V14_ABILITIES.A0HB.resolved_fields;assert.equal(f.code,'Ahea');assert.equal(+f.DataA1,500);assert.equal(+f.Cost1,10);assert.equal(+f.Rng1,600);assert.equal(f.Cool1,undefined);
 assert.equal(OCEAN_HEALING_RULES.A0HB.status,'partial');assert.equal(OCEAN_HEALING_RULES.A0HB.nativeKind,true);assert.equal(OCEAN_HEALING_NATIVE_REFERENCE.cooldown,1);assert.equal(OCEAN_HEALING_NATIVE_REFERENCE.sources.length,2);
});
test('fresh deployment never derives Ca from guards, U2, training or a building saved handle',()=>{
 const f=fixture();delete f.e.sourceOceanHealingBonus;f.add();f.g.state.U2={30:1,20:100};f.e.trainingLevel=99;
 const before=clone(f.e);assert.equal(initializeOceanHealingDeployment(f.g,{sourceOceanHealingBonus:500,unitId:'v14_h0J3'},f.e),0);
 assert.deepEqual(clone(f.e),before);assert.equal(f.cast(),false);assert.equal(f.e.hp,100);assert.equal(Object.hasOwn(f.e,'sourceOceanHealingBonus'),false);
});
test('an explicit runtime handle value survives repeat initialization, including arena',()=>{
 const f=fixture();f.e.isArena=true;const before=clone(f.e);
 assert.equal(initializeOceanHealingDeployment(f.g,{},f.e),25);assert.equal(initializeOceanHealingDeployment(f.g,{},f.e),25);assert.deepEqual(clone(f.e),before);
});
test('only A0HB successful-event callbacks consume a positive saved integer bonus',()=>{
 const f=fixture();for(const id of ['A313','A07Y','Ahea',undefined])assert.equal(oceanHealingSpellEffect(f.g,f.e,id,null),false);
 f.e.hp=100;for(const value of [undefined,0,-25,NaN,Infinity,1.5,'25',2147483648]){f.e.sourceOceanHealingBonus=value;assert.equal(f.cast(),false);assert.equal(f.e.hp,100);}
});
test('the caster gets twice Ca and A07S recipients get Ca, independent of the original native target',()=>{
 const f=fixture(),recipient=f.add(),nativeTarget=f.add({skillSpecs:[]});assert.equal(f.cast(nativeTarget),true);
 assert.equal(f.e.hp,150);assert.equal(recipient.hp,125);assert.equal(nativeTarget.hp,100);
 assert.deepEqual(f.e.status.oceanHealingLastEffect.requests.map(r=>[r.targetId,r.amount]),[[f.e.id,50],[recipient.id,25]]);
 assert.equal(f.e.status.oceanHealingLastEffect.nativeTargetId,nativeTarget.id);
});
test('an A07S caster receives the self and group writes in source order',()=>{
 const f=fixture();f.e.skillSpecs.push({id:'A07S'});f.cast();assert.equal(f.e.hp,175);
 assert.deepEqual(f.e.status.oceanHealingLastEffect.requests.map(r=>[r.phase,r.before,r.after]),[['self',100,150],['A07S',150,175]]);
});
test('native marker level and userdata govern recipients, not owner or team',()=>{
 const f=fixture(),enemy=f.add({team:1,ownerId:4,side:'monster',battleTeam:1}),allyMismatch=f.add({userData:2}),noMarker=f.add({skillSpecs:[],abilityIds:['A07S']}),zeroLevel=f.add({abilityLevels:{A07S:0}}),fallback=f.add({skillSpecs:undefined,abilityIds:['A07S']});
 f.cast();assert.equal(enemy.hp,125);assert.equal(allyMismatch.hp,100);assert.equal(noMarker.hp,100);assert.equal(zeroLevel.hp,100);assert.equal(fallback.hp,125);
});
test('userdata defaults to the native zero value without guessing from player ownership',()=>{
 const f=fixture();delete f.e.userData;const zero=f.add({userData:undefined,ownerId:7}),one=f.add({userData:1,ownerId:0});f.cast();assert.equal(zero.hp,125);assert.equal(one.hp,100);
});
test('range uses source distance scale and accepts the 2000 boundary',()=>{
 const f=fixture(),inside=f.add({worldX:10+2000/300}),outside=f.add({worldX:10+2000/300+.0001});f.cast();assert.equal(inside.hp,125);assert.equal(outside.hp,100);
 f.e.distanceScale=1;f.cast();assert.equal(outside.hp,125);
});
test('fallback local coordinates and a genuinely different world position are distinguished',()=>{
 const f=fixture();delete f.e.worldX;delete f.e.worldY;f.e.x=10;f.e.y=10;const local=f.add({worldX:undefined,worldY:undefined,x:10,y:10}),far=f.add({worldX:100,worldY:100,x:10,y:10});f.cast();assert.equal(local.hp,125);assert.equal(far.hp,100);
});
test('hidden, invulnerable, immune and paused recipients are not invented exclusions',()=>{
 const f=fixture(),t=f.add({invulnerable:true,traits:['mechanical'],status:{sourceHidden:true,sourcePaused:true,cycloneUntil:50},skillSpecs:[{id:'A07S'},{id:'Avul'},{kind:'immunity'}]});f.cast();assert.equal(t.hp,125);
});
test('direct life writes clamp maximum health and do not run shield or incoming-damage calculations',()=>{
 const f=fixture();f.e.hp=980;const t=f.add({hp:995,status:{incomingMultiplier:0},buffs:[{kind:'anti_magic',remaining:999}]});f.g._hurt=()=>assert.fail('direct healing cannot become damage');f.g._auraEffects=()=>assert.fail('native SetUnitState ignores aura heal modifiers');f.cast();assert.equal(f.e.hp,1000);assert.equal(t.hp,1000);assert.equal(t.buffs[0].remaining,999);near(f.e.status.oceanHealingLastEffect.requests[0].applied,20);
});
test('dead A07S units remain in the source enumeration but are not resurrected',()=>{
 const f=fixture(),dead=f.add({hp:0,status:{deathCounted:true,sourceDeathHandled:true}}),dying=f.add({hp:.4});f.cast();assert.equal(dead.hp,0);assert.equal(dying.hp,.4);
 for(const t of [dead,dying])assert.equal(f.e.status.oceanHealingLastEffect.requests.find(r=>r.targetId===t.id).nativeBoundary,'dead-unit-life-write-without-resurrection');
});
test('a spell effect already accepted before caster death still reaches nearby recipients',()=>{
 const f=fixture(),recipient=f.add();f.e.hp=0;f.e.status.deathCounted=true;assert.equal(f.cast(),true);assert.equal(f.e.hp,0);assert.equal(recipient.hp,125);
});
test('removed targets are absent from the native group and removed caster writes stay explicit partial',()=>{
 const f=fixture(),t=f.add({status:{sourceRemoved:true}});f.cast();assert.equal(t.hp,100);assert.equal(f.e.status.oceanHealingLastEffect.requests.length,1);
 f.e.status.sourceRemoved=true;f.cast();assert.equal(f.e.hp,150);assert.equal(f.e.status.oceanHealingLastEffect.nativeBoundary,'removed-caster-enumeration-unverified');
});
test('the independent listener is not suppressed by the all-ability trigger depth and each event runs once',()=>{
 const f=fixture(),t=f.add();f.g._sourceAbilityEffectDepth=3;f.cast();f.cast();assert.equal(f.e.hp,200);assert.equal(t.hp,150);assert.equal(f.g._sourceAbilityEffectDepth,3);
});
test('nested accepted callbacks keep independent reports without a synthetic global busy lock',()=>{
 const f=fixture(),other=f.add({sourceOceanHealingBonus:10,skillSpecs:[]}),t=f.add();let nested=false;
 f.g._event=(kind,e)=>{if(!nested&&kind==='heal'&&e===f.e){nested=true;oceanHealingSpellEffect(f.g,other,'A0HB',null);}};
 f.cast();assert.equal(f.e.hp,150);assert.equal(other.hp,120);assert.equal(t.hp,135);assert.equal(f.e.status.oceanHealingLastEffect.requests.length,2);assert.equal(other.status.oceanHealingLastEffect.requests.length,2);
});
test('bonus processing does not charge mana, reset cooldown, duplicate native heal or enqueue jobs',()=>{
 const f=fixture(),target=f.add({skillSpecs:[]});f.e.skillStates.A0HB={readyAt:11,casts:1};const states=clone(f.e.skillStates);f.cast(target);
 assert.equal(f.e.mana,100);assert.deepEqual(f.e.skillStates,states);assert.equal(target.hp,100);assert.equal(f.g.state.sourceSkillJobs.length,0);
});
test('kings can be selected only with the same explicit marker and userdata, without double enumeration',()=>{
 const f=fixture(),king=f.add({id:'king',isKing:true});f.g.state.kings=[king];f.cast();assert.equal(king.hp,125);assert.equal(f.e.status.oceanHealingLastEffect.requests.filter(r=>r.targetId==='king').length,1);
});
test('JSON/Game restore preserves explicit handle bonus and prior reports without replay or grants',()=>{
 const f=fixture(),recipient=f.add();f.cast();const r=Game.fromSnapshot(clone(f.g.snapshot())),e=r.state.entities.find(t=>t.id===f.e.id),t=r.state.entities.find(t=>t.id===recipient.id);
 const before=clone(r.state.entities);assert.equal(restoreOceanHealing(r),1);assert.equal(restoreOceanHealing(r),1);assert.deepEqual(clone(r.state.entities),before);assert.equal(e.sourceOceanHealingBonus,25);assert.equal(t.hp,125);
 oceanHealingSpellEffect(r,e,'A0HB',t);assert.equal(e.hp,200);assert.equal(t.hp,150);
});
test('a fresh replacement does not inherit an old body saved bonus and restore leaves missing values missing',()=>{
 const f=fixture(),replacement=f.add({skillSpecs:[{id:'A0HB'}]});initializeOceanHealingDeployment(f.g,f.e,replacement);assert.equal(Object.hasOwn(replacement,'sourceOceanHealingBonus'),false);assert.equal(oceanHealingSpellEffect(f.g,replacement,'A0HB',f.e),false);
 restoreOceanHealing(f.g);assert.equal(Object.hasOwn(replacement,'sourceOceanHealingBonus'),false);
});
