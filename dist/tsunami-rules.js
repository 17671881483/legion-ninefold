import {V14_ABILITIES,V14_UNIT_TEMPLATES} from './v14-reference.js';

const boundary='原生施法前摇、同帧事件次序、单位枚举顺序及原图地形仍为宿主适配；没有凭文案增加海啸伤害。';
export const WATER_ARMOR_NATIVE_REFERENCE=Object.freeze({base:'AUfa',manaCost:40,cast:0,versions:['1.24.4','1.27.1'],customInheritanceVerified:false,
 sources:['https://github.com/sumneko/w3x2lni/blob/master/data/zhCN-1.24.4/prebuilt/Custom/ability.ini#L22702-L22745','https://github.com/sumneko/w3x2lni/blob/master/data/enUS-1.27.1/prebuilt/Custom/ability.ini#L22745-L22788']});
export const TSUNAMI_RULES=Object.freeze({
 A313:{status:'partial',active:true,targetKind:'enemy',description:'海啸：手动选择400码内敌人，消耗25魔法、冷却5秒。读取施法者已有朝向，小于180度取90度，否则取270度；创建e010，每0.04秒前移15码、半径增加5码，初始半径250，共40次。范围内活着的敌人每次沿波方向推7码，仅目标点可步行时移动；不造成已核定脚本伤害。',partial:boundary+'ANfd的DataA/B是图形参数，原生DataC伤害缺失不补值。原型auto为空，未发现海啸自动命令。飞行波不套用地面导航裁剪；目标推移使用Web地形点检查，不能视作原图可行走性完全一致。'},
 A07Y:{status:'partial',active:true,nativeKind:true,targetKind:'unit',manaCost:40,description:'水甲：800码友方目标，5秒冷却，施加10秒5点护甲。Cost字段未提取，宿主采用AUfa原生参考40魔法；默认娜迦女王最多30魔法，不能因此免费施放。只有原型h108成功施法后，才从自身400码内生命至少1且非原目标的友军中随机选取至多两名不同单位，每名由独立u006请求水甲。',partial:boundary+'原生40魔法仅为1.24.4/1.27.1基础对象参考，不证明本图缺失Cost的继承。辅助施法记录request/hostAccepted/applied，按即时原生命令适配；u006施法点与真实命中次序未知。原生水甲受到近战攻击后的减速尚未还原，不以其他技能的减速值补造。'},
});
const raw=e=>e?.combatRawcode??e?.sourceRawcode??e?.rawcode;
const has=(e,id)=>e?.skillSpecs?.some(s=>s.id===id)&&(e.abilityLevels?.[id]??1)>0;
const scale=e=>(e?.distanceScale??1/3)/100;
const pos=e=>({x:e?.worldX??e?.x,y:e?.worldY??e?.y});
const distance=(a,b)=>Math.hypot(pos(a).x-pos(b).x,pos(a).y-pos(b).y);
const removed=e=>!e||e.status?.sourceRemoved||e.status?.yseraRemoved;
const hidden=e=>e?.status?.sourceHidden||e?.status?.yseraHidden;
const alive=e=>!removed(e)&&e.hp>.405&&!e.status?.deathCounted;
const all=g=>[...(g.state.entities??[]),...(g.state.kings??[])];
const jobs=g=>g.state.sourceSkillJobs??=[];
const state=e=>(e.status??={}).tsunami??={};
const sameBattle=(a,b)=>a.battleTeam===undefined||b.battleTeam===undefined||a.battleTeam===b.battleTeam;
const ally=(a,b)=>a.team!==undefined&&b.team!==undefined?a.team===b.team:a.side===b.side;
const facing=e=>((Number.isFinite(e?.facing)?e.facing:270)%360+360)%360;
const num=(value,fallback=0)=>value!==undefined&&Number.isFinite(Number(value))?Number(value):fallback;
const fields=id=>V14_ABILITIES[id]?.resolved_fields??{};
const invulnerable=(e,api)=>api.scriptInvulnerable?.(e)??(e.invulnerable||has(e,'Avul'));
const magicImmune=(e,api)=>api.magicImmune?.(e)??e.skillSpecs?.some(s=>s.kind==='immunity'&&s.status==='implemented');
const blocked=(g,e)=>g.state.paused||!alive(e)||hidden(e)||e.status?.sourcePaused||e.status?.yseraPaused||e.status?.illidanPaused||['stunUntil','cycloneUntil','silenceUntil'].some(k=>e.status?.[k]>g.state.time);
function spec(e,id){
 const f=fields(id);
 return {id,kind:id==='A07Y'?'buff':'tsunami_source',status:'partial',runtimeImplemented:true,targets:String(f.targs1??'_').split(','),range:num(f.Rng1)*scale(e),manaCost:num(f.Cost1,id==='A07Y'?WATER_ARMOR_NATIVE_REFERENCE.manaCost:25),cooldown:num(f.Cool1,5),armor:num(f.DataB1),duration:num(f.DataA1),buffKey:f.BuffID1??id};
}
function targetFailure(g,e,t,s,api,{enemy=false}={}){
 if(!alive(t)||hidden(t)||has(t,'Aloc'))return 'dead-hidden-or-locust';
 if(!sameBattle(e,t)||(enemy?ally(e,t):!ally(e,t)))return 'alliance-or-battle';
 if(t.status?.cycloneUntil>g.state.time)return 'cyclone';
 if(enemy&&(invulnerable(t,api)||magicImmune(t,api)))return 'immune-or-invulnerable';
 if(api.matchesTargets&&!api.matchesTargets(s,e,t))return 'native-target-mask';
 if(distance(e,t)>s.range+1e-8)return 'range';
 return null;
}
function pay(g,e,s){
 const prior=e.skillStates?.[s.id];
 if((prior?.readyAt??0)>g.state.time+1e-8)return {ok:false,message:'技能冷却中',reason:'cooldown'};
 if(!(e.mana>=s.manaCost))return {ok:false,message:'魔法不足',reason:'mana'};
 const st=(e.skillStates??={})[s.id]??={readyAt:0,casts:0};
 e.mana-=s.manaCost;st.readyAt=g.state.time+s.cooldown;st.casts++;e.pendingAttack=null;
 return {ok:true};
}
function auxiliary(g,e,code,extra,api){
 const t=V14_UNIT_TEMPLATES[code],p=pos(e),options={worldX:p.x,worldY:p.y,facing:0,isSummon:true,isHero:false,isNativeHero:false,scriptAuxiliary:true,nav:undefined,buildingId:undefined,reward:0,...extra};
 let d=api.spawnUnit?.(g,e,code,options);
 if(!d){
  d={id:g._uid('tsunami-aux'),sourceRawcode:code,combatRawcode:code,skillVersion:'v14.1A5',distanceScale:e.distanceScale??1/3,side:e.side,team:e.team,battleTeam:e.battleTeam,ownerId:e.ownerId,sourceNativeOwnerId:e.sourceNativeOwnerId,laneId:e.laneId,sourceLaneId:e.sourceLaneId,
   hp:t.hp,maxHp:t.hp,mana:t.manaStart,maxMana:t.mana,manaRegen:t.manaRegen,skillSpecs:t.abilityIds.map(id=>({id})),skillStates:{},status:{},...options};
  (g.state.entities??=[]).push(d);
 }
 d.status??={};d.scriptAuxiliary=true;d.status.tsunamiAuxiliary=true;return d;
}
function setWavePosition(g,e,point,api){
 if(api.setTsunamiPosition)api.setTsunamiPosition(g,e,point);
 else{e.worldX=point.x;e.worldY=point.y;g._syncLocal?.(e);}
}
function beginWave(g,e,api){
 const direction=facing(e)<180?90:270,d=auxiliary(g,e,'e010',{facing:direction,animationTimeScale:.7},api);
 const j={id:g._uid('tsunami'),type:'tsunami_wave',sourceId:e.id,source:e,dummyId:d.id,dummy:d,nextAt:g.state.time+.04,remaining:40,pulses:0,radius:250,totalPushes:0,blockedPushes:0,createdAt:g.state.time};
 jobs(g).push(j);state(e).lastWave={at:g.state.time,jobId:j.id,dummyId:d.id,sourceFacing:facing(e),facing:direction};
 return j;
}

