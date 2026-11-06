import {laneToWorld} from './layout.js';

const boundary='ANcl原生前摇、引导和同帧命令仲裁、原生范围枚举与浮点计时仍待核定；辅助e008不参与军团计数，位移使用Web通行图，原模型和特效缺失。';
export const GULDAN_RULES={
 A1QL:{status:'partial',active:true,targetKind:'point',description:'邪能箭：15魔法、13秒冷却、500码施法距离。在0/1/2秒从施法者当时位置向最初选点发射；每箭通常移动4次160码，总640码，200码碰撞范围内每目标101点法术／魔法伤害，同箭去重。源码未调用控制单位函数，不添加提示中的8%控制。',partial:boundary+'去重组存于施法者句柄，重叠发射会替换并共享当前组；销毁组的原生无效句柄行为仍保留边界。'},
 A1QM:{status:'partial',active:true,targetKind:'point',description:'破坏之雨：16魔法、16秒冷却、500码施法距离。在固定选点400码范围内，每秒26点法术／魔法伤害，共16次，首次在1秒后；施法者死亡不取消。',partial:boundary},
 A1QN:{status:'partial',active:true,targetKind:'none',description:'灵魂虹吸：11魔法、9秒冷却。立即直接扣除自身周围400码敌人各自当前生命的30%，不经过伤害事件；总量分成6份，每秒一份，在最初施法位置600码内的全部存活友军之间均分，包含满血单位。没有友军的一份不会顺延。',partial:boundary+'直接生命设置使用已实例化单位和国王；未实体化建筑、隐藏/移除句柄及极低生命死亡的原生顺序仍有边界。'},
};
const has=(e,id)=>e?.skillSpecs?.some(s=>s.id===id)&&(e.abilityLevels?.[id]??1)>0;
const pos=e=>Number.isFinite(e?.worldX)?{x:e.worldX,y:e.worldY}:laneToWorld(e?.laneId,e?.x,e?.y)??{x:e?.x??0,y:e?.y??0};
const scale=e=>(e.distanceScale??1/3)/100;
const removed=e=>!e||e.status?.sourceRemoved||e.status?.yseraRemoved;
const all=g=>[...g.state.entities,...(g.state.kings??[])];
const jobs=g=>g.state.sourceSkillJobs??=[];
const report=(e,key,value)=>((e.status??={})[key]=value);
const queue=(g,e,type,data)=>{const j={type,sourceId:e.id,source:e,...data};jobs(g).push(j);return j;};
const ally=(a,b)=>a.team!==undefined&&b.team!==undefined?a.team===b.team:a.side===b.side&&a.battleTeam===b.battleTeam;
const group=(g,e,p,r,friendly=false)=>all(g).filter(t=>t.hp>.405&&!removed(t)&&!t.status?.sourceHidden&&!t.status?.yseraHidden&&!has(t,'Aloc')&&!has(t,'Avul')&&ally(e,t)===friendly&&Math.hypot(pos(t).x-p.x,pos(t).y-p.y)<=r*scale(e)+1e-8);
const unavailable=(g,e)=>removed(e)||e.hp<=.405||e.status?.sourcePaused||e.status?.yseraPaused||e.status?.illidanPaused||e.status?.sourceHidden||e.status?.yseraHidden||['stunUntil','cycloneUntil','silenceUntil'].some(k=>e.status?.[k]>g.state.time);
export const canGuldanCast=(e,id)=>!!GULDAN_RULES[id]&&has(e,id);

