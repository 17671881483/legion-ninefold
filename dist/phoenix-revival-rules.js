import {V14_UNIT_TEMPLATES} from './v14-reference.js';
import {laneToWorld} from './layout.js';

export const PHOENIX_REVIVAL_RULE={status:'partial',description:'涅槃由建筑A1SE登记普通单位死亡监听。死亡时先对400码内敌人造成102点混乱／通用武器伤害，再生成无敌凤凰蛋h0VY并移除旧体；3秒后先KillUnit凤凰蛋，再创建h0VZ并移除蛋。两次新生均为2000生命、190平均基础攻击的h0VZ，只有第一次重新授予A1SE并继续监听。没有复活时102伤害或额外56灼烧。',partial:'凤凰蛋缺spd/weapsOn原生字段，不能使用导入器270移速/开启武器的回退值；当前宿主保留静止等待并标记未知原生行动。CreateUnit碰撞、原生科技对新体属性、已移除蛋句柄、死亡监听先后与原始模型资源仍待核定。A1SB/A1SC主动技能另按实际脚本绑定实现并保留原生边界，不与复活机制混算。'};
const raw=e=>e?.combatRawcode??e?.sourceRawcode;
const has=(e,id)=>e?.skillSpecs?.some(s=>s.id===id)&&(e.abilityLevels?.[id]??1)>0;
const removed=e=>!e||e.status?.sourceRemoved||e.status?.yseraRemoved;
const pos=e=>Number.isFinite(e.worldX)?{x:e.worldX,y:e.worldY}:laneToWorld(e.laneId,e.x,e.y)??{x:e.x,y:e.y};
const jobs=g=>g.state.sourceSkillJobs??=[];
const hasBuildingRevival=b=>{
 if(!b)return false;
 const code=b.unitId?.replace(/^v14_/,'')??b.sourceRawcode,ids=[...(V14_UNIT_TEMPLATES[code]?.abilityIds??b.abilityIds??[]),...(b.permanentAbilityIds??[]),...(b.skillSpecs??[]).map(s=>s.id)];
 return ids.includes('A1SE')&&(b.abilityLevels?.A1SE??1)>0;
};
export function initializePhoenixRevival(g,b,e){
 if(!hasBuildingRevival(b)||e.status?.phoenixRevivalRegistered)return;
 const blue=raw(e)==='h0WW';
 (e.status??={}).phoenixRevivalRegistered={at:g.state.time,buildingRawcode:b.unitId?.replace(/^v14_/,''),blue};
 if(blue)e.status.phoenixBlue=true;
 e.color=blue?'#83cce6':'#e4ab62';
 jobs(g).push({type:'phoenix_revive',sourceId:e.id,source:e,phase:'body',count:0,blue});
}
function registerGroups(e,userData){e.userData=userData;e.status.sourceJHMember=userData;e.status.sourceJWMember=true;}
function enemyGroup(g,e){
 const p=pos(e),r=400*(e.distanceScale??1/3)/100;
 return [...g.state.entities,...(g.state.kings??[])].filter(t=>t.battleTeam===e.battleTeam&&t.side!==e.side&&t.hp>.405&&!removed(t)&&!t.status?.sourceHidden&&!t.status?.yseraHidden&&!has(t,'Aloc')&&!has(t,'Avul')&&Math.hypot(pos(t).x-p.x,pos(t).y-p.y)<=r+1e-8);
}
function spawn(g,source,code,blue,api){
 const p=pos(source),body=api.spawnUnit(g,source,code,{worldX:p.x,worldY:p.y,facing:source.facing??0,userData:source.userData??0,isSummon:false,isHero:false,isNativeHero:false,isArena:source.isArena??false,expiresAt:undefined,nav:undefined,buildingId:undefined});
 if(!body)return null;
 registerGroups(body,source.userData??0);
 body.status.phoenixBlue=blue;body.status.phoenixOriginId=source.status?.phoenixOriginId??source.id;
 body.sourceModelOverride=code==='h0VY'?(blue?'Phoenix2_Blue.mdx':'Phoenix2.mdl'):(blue?'Phoenix_Blue.mdx':'Phoenix.mdx');
 if(blue)body.color='#83cce6';else body.color='#e4ab62';
 return body;
}