// Call only after a genuinely successful native SPELL_EFFECT. This is a
// distinct trigger (26470-26472); the map's all-ability reentrancy guard does
// not suppress it. It does not pay for, validate, or replay the original cast.
export function tsunamiNativeSpellEffect(g,e,id,target,api={}){
 if(id==='A313')return beginWave(g,e,api);
 if(id!=='A07Y'||raw(e)!=='h108')return false;
 const pool=all(g).filter(t=>!removed(t)&&!has(t,'Aloc')&&t.hp>=1&&ally(e,t)&&sameBattle(e,t)&&t.id!==target?.id&&distance(e,t)<=400*scale(e)+1e-8);
 const report={at:g.state.time,sourceTargetId:target?.id??null,candidateIds:pool.map(t=>t.id),randomDraws:0,requests:[]};
 for(let attempt=0;attempt<2;attempt++){
  // Blizzard.j GroupPickRandomUnitEnum: include the first 1..1 draw and
  // remove the picked handle even when its subsequent native order fails.
  let chosen=null,n=0;for(const t of pool){report.randomDraws++;if(Math.floor(g._random()*++n)===0)chosen=t;}
  if(!chosen)continue;
  pool.splice(pool.indexOf(chosen),1);
  const d=auxiliary(g,e,'u006',{},api);
  if(api.addAbility)api.addAbility(g,d,'A07Y');else d.skillSpecs.push(spec(d,'A07Y'));
  const r={at:g.state.time,sourceId:e.id,casterId:d.id,targetId:chosen.id,abilityId:'A07Y',level:1,orderId:852225,requested:true,hostAccepted:false,applied:false,nativeOutcome:'unverified',adapter:'immediate-native-water-armor',nativeReference:WATER_ARMOR_NATIVE_REFERENCE,unitCastPoint:V14_UNIT_TEMPLATES.u006.sourceRawFields.castpt??null};
  const result=castWaterArmor(g,d,{target:chosen},api);r.hostAccepted=result.ok;r.applied=result.ok;r.manaCost=spec(d,'A07Y').manaCost;r.cooldown=spec(d,'A07Y').cooldown;r.manaAfter=d.mana;
  if(!result.ok)r.rejectedByHost=result.reason??result.message;
  d.status.waterArmorOrder=r;report.requests.push(r);
  jobs(g).push({type:'tsunami_dummy_life',sourceId:e.id,source:e,dummyId:d.id,dummy:d,endAt:g.state.time+1});
 }
 state(e).lastArmorSpread=report;return report;
}

