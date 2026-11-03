import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';
import {UNITS,RULES} from '../dist/data.js';
import {BOX_REWARD_RULES,advanceBoxRewards} from '../dist/box-training-rules.js';
const clone=x=>JSON.parse(JSON.stringify(x));
function fixture(){
 const g=new Game({mode:'sandbox',seed:56}),p=g.state.players[1];g.state.sandbox.aiEnabled=true;g.state.wave=7;for(const q of g.state.players)q.eggHistory.firstWaveClosed=true;
 p.heroAltarCount=2;p.populationCap=300;p.gold=p.wood=0;p.roster=[];p.workers=10;p.lumberLevel=30;
 return {g,p};
}
function finish(g,p,raw='h010'){
 const d=UNITS.find(u=>u.id===`v14_${raw}`),i=p.buildings.length,b={id:g._uid('b'),unitId:d.id,col:i%6,row:Math.floor(i/6),construction:{targetId:d.id}};
 p.buildings.push(b);g._completeConstruction(p,b);return b;
}
function offer(p,...ids){p.boxRewards={providerId:`box-n060-${p.id}`,providerRawcode:'n060',ownerId:p.id,tier:BOX_REWARD_RULES[ids[0]].tier,sourceWave:6,consumed:false,abilityIds:ids};}
function commands(g){const calls=[],run=g.command.bind(g);g.command=(type,payload)=>{const result=run(type,payload);calls.push({type,payload,result});return result;};return calls;}