// EVENT_UNIT_DEATH, not widget death: A14E reincarnation waiting does not
// dispatch this listener. Its registration survives removing A1SE; the
// callback then checks the CURRENT level and destroys itself if absent.
export function phoenixUnitDeath(g,e,api){
 for(const j of [...jobs(g)]){
  if(j.type!=='phoenix_revive'||j.sourceId!==e.id||j.phase!=='body'||j.done)continue;
  j.source=e;
  if(!has(e,'A1SE')){j.done=true;j.reason='ability-absent-at-death';continue;}
  j.phase='death';
  const targets=enemyGroup(g,e),event={at:g.state.time,targets:targets.map(t=>t.id),count:j.count};e.status.phoenixDeath=event;
  for(const t of targets)api.nativeDamage(g,t,102,e,{attackType:'chaos',damageType:'universal',weapon:true});
  const egg=spawn(g,e,'h0VY',j.blue,api);
  if(!egg){j.done=true;j.reason='missing-egg-template';continue;}
  egg.status.phoenixEgg={hatchAt:g.state.time+3,cycle:j.count+1,missingNativeFields:['spd','weapsOn']};
  // Holding this auxiliary avoids treating missing native fields as the
  // importer's generic moving/attacking fighter defaults. This is an explicit
  // partial host adapter, not a claim that the script calls PauseUnit.
  egg.status.sourcePaused=true;egg.status.phoenixEggActionBoundary=true;
  j.eggId=egg.id;j.egg=egg;j.at=g.state.time+3;j.phase='egg';event.eggId=egg.id;
  api.removeUnit(g,e);
  g._event?.('revive',egg,'涅槃 · 凤凰蛋',{skillId:'A1SE',duration:3,oldSourceId:e.id});
 }
}
export function tickPhoenixRevival(g,j,api){
 if(j.done)return false;
 if(j.phase==='body'){
  j.source=g.state.entities.find(e=>e.id===j.sourceId)??j.source;
  if(removed(j.source)){j.reason='removed-body-handle';return false;}
  return true;
 }
 if(j.phase!=='egg'||j.at>g.state.time+1e-8)return true;
 const egg=g.state.entities.find(e=>e.id===j.eggId)??j.egg;
 if(removed(egg)){j.reason='removed-egg-native-outcome-unverified';return false;}
 j.egg=egg;
 const frameTime=g.state.time;g.state.time=j.at;
 try{
  // An already-dead egg is not a cancellation condition in the source.
  // Keep its retained owner/location/userData and still attempt the hatch.
  api.killUnit(g,egg);
  const body=spawn(g,egg,'h0VZ',j.blue,api);if(!body)return false;
  body.status.phoenixHatch={at:j.at,cycle:j.count+1,eggId:egg.id,oldBodyId:j.sourceId};
  api.removeUnit(g,egg);
  if(j.count+1<2){
   j.count++;j.sourceId=body.id;j.source=body;j.phase='body';
   api.addAbility(g,body,'A1SE');body.status.phoenixRevivalRegistered={at:g.state.time,continued:true,blue:j.blue};
   delete j.at;delete j.egg;delete j.eggId;
  }else{j.count++;j.done=true;j.phase='complete';}
  g._event?.('revive',body,`涅槃重生 ${j.count}/2`,{skillId:'A1SE'});
  return !j.done;
 }finally{g.state.time=frameTime;}
}
export function restorePhoenixRevival(g){
 const handles=new Map([...g.state.entities,...(g.state.kings??[])].map(e=>[e.id,e]));
 for(const j of jobs(g))if(j.type==='phoenix_revive'){
  for(const [id,key]of [[j.sourceId,'source'],[j.eggId,'egg']])if(id){if(!handles.has(id)&&j[key])handles.set(id,j[key]);j[key]=handles.get(id);}
 }
 // Older builds never implemented phoenix death, so only an alive original
 // deployed body with its actual building can establish a fresh first cycle.
 // Never guess how many cycles a detached h0VZ or a dead handle has consumed.
 for(const e of g.state.entities){
  if(e.hp<=.405||removed(e)||!['h0VX','h0WW'].includes(raw(e))||e.status?.phoenixRevivalRegistered||jobs(g).some(j=>j.type==='phoenix_revive'&&j.sourceId===e.id))continue;
  const b=g.state.players[e.ownerId]?.buildings.find(b=>b.id===e.buildingId);
  initializePhoenixRevival(g,b,e);
  if(e.status?.phoenixRevivalRegistered)e.status.phoenixRevivalRegistered.migrated=true;
 }
}
