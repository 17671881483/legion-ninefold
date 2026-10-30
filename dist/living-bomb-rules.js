// BOOMA01:38591–38601; SPELL_EFFECT:39769–39774; death:42107–42125.
export const LIVING_BOMB_RULES={
 A0IP:{status:'partial',active:true,targetKind:'enemy',description:'活体炸弹耗魔20、冷却2秒、距离600；原生B04Y降低50%攻速并持续7秒。每次施法效果把目标共享计数7重设为7并新建1秒计时器；每次先减计数，再造成目标当时最大生命5%的混乱/通用伤害，伤害后计数恰为0才停止该计时器。带非零计数死亡时进入爆炸分支。',partial:'提供Web手动选敌入口；原型auto为_，未找到自动slow命令入口，不把文案随机选敌当作脚本。瞬时Aslo命中、缺失移动减速默认值、施法前摇及原生事件顺序待核定。多计时器共享计数可降为负数，照源码继续，不擅自裁成7跳。'},
 A0IQ:{status:'partial',description:'活体炸弹爆炸的同一马甲对每个枚举目标依次请求thunderbolt、faeriefire。Afae显式减甲5、普通/英雄持续3秒、距离700。',partial:'Cost/Cool/施法和默认目标许可缺失，连续命令覆盖未验证。记录所有命令，不把命令发出当成所有目标已减甲。'},
 A0IS:{status:'partial',description:'活体炸弹爆炸马甲请求的风暴之锤，AHtb显式普通/英雄控制1.5秒、距离5000。',partial:'伤害、Cost/Cool/施法和默认目标许可缺失；未采用文案100伤害/5秒。连续命令与弹道未验证，当前只保留请求。'},
 A0IR:{status:'unresolved',description:'死灵术士光环AHad对象缺少DataA1护甲数值且目标为none。',partial:'不能以文案5护甲或零效果宣称已实现；h0JP的Attack20另属亡灵军团开战登记，已独立接入。'},
};
const all=g=>[...g.state.entities,...(g.state.kings??[])];
const has=(e,id)=>e?.skillSpecs?.some(s=>s.id===id)&&(e.abilityLevels?.[id]??1)>0;
const raw=e=>e.combatRawcode??e.sourceRawcode;
const pos=e=>({x:e.worldX??e.x,y:e.worldY??e.y});
const removed=e=>e?.status?.sourceRemoved||e?.status?.yseraRemoved;
const hidden=e=>e?.status?.sourceHidden||e?.status?.yseraHidden;
const distance=(a,b)=>Math.hypot(pos(a).x-pos(b).x,pos(a).y-pos(b).y);
const retain=(g,e)=>{(g.state.livingBombHandles??={})[e.id]=e;return e;};
const resolve=(g,id)=>{const e=all(g).find(e=>e.id===id);return e?retain(g,e):g.state.livingBombHandles?.[id];};
export const canLivingBombCast=(e,id)=>id==='A0IP'&&has(e,id);

export function livingBombSpellEffect(g,source,target){
 if(!target||g._sourceAbilityEffectDepth)return false;
 g._sourceAbilityEffectDepth=(g._sourceAbilityEffectDepth??0)+1;
 try{
  retain(g,source);retain(g,target);(target.status??={}).livingBombCounter=7;
  (g.state.sourceSkillJobs??=[]).push({type:'living_bomb',sourceId:source.id,targetId:target.id,nextAt:g.state.time+1,ticks:0});
  return true;
 }finally{g._sourceAbilityEffectDepth--;}
}

export function castLivingBomb(g,source,id,params,api){
 const fail=message=>({ok:false,message}),target=params.target,now=g.state.time;
 if(!canLivingBombCast(source,id))return fail('当前单位没有活体炸弹');
 const st=source.status??={};
 if(source.hp<=.405||removed(source)||hidden(source)||st.sourcePaused||st.yseraPaused||st.illidanPaused||st.stunUntil>now||st.cycloneUntil>now)return fail('单位当前无法施法');
 const s=api.compileAbility(g,source,id);
 if(!target||target.hp<=.405||removed(target)||hidden(target)||target.status?.cycloneUntil>now||has(target,'Aloc')||source.battleTeam!==target.battleTeam||!api.matchesTargets(s,source,target)||api.magicImmune(target)||api.scriptInvulnerable(target))return fail('请选择可施法的敌人');
 if(distance(source,target)>s.range+1e-8)return fail('超出施法范围');
 const state=(source.skillStates??={})[id]??={readyAt:0,casts:0};
 if(state.readyAt>now+1e-8)return fail('技能冷却中');if(source.mana<s.manaCost)return fail('魔法不足');
 source.mana-=s.manaCost;state.casts++;state.readyAt=now+s.cooldown;
 target.buffs=(target.buffs??[]).filter(b=>![b.id,b.key,b.buffKey].includes('B04Y'));
 target.buffs.push({id:'B04Y',key:'B04Y',buffKey:'B04Y',skillId:id,sourceId:source.id,ownerId:source.ownerId,haste:-Number(s.fields.DataB1),expiresAt:now+((target.isNativeHero??target.isHero)?s.heroDuration:s.duration)});
 const scriptApplied=livingBombSpellEffect(g,source,target);
 st.livingBombCast={at:now,targetId:target.id,order:'slow',scriptApplied,nativeAdapter:'instant'};
 g._event?.('cast',source,'活体炸弹',{skillId:id,targetId:target.id});return {ok:true,message:'已施放活体炸弹'};
}

