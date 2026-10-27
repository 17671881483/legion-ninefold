import {V14_ABILITIES} from './v14-reference.js';
import {spawnWarpWorld,navigationPath} from './layout.js';

export const SKELETON_KING_RULES=Object.freeze({
  A0IA:{status:'partial',description:'仅精确战斗体h0JJ、非幻象、正等级复活且有击杀者的主死亡分支生效，火噬优先。每次先抽0或1，首次不因抽样失败，带u1的后续体抽1时失败。1秒后仅LI开启时新建同原型，继承owner/位置/朝向/userData及预存SMYinwei，标记u1；旧体被移除。',partial:'LI由波末统计J4回调开启，不能等同战斗阶段。原生等待轮询、CreateUnit碰撞/出生事件顺序、已移除旧句柄重加能力和重击原生命令边界未闭合。'},
  A0IB:{status:'partial',description:'复活时创建e008，加A0IB并请求thunderclap，1秒后RemoveUnit。显式物编：200范围、30伤害、2秒降低20%移速和攻速，B04V，目标ground,neutral,organic。',partial:'未提供Cost/Cool/cast/原生继承默认字段，neutral目标许可及原生命令执行未证实；保存命令请求和显式效果字段，不将请求当成命中。'},
});
const pos=e=>({x:e.worldX??e.x??0,y:e.worldY??e.y??0});
const has=(e,id)=>e?.skillSpecs?.some(s=>s.id===id)&&(e.abilityLevels?.[id]??1)>0;
const eventAt=g=>g._skeletonKingEventAt??g._aesaraEventAt??g._brightArthasEventAt??g._arthasEventAt??g._lichEventAt??g._vashjEventAt??g._iceEventAt??g._trollEventAt??g._kelthuzadEventAt??g.state.time;
export const isSkeletonKingJobType=type=>['skeleton_king_revive','skeleton_king_old_ability','skeleton_king_dummy_remove'].includes(type);

// LI has no initializer or combat-start assignment. K5 starts true; Jc is
// the participating-player force. Legacy snapshots cannot prove an old J4.
export function skeletonKingGate(g){return g.state.skeletonKingGate??={li:false,statisticsEnabled:true};}
export function beginSkeletonKingRoundFinish(g,wave=g.state.wave){
  if(wave>=30)return; // hd:19564 routes continuous mode around OZ.
  const gate=skeletonKingGate(g),at=g.state.time;
  gate.finish={wave,closeAt:at+1,armAt:at+3+([16,24].includes(wave)?8:0)};
}
export function tickSkeletonKingLifecycle(g){
  const gate=skeletonKingGate(g),now=g.state.time;
  gate.initialLi??=gate.li;gate.transitions??=[];
  for(;;){
    const events=[['close',gate.finish?.closeAt],['arm',gate.finish?.armAt],['statistics',gate.j4At]].filter(([,at])=>Number.isFinite(at)&&at<=now+1e-8).sort((a,b)=>a[1]-b[1]);
    if(!events.length)break;
    const [type,at]=events[0];
    if(type==='close'){gate.li=false;gate.transitions.push({at,li:false});delete gate.finish.closeAt;}
    else if(type==='arm'){gate.j4At=at+6;gate.lastJ4StartedAt=at;delete gate.finish;}
    else{delete gate.j4At;if(gate.statisticsEnabled&&g.state.players.some(p=>!p.eliminated)){gate.li=true;gate.transitions.push({at,li:true});gate.lastStatisticsAt=at;}}
  }
}
export function skeletonKingLiAt(g,at){
  const gate=skeletonKingGate(g);
  // _step can have advanced LI to the frame end before an earlier job is
  // dispatched. Query the recorded transition history at the timer expiry.
  if(!gate.transitions?.length)return gate.li;
  let li=gate.initialLi;
  for(const transition of gate.transitions){if(transition.at>at+1e-8)break;li=transition.li;}
  return li;
}

// Return whether the elseif condition matched, even if the random branch fails.
export function skeletonKingMainDeath(g,dead,killer){
  if((dead.combatRawcode??dead.sourceRawcode)!=='h0JJ'||!killer||!has(dead,'A0IA')||dead.isIllusion)return false;
  const st=dead.status??={},draw=Math.floor(g._random()*2);
  if(draw>0&&st.skeletonKingU1===true){
    // Flush the source hashtable flags, not the Web engine's death metadata.
    delete st.skeletonKingU1;delete st.sourceSMYinwei;st.skeletonKingHashtableFlushed=true;
  }else(g.state.sourceSkillJobs??=[]).push({type:'skeleton_king_revive',sourceId:dead.id,source:dead,smYinwei:st.sourceSMYinwei===true,at:eventAt(g)+1});
  return true;
}

