import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Game} from '../dist/engine.js';
import {UNIT_TEMPLATES} from '../dist/data.js';
import {compileSkills} from '../dist/skills.js';
import {laneToWorld} from '../dist/layout.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function fixture(){
 const g=new Game({mode:'sandbox',seed:27});g.state.entities=[];g.state.phase='combat';g.state.time=10;g._random=()=>.99;
 const p=laneToWorld(0,3,6);
 const make=({side='monster',ids=[],code='h002',x=0,hp=1000,maxHp=hp,...extra}={})=>{
  const e=g._entity(UNIT_TEMPLATES[code],{ownerId:side==='defender'?0:4,team:side==='defender'?0:1,side,battleTeam:0,laneId:0,sourceLaneId:0,worldX:p.x+x,worldY:p.y,...extra});
  e.skillSpecs=compileSkills({abilityIds:ids,skillVersion:'v14.1A5',distanceScale:1/3});e.buffs=[];e.ability=null;e.hp=hp;e.maxHp=maxHp;e.armor=0;e.sourceArmorTypeRaw='none';e.armorType='unarmored';e.attackCd=e.abilityCd=1000;e.hpRegen=e.manaRegen=0;e.mana=0;g.state.entities.push(e);return e;
 };
 const kill=(dead,killer,options={spell:true,universal:true})=>g._hurt(dead,dead.hp,killer,options);
 return {g,make,kill,p};
}
const has=(e,id)=>e.skillSpecs?.some(s=>s.id===id);

