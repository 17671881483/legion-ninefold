import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/engine.js';
import {UNIT_TEMPLATES} from '../dist/data.js';
import {compileSkills,tickSourceScriptJobs,sourceAuraEffects} from '../dist/skills.js';
import {castAICombat} from '../dist/ai-combat.js';
const clone=x=>JSON.parse(JSON.stringify(x));
function fixture(ids=['A16T']){
 const g=new Game({mode:'sandbox',seed:70}),p=g.state.players[4];g.state.sandbox.aiEnabled=true;g.state.phase='combat';g.state.time=10;g.state.entities=[];g._spawnQueue=[];
 for(const q of g.state.players){q.gold=q.wood=0;q.roster=[];}for(const k of g.state.kings)k.worldX=k.worldY=10000;
 const make=(x=0,y=0,enemy=false,abilities=[])=>{
  const e=g._entity(UNIT_TEMPLATES.h0WK,{ownerId:enemy?0:p.id,side:enemy?'monster':'defender',team:enemy?0:1,battleTeam:1,laneId:4,sourceLaneId:4,userData:5,worldX:20+x,worldY:10+y});
  e.skillSpecs=compileSkills({abilityIds:abilities,skillVersion:'v14.1A5',distanceScale:1/3});e.skillStates={};e.hp=e.maxHp=2000;e.mana=e.maxMana=100;e.hpRegen=e.manaRegen=e.moveSpeed=0;e.attackCd=999;e.traits=[];e.buffs=[];e.isAncient=false;g.state.entities.push(e);return e;
 };
 const a=make(0,0,false,ids),calls=[],command=g.command.bind(g);g.command=(type,payload)=>{const result=command(type,payload);calls.push({type,payload,result});return result;};
 return {g,p,a,make,calls,act:()=>castAICombat(g,p),casts:()=>calls.filter(c=>c.type==='cast'&&c.result.ok)};
}
test('AI centers blossom on concentrated wounds and pays the native fee once',()=>{
 const f=fixture(),near=f.make(-1.8);near.hp=1900;const a=f.make(1.8),b=f.make(2.7);a.hp=b.hp=1000;
 f.act();assert.equal(f.casts().length,1);assert.equal(f.casts()[0].payload.worldX,a.worldX);assert.equal(f.a.mana,90);assert.equal(f.a.skillStates.A16T.readyAt,25);
 tickSourceScriptJobs(f.g);assert.equal(a.hp,1060);assert.equal(b.hp,1060);assert.equal(near.hp,1900);f.act();assert.equal(f.casts().length,1);
});
test('healthy armies do not waste healing mana',()=>{const f=fixture(['A16T','A0JA']);f.make(.2);f.act();assert.equal(f.casts().length,0);assert.equal(f.a.mana,100);});
test('minor wounds below the useful healing threshold wait',()=>{const f=fixture();f.a.hp=1900;f.act();assert.equal(f.a.mana,100);});
test('tranquility evaluates the aura around its caster and restores real HP per second',()=>{
 const f=fixture(['A0JA']),t=f.make(1);t.hp=800;f.act();assert.equal(f.casts()[0].payload.targetId,t.id);assert.equal(f.a.mana,72);assert.equal(sourceAuraEffects(f.g,t,[]).healRate,80);
});
test('an injured target in cast range but outside tranquility aura is not enough',()=>{const f=fixture(['A0JA']),t=f.make(1.9);t.hp=100;f.act();assert.equal(f.a.mana,100);});
test('existing allied tranquility coverage prevents wasting a second cast',()=>{
 const f=fixture(['A0JA']),t=f.make(.2);t.hp=500;f.act();const second=f.make(.1,0,false,['A0JA']);f.act();assert.equal(f.casts().length,1);assert.equal(second.mana,100);
});
test('a rejected immune heal target does not starve a legal injured ally',()=>{
 const f=fixture(['A0JA']),bad=f.make(.1,0,false,['Amim']),good=f.make(.2);bad.hp=good.hp=500;f.act();assert.equal(f.casts().at(-1).payload.targetId,good.id);assert.equal(f.a.mana,72);
});
test('many immune cyclone or invulnerable targets cannot hide the later legal heal target',()=>{
 for(const mode of ['immune','cyclone','invulnerable']){const f=fixture(['A0JA']);for(let i=0;i<5;i++){const bad=f.make(.1,0,false,mode==='immune'?['Amim']:[]);bad.hp=100;if(mode==='cyclone')bad.status.cycloneUntil=11;if(mode==='invulnerable')bad.invulnerable=true;}const good=f.make(.2);good.hp=500;f.act();assert.equal(f.casts()[0].payload.targetId,good.id,mode);assert.equal(f.a.mana,72);}
});
test('Anduin keeps source-triggered burst priority even when enemies cluster',()=>{
 const f=fixture(['A1SP','A1SV']);for(let i=0;i<4;i++)f.make(.5+i*.1,0,true);f.act();assert.equal(f.casts().length,0);assert.equal(f.a.mana,100);
});
test('sparse combat preserves Anduin mana for his source-triggered soul burst',()=>{const f=fixture(['A1SP','A1SV']);f.a.mana=30;f.make(.5,0,true);f.act();assert.equal(f.casts().length,0);assert.equal(f.a.mana,30);});
test('summoners wait for nearby opposition rather than spending timed life at spawn',()=>{
 for(const id of ['A1TW','A1UN']){const f=fixture([id]);f.make(3.01,0,true);f.act();assert.equal(f.a.mana,100);f.make(2.9,0,true);f.act();assert.equal(f.casts().length,1);assert.equal(f.a.mana,id==='A1TW'?87:75);assert.equal(f.g.state.entities.filter(e=>e.isSummon).length,id==='A1TW'?1:4);}
});
test('Nerzhul summons beside himself through the real command',()=>{const f=fixture(['A1UN']);f.make(2,0,true);f.act();assert.equal(f.casts()[0].payload.worldX,f.a.worldX);assert.equal(f.casts()[0].payload.worldY,f.a.worldY);});
test('ancient summoners cannot issue stopped native summon orders',()=>{for(const id of ['A1TW','A1UN']){const f=fixture([id]);f.a.isAncient=true;f.make(.2,0,true);f.act();assert.equal(f.casts().length,0);assert.equal(f.a.mana,100);}});
test('blade waits until a valuable enemy is within the actual 350 radius',()=>{
 const f=fixture(['A1TZ']),t=f.make(351/300,0,true);f.act();assert.equal(f.a.mana,100);t.worldX=f.a.worldX+350/300;f.act();assert.equal(f.casts().length,1);assert.equal(f.a.mana,84);
});
test('each caster issues at most one successful paid command per AI turn',()=>{const f=fixture(['A1TW','A1TZ','A1UN']);f.make(.5,0,true);f.act();assert.equal(f.casts().length,1);assert.ok(f.a.mana<100);});
test('main AI dispatch actually calls combat tactics',()=>{const f=fixture(['A1TW']);f.make(.5,0,true);f.g._aiAct(f.p);assert.equal(f.casts().length,1);});
test('AI respects manual casts and their shared cooldown',()=>{
 const f=fixture(['A1TW']);f.make(.5,0,true);assert.equal(f.g.command('cast',{entityId:f.a.id,playerId:4,skillId:'A1TW'}).ok,true);f.act();assert.equal(f.casts().length,1);assert.equal(f.a.mana,87);
});
test('no enemy or wrong battlefield means no offensive spell',()=>{
 for(const mode of ['none','ally','other-battle','hidden','removed','dead','locust','invulnerable']){const f=fixture(['A1TW','A1SP','A1TZ']);if(mode!=='none'){const t=f.make(.5,0,mode!=='ally',mode==='locust'?['Aloc']:mode==='invulnerable'?['Avul']:[]);if(mode==='other-battle')t.battleTeam=0;if(mode==='hidden')t.status.sourceHidden=true;if(mode==='removed')t.status.sourceRemoved=true;if(mode==='dead')t.hp=0;}f.act();assert.equal(f.casts().length,0,mode);assert.equal(f.a.mana,100);}
});
test('caster control states, zero level and insufficient mana preserve resources',()=>{
 for(const mode of ['stun','silence','paused','hidden','removed','dead','zero-level','mana']){const f=fixture(['A1TW']);f.make(.5,0,true);if(mode==='stun')f.a.status.stunUntil=11;if(mode==='silence')f.a.status.silenceUntil=11;if(mode==='paused')f.a.status.sourcePaused=true;if(mode==='hidden')f.a.status.sourceHidden=true;if(mode==='removed')f.a.status.sourceRemoved=true;if(mode==='dead')f.a.hp=0;if(mode==='zero-level')f.a.abilityLevels={A1TW:0};if(mode==='mana')f.a.mana=12;const mana=f.a.mana;f.act();assert.equal(f.casts().length,0,mode);assert.equal(f.a.mana,mana);}
});
test('human units and other owners are never cast by this AI',()=>{const f=fixture(['A1TW']);f.make(.5,0,true);f.a.ownerId=0;const before=clone(f.g.snapshot());f.act();castAICombat(f.g,f.g.state.players[0]);assert.deepEqual(clone(f.g.snapshot()),before);});
test('paused disabled build and ended games have no tactical side effects',()=>{for(const mode of ['paused','disabled','build','ended']){const f=fixture(['A1TW']);f.make(.5,0,true);if(mode==='paused')f.g.state.paused=true;else if(mode==='disabled')f.g.state.sandbox.aiEnabled=false;else f.g.state.phase=mode;const before=clone(f.g.snapshot());f.act();assert.deepEqual(clone(f.g.snapshot()),before,mode);}});
test('planning without a legal cast consumes no combat RNG',()=>{const f=fixture(['A1TW']);const rng=f.g._rng;f.act();assert.equal(f.g._rng,rng);});
test('two owned casters can independently act in the same AI turn',()=>{const f=fixture(['A1TW']),second=f.make(.1,0,false,['A1TW']);f.make(.5,0,true);f.act();assert.equal(f.casts().length,2);assert.equal(second.mana,87);});
test('save restore repeats targets mana cooldowns and summons exactly',()=>{
 const f=fixture(['A1TW','A1UN']);f.make(.5,0,true);const restored=Game.fromSnapshot(clone(f.g.snapshot()));f.act();castAICombat(restored,restored.state.players[4]);assert.deepEqual(clone(restored.snapshot()),clone(f.g.snapshot()));
});
test('unknown and unresolved active skills are not guessed by combat AI',()=>{const f=fixture(['A1TY','A1TV']);f.make(.5,0,true);f.act();assert.equal(f.casts().length,0);assert.equal(f.a.mana,100);});
test('real arena deployment can summon Maiev avatar while Nerzhul ritual stays removed',()=>{
 const f=fixture();for(const p of f.g.state.players)p.buildings=[];
 for(const [i,raw] of ['n08G','n08J'].entries())f.p.buildings.push({id:'arena-'+raw,unitId:'v14_'+raw,col:i,row:5,construction:null});
 f.g.state.players[0].buildings.push({id:'arena-enemy',unitId:'v14_h00T',col:2,row:5,construction:null});f.g._startArena();
 const a=f.g.state.entities.find(e=>e.combatRawcode==='h0WK'),n=f.g.state.entities.find(e=>e.combatRawcode==='h0WM'),enemy=f.g.state.entities.find(e=>e.ownerId===0);
 assert.equal(a.side,'arena1');assert.equal(n.skillSpecs.some(s=>s.id==='A1UN'),false);enemy.worldX=a.worldX+2;enemy.worldY=a.worldY;f.act();
 assert.ok(f.casts().some(c=>c.payload.entityId===a.id&&c.payload.skillId==='A1TW'));assert.equal(f.casts().some(c=>c.payload.skillId==='A1UN'),false);
});