function attackStart(g,body,userData){
  // Web mapping of player start locations; command and registrations are new,
  // rather than an inherited chase, target, route, buff or building handle.
  const playerId=userData-1;
  body.status.sourceJHMember=userData;body.status.sourceJWMember=true;
  body.status.skeletonKingAttackOrder={order:'attack',playerId};
  if(!Number.isInteger(playerId)||playerId<0||playerId>=8){body.status.skeletonKingAttackOrder.unresolvedStartLocation=true;return;}
  const goal=spawnWarpWorld(playerId);body.sourceLaneId=playerId;
  body.nav={mode:'return',routeId:playerId,path:navigationPath(pos(body),goal,body.battleTeam,body.radius),index:1,distance:0,goal,interrupted:false};
  body.routeMode='return';body.status.skeletonKingAttackOrder.goal=goal;
}

export function skeletonKingClapDescriptor(){
  const f=V14_ABILITIES.A0IB.resolved_fields;
  return {abilityId:'A0IB',order:'thunderclap',level:1,radius:Number(f.Area1),damage:Number(f.DataA1),move:-Number(f.DataC1),haste:-Number(f.DataD1),duration:Number(f.Dur1),heroDuration:Number(f.HeroDur1),buffId:f.BuffID1,targets:f.targs1.split(','),missingNativeFields:['Cost1','Cool1','Cast1'],nativeBoundary:true};
}

export function tickSkeletonKingJob(g,job,api){
  if(job.at>g.state.time+1e-8)return true;
  tickSkeletonKingLifecycle(g);
  const frameTime=g.state.time,old=g._skeletonKingEventAt;
  g.state.time=job.at;g._skeletonKingEventAt=job.at;
  try{
    const source=g.state.entities.find(e=>e.id===job.sourceId)??job.source;
    if(job.type==='skeleton_king_old_ability'){
      // A02ATimer targets i, which A01ATimer already removed. Preserve this
      // request on that handle; never turn it into a cooldown on the new unit.
      source.status.skeletonKingOldAbilityRequest={abilityId:'A0IA',at:job.at,removed:!!source.status.sourceRemoved,nativeBoundary:true};return false;
    }
    if(job.type==='skeleton_king_dummy_remove'){api.removeUnit(g,source);source.status.sourceRemoved=true;return false;}
    if(!skeletonKingLiAt(g,job.at))return false;
    if(source.status.sourceRemoved){
      source.status.skeletonKingRemovedRevivalRequest={at:job.at,nativeBoundary:true};return false;
    }
    const point=pos(source),userData=source.userData??0;
    const dummy=api.spawnUnit(g,source,'e008',{worldX:point.x,worldY:point.y,facing:0,userData,isSummon:false,expiresAt:undefined,nav:undefined});
    // The Aloc auxiliary is not in JH/JW or either side's combat group.
    // Retain its real entity handle in the removal job, outside the Web's
    // target/round-survival list, until the explicit RemoveUnit callback.
    if(dummy)g.state.entities=g.state.entities.filter(e=>e.id!==dummy.id);
    const body=api.spawnUnit(g,source,source.combatRawcode,{worldX:point.x,worldY:point.y,facing:source.facing??0,userData,isSummon:false,expiresAt:undefined,nav:undefined});
    if(!body||!dummy)return false;
    body.status.skeletonKingU1=true;if(job.smYinwei)body.status.sourceSMYinwei=true;
    attackStart(g,body,userData);
    api.removeAbility(g,source,'A0IA');
    (g.state.sourceSkillJobs??=[]).push({type:'skeleton_king_old_ability',sourceId:source.id,source,at:job.at+1});
    api.removeUnit(g,source);source.status.sourceRemoved=true;
    api.addAbility(g,dummy,'A0IB');dummy.status.sourcePaused=true;
    dummy.status.skeletonKingClapRequest={...skeletonKingClapDescriptor(),at:job.at,sourceId:dummy.id,...point,scale:(body.distanceScale??1/3)/100};
    g.state.sourceSkillJobs.push({type:'skeleton_king_dummy_remove',sourceId:dummy.id,source:dummy,at:job.at+1});
    g._event?.('revive',body,'骷髅王复活',{skillId:'A0IA',oldSourceId:source.id,dummyId:dummy.id});
    g._event?.('cast',dummy,'骷髅王复活重击 · 原生命令请求',{skillId:'A0IB',nativeBoundary:true});
    return false;
  }finally{g.state.time=frameTime;if(old===undefined)delete g._skeletonKingEventAt;else g._skeletonKingEventAt=old;}
}