test('evidence matches original SHA, killed-unit maximum HP, main trigger disabling and final elseif',()=>{
 const proof=JSON.parse(readFileSync(new URL('../reference/death-trigger-evidence.json',import.meta.url))),bytes=readFileSync(new URL('../reference/v14-source/raw_extracted/war3map.j',import.meta.url)),lines=bytes.toString('latin1').split('\n');
 assert.equal(createHash('sha256').update(bytes).digest('hex'),proof.source.sha256);for(const row of [...proof.sourceEvidence,proof.aesaraCorrection])assert.equal(lines[row.line-1].trim(),row.text);
 assert.match(lines[42089],/GetUnitAbilityLevel\(bv,\$41304857\)/);assert.match(lines[42090],/GetUnitState\(i,UNIT_STATE_MAX_LIFE\)\*\.02/);assert.match(lines[41927],/DisableTrigger\(Eb\)/);assert.match(lines[42176],/EnableTrigger\(Eb\)/);
});
test('fire triggers for either weapon or spell kills, centered at the victim rather than killer',()=>{
 for(const spell of [false,true]){const {g,make,kill}=fixture(),a=make({side:'defender',ids:['A0HW'],x:3}),dead=make({hp:1,maxHp:1000}),t=make({x:.6,maxHp:5000}),outside=make({x:2/3+.001});kill(dead,a,{spell,universal:true});near(t.hp,976);near(outside.hp,1000);assert.equal(g.state.events.filter(e=>e.skillId==='A0HW').length,1);}
});
test('fire belongs to killer; dying with the ability or KillUnit without a killer does not explode',()=>{
 for(const mode of ['victim','null']){const {g,make,kill}=fixture(),dead=make({ids:['A0HW']}),t=make({side:'defender',x:.2}),a=make({side:'defender',x:2});if(mode==='null')g._killUnit(dead);else kill(dead,a);near(t.hp,1000);assert.equal(g.state.events.filter(e=>e.skillId==='A0HW').length,0);}
});
test('fire requires a positive ability level but does not require an enemy or live victim killer',()=>{
 const f=fixture(),a=f.make({side:'defender',ids:['A0HW']}),dead=f.make(),t=f.make({x:.2});a.abilityLevels={A0HW:0};f.kill(dead,a);near(t.hp,1000);
 const x=fixture(),source=x.make({side:'defender',ids:['A0HW']}),ally=x.make({side:'defender'}),enemy=x.make({x:.2});source.hp=0;x.kill(ally,source);near(enemy.hp,976);
});
test('fire is melee/normal attack type with magic damage: no armor reduction, magic immunity still applies',()=>{
 const {make,kill}=fixture(),a=make({side:'defender',ids:['A0HW']}),dead=make(),armored=make({x:.2}),fort=make({x:.3}),immune=make({x:.4,ids:['Amim']});armored.armor=100;fort.sourceArmorTypeRaw='fort';fort.armorType='fortified';kill(dead,a);near(armored.hp,976);near(fort.hp,980.8);near(immune.hp,1000);
});
test('fire burst secondary kill never recursively bursts and regular bounties still count both deaths',()=>{
 const {g,make,kill}=fixture(),a=make({side:'defender',ids:['A0HW'],x:3}),dead=make(),chain=make({x:.6,hp:20,maxHp:5000}),beyond=make({x:1.2});kill(dead,a);assert.ok(chain.hp<=0);near(beyond.hp,1000);assert.equal(g.state.events.filter(e=>e.skillId==='A0HW').length,1);assert.equal(g.state.players[0].stats.kills,2);assert.equal(g.state.metrics.killed,2);assert.equal(g._sourceUnitDeathTriggerDepth,0);
 const later=make({x:2,hp:1});kill(later,a);assert.equal(g.state.events.filter(e=>e.skillId==='A0HW').length,2,'trigger re-enabled for later death');
});
test('main-trigger suppression prevents nested soul-transfer/slow and alchemy draws',()=>{
 const {g,make,kill}=fixture(),a=make({side:'defender',ids:['A0HW']}),dead=make(),nested=make({x:.2,hp:10,ids:['A194','A18Z']});let draws=0;g._random=()=>{draws++;return 0;};kill(dead,a);assert.ok(nested.hp<=0);assert.equal(draws,1,'only outer SingedAlchemyGold initializer');assert.equal(g.state.entities.some(e=>e.combatRawcode==='h03B'),false);assert.equal(a.status.sourceClassNativeSlowPending,undefined);
});
test('Ju membership excludes only the main trigger and does not fabricate a fire event',()=>{
 const {g,make,kill}=fixture(),a=make({side:'defender',ids:['A0HW']}),dead=make({ids:['A194']}),t=make({x:.2});dead.status.sourceJuMember=true;a.status.brightFuryActive=true;let draws=0;g._random=()=>{draws++;return 0;};kill(dead,a);near(t.hp,1000);assert.equal(draws,0);assert.equal(a.status.brightFuryActive,false,'independent global fury listener still runs');
});
test('class-created skeletons precede the killer fire burst and enter its newly built group',()=>{
 const {g,make,kill}=fixture(),a=make({side:'defender',ids:['A0HW'],x:3}),dead=make({ids:['A194']});g._random=()=>0;kill(dead,a);const spawned=g.state.entities.filter(e=>e.combatRawcode==='h03B');assert.equal(spawned.length,3);for(const s of spawned)assert.ok(s.hp<s.maxHp,'fire sees skeleton created earlier by same death callback');
});
test('fire prefix skips bone-dragon decrement but does not skip the independent Lich listener',()=>{
 const {g,make,kill}=fixture(),a=make({side:'defender',ids:['A0HW']}),bone=make({code:'h0D3'}),lich=make({side:'defender',code:'h0M0',x:.3});bone.status.lichBoneCounterOwner=4;g.state.players[4].sourceBoneDragons=1;lich.status.lichDeathListener=true;g._random=()=>0;kill(bone,a);assert.equal(g.state.players[4].sourceBoneDragons,1);assert.equal(g.state.entities.filter(e=>e.status.lichReanimated).length,1);
});
test('ordinary bone death decrements once while nested burst deaths do not',()=>{
 for(const nested of [false,true]){const {g,make,kill}=fixture(),a=make({side:'defender',ids:nested?['A0HW']:[]}),bone=make({code:'h0D3',x:.2,hp:nested?10:1000});bone.status.lichBoneCounterOwner=4;g.state.players[4].sourceBoneDragons=1;if(nested)kill(make(),a);else kill(bone,a);g._sourceDeath(bone,a);assert.equal(g.state.players[4].sourceBoneDragons,nested?1:0);}
});
test('death explosion ignores ordinary armor and magic immunity, excludes Avul, and uses 400 radius',()=>{
 const {make,kill}=fixture(),a=make({side:'defender',x:3}),dead=make({ids:['A20D']}),armored=make({side:'defender',x:1.3,ids:['Amim']}),inv=make({side:'defender',x:.2,ids:['Avul']}),outside=make({side:'defender',x:4/3+.001});armored.armor=100;kill(dead,a);near(armored.hp,800);near(inv.hp,1000);near(outside.hp,1000);
});
test('nested death explosions do not chain while independent duel callbacks still kill their tagged target',()=>{
 const {g,make,kill}=fixture(),a=make({side:'defender',x:5}),dead=make({ids:['A20D']}),nested=make({side:'defender',x:1.2,ids:['A20D'],hp:100}),beyond=make({x:2.4}),tagged=make({x:5});nested.status.huskarDuelTag=tagged.id;g.state.sourceSkillJobs.push({type:'huskar_duel',sourceId:nested.id,targetId:tagged.id,at:10});kill(dead,a);assert.ok(nested.hp<=0);near(beyond.hp,1000);assert.equal(tagged.hp,0);assert.equal(g.state.events.filter(e=>e.skillId==='A20D').length,1);
});
test('death explosion runs before fire and the original killer may already be dead when fire executes',()=>{
 const {g,make,kill}=fixture(),a=make({side:'defender',ids:['A0HW'],hp:100}),dead=make({ids:['A20D']}),t=make({x:.3});kill(dead,a);assert.ok(a.hp<=0);near(t.hp,976);const events=g.state.events.filter(e=>['A20D','A0HW'].includes(e.skillId));assert.deepEqual(events.map(e=>e.skillId),['A20D','A0HW']);
});
test('range-enumeration snapshot excludes units created by independent nested death listeners',()=>{
 const {g,make,kill}=fixture(),a=make({side:'defender',x:4}),dead=make({ids:['A20D']}),t=make({side:'defender',x:.3,hp:10}),lich=make({side:'defender',code:'h0M0',x:1});lich.status.lichDeathListener=true;g._random=()=>0;kill(dead,a);const copies=g.state.entities.filter(e=>e.status.lichReanimated);assert.ok(copies.length>=1);for(const c of copies)near(c.hp,c.maxHp);
});
test('nested Ysera death keeps independent cleanup but cannot schedule the disabled main awakening',()=>{
 for(const nested of [true,false]){const {g,make,kill}=fixture(),a=make({side:'defender',x:3}),dead=make({ids:['A20D']}),ysera=make({code:'h0YN',side:'defender',ids:['A2YC'],x:.2,hp:10});if(nested)kill(dead,a);else kill(ysera,dead);assert.equal(g.state.sourceSkillJobs.some(j=>j.type==='ysera_death_awaken'),!nested);assert.equal(ysera.status.yseraDeathHandled,true);}
});
test('range enumeration includes king handles and excludes other battles, hidden and Locust bodies',()=>{
 const {g,make,kill,p}=fixture(),a=make({side:'monster',ids:['A0HW']}),dead=make({side:'defender'}),hidden=make({side:'defender',x:.2}),locust=make({side:'defender',x:.2,ids:['Aloc']}),other=make({side:'defender',battleTeam:1,x:.2});hidden.status.sourceHidden=true;
 const king=g.state.kings[0];king.worldX=p.x+.3;king.worldY=p.y;king.sourceArmorTypeRaw='none';king.armorType='unarmored';const hp=king.hp;kill(dead,a);near(king.hp,hp-24);near(hidden.hp,1000);near(locust.hp,1000);near(other.hp,1000);
});
test('all death entry paths share one main dispatch and JSON restores handled deaths without replay',()=>{
 for(const path of ['damage','KillUnit','direct','timed']){const {g,make,kill}=fixture(),a=make({side:'defender',x:3}),dead=make({ids:['A20D']}),t=make({side:'defender',x:.3});if(path==='damage')kill(dead,a);else if(path==='KillUnit')g._killUnit(dead);else if(path==='direct'){dead.hp=0;g._sourceDeath(dead,null);}else{dead.expiresAt=10;g._clearDead();}near(t.hp,800);g._sourceDeath(dead,a);near(t.hp,800);
  const r=Game.fromSnapshot(JSON.parse(JSON.stringify(g.snapshot()))),rt=r.state.entities.find(e=>e.id===t.id),rd=r.state.entities.find(e=>e.id===dead.id);if(rd)r._sourceDeath(rd,null);near(rt.hp,800);assert.equal(r._sourceUnitDeathTriggerDepth,undefined);}
});

test('alchemy gold belongs to the suppressed main trigger; independent ordinary bounties remain',()=>{
 const {g,make,kill}=fixture(),a=make({side:'defender',code:'h0XH',ids:['A0HW'],x:3}),dead=make(),nested=make({x:.2,hp:10});g._random=()=>0;const before=g.state.players[0].gold;kill(dead,a);assert.ok(nested.hp<=0);assert.equal(g.state.events.filter(e=>e.type==='gold'&&e.text?.startsWith('点金')).length,1);near(g.state.players[0].gold-before,5+dead.reward+nested.reward);
});
