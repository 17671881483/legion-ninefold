// war3map.j 38570–38590, 39745–39768, 41291–41292 (Latin-1, LF lines).
export const SOUL_TOXIN_RULES={
  A0I5:{status:'partial',description:'敌对正伤害链命中受害者持有本技能且魔法>24时，向伤害来源请求cripple；失败也占用该elseif分支。非e008施法效果以目标为圆心枚举200范围敌军，对当时没有B04U者分别建立1秒计时器并请求马甲施毒；任务建立不依赖马甲命令成功。每次回调仍有B04U且双方存活时造成10点法术攻击/魔法伤害，否则造成90点同类伤害、请求A0I7等级1并销毁任务，当次不追加10点。',partial:'Acri的Cool1/DataC1及默认施法时间缺失；宿主仅适配首次就绪命令，后续未知原生冷却保留未决请求，不按零冷却重放。即时命中适配先施加主目标B04U再派发spell effect，因此已带buff的主目标不建立计时器；原生buff与事件先后、弹道、命令仲裁、枚举和RemoveUnit句柄语义仍待运行证据。'},
  A0I7:{status:'partial',description:'脚本请求的AHtb眩晕：等级1普通目标1秒、原生英雄0.5秒，目标条件为air/ground/debris/enemy/neutral/organic；只适配已知控制，不补入文案伤害。',partial:'原生DataA1伤害、Cost1/Cool1、施法时间和弹道等默认字段缺失；马甲命令成功与即时控制命中仅为宿主适配，非原生运行验证。'},
};
const all=g=>[...g.state.entities,...(g.state.kings??[])];
const raw=e=>e.combatRawcode??e.sourceRawcode;
const has=(e,id)=>e?.skillSpecs?.some(s=>s.id===id)&&(e.abilityLevels?.[id]??1)>0;
const pos=e=>({x:e.worldX??e.x,y:e.worldY??e.y});
const distance=(a,b)=>Math.hypot(pos(a).x-pos(b).x,pos(a).y-pos(b).y);
const removed=e=>!!(e?.status?.sourceRemoved||e?.status?.yseraRemoved);
// Native buff ids without an expiry are an explicit live-buff observation.
// All timed buffs also expose id/key/buffKey for the shared A0I1 branch.
export function hasSoulToxinBuff(e,at){return e?.buffs?.some(b=>[b.id,b.key,b.buffKey].includes('B04U')&&(b.expiresAt===undefined||b.expiresAt>at))||e?.nativeBuffIds?.includes('B04U')===true;}
function retain(g,e){(g.state.soulToxinHandles??={})[e.id]=e;return e;}
function resolve(g,id){const live=all(g).find(e=>e.id===id);return live?retain(g,live):g.state.soulToxinHandles?.[id];}
function dummy(g,source,at,abilityId,origin){return {id:g._uid('soul-dummy'),combatRawcode:'e008',side:source.side,battleTeam:source.battleTeam,ownerId:source.ownerId,distanceScale:source.distanceScale??1/3,worldX:pos(origin).x,worldY:pos(origin).y,hp:60,lifeRequest:10000,mana:100000,skillSpecs:[],status:{},skillStates:{},abilityId,abilityLevel:1,damageSourceId:source.id,removeAt:at+2};}
function applyBuff(source,target,s,at){
  target.buffs??=[];target.buffs=target.buffs.filter(b=>![b.id,b.key,b.buffKey].includes('B04U'));
  target.buffs.push({id:'B04U',key:'B04U',buffKey:'B04U',skillId:'A0I5',sourceId:source.id,ownerId:source.ownerId,expiresAt:at+((target.isNativeHero??target.isHero)?s.heroDuration:s.duration),move:s.move,haste:s.haste});
}
function crippleRequest(g,source,target,api,at,isDummy=false){
  const s=api.compileAbility(g,source,'A0I5'),st=(source.skillStates??={}).A0I5??={readyAt:0,casts:0};
  const request={abilityId:'A0I5',order:'cripple',sourceId:source.id,targetId:target.id,at,isDummy,outcome:'failed',reason:null};
  const blocked=source.hp<=.405||removed(source)||source.status?.sourceHidden||source.status?.sourcePaused||source.status?.yseraPaused||source.status?.yseraHidden||source.status?.stunUntil>at||source.status?.cycloneUntil>at;
  if(blocked)request.reason='caster-unavailable';
  else if(target.hp<=.405||removed(target)||target.status?.sourceHidden||target.status?.yseraHidden||target.status?.cycloneUntil>at||target.isBuilding||has(target,'Aloc')||source.battleTeam!==target.battleTeam||!api.matchesTargets(s,source,target)||api.magicImmune(target))request.reason='invalid-native-target';
  else if(distance(source,target)>s.range+1e-8)request.reason='out-of-range';
  else if(source.mana<s.manaCost)request.reason='mana';
  else if(st.readyAt>at+1e-8)request.reason='cooldown';
  else if(st.nativeCooldownUnresolved){request.outcome='unresolved';request.reason='native-cooldown-unresolved';}
  else{
    source.mana-=s.manaCost;st.casts++;st.readyAt=s.cooldown===null?null:at+s.cooldown;st.nativeCooldownUnresolved=s.cooldown===null;
    request.outcome='adapted-success';request.reason='instant-native-buff-before-spell-effect';
    applyBuff(source,target,s,at);
    if(!isDummy)soulToxinSpellEffect(g,source,target,api,at);
  }
  return request;
}
// Invoke only after the preceding A0HX/A0IK/A0XM branches have missed. The
// selected result is independent of the native command's outcome.
export function soulToxinDamageBranch(g,target,source,amount,api){
  if(!(amount>0)||!source||source.id===target.id||source.side===target.side||has(source,'A2Y7')||!has(target,'A0I5')||!(target.mana>24))return null;
  const request=crippleRequest(g,target,source,api,g.state.time);
  (target.status??={}).soulToxinOrderRequest=request;
  if(request.outcome==='adapted-success')g._event?.('cast',target,'噬魂毒素',{skillId:'A0I5',targetId:source.id});
  return {selected:'A0I5',request};
}
// This consumes the buff state observed at SPELL_EFFECT. Do not force a timer
// for the primary target: the source loop excludes it if B04U already exists.
export function soulToxinSpellEffect(g,source,primary,api,at=g.state.time){
  if(raw(source)==='e008'||g._soulToxinSpellEffectDepth)return [];
  g._soulToxinSpellEffectDepth=1;
  try{
    const jobs=[];const radius=200*(source.distanceScale??1/3)/100;
    for(const target of all(g)){
      if(target.side===source.side||target.battleTeam!==source.battleTeam||removed(target)||distance(primary,target)>radius+1e-8||hasSoulToxinBuff(target,at))continue;
      retain(g,source);retain(g,target);
      const d=dummy(g,source,at,'A0I5',source),job={type:'soul_toxin',sourceId:source.id,targetId:target.id,nextAt:at+1,ticks:0,dummy:d};
      // Timer creation is unconditional after the JASS enemy/buff test, even
      // when the native organic/mana/range/immunity checks reject the order.
      job.crippleRequest=crippleRequest(g,d,target,api,at,true);
      (g.state.sourceSkillJobs??=[]).push(job);jobs.push(job);
    }
    return jobs;
  }finally{g._soulToxinSpellEffectDepth=0;}
}
export function tickSoulToxinJob(g,job,api){
  const source=resolve(g,job.sourceId),target=resolve(g,job.targetId);
  if(!source||!target){job.done=true;job.boundary='missing-retained-handle';return false;}
  while(!job.done&&job.nextAt<=g.state.time+1e-8){
    const at=job.nextAt,frameAt=g.state.time,priorEventAt=g._soulToxinEventAt;
    job.ticks++;g.state.time=at;g._soulToxinEventAt=at;
    try{
      // Real RemoveUnit is not KillUnit. Unknown native handles stop here with
      // an explicit boundary; corpses removed by _clearDead retain their HP.
      if(removed(source)||removed(target)){job.done=true;job.boundary='native-removed-handle-unresolved';(target.status??={}).soulToxinHandleBoundary=job.boundary;break;}
      if(!hasSoulToxinBuff(target,at)||target.hp<=.405||source.hp<=.405){
        const endReason=source.hp<=.405?'source-dead':target.hp<=.405?'target-dead':'buff-missing';
        api.nativeDamage(g,target,90,source,{attackType:'spells',damageType:'magic'});
        const d=dummy(g,source,at,'A0I7',target),applied=!has(target,'Aloc')&&api.applyNativeStun(g,d,target,'A0I7');
        (target.status??={}).soulToxinEndRequest={at,sourceId:source.id,abilityId:'A0I7',level:1,order:'thunderbolt',dummy:d,applied,missingNativeDamage:true};
        job.done=true;job.endAt=at;job.endReason=endReason;
      }else api.nativeDamage(g,target,10,source,{attackType:'spells',damageType:'magic'});
      job.nextAt+=1;
    }finally{g.state.time=frameAt;if(priorEventAt===undefined)delete g._soulToxinEventAt;else g._soulToxinEventAt=priorEventAt;}
  }
  if(job.dummy.removeAt<=g.state.time)job.dummy.removed=true;
  return !job.done;
}
export function pruneSoulToxinHandles(g){
  const used=new Set((g.state.sourceSkillJobs??[]).filter(j=>j.type==='soul_toxin'&&!j.done).flatMap(j=>[j.sourceId,j.targetId]));
  for(const id of Object.keys(g.state.soulToxinHandles??{}))if(!used.has(id))delete g.state.soulToxinHandles[id];
}