test('AI selects a usable earned reward over an unsupported builder spell exactly once',()=>{
 const {g,p}=fixture();offer(p,'A133','A13M');const calls=commands(g);g._aiAct(p);assert.equal(p.gold,50);assert.equal(p.boxRewards.selectedAbilityId,'A133');g._aiAct(p);assert.equal(p.gold,50);assert.equal(calls.filter(c=>c.type==='boxReward').length,1);
});
test('AI does not create rewards when none were earned or overwrite a consumed group',()=>{
 const {g,p}=fixture(),rng=g._rng;g._aiAct(p);assert.equal(p.boxRewards,undefined);assert.equal(g._rng,rng);
 offer(p,'A133');p.boxRewards.consumed=true;const before=clone(p.boxRewards);g._aiAct(p);assert.deepEqual(p.boxRewards,before);assert.equal(p.gold,0);
});
test('normal wave-six grants are consumed by AI while the human gift stays untouched',()=>{
 const {g,p}=fixture();advanceBoxRewards(g,6);const human=clone(g.state.players[0].boxRewards);g._aiAct(p);assert.equal(p.boxRewards.consumed,true);assert.deepEqual(g.state.players[0].boxRewards,human);
});
test('unsupported-only offers remain available without a failed command loop',()=>{
 const {g,p}=fixture();offer(p,'A13M','A2ZD','A2ZB');const calls=commands(g),before=clone(p.boxRewards);for(let i=0;i<5;i++)g._aiAct(p);assert.deepEqual(p.boxRewards,before);assert.equal(calls.some(c=>c.type==='boxReward'),false);
});
test('gift selection waits for build phase and cannot run while paused or ended',()=>{
 for(const phase of ['combat','paused','ended']){const {g,p}=fixture();offer(p,'A133');if(phase==='paused')g.state.paused=true;else g.state.phase=phase;g._aiAct(p);assert.equal(p.boxRewards.consumed,false);assert.equal(p.gold,0);}
});
test('sandbox disable and player-zero ownership remain respected for gifts',()=>{
 const {g,p}=fixture();offer(p,'A133');g.state.sandbox.aiEnabled=false;g._aiAct(p);assert.equal(p.boxRewards.consumed,false);const human=g.state.players[0];offer(human,'A133');g.state.sandbox.aiEnabled=true;g._aiAct(human);assert.equal(human.boxRewards.consumed,false);
});
test('random fighter reward creates one real unit in the AI own free cell',()=>{
 const {g,p}=fixture();offer(p,'A132');const rng=g._rng;g._aiAct(p);assert.equal(p.boxRewards.selectedAbilityId,'A132');assert.equal(p.buildings.length,1);const b=p.buildings[0];assert.equal(b.sourceGift.abilityId,'A132');assert.equal(b.col,2);assert.equal(b.row,4);assert.notEqual(g._rng,rng);assert.equal(p.gold,0);assert.equal(p.wood,0);
});
test('a full formation falls back to a resource offer without rolling a fighter',()=>{
 const {g,p}=fixture();for(let i=0;i<48;i++)finish(g,p);offer(p,'A132','A133');const rng=g._rng;g._aiAct(p);assert.equal(p.boxRewards.selectedAbilityId,'A133');assert.equal(p.buildings.length,48);assert.equal(g._rng,rng);
});
test('permanent attack reward prefers a fast area attacker and reaches combat',()=>{
 const {g,p}=fixture();finish(g,p);const dragon=finish(g,p,'h01B');offer(p,'A136');g._aiAct(p);assert.ok(dragon.permanentAbilityIds.includes('A139'));g._startCombat();const fighter=g.state.entities.find(e=>e.buildingId===dragon.id);assert.ok(fighter.skillSpecs.some(s=>s.id==='A139'));assert.ok(fighter.sourcePassiveStatBonuses.A139.flatDamage===30);
});
test('existing permanent grants are not wasted on the same target twice',()=>{
 const {g,p}=fixture(),b=finish(g,p);b.permanentAbilityIds=['A139','A13B'];offer(p,'A136','A133');g._aiAct(p);assert.equal(p.boxRewards.selectedAbilityId,'A133');assert.deepEqual(b.permanentAbilityIds,['A139','A13B']);
});
test('training pays the real discounted fee and releases the replaced carrier plan',()=>{
 const {g,p}=fixture(),b=finish(g,p);p.gold=40;p.aiUpgradePlan={buildingId:b.id,targets:['v14_h011']};offer(p,'A2ZA');const fee=g.boxTrainingStatus(b.id,p.id).targets[0].cost.gold,calls=commands(g);g._aiAct(p);assert.equal(p.gold,40-fee);assert.equal(p.buildings[0].unitId,'v14_h011');assert.notEqual(p.buildings[0].id,b.id);assert.equal(p.aiUpgradePlan,undefined);assert.equal(calls.filter(c=>c.type==='boxTrain'&&c.result.ok).length,1);
});
test('training cannot spend another carrier upgrade reservation',()=>{
 const {g,p}=fixture(),b=finish(g,p);const planned=finish(g,p,'h00N');planned.construction={targetId:'v14_h00N',finishAt:100,duration:2};p.gold=280;p.aiUpgradePlan={buildingId:planned.id,targets:['v14_h00U']};offer(p,'A2ZA');g._aiAct(p);assert.equal(b.unitId,'v14_h010');assert.equal(p.boxRewards.consumed,false);assert.equal(p.gold,280);
});
test('training preserves a carrier with permanent earned bonuses',()=>{
 for(const bonus of ['ability','armor']){const {g,p}=fixture(),b=finish(g,p);p.gold=40;if(bonus==='ability')b.permanentAbilityIds=['A13X'];else b.treasureArmor=15;offer(p,'A2ZA');g._aiAct(p);assert.equal(p.buildings[0].id,b.id);assert.equal(p.boxRewards.consumed,false);}
});
test('unaffordable training falls back to an available reward without negative resources',()=>{
 const {g,p}=fixture(),b=finish(g,p);offer(p,'A2ZA','A133');const calls=commands(g);g._aiAct(p);assert.equal(p.boxRewards.selectedAbilityId,'A133');assert.equal(calls.some(c=>c.type==='boxTrain'),false);assert.equal(b.unitId,'v14_h010');assert.ok(p.gold>=0&&p.wood>=0);
});
test('maxed lumber reward falls back, while valid research is granted once',()=>{
 const {g,p}=fixture();offer(p,'A140','A13O');g._aiAct(p);assert.equal(p.boxRewards.selectedAbilityId,'A13O');assert.equal(p.lumberLevel,30);
 const other=fixture();other.p.lumberLevel=0;offer(other.p,'A140');other.g._aiAct(other.p);assert.equal(other.p.lumberLevel,1);assert.equal(other.p.boxRewards.consumed,true);
});
test('healthy king receives paid attack, regen and hp targets before taking damage',()=>{
 const {g,p}=fixture(),k=g.state.kings[p.team];g.state.phase='combat';g.state.wave=12;k.attackLevel=6;p.wood=100;g._aiAct(p);assert.equal(k.regenLevel,1);assert.equal(p.wood,0);assert.equal(p.income,RULES.initialIncome+RULES.kingIncome);
 k.regenLevel=3;p.wood=100;const hp=k.maxHp;g._aiAct(p);assert.equal(k.hpLevel,1);assert.equal(k.maxHp,hp+RULES.kingHpUpgradeIncrements[0]);assert.equal(k.hp,k.maxHp);
});
test('shared king targets prevent four allies from buying the same upgrade goal repeatedly',()=>{
 const {g,p}=fixture(),k=g.state.kings[p.team];g.state.phase='combat';g.state.wave=1;k.attackLevel=0;p.wood=200;const calls=commands(g);g._aiAct(p);g._aiAct(p);assert.equal(k.attackLevel,1);assert.equal(p.wood,100);assert.equal(calls.filter(c=>c.type==='king').length,1);
});
test('healthy early kings keep wood for growth after reaching the attack target',()=>{
 const {g,p}=fixture(),k=g.state.kings[p.team];g.state.phase='combat';g.state.wave=10;k.attackLevel=5;p.wood=100;g._aiAct(p);assert.equal(p.wood,100);assert.equal(k.hpLevel,0);assert.equal(k.regenLevel,0);
});
test('critical king prioritizes immediate hp and every upgrade still pays wood',()=>{
 const {g,p}=fixture(),k=g.state.kings[p.team];g.state.phase='combat';k.hp=k.maxHp*.2;p.wood=99;g._aiAct(p);assert.equal(k.hpLevel,0);p.wood=100;g._aiAct(p);assert.equal(k.hpLevel,1);assert.equal(p.wood,0);assert.equal(k.hp,200+RULES.kingHpUpgradeIncrements[0]);
});
test('king development cannot steal wood from a pending troop chain',()=>{
 const {g,p}=fixture(),b=finish(g,p,'h08Y'),k=g.state.kings[p.team];g.state.phase='combat';p.aiUpgradePlan={buildingId:b.id,targets:['v14_h0YM']};const target=UNITS.find(u=>u.id==='v14_h0YM');assert.ok(target.woodCost>0);p.wood=target.woodCost+99;g._aiAct(p);assert.equal(k.attackLevel,0);assert.equal(k.hpLevel,0);
});
test('reward choice and king investments continue identically after save restore',()=>{
 const {g,p}=fixture();finish(g,p,'h01B');offer(p,'A136','A133','A134');p.wood=400;const saved=Game.fromSnapshot(clone(g.snapshot()));g._aiAct(p);saved._aiAct(saved.state.players[p.id]);assert.deepEqual(clone(saved.snapshot()),clone(g.snapshot()));
});
