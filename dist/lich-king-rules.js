import {V14_ABILITIES,V14_UNIT_TEMPLATES} from './v14-reference.js';

export const LICH_KING_RULES=Object.freeze({
  A0KP:{name:'亡者呼唤',status:'partial',description:'普通战h0M0、竞技场携带A0KQ的出战体注册独立死亡监听。1200范围内死亡时先抽1至101随机数，≤5才继续检查（连续均匀分布约4%）；排除Ju组、原生英雄及e00E，不区分敌友或召唤物。复制死亡类型并继承召唤者路线，标为召唤物、存活4秒。施法者生命归零注销。',partial:'CreateUnit的原生碰撞、出生钩子完整顺序以及生命事件与死亡事件的同帧顺序仍待原图验证。'},
  A0KQ:{name:'召唤辛达苟萨',status:'partial',active:true,targetKind:'unit',range:600,manaCost:18,cooldown:0,description:'对600范围敌人释放：龙沿初始方向每0.04秒移动80码，共12次、960码，第13次回调结束。每次300范围敌人按本次飞行去重，造成50＋50×玩家当时骨龙计数的通用伤害；施法者死亡不取消。',partial:'物编没有Cool1，Web不添加猜测冷却；Aslo原生自动施法/命令资格及继承字段未核定。每步同一个dummy连续发A0KR thunderbolt后立即RemoveUnit，命中仲裁未证实：保留全部原生命令请求与等级，不伪造全部目标已眩晕。'},
});
const has=(e,id)=>Array.isArray(e?.skillSpecs)?e.skillSpecs.some(s=>s.id===id):(e?.abilityIds??[]).includes(id);
const raw=e=>e?.combatRawcode??e?.sourceRawcode??e?.rawcode;
const pos=e=>({x:e.worldX??e.x??0,y:e.worldY??e.y??0});
const scale=e=>(e.distanceScale??1/3)/100;
const distance=(a,b)=>Math.hypot(pos(a).x-pos(b).x,pos(a).y-pos(b).y);
const alive=e=>e&&e.hp>0&&!e.status?.deathCounted&&!e.status?.sourceDeathHandled;
const units=g=>[...g.state.entities,...(g.state.kings??[])];
const now=g=>g._lichEventAt??g.state.time;
const clone=e=>JSON.parse(JSON.stringify(e));
const sameBattle=(a,b)=>a.battleTeam===undefined||b.battleTeam===undefined||a.battleTeam===b.battleTeam;
const player=(g,id)=>g.state.players.find(p=>p.id===id);
export const isLichKingJobType=type=>type==='lich_king_dragon';
export const canLichKingCastAbility=(e,id)=>id==='A0KQ'&&has(e,id);

// Normal-wave reset is explicit (OC5F_cg:21473). vf's arena registration
// has no reset, so the arena bridge must not invent one.
export function resetLichKingRound(g){for(const p of g.state.players)p.sourceBoneDragons=0;}
export function initializeLichKingDeployment(g,body){
  if(!['h0M0','h0D3','h2A2'].includes(raw(body))&&!(body.isArena&&has(body,'A0KQ')))return;
  const st=body.status??={};if(st.lichDeploymentRegistered)return;
  st.lichDeploymentRegistered=true;body.userData=body.ownerId+1;
  const registered=body.isArena?has(body,'A0KQ'):raw(body)==='h0M0';
  if(registered)st.lichDeathListener=true;
  else if(['h0D3','h2A2'].includes(raw(body))){
    st.lichBoneCounterOwner=body.ownerId;const p=player(g,body.ownerId);
    if(p)p.sourceBoneDragons=(p.sourceBoneDragons??0)+1;
  }
}

/** Separate from regular death-trigger suppression; one listener per Arthas. */
export function lichKingDeath(g,dead,api={}){
  const st=dead.status??={};if(st.lichDeathObserved)return;st.lichDeathObserved=true;st.lichDeathListener=false;
  if(['h0D3','h2A2'].includes(raw(dead))&&!st.sourceJuMember){
    const owner=st.lichBoneCounterOwner,p=player(g,owner);
    // A copied dragon has no saved P_id handle; it must not decrement its
    // apparent owner. The source writes the null-handle bucket instead.
    if(p)p.sourceBoneDragons=(p.sourceBoneDragons??0)-1;
    else g.state.lichNullOwnerBoneDragons=(g.state.lichNullOwnerBoneDragons??0)-1;
  }
  for(const job of g.state.sourceSkillJobs??[])if(isLichKingJobType(job.type)&&job.sourceId===dead.id)job.source=clone(dead);
  for(const caster of [...g.state.entities]){
    if(!caster.status?.lichDeathListener||!alive(caster)||!sameBattle(caster,dead)||distance(caster,dead)>1200*scale(caster)+1e-8)continue;
    // JASS's and chain draws before the exclusions; do not save RNG draws on
    // a native hero, the Ju group or the dragon dummy.
    if(1+100*g._random()>5||st.sourceJuMember||dead.isNativeHero||raw(dead)==='e00E')continue;
    const def=V14_UNIT_TEMPLATES[raw(dead)];
    if(!def){(caster.status.lichUnresolvedRevivalTypes??=[]).push(raw(dead));continue;}
    const revived=api.spawnUnit(g,caster,raw(dead),{worldX:pos(dead).x,worldY:pos(dead).y,facing:dead.facing??0,userData:caster.userData??caster.ownerId+1,isSummon:true,expiresAt:now(g)+4});
    if(!revived)continue;
    revived.traits=[...new Set([...(revived.traits??[]),'summoned'])];
    revived.status.lichReanimated=true;
    g._event?.('revive',revived,'亡者呼唤 · 4秒',{sourceId:caster.id});
  }
}

