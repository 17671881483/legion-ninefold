import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Game} from '../dist/engine.js';
import {UNIT_TEMPLATES} from '../dist/data.js';
const source=(await readFile(new URL('../reference/v14-source/raw_extracted/war3map.j',import.meta.url))).toString('latin1');
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function fixture(code){
  const g=new Game({mode:'sandbox',seed:42});g.state.entities=[];g.state.sourceSkillJobs=[];
  const attacker=g._entity(UNIT_TEMPLATES[code],{ownerId:0,team:0,side:'defender',battleTeam:0,laneId:0,sourceLaneId:0,worldX:1,worldY:1});attacker.skillSpecs=[];attacker.mana=0;
  const target=g._entity({id:'v14-native-passive-target',sourceVersion:'v14.1A5',hp:1000,armor:0,armorType:'medium',sourceArmorTypeRaw:'medium',abilityIds:[]},{ownerId:4,team:1,side:'monster',battleTeam:0,laneId:0,sourceLaneId:0,worldX:1.2,worldY:1});
  g.state.entities=[attacker,target];return {g,attacker,target};
}
test('true fire is an independent listener with its own recursion guard and uses pre-event life',()=>{
  const body=source.match(/function A_SushuiInfernoSpellTrueFire\b[\s\S]*?endfunction/)[0];
  assert.match(body,/DisableTrigger\(GetTriggeringTrigger\(\)\)/);assert.match(body,/\.03,ATTACK_TYPE_NORMAL,DAMAGE_TYPE_UNIVERSAL/);
  const {g,attacker,target}=fixture('n0S4'),factor=g._typeMultiplier('spells',target.armorType,target.sourceArmorTypeRaw);
  g._sourceDamageTriggerDepth=1;g._hurt(target,100,attacker,{spell:true,universal:true});
  near(target.hp,1000-100-1000*.03*factor);assert.equal(g._sourceTrueFireDepth,0);assert.equal(g._sourceDamageTriggerDepth,1);
});
test('frozen touch is independently gated by strictly more than forty actual damage and native hero classification',()=>{
  const {g,attacker,target}=fixture('n0S6');target.hp=500;target.isHero=true;target.isNativeHero=false;
  const factor=g._typeMultiplier('spells',target.armorType,target.sourceArmorTypeRaw);
  g._sourceDamageTriggerDepth=1;g._hurt(target,40,attacker,{spell:true,universal:true});near(target.hp,460);
  g._hurt(target,41,attacker,{spell:true,universal:true});near(target.hp,419-1000*.01*factor);
  target.hp=500;target.isNativeHero=true;g._hurt(target,41,attacker,{spell:true,universal:true});near(target.hp,459-500*.01*factor);assert.equal(g._sourceFrozenTouchDepth,0);
});
test('true-fire damage can trigger a fresh alchemist reaction without recursively adding true fire',()=>{
  const {g,attacker}=fixture('n0S4');const target=g._entity(UNIT_TEMPLATES.h0XH,{ownerId:4,team:1,side:'monster',battleTeam:0,laneId:0,sourceLaneId:0,worldX:1.2,worldY:1});target.mana=0;target.hp=target.maxHp*.25+101;g.state.entities=[attacker,target];
  let calls=0;const hurt=g._hurt.bind(g);g._hurt=(...args)=>{calls++;assert.ok(calls<5);return hurt(...args);};g._hurt(target,100,attacker,{spell:true,universal:true});
  assert.equal(calls,2);assert.equal(target.skillStates.A2Z2.casts,1);assert.equal(g._sourceTrueFireDepth,0);
});