// Merge this family's timers by expiry, instead of draining one whole timer
// before its siblings. Shared target state makes that distinction observable.
export function tickLivingBombJobs(g,api){
 const frameAt=g.state.time;
 for(;;){
  let job=null;
  for(const j of g.state.sourceSkillJobs??[])if(j.type==='living_bomb'&&!j.done&&j.nextAt<=frameAt+1e-8&&(!job||j.nextAt<job.nextAt))job=j;
  if(!job)break;
  const source=resolve(g,job.sourceId),target=resolve(g,job.targetId),at=job.nextAt;
  if(!source||!target||removed(source)||removed(target)){job.done=true;job.boundary='native-removed-handle-unresolved';continue;}
  g.state.time=at;
  try{
   const st=target.status??={};st.livingBombCounter=((st.livingBombCounter??0)-1)|0;job.ticks++;job.nextAt+=1;
   // There is no alive/buff test. A dead retained caster still deals damage;
   // a corpse target still consumes callbacks and its shared counter.
   api.nativeDamage(g,target,target.maxHp*.05,source,{attackType:'chaos',damageType:'universal',weapon:true});
   if(st.livingBombCounter===0){job.done=true;job.endAt=at;}
  }finally{g.state.time=frameAt;}
 }
}

export function livingBombMainDeath(g,dead,killer,api){
 if(!(dead.status?.livingBombCounter??0))return false;
 const at=g.state.time,point=pos(dead),report={at,counter:dead.status.livingBombCounter,killerId:killer?.id??null,sourceId:dead.id,requests:[]};dead.status.livingBombExplosion=report;
 // GetOwningPlayer(GetKillingUnit()) cannot be replaced by the original
 // bomber's owner. Null-killer native behavior remains explicitly unresolved.
 if(!killer){report.boundary='null-killer-owner-unresolved';return true;}
 const dummy={id:g._uid('bomb-dummy'),rawcode:'e008',ownerId:killer.ownerId,side:killer.side,battleTeam:killer.battleTeam,worldX:point.x,worldY:point.y,abilities:['A0IS','A0IQ'],removeAt:at+1,timedLifeAt:at+2};report.dummy=dummy;
 const radius=450*(dead.distanceScale??1/3)/100;
 // Destruction01 uses enemies of the KILLER. It does not test life, Avul,
 // magic immunity or organic type; host enumeration still omits locust/hidden.
 const group=all(g).filter(t=>t.side!==killer.side&&t.battleTeam===killer.battleTeam&&!removed(t)&&!hidden(t)&&!has(t,'Aloc')&&distance(dead,t)<=radius+1e-8);
 for(const target of group){
  api.nativeDamage(g,target,150,dead,{attackType:'chaos',damageType:'universal',weapon:true});
  for(const [abilityId,order]of [['A0IS','thunderbolt'],['A0IQ','faeriefire']])report.requests.push({abilityId,order,targetId:target.id,dummyId:dummy.id,outcome:'native-unresolved'});
 }
 report.enumeratedIds=group.map(e=>e.id);report.lastOrder=report.requests.at(-1)??null;
 g._event?.('splash',dead,'活体炸弹爆炸',{skillId:'A0IP',radius,sourceId:dead.id});return true;
}

export function pruneLivingBombHandles(g){
 const ids=new Set((g.state.sourceSkillJobs??[]).filter(j=>j.type==='living_bomb'&&!j.done).flatMap(j=>[j.sourceId,j.targetId]));
 for(const id of Object.keys(g.state.livingBombHandles??{}))if(!ids.has(id))delete g.state.livingBombHandles[id];
}
