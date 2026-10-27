import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';
import {UNITS,UNIT_TEMPLATES} from '../dist/data.js';
import {V14_ABILITIES} from '../dist/v14-reference.js';
import {compileSkills,sourceWeapon,sourceBarrageTargets,refreshSourceSkills} from '../dist/skills.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const specs=ids=>compileSkills({abilityIds:ids,skillVersion:'v14.1A5',distanceScale:1/3});
function fixture(ids=['A0VW','A0VZ'],code='h0OV'){
 const g=new Game({mode:'sandbox',seed:291});g.state.entities=[];g.state.time=10;g.state.phase='combat';
 const e=g._entity(UNIT_TEMPLATES[code],{team:0,side:'defender',battleTeam:0,laneId:0,ownerId:0,worldX:10,worldY:10});
 e.skillSpecs=specs(ids);e.hp=e.maxHp=10000;e.damage=303.5;e.hpRegen=e.manaRegen=0;g.state.entities.push(e);const lane=g.state.entities;lane.auras=[];
 function enemy(extra={}){const t=g._entity(UNIT_TEMPLATES.h002,{team:1,side:'monster',battleTeam:0,laneId:0,worldX:10.3,worldY:10,...extra});t.skillSpecs=[];t.hp=t.maxHp=10000;t.armor=0;t.armorType='normal';t.sourceArmorTypeRaw='normal';g.state.entities.push(t);return t;}
 const attack=t=>g._attack(e,t,lane),loss=t=>10000-t.hp;return {g,e,lane,enemy,attack,loss};
}
test('real Aroc objects use attack damage and retain explicit partial boundaries',()=>{
 for(const [id,count] of [['A0VW',3],['A07M',4],['A17M',4],['A0BY',11],['A150',4]]){const [s]=specs([id]);assert.equal(s.extraTargets,count);assert.equal(s.status,'partial');assert.equal(s.damage,undefined);assert.equal(s.damageCap,undefined);assert.match(s.effectText,/沿用.*武器/);}
 for(const id of ['A0YV','A205','A0IF'])assert.equal(specs([id])[0].status,'unresolved');
});
test('queen DataB is outgoing one half, while all explicit incoming factors are one',()=>{
 const f=V14_ABILITIES.A0VZ.fields;assert.equal(f.DataB1,'0.5');for(const k of ['DataA1','DataE1','DataG1','DataH1'])assert.equal(Number(f[k]),1);
 const [s]=specs(['A0VZ']);assert.equal(s.attackFactor,.5);assert.equal(s.status,'partial');assert.match(s.effectText,/固定脚本伤害不减半/);
});
test('real queen and skin fire primary plus three arrows at half attack, not 99999 damage',()=>{
 for(const code of ['h0OV','h0WB']){const {e,enemy,attack,loss}=fixture(['A0VW','A0VZ'],code),targets=Array.from({length:6},()=>enemy());attack(targets[0]);assert.deepEqual(targets.map(loss),[151.75,151.75,151.75,151.75,0,0]);near(e.damage,303.5);}
});
test('each arrow applies its own armor and armor type, not the primary post-armor damage',()=>{
 const {g,e,enemy,attack,loss}=fixture(),a=enemy(),b=enemy();a.armor=30;b.armor=5;b.armorType='heavy';b.sourceArmorTypeRaw='large';attack(a);
 near(loss(a),151.75*g._typeMultiplier('chaos',a.armorType,a.sourceArmorTypeRaw)*g._armorFactor(30));near(loss(b),151.75*g._typeMultiplier('chaos',b.armorType,b.sourceArmorTypeRaw)*g._armorFactor(5));assert.ok(loss(b)>loss(a));
});
test('evading the primary does not cancel already released secondary arrows',()=>{
 const {e,enemy,attack,loss}=fixture(),a=enemy(),b=enemy();a.skillSpecs=[{id:'evade',kind:'evasion',status:'implemented',chance:1}];attack(a);near(loss(a),0);near(loss(b),151.75);
});
test('secondary arrows are attack damage and can be evaded or blocked independently',()=>{
 const {enemy,attack,loss}=fixture(),a=enemy(),b=enemy(),c=enemy();b.skillSpecs=[{id:'evade',kind:'evasion',status:'implemented',chance:1}];c.skillSpecs=[{id:'block',kind:'hardened',status:'implemented',chance:1,reduction:50,minimum:0}];attack(a);near(loss(a),151.75);near(loss(b),0);near(loss(c),101.75);
});
test('primary killing the attacker does not erase secondary shots selected at release',()=>{
 const {g,e,enemy,attack,loss}=fixture(),a=enemy(),b=enemy(),hurt=g._hurt.bind(g);g._hurt=(t,...args)=>{const result=hurt(t,...args);if(t===a)e.hp=0;return result;};attack(a);near(loss(b),151.75);
});
test('secondary membership is captured before primary damage scripts spawn another enemy',()=>{
 const {g,e,enemy,attack,loss}=fixture(),a=enemy();let born;const hurt=g._hurt.bind(g);g._hurt=(t,...args)=>{const r=hurt(t,...args);if(t===a)born=enemy();return r;};attack(a);near(loss(born),0);
});
test('barrage filters source radius, allies, other battles, dead and invulnerable units',()=>{
 const {g,e,enemy,attack,loss}=fixture(),a=enemy(),far=enemy({worldX:12}),ally=enemy({team:0,side:'defender'}),other=enemy({battleTeam:1}),dead=enemy(),invul=enemy(),edge=enemy({worldX:10+500/300});dead.hp=0;invul.invulnerable=true;attack(a);
 for(const t of [far,ally,other,invul])near(loss(t),0);near(loss(edge),151.75);near(dead.hp,0);
});
test('expired cyclone stops excluding a secondary target',()=>{
 const {g,enemy,attack,loss}=fixture(),a=enemy(),b=enemy(),c=enemy();b.status.cycloneUntil=9;c.status.cycloneUntil=11;attack(a);near(loss(b),151.75);near(loss(c),0);
});
test('arrows require a missile weapon; a melee or instant primary does not invent multishot',()=>{
 for(const type of ['normal','instant','msplash','mbounce']){const {e,enemy,attack,loss}=fixture(),a=enemy(),b=enemy({worldX:10.7});e.weapon1={...e.weapon1,weapTp1:type};attack(a);near(loss(b),0);}
});
test('a critical strike suppresses barrage only on that attack',()=>{
 const {g,e,enemy,attack,loss}=fixture(),a=enemy(),b=enemy();e.skillSpecs.push({id:'critical',kind:'crit',status:'implemented',chance:.5,multiplier:2,targets:['enemies']});g._random=()=>0;attack(a);near(loss(a),303.5);near(loss(b),0);g._random=()=>.9;attack(a);near(loss(a),455.25);near(loss(b),151.75);
});
test('orb bonus and buff placer stay on the primary; secondary arrows use the base weapon',()=>{
 const {e,enemy,attack,loss}=fixture(),a=enemy(),b=enemy();e.mana=100;e.skillSpecs.push({id:'orb',kind:'orb',status:'implemented',manaCost:3,cooldown:0,damage:100,duration:2,buffKey:'orb-test',targets:['enemies']});attack(a);near(loss(a),201.75);near(loss(b),151.75);near(e.mana,97);assert.ok(a.buffs.some(b=>b.key==='orb-test'));assert.ok(!b.buffs.some(b=>b.key==='orb-test'));
});
test('ordinary damage buffs apply once to all arrows before the outgoing factor',()=>{
 const {e,enemy,attack,loss}=fixture(),a=enemy(),b=enemy();e.buffs.push({expiresAt:20,damage:.2});attack(a);near(loss(a),182.1);near(loss(b),182.1);
});
test('second weapon supplies barrage damage and attack type even on targets it cannot directly attack',()=>{
 const {g,e,enemy,attack,loss}=fixture(['A07M']),a=enemy(),b=enemy();e.attackType='normal';e.weapon1={...e.weapon1,weapsOn:'3',targs1:'ground'};e.weapon2={weapsOn:'3',weapTp2:'missile',targs2:'air',dmgplus2:'99',dice2:'1',sides2:'1',atkType2:'pierce',cool2:'2',rangeN2:'600'};a.targetType='air';b.targetType='ground';b.skillSpecs=specs(['A07N']);b.skillStates.A07N={active:true};attack(a);near(loss(a),100*g._typeMultiplier('pierce','normal','normal'));near(loss(b),100*g._typeMultiplier('pierce','normal','normal')*.6);
});
test('secondary arrows participate in independent attack listeners without recursively firing more arrows',()=>{
 const {e,enemy,attack,loss}=fixture(['A0VW','A1VR']),targets=Array.from({length:6},()=>enemy());e.maxHp=100000;attack(targets[0]);assert.equal(targets.filter(t=>loss(t)>0).length,4);near(e.status.arthasHungerDamage,303.5*8);
});
test('A0VZ neither halves incoming damage nor fixed source snake damage',()=>{
 const {g,e,enemy}=fixture(),a=enemy();const before=e.hp;g._hurt(e,100,a,{spell:true,universal:true});near(e.hp,before-100);const amount=325*g._typeMultiplier('normal',a.armorType,a.sourceArmorTypeRaw)*g._armorFactor(a.armor);g._hurt(a,amount,e,{spell:true,attackType:'normal',nativeDamageType:'normal'});near(a.hp,10000-amount);
});
test('removing A0VZ restores outgoing attack damage without changing displayed base stats',()=>{
 const {e,enemy,attack,loss}=fixture(),a=enemy(),b=enemy();e.skillSpecs=e.skillSpecs.filter(s=>s.id!=='A0VZ');attack(a);near(loss(a),303.5);near(loss(b),303.5);near(e.damage,303.5);
});
test('old saved barrage specs recompile without changing mana, HP or adding removed abilities',()=>{
 const {e}=fixture();e.skillImplementationRevision='v14-content-20261026-v21-1';e.skillSpecs=[{id:'A0VW',kind:'barrage',damage:999999,status:'implemented'}];e.mana=17;e.hp=123;assert.equal(refreshSourceSkills(e,UNIT_TEMPLATES.h0OV),true);assert.deepEqual(e.skillSpecs.map(s=>s.id),['A0VW']);assert.equal(e.skillSpecs[0].kind,'native_barrage');near(e.mana,17);near(e.hp,123);
});
