// war3map.j:39532–39548 / 42545–42560. i is the damage SOURCE.
const boundary='ANmo原生施法前摇、命令排队、额外雷雨伤害及弹道未核定；A12F缺DataA1，不能将缺字段当0。本版即时派发可证实的施法脚本，并用Dur1保留吟唱窗口；原生群组顺序及随机序列仍有宿主差异。';
export const STORM_LIZARD_RULES={
 A12E:{status:'unresolved',description:'雷雨：独立武器伤害监听优先向攻击者、否则受击者请求monsoon，落点是另一方的位置。对象含耗魔18、冷却6秒、距离600、范围300、持续3秒及DataA/B/C=20/1/1。',partial:'脚本没有雷雨伤害回调；ANmo原生逐跳时序及数据字段执行语义尚未核定，只记录命令，不伪造范围伤害或消耗资源。'},
 A12F:{status:'partial',active:true,targetKind:'point',description:'落雷耗魔18、冷却5秒、距离800。落点100内随机选一名敌人，请求A0I7等级5并造成1000普通攻击/魔法伤害；其余300内存活且无Avul的敌人按距离≤100/≤200/≤300分别受到200/150/100同类伤害并请求等级1眩晕。主目标抽选不检查存活或Avul，先控制后伤害；不是锁定最初交战目标。',partial:boundary+'A0I7仅适配已知控制：等级5普通5秒/英雄2.5秒，等级1普通1秒/英雄0.5秒；不补入缺失的马甲伤害。'},
 A12H:{status:'partial',description:'独立武器伤害事件先处理monsoon请求；攻击者有闪电风暴且攻击者当前命令不是monsoon时抽实数0—100≤30，否则检查受击者的闪电风暴，但仍检查攻击者命令。成功添加并保留动态A12G并向另一方请求chainlightning。前一方条件成立但抽签失败不会改由后一方抽签。',partial:'A12G缺原生递减比例、耗魔、冷却和施法字段，只接入授予与命令请求，不把说明的随机3人等同原生弹跳。'+boundary},
 A12G:{status:'unresolved',description:'动态闪电链AOcl明确DataA=150、DataB=3、Area=600、Rng=10000000；获得后脚本没有移除。',partial:'DataC递减比例、耗魔、冷却和弹跳选择默认字段缺失；不套用文案100伤害/4跳，也不猜0%衰减。'},
};
const has=(e,id)=>e?.skillSpecs?.some(s=>s.id===id)&&(e.abilityLevels?.[id]??1)>0;
const pos=e=>({x:e.worldX??e.x,y:e.worldY??e.y});
const dist=(a,b)=>Math.hypot(pos(a).x-pos(b).x,pos(a).y-pos(b).y);
const all=g=>[...g.state.entities,...(g.state.kings??[])];
const removed=e=>!e||e.status?.sourceRemoved||e.status?.yseraRemoved;
const hidden=e=>e.status?.sourceHidden||e.status?.yseraHidden;
const unavailable=(g,e)=>e.hp<=.405||removed(e)||hidden(e)||e.status?.sourcePaused||e.status?.yseraPaused||e.status?.illidanPaused||e.status?.stunUntil>g.state.time||e.status?.cycloneUntil>g.state.time;
const scale=e=>(e.distanceScale??1/3)/100;
const observable=(source,e)=>e.battleTeam===source.battleTeam&&!removed(e)&&!hidden(e)&&!has(e,'Aloc');
function pick(g,group){let result=null,n=0;for(const e of group)if(Math.floor(g._random()*++n)===0)result=e;return result;}
export const canStormLizardCast=(e,id)=>id==='A12F'&&has(e,id);
export function stormLizardChanneling(g,e){
 const ch=e.status?.stormLizardChannel;if(!ch)return false;
 if(ch.until<=g.state.time+1e-8||unavailable(g,e)){delete e.status.stormLizardChannel;return false;}
 return true;
}
const currentOrder=(g,e)=>stormLizardChanneling(g,e)?'monsoon':e.currentOrder??'';
function vertigo(g,source,target,level,api){
 const s=api.compileAbility(g,source,'A0I7'),duration=Number(s.fields[((target.isNativeHero??target.isHero)?'HeroDur':'Dur')+level]);
 const applied=Number.isFinite(duration)&&!has(target,'Aloc')&&api.applyNativeStun(g,source,target,'A0I7',duration);
 const request={at:g.state.time,dummyId:g._uid('lizard-bolt'),dummyRawcode:'e008',ownerId:source.ownerId,targetId:target.id,abilityId:'A0I7',level,order:'thunderbolt',timedLife:1,duration,controlAdapted:!!applied,nativeOutcome:'unverified',missingNativeDamage:true};
 (target.status??={}).stormLizardStunRequest=request;return request;
}
export function stormLizardSpellEffect(g,source,point,api){
 if(g._sourceAbilityEffectDepth)return false;
 g._sourceAbilityEffectDepth=(g._sourceAbilityEffectDepth??0)+1;
 try{
  const report={at:g.state.time,point:{...point},primaryId:null,areaIds:[],requests:[]};(source.status??={}).stormLizardStrike=report;
  // GetRandomTarget has only the enemy test; keep dead/invulnerable entrants.
  const primary=pick(g,all(g).filter(t=>observable(source,t)&&t.side!==source.side&&dist(t,point)<=100*scale(source)+1e-8));
  if(primary){report.primaryId=primary.id;report.requests.push(vertigo(g,source,primary,5,api));api.nativeDamage(g,primary,1000,source,{attackType:'normal',damageType:'magic',weapon:true});}
  // SelectRange runs AFTER primary damage and can see units spawned by it.
  const group=all(g).filter(t=>observable(source,t)&&t!==primary&&t.side!==source.side&&t.hp>.405&&!has(t,'Avul')&&dist(t,point)<=300*scale(source)+1e-8);
  for(const target of group){report.areaIds.push(target.id);report.requests.push(vertigo(g,source,target,1,api));const d=dist(target,point)/scale(source);api.nativeDamage(g,target,d<=100+1e-8?200:d<=200+1e-8?150:100,source,{attackType:'normal',damageType:'magic',weapon:true});}
  g._event?.('cast',source,'落雷',{skillId:'A12F',radius:300*scale(source),worldX:point.x,worldY:point.y});return true;
 }finally{g._sourceAbilityEffectDepth--;}
}
export function castStormLizard(g,source,id,params,api){
 const fail=message=>({ok:false,message}),point=params.point,now=g.state.time;
 if(!canStormLizardCast(source,id))return fail('当前单位没有落雷');
 if(unavailable(g,source))return fail('单位当前无法施法');
 if(!Number.isFinite(point?.x)||!Number.isFinite(point?.y))return fail('请选择施法位置');
 const spec=api.compileAbility(g,source,id),state=(source.skillStates??={})[id]??={readyAt:0,casts:0};
 if(dist(source,point)>spec.range+1e-8)return fail('超出施法范围');
 if(state.readyAt>now+1e-8)return fail('技能冷却中');if(source.mana<spec.manaCost)return fail('魔法不足');
 source.mana-=spec.manaCost;state.readyAt=now+spec.cooldown;state.casts++;
 source.pendingAttack=null;(source.status??={}).stormLizardChannel={until:now+spec.duration,point:{...point},nativeTimingUnverified:true};
 const scriptApplied=stormLizardSpellEffect(g,source,point,api);
 source.status.stormLizardCast={at:now,point:{...point},scriptApplied,nativeAdapter:'instant-effect-duration-channel',missingNativeDamage:true};
 return {ok:true,skillId:id,message:'已施放落雷'};
}
function monsoon(g,source,other,api){
 const ids=['A12E','A12F'].filter(id=>has(source,id));
 const request={at:g.state.time,order:'monsoon',abilityIds:ids,targetPoint:pos(other),outcome:'unresolved'};
 (source.status??={}).stormLizardMonsoonRequest=request;
 if(ids.length!==1){request.reason='shared-native-order-ambiguous';return;}
 if(ids[0]==='A12E'){request.reason='native-ANmo-unresolved';return;}
 const result=castStormLizard(g,source,'A12F',{point:pos(other)},api);request.outcome=result.ok?'adapted-success':'failed';request.reason=result.ok?null:result.message;
 if(source.status.stormLizardMonsoonRequest!==request)request.nestedRequest=source.status.stormLizardMonsoonRequest;
 source.status.stormLizardMonsoonRequest=request;
}
// The caller supplies New_UnitAttack's per-damage-source recursion guard.
// There is no amount/allegiance/alive filter in these independent branches.
export function stormLizardAttackDamage(g,attacker,target,api){
 if(has(attacker,'A12E')||has(attacker,'A12F'))monsoon(g,attacker,target,api);
 else if(has(target,'A12E')||has(target,'A12F'))monsoon(g,target,attacker,api);
 let caster=null,other=null;
 if(has(attacker,'A12H')&&currentOrder(g,attacker)!=='monsoon'){caster=attacker;other=target;}
 else if(has(target,'A12H')&&currentOrder(g,attacker)!=='monsoon'){caster=target;other=attacker;}
 if(!caster)return;
 const roll=g._random()*100,report={at:g.state.time,roll,triggerSourceId:attacker.id,targetId:other.id};(caster.status??={}).stormLizardProc=report;
 if(roll>30)return;
 api.addAbility(g,caster,'A12G');report.granted=true;
 report.request={order:'chainlightning',abilityId:'A12G',outcome:'native-unresolved',targetId:other.id,missingNativeFields:['DataC1','Cost1','Cool1','Cast1']};
}