function launchArrow(g,j,api){
 const e=j.source,p=pos(e),angle=Math.atan2(j.y-p.y,j.x-p.x);
 const d=api.spawnUnit(g,e,'e008',{worldX:p.x,worldY:p.y,facing:angle*180/Math.PI,scriptAuxiliary:true,isSummon:false,isHero:false,isNativeHero:false,userData:0,nav:undefined,buildingId:undefined});
 if(!d)return;
 g.state.entities=g.state.entities.filter(t=>t.id!==d.id);report(d,'guldanAuxiliary',true);
 report(e,'guldanArrowGroup',{hitIds:[],destroyed:false});
 queue(g,e,'guldan_arrow',{dummyId:d.id,dummy:d,angle,steps:0,phase:'flight',nextAt:g.state.time,removeAt:g.state.time+.2});
}
function finishArrow(g,j){
 const hits=j.source.status?.guldanArrowGroup;if(hits)hits.destroyed=true;
 j.phase='cleanup';j.finishedAt=g.state.time;j.nextAt=j.removeAt;
}
export function guldanSpellEffect(g,e,id,params,api){
 if(g._sourceAbilityEffectDepth)return false;
 g._sourceAbilityEffectDepth=(g._sourceAbilityEffectDepth??0)+1;
 try{
  const origin=pos(e);
  if(id==='A1QL')for(let n=0;n<3;n++)queue(g,e,'guldan_launch',{...params.point,nextAt:g.state.time+n});
  else if(id==='A1QM')queue(g,e,'guldan_rain',{...params.point,ticks:0,nextAt:g.state.time+1});
  else if(id==='A1QN'){
   let total=0;const victims=group(g,e,origin,400),drained=[];
   for(const t of victims){
    if(g._protectedKing(t))continue;
    const amount=t.hp*.3;t.hp-=amount;total+=amount;drained.push({id:t.id,amount});if(t.hp<=.405){t.hp=0;g._settleDeath(t,null);}
   }
   report(e,'guldanDrain',{at:g.state.time,point:origin,total,victims:drained});
   queue(g,e,'guldan_heal',{...origin,total,perTick:total/6,ticks:0,nextAt:g.state.time+1});
  }else return false;
  return true;
 }finally{g._sourceAbilityEffectDepth--;}
}
export function castGuldan(g,e,id,params,api){
 const fail=message=>({ok:false,message}),r=GULDAN_RULES[id],now=g.state.time;
 if(!canGuldanCast(e,id))return fail('当前单位没有此技能');if(unavailable(g,e))return fail('单位当前无法施法');
 const s=api.compileAbility(g,e,id),p=r.targetKind==='point'?params.point:pos(e);
 if(!Number.isFinite(p?.x)||!Number.isFinite(p?.y))return fail('请选择施法位置');
 if(r.targetKind==='point'&&Math.hypot(pos(e).x-p.x,pos(e).y-p.y)>s.range+1e-8)return fail('超出施法范围');
 const st=(e.skillStates??={})[id]??={readyAt:0,casts:0};
 if(st.readyAt>now+1e-8)return fail('技能冷却中');if(e.mana<s.manaCost)return fail('魔法不足');
 e.mana-=s.manaCost;st.readyAt=now+s.cooldown;st.casts++;e.pendingAttack=null;
 const scriptApplied=guldanSpellEffect(g,e,id,params,api);
 report(e,'guldanCast',{at:now,id,point:p,scriptApplied,nativeTimingUnverified:true});
 g._event?.('cast',e,s.name,{skillId:id});return {ok:true,skillId:id,message:'已施放'+s.name};
}
export function guldanMainDamage(g,target,attacker,amount,api,ids=['A1QL','A1QM','A1QN']){
 if(!(amount>0)||!attacker||target===attacker||ally(target,attacker)||has(attacker,'A2Y7'))return;
 for(const id of ids){
  const e=has(target,id)?target:has(attacker,id)?attacker:null;if(!e)continue;
  const other=e===target?attacker:target,order={A1QL:'unloadall',A1QM:'unravenform',A1QN:'unrobogoblin'}[id];
  const result=castGuldan(g,e,id,id==='A1QN'?{}:{point:pos(other)},api);
  report(e,'guldanOrder'+id,{at:g.state.time,id,order,targetId:id==='A1QN'?undefined:other.id,outcome:result.ok?'adapted-success':'failed',reason:result.ok?null:result.message});
 }
}
export function guldanWidgetDeath(g,e){
 for(const j of jobs(g))if(j.type==='guldan_arrow'&&j.phase==='flight'&&j.dummyId===e.id)finishArrow(g,j);
}
function tickGuldan(g,j,api){
 if(j.done)return false;const frame=g.state.time;
 j.source=all(g).find(e=>e.id===j.sourceId)??j.source;
 try{while(j.nextAt<=frame+1e-8&&!j.done){
  g.state.time=j.nextAt;
  if(j.type==='guldan_launch'){launchArrow(g,j,api);j.done=true;}
  else if(j.type==='guldan_arrow'){
   if(j.phase==='cleanup'){api.removeUnit(g,j.dummy);j.done=true;continue;}
   if(j.steps+1>=5){finishArrow(g,j);continue;}
   const p=pos(j.dummy);api.moveUnit(g,j.dummy,{x:p.x+Math.cos(j.angle)*160*scale(j.source),y:p.y+Math.sin(j.angle)*160*scale(j.source)});j.steps++;
   const hits=j.source.status?.guldanArrowGroup;
   for(const t of group(g,j.source,pos(j.dummy),200))if(!hits||hits.destroyed||!hits.hitIds.includes(t.id)){
    api.nativeDamage(g,t,101,j.source,{attackType:'spells',damageType:'magic'});
    if(hits&&!hits.destroyed)hits.hitIds.push(t.id);
   }
   j.nextAt+=.04;
  }else if(j.type==='guldan_rain'){
   for(const t of group(g,j.source,j,400))api.nativeDamage(g,t,26,j.source,{attackType:'spells',damageType:'magic'});
   j.ticks++;j.nextAt+=1;if(j.ticks===16)j.done=true;
  }else if(j.type==='guldan_heal'){
   const friends=group(g,j.source,j,600,true),amount=friends.length?j.perTick/friends.length:0;
   for(const t of friends)t.hp=Math.min(t.maxHp,t.hp+amount);
   report(j.source,'guldanHealing',{at:g.state.time,point:{x:j.x,y:j.y},allyIds:friends.map(e=>e.id),amount,tick:j.ticks+1});
   j.ticks++;j.nextAt+=1;if(j.ticks===6)j.done=true;
  }else return false;
 }return !j.done;}finally{g.state.time=frame;}
}
export function tickGuldanJobs(g,api){
 const frame=g.state.time;
 try{while(true){
  // Launches share a caster-owned hit group. Resolve due callbacks in time
  // order even when one host frame crosses several one-second launches.
  const due=jobs(g).filter(j=>j.type?.startsWith('guldan_')&&!j.done&&j.nextAt<=frame+1e-8).sort((a,b)=>a.nextAt-b.nextAt)[0];
  if(!due)break;g.state.time=due.nextAt;tickGuldan(g,due,api);
 }}finally{g.state.time=frame;}
}
export function restoreGuldan(g){
 const handles=new Map(all(g).map(e=>[e.id,e])),bind=e=>{if(!e)return e;if(!handles.has(e.id))handles.set(e.id,e);return handles.get(e.id);};
 for(const j of jobs(g))if(j.type?.startsWith('guldan_'))for(const key of ['source','dummy'])if(j[key])j[key]=bind(j[key]);
}