export function castWaterArmor(g,e,params={},api={}){
 const fail=(message,reason)=>({ok:false,message,reason});
 if(!has(e,'A07Y'))return fail('当前单位没有水甲','ability');
 if(blocked(g,e))return fail('单位当前无法施法','caster');
 const s=spec(e,'A07Y'),t=params.target,failure=targetFailure(g,e,t,s,api);
 if(failure)return fail(failure==='range'?'超出800施法范围':'请选择有效友方单位',failure);
 const result=pay(g,e,s);if(!result.ok)return result;
 // AUfa DataA is armor lifetime; Dur/HeroDur describes its separate melee
 // chill. The custom object happens to set both to ten, but they are distinct.
 t.buffs??=[];t.buffs=t.buffs.filter(b=>b.key!==s.buffKey);
 t.buffs.push({key:s.buffKey,skillId:'A07Y',sourceId:e.id,ownerId:e.ownerId,expiresAt:g.state.time+s.duration,armor:s.armor,damage:0,haste:0,move:0,dps:0,waterArmorNativePartial:true});
 state(e).lastArmorCast={at:g.state.time,targetId:t.id,manaCost:s.manaCost,cooldown:s.cooldown,armor:s.armor,duration:s.duration,nativeReference:WATER_ARMOR_NATIVE_REFERENCE};
 g._event?.('cast',e,'水甲',{skillId:'A07Y',targetId:t.id});
 tsunamiNativeSpellEffect(g,e,'A07Y',t,api);
 return {ok:true,skillId:'A07Y',message:'已施放水甲'};
}
export const canTsunamiCast=(e,id)=>['A313','A07Y'].includes(id)&&has(e,id);
export function castTsunami(g,e,id,params={},api={}){
 if(id==='A07Y')return castWaterArmor(g,e,params,api);
 const fail=(message,reason)=>({ok:false,message,reason});
 if(id!=='A313'||!has(e,id))return fail('当前单位没有海啸','ability');
 if(blocked(g,e))return fail('单位当前无法施法','caster');
 const s=spec(e,id),failure=targetFailure(g,e,params.target,s,api,{enemy:true});
 if(failure)return fail(failure==='range'?'超出400施法范围':'请选择有效敌人',failure);
 const result=pay(g,e,s);if(!result.ok)return result;
 tsunamiNativeSpellEffect(g,e,id,params.target,api);
 g._event?.('cast',e,'海啸',{skillId:id,targetId:params.target.id});
 return {ok:true,skillId:id,message:'已施放海啸'};
}

