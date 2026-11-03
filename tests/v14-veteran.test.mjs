import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Game} from '../dist/engine.js';
import {UNITS,UNIT_TEMPLATES,RULES} from '../dist/data.js';
import {compileSkills,describeSkills,tickSourceScriptJobs} from '../dist/skills.js';
import {veteranDeath} from '../dist/veteran-rules.js';
import {isReincarnating} from '../dist/reincarnation-rules.js';
import {laneToWorld} from '../dist/layout.js';
const clone=x=>JSON.parse(JSON.stringify(x)),u=code=>UNITS.find(u=>!u.legacy&&u.sourceRawcode===code),ok=r=>assert.equal(r.ok,true,r.message);
function skills(e,ids){e.skillSpecs=compileSkills({skillVersion:'v14.1A5',distanceScale:1/3,abilityIds:ids});e.skillStates=Object.fromEntries(ids.map(id=>[id,{readyAt:0,casts:0}]));}
function fixture(){
 const g=new Game({mode:'sandbox',seed:49});g.state.phase='combat';g.state.time=10;g.state.entities=[];g.state.sourceSkillJobs=[];g._spawnQueue=[];g._aiAct=()=>{};
 const point=laneToWorld(0,3,6);
 const make=(code='h028',extra={})=>{const e=g._entity(UNIT_TEMPLATES[code],{side:'defender',ownerId:0,team:0,sourceNativeOwnerId:8,userData:1,battleTeam:0,laneId:0,sourceLaneId:0,worldX:point.x,worldY:point.y,...extra});skills(e,[]);e.hp=e.maxHp=1000;e.armor=0;e.hpRegen=e.manaRegen=e.moveSpeed=0;e.attackCd=9999;e.ability=null;g.state.entities.push(e);return e;};
 const a=make(),t=make('h03E',{side:'monster',team:1,ownerId:4,sourceNativeOwnerId:11,userData:0,worldX:point.x+.5});
 const gold=g.state.players.map(p=>p.gold);let draws=0;
 const rolls=(...values)=>{draws=0;g._random=()=>{assert.ok(draws<values.length,'unexpected RNG draw');return values[draws++];};};
 const delta=id=>g.state.players[id].gold-gold[id],kill=()=>g._hurt(t,2000,a,{spell:true,scripted:true});
 return{g,a,t,make,rolls,delta,kill,draws:()=>draws};
}
test('pinned source proves the listener, human count and dormant alternate unlock',()=>{
 const audit=JSON.parse(readFileSync(new URL('../reference/veteran-reward-evidence.json',import.meta.url))),raw=readFileSync(new URL('../reference/v14-source/raw_extracted/war3map.j',import.meta.url)),source=raw.toString('latin1'),lines=source.split('\n');
 assert.equal(createHash('sha256').update(raw).digest('hex'),audit.source.sha256);for(const row of audit.sourceEvidence)assert.equal(lines[row.line-1].replace(/\r$/,''),row.text);
 assert.doesNotMatch(source,/\bset T[23]\[/);assert.doesNotMatch(source,/(?:Disable|Enable)Trigger\(T0\)/);
 assert.equal(lines.filter(l=>/^set Sf\[0\]=/.test(l)).length,2);
});
test('native condition preserves owner8 veteran AND versus any owner9 killer',()=>{
 for(const [code,owner,eligible]of [['h028',8,true],['h00L',8,false],['h00L',9,true],['h028',9,true],['h028',0,false],['h028',10,false]]){
  const f=fixture();f.a.combatRawcode=code;f.a.sourceNativeOwnerId=owner;f.rolls(...(eligible?[0]:[]));veteranDeath(f.g,f.t,f.a);assert.equal(f.delta(0),eligible?1:0);assert.equal(f.draws(),eligible?1:0);
 }
});
test('A113 is neither necessary nor sufficient for the registered rawcode condition',()=>{
 const f=fixture();assert.equal(f.a.skillSpecs.length,0);f.rolls(0);veteranDeath(f.g,f.t,f.a);assert.equal(f.delta(0),1);
 const n=fixture();n.a.combatRawcode='h00L';skills(n.a,['A113']);n.rolls();veteranDeath(n.g,n.t,n.a);assert.equal(n.delta(0),0);
});
test('integer60 percent and two-human30 percent have exact endpoint behavior',()=>{
 for(const [humans,draw,awarded,roll]of [[1,.599999,1,6],[1,.6,0,7],[2,.299999,1,3],[2,.3,0,4],[8,.599999,1,6]]){
  const f=fixture();f.g.state.sourceHumanPlayerCount=humans;f.rolls(draw);veteranDeath(f.g,f.t,f.a);assert.equal(f.delta(0),awarded);assert.equal(f.t.status.veteranReward.roll,roll);assert.equal(f.draws(),1);
 }
});
test('single-player human count is independent from sandbox AI and difficulty',()=>{
 for(const mode of ['normal','sandbox']){const g=new Game({mode,seed:49});assert.equal(g.state.sourceHumanPlayerCount,1);if(mode==='sandbox'){g.state.sandbox.aiEnabled=true;assert.equal(g.state.sourceHumanPlayerCount,1);}}
});
test('recipient is userData minus one, not economic owner or lane',()=>{
 const f=fixture();f.a.ownerId=4;f.a.sourceLaneId=6;f.a.userData=3;f.rolls(0);veteranDeath(f.g,f.t,f.a);assert.equal(f.delta(2),1);assert.equal(f.delta(0),0);assert.equal(f.delta(4),0);assert.equal(f.g.state.players[2].stats.goldEarned,1);
});
test('missing and unrepresented native recipients never fall back to a human',()=>{
 for(const value of [undefined,0,10]){const f=fixture();f.a.userData=value;f.rolls(0);veteranDeath(f.g,f.t,f.a);assert.equal(f.delta(0),0);assert.equal(f.t.status.veteranReward.boundary,'native-player-not-represented');assert.equal(f.g.state.sourceVeteranCounts[value??0],1);}
});
test('T1 counts successful rewards;125 does not invent the never-written T2/T3 flags',()=>{
 const f=fixture(),next=f.make('h03E');f.g.state.sourceVeteranCounts[1]=124;f.rolls(.9,0);veteranDeath(f.g,f.t,f.a);assert.equal(f.g.state.sourceVeteranCounts[1],124);veteranDeath(f.g,next,f.a);assert.equal(f.g.state.sourceVeteranCounts[1],125);assert.equal(f.g.state.players[0].technologies.R00M,undefined);assert.equal(f.delta(0),1);
});
test('independent listener still rewards while main death chain is suppressed or Ju-excluded',()=>{
 for(const mode of ['nested','Ju']){const f=fixture();f.g.state.wave=31;if(mode==='nested')f.g._sourceUnitDeathTriggerDepth=1;else f.t.status.sourceJuMember=true;f.rolls(0);f.kill();assert.equal(f.delta(0),1);assert.equal(f.draws(),1);assert.equal(f.t.status.veteranReward.awarded,1);}
});
test('spell damage and dead, allied or self killers retain the source reward condition',()=>{
 for(const mode of ['spell','dead','ally','self']){const f=fixture();f.g.state.wave=31;if(mode==='dead')f.a.hp=0;if(mode==='ally'){f.t.side='defender';f.t.team=0;}if(mode==='self'){f.t=f.a;}f.rolls(.9,0);f.g._hurt(f.t,2000,f.a,{spell:true,scripted:true});assert.equal(f.delta(0),1,mode);assert.equal(f.draws(),2);}
});
test('bounty and farmer reward settle before independent veteran reward',()=>{
 const f=fixture();f.g.state.players[0].nagaFarmerGoldRate=100;f.rolls(.9,0,0);let eventGold;
 const event=f.g._event.bind(f.g);f.g._event=(type,e,text,data)=>{if(data?.skillId==='A113')eventGold=f.delta(0);event(type,e,text,data);};f.kill();
 assert.equal(f.delta(0),RULES.waveKillGold[0]+2);assert.equal(eventGold,f.delta(0));assert.equal(f.draws(),3);
});
test('wave31 removes ordinary bounty but retains veteran reward',()=>{
 const f=fixture();f.g.state.wave=31;f.rolls(.9,0);f.kill();assert.equal(f.delta(0),1);assert.equal(f.t.reward,0);
});
test('arena and summoned victims are eligible without ordinary wave reward',()=>{
 for(const kind of ['arena','summon']){const f=fixture();f.t.side='arena1';f.t.isArena=true;if(kind==='summon')f.t.isSummon=true;f.rolls(.9,0);f.kill();assert.equal(f.delta(0),1);}
});
test('red king native treasury is recorded as unrepresented and never credited to humans',()=>{
 const f=fixture();f.rolls(0);veteranDeath(f.g,f.t,f.g.state.kings[1]);assert.equal(f.t.status.veteranReward.playerId,9);assert.equal(f.t.status.veteranReward.boundary,'native-player-not-represented');assert.equal(f.g.state.sourceVeteranCounts[10],1);assert.equal(f.delta(0),0);
 const n=fixture();n.rolls();veteranDeath(n.g,n.t,n.g.state.kings[0]);assert.equal(n.draws(),0);
});
test('each terminal death rolls at most once, including failed rewards',()=>{
 for(const draw of [0,.9]){const f=fixture();f.rolls(.9,draw);f.kill();f.g._settleDeath(f.t,f.a);veteranDeath(f.g,f.t,f.a);assert.equal(f.draws(),2);assert.equal(f.g.state.sourceVeteranCounts[1]??0,draw===0?1:0);}
});
test('ordinary reincarnation does not pay until a genuine terminal death',()=>{
 const f=fixture();f.t.combatRawcode='h0QD';skills(f.t,['A14E']);f.rolls();f.kill();assert.equal(isReincarnating(f.t),true);assert.equal(f.t.status.veteranReward,undefined);assert.equal(f.delta(0),0);
 f.g.state.time=12;tickSourceScriptJobs(f.g);assert.equal(f.t.hp,1000);f.rolls(.9,0);f.kill();assert.equal(isReincarnating(f.t),false);assert.equal(f.t.status.veteranReward.awarded,1);
});
test('real soldier upgrade deploys exact native owner and userData in normal and arena rounds',()=>{
 const g=new Game({mode:'sandbox',builderId:'v14_builder_u000',seed:49}),p=g.state.players[0];ok(g.command('build',{unitId:u('h00M').id,col:0,row:0}));ok(g.command('sandboxComplete'));const b=p.buildings[0];ok(g.command('upgrade',{buildingId:b.id,unitId:u('h00T').id}));ok(g.command('sandboxComplete'));ok(g.command('ready'));
 for(const mode of ['normal','arena']){if(mode==='arena')g._startArena();const e=g.state.entities.find(e=>e.buildingId===b.id);assert.equal(e.combatRawcode,'h028');assert.equal(e.sourceNativeOwnerId,8);assert.equal(e.userData,1);assert.equal(e.skillSpecs.some(s=>s.id==='A113'),false);}
});
test('red non-veteran deployment also preserves native owner9 and original recipient',()=>{
 const g=new Game({mode:'sandbox',seed:49}),p=g.state.players[5];p.buildings=[{id:'red',unitId:u('h00M').id,col:0,row:0}];g._startArena();const a=g.state.entities.find(e=>e.buildingId==='red');assert.equal(a.combatRawcode,'h00L');assert.equal(a.sourceNativeOwnerId,9);assert.equal(a.userData,6);const gold=p.gold;g._random=()=>0;veteranDeath(g,{skillVersion:'v14.1A5',status:{}},a);assert.equal(p.gold,gold+1);
});
test('legacy saves hydrate only verifiable original buildings, preserving explicit zeros',()=>{
 for(const kind of ['matched','mismatch','missing','summon','illusion','zero']){const f=fixture();f.a.buildingId='old';delete f.a.userData;delete f.a.sourceNativeOwnerId;if(kind!=='missing')f.g.state.players[0].buildings=[{id:'old',unitId:u(kind==='mismatch'?'h00M':'h00T').id,col:0,row:0}];if(kind==='summon')f.a.isSummon=true;if(kind==='illusion')f.a.isIllusion=true;if(kind==='zero'){f.a.userData=0;f.a.sourceNativeOwnerId=0;}const g=Game.fromSnapshot(clone(f.g.snapshot())),a=g.state.entities[0];assert.equal(a.sourceNativeOwnerId,kind==='matched'?8:kind==='zero'?0:undefined,kind);assert.equal(a.userData,kind==='matched'?1:kind==='zero'?0:undefined,kind);}
});
test('saved RNG, recipient, counters and handled-death state resume without repeat payout',()=>{
 const f=fixture(),a=Game.fromSnapshot(clone(f.g.snapshot())),b=Game.fromSnapshot(clone(f.g.snapshot()));a._hurt(a.state.entities[1],2000,a.state.entities[0],{spell:true,scripted:true});b._hurt(b.state.entities[1],2000,b.state.entities[0],{spell:true,scripted:true});assert.deepEqual(clone(a.snapshot()),clone(b.snapshot()));
 const c=Game.fromSnapshot(clone(a.snapshot())),gold=c.state.players[0].gold,rng=c._rng;veteranDeath(c,c.state.entities[1],c.state.entities[0]);assert.equal(c.state.players[0].gold,gold);assert.equal(c._rng,rng);
});
test('building-only A113 is described as partial without injecting a combat ability',()=>{
 const def=u('h00T'),s=describeSkills(def).find(s=>s.id==='A113');assert.ok(s);assert.equal(s.status,'partial');assert.ok(s.effectText.includes('2名人类'));assert.ok(s.effectText.includes('不能直接解锁泰兰'));assert.equal(compileSkills(def).some(s=>s.id==='A113'),false);
});
test('natural battle waits through pause and settles a veteran kill without direct death calls',()=>{
 const f=fixture();f.t.hp=1;f.a.damage=10000;f.a.attackCd=0;f.g._random=()=>0;f.g.state.paused=true;f.g.tick(.2);assert.equal(f.t.status.veteranReward,undefined);f.g.state.paused=false;for(let i=0;i<60&&!f.t.status.veteranReward;i++)f.g.tick(.05);assert.equal(f.t.status.veteranReward?.awarded,1);assert.equal(f.g.state.sourceVeteranCounts[1],1);assert.ok(f.t.hp<=0);
});