/** Called by the explicit native spell-effect bridge, not the global ANcl trigger. */
export function lichKingSpellEffect(g,caster,target){
  if(!caster.status?.lichDeathListener||!target)return false;
  const a=pos(caster),b=pos(target);
  const job={type:'lich_king_dragon',sourceId:caster.id,source:clone(caster),ownerId:caster.ownerId,...a,
    dummy:{id:g._uid('lich-dragon'),combatRawcode:'e00E',skillVersion:'v14.1A5',hp:20,maxHp:20,team:caster.team,side:caster.side,ownerId:caster.ownerId,battleTeam:caster.battleTeam,laneId:caster.laneId,sourceLaneId:caster.sourceLaneId,skillSpecs:[],traits:[],status:{},worldX:a.x,worldY:a.y},
    angle:Math.atan2(b.y-a.y,b.x-a.x),steps:0,hitIds:[],nativeStunRequests:[],nextAt:now(g)+.04};
  (g.state.sourceSkillJobs??=[]).push(job);return true;
}

export function castLichKingAbility(g,e,id,{target}={},api={}){
  const rule=LICH_KING_RULES[id],time=now(g),fail=message=>({ok:false,message});
  if(!canLichKingCastAbility(e,id))return fail('该单位没有召唤辛达苟萨');
  if(!alive(e)||e.status?.stunUntil>time||e.status?.cycloneUntil>time||e.status?.sourcePaused||e.status?.yseraPaused||e.status?.yseraHidden||e.status?.illidanPaused)return fail('单位当前无法施法');
  if(!alive(target)||target.team===e.team||!sameBattle(e,target)||distance(e,target)>600*scale(e)+1e-8||target.status?.cycloneUntil>time||target.skillSpecs?.some(s=>s.kind==='immunity'))return fail('请选择600范围内可受法术影响的敌人');
  const state=(e.skillStates??={})[id]??={casts:0,readyAt:0};
  if(state.readyAt>time)return fail('技能冷却中');if(e.mana<rule.manaCost)return fail('魔法不足');
  e.mana-=rule.manaCost;state.casts++;state.readyAt=time;
  const scriptTriggered=lichKingSpellEffect(g,e,target);
  g._event?.('cast',e,rule.name,{skillId:id});return {ok:true,skillId:id,scriptTriggered,nativeBoundary:true};
}

export function tickLichKingJob(g,job,api={}){
  const source=units(g).find(e=>e.id===job.sourceId)??job.source;
  while(!job.done&&job.nextAt<=g.state.time+1e-8){
    const at=job.nextAt;job.nextAt+=.04;
    if(job.steps===12){job.done=true;job.dummy.hp=0;const old=g._lichEventAt;g._lichEventAt=at;try{api.sourceDeath(g,job.dummy,null);}finally{if(old===undefined)delete g._lichEventAt;else g._lichEventAt=old;}break;}
    const count=player(g,job.ownerId)?.sourceBoneDragons??0;
    job.x+=Math.cos(job.angle)*80*scale(source);job.y+=Math.sin(job.angle)*80*scale(source);job.steps++;job.dummy.worldX=job.x;job.dummy.worldY=job.y;
    const targets=units(g).filter(t=>t.team!==source.team&&sameBattle(t,source)&&distance(t,job)<=300*scale(source)+1e-8&&!job.hitIds.includes(t.id));
    const old=g._lichEventAt;g._lichEventAt=at;
    try{
      const request={at,abilityId:'A0KR',requestedLevel:count,targetIds:[],dummyRemovedImmediately:true};
      for(const target of targets){
        api.universalDamage(g,target,50+50*count,source);job.hitIds.push(target.id);request.targetIds.push(target.id);
      }
      // One native caster per step, not one per target. Keep the request as
      // evidence; the unresolved immediate-RemoveUnit arbitration is explicit.
      if(request.targetIds.length){
        const fields=V14_ABILITIES.A0KR.resolved_fields;
        request.duration=fields[`Dur${count}`]===undefined?null:Number(fields[`Dur${count}`]);
        request.heroDuration=fields[`HeroDur${count}`]===undefined?null:Number(fields[`HeroDur${count}`]);
        job.nativeStunRequests.push(request);api.requestLichStun?.(g,source,request);
      }
    }finally{if(old===undefined)delete g._lichEventAt;else g._lichEventAt=old;}
  }
  return !job.done;
}