function timedLife(g,j,at,api){
 j.done=true;j.dummy.status??={};j.dummy.status.tsunamiTimedLifeAt=at;
 if(!removed(j.dummy)&&j.dummy.hp>0){if(api.killUnit)api.killUnit(g,j.dummy);else{j.dummy.hp=0;j.dummy.status.deathCounted=true;}}
}
export function tickTsunamiJob(g,j,api={}){
 if(!j||j.done||!['tsunami_wave','tsunami_dummy_life'].includes(j.type))return false;
 if(g.state.paused)return true;
 if(removed(j.dummy)){j.done=true;j.nativeBoundary='removed-dummy-handle';return false;}
 if(j.type==='tsunami_dummy_life'){
  if(g.state.time>=j.endAt-1e-8)timedLife(g,j,j.endAt,api);
  return !j.done;
 }
 while(j.remaining>0&&j.nextAt<=g.state.time+1e-8){
  const d=j.dummy,angle=facing(d)*Math.PI/180,dx=Math.cos(angle),dy=Math.sin(angle),p=pos(d),center={x:p.x+15*scale(d)*dx,y:p.y+15*scale(d)*dy};
  setWavePosition(g,d,center,api);j.remaining--;j.pulses++;j.radius+=5;j.lastAt=j.nextAt;j.nextAt+=.04;
  const candidates=all(g).filter(t=>alive(t)&&!has(t,'Aloc')&&!ally(d,t)&&sameBattle(d,t)&&Math.hypot(pos(t).x-center.x,pos(t).y-center.y)<=j.radius*scale(d)+1e-8);
  j.lastEnumeratedIds=candidates.map(t=>t.id);
  for(const t of candidates){
   const q=pos(t),point={x:q.x+7*scale(d)*dx,y:q.y+7*scale(d)*dy};
   // IsTerrainPathable(..., WALKABILITY)==false is required. With no host
   // terrain query, keep the request unresolved instead of pushing through.
   const terrain=api.isTerrainBlocked?.(g,point,t);
   if(terrain!==false){j.blockedPushes++;if(terrain===undefined)j.terrainUnresolved=true;continue;}
   t.worldX=point.x;t.worldY=point.y;g._syncLocal?.(t);t.chase=null;t.movePath=null;j.totalPushes++;
  }
  if(j.remaining===0){j.timedLifeAt=j.lastAt+.01;j.dummy.status.tsunamiTimedLifeRequestedAt=j.lastAt;j.dummy.status.tsunamiTimedLifeDuration=.01;}
 }
 if(j.remaining===0&&g.state.time>=j.timedLifeAt-1e-8)timedLife(g,j,j.timedLifeAt,api);
 return !j.done;
}
export function tickTsunamiJobs(g,api={}){for(const j of jobs(g))if(j.type==='tsunami_wave'||j.type==='tsunami_dummy_life')tickTsunamiJob(g,j,api);}
export function restoreTsunami(g){
 const handles=new Map(all(g).map(e=>[e.id,e]));
 for(const j of jobs(g))if(j.type==='tsunami_wave'||j.type==='tsunami_dummy_life'){
  if(!handles.has(j.sourceId)&&j.source)handles.set(j.sourceId,j.source);j.source=handles.get(j.sourceId)??j.source;
  if(!handles.has(j.dummyId)&&j.dummy)handles.set(j.dummyId,j.dummy);j.dummy=handles.get(j.dummyId)??j.dummy;
 }
}
