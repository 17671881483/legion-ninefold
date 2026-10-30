// war3map.j 38440–38539, 39513–39531, 42447–42504.
// Both DevourSkill functions return BEFORE the digestion/timer code.
const boundary='ANcl采用即时命令/施法效果适配，缺少本图原生默认表和运行验证；耗魔暂不扣除，不将缺Cost1当作已核定零耗魔。外部1.24.4/1.27.1默认表均为0耗魔、180秒FollowThrough，但本图继承关系、0.3秒单位施法点、引导中断和命令冲突仍待核定。原生枚举次序、飞高尸体和素材表现保留边界。';
export const KODO_RULES={
 A14T:{status:'partial',active:true,targetKind:'enemy',description:'吞噬：自动入口在武器伤害事件中优先检查攻击者，否则检查受击者；依次尝试自身300范围内生命≤400的地面敌人，首个接受命令的目标生效。手动施法目标没有脚本生命门槛，也没有物编地面限制。施法效果直接造成99999混乱攻击/通用伤害，冷却10秒。源码随后return，未执行隐藏、消化、回血、吐出或5秒重置。',partial:boundary},
 A14X:{status:'partial',active:true,targetKind:'enemy',description:'暴食：自动入口生命门槛≤3000，范围300、地面敌人，攻击者优先于受击者。施法效果先保存范围候选，再对主目标造成99999普通攻击/普通伤害，然后对保存组中首个非主目标、当前生命≤3000、地面且未隐藏的敌人再造成同样伤害，最多两人。手动主目标不受生命门槛限制，冷却3秒；不按说明持续消化。',partial:boundary},
};
const has=(e,id)=>e?.skillSpecs?.some(s=>s.id===id)&&(e.abilityLevels?.[id]??1)>0;
const pos=e=>({x:e.worldX??e.x,y:e.worldY??e.y});
const distance=(a,b)=>Math.hypot(pos(a).x-pos(b).x,pos(a).y-pos(b).y);
const removed=e=>!e||e.status?.sourceRemoved||e.status?.yseraRemoved;
const hidden=e=>e?.status?.sourceHidden||e?.status?.yseraHidden;
const ground=e=>e.targetType!=='air';
const scale=e=>(e.distanceScale??1/3)/100;
const all=g=>[...g.state.entities,...(g.state.kings??[])];
// SelectRange itself has no hidden, mechanical, hero, or magic-immune test.
export const kodoRange=(g,e)=>all(g).filter(t=>!removed(t)&&!has(t,'Aloc')&&t.battleTeam===e.battleTeam&&t.side!==e.side&&t.hp>.405&&!has(t,'Avul')&&distance(e,t)<=300*scale(e)+1e-8);
export const canKodoCast=(e,id)=>!!KODO_RULES[id]?.active&&has(e,id);
function devour(g,e,t,id,api,report){
 if(!t)return;
 const hit={targetId:t.id,requestedDamage:99999,attackType:id==='A14T'?'chaos':'normal',damageType:id==='A14T'?'universal':'normal',hpBefore:t.hp};report.hits.push(hit);
 g._event?.('chain',t,id==='A14T'?'吞噬':'暴食',{skillId:id,duration:.2,fromWorldX:pos(e).x,fromWorldY:pos(e).y});
 hit.dealt=api.nativeDamage(g,t,99999,e,{attackType:hit.attackType,damageType:hit.damageType,weapon:true});hit.hpAfter=t.hp;
 if(t.hp<=.405){(t.status??={}).kodoCorpseLift={at:g.state.time,sourceId:e.id,height:100000,rate:1000000,nativeVisualUnresolved:true};hit.corpseLiftRequested=true;}
}
export function kodoSpellEffect(g,e,id,target,api){
 if(!KODO_RULES[id]||!target||g._sourceAbilityEffectDepth)return false;
 g._sourceAbilityEffectDepth=(g._sourceAbilityEffectDepth??0)+1;
 try{
  const group=id==='A14X'?kodoRange(g,e):[],report={at:g.state.time,abilityId:id,primaryId:target.id,groupBeforeDamage:group.map(t=>t.id),hits:[]};(e.status??={}).kodoEffect=report;
  devour(g,e,target,id,api,report);
  if(id==='A14X')for(const t of group)if(t!==target&&t.hp<=3000&&ground(t)&&!hidden(t)){devour(g,e,t,id,api,report);break;}
  return true;
 }finally{g._sourceAbilityEffectDepth--;}
}
export function castKodo(g,e,id,params,api){
 const fail=message=>({ok:false,message}),now=g.state.time,t=params.target;
 if(!canKodoCast(e,id))return fail('当前单位没有此科多技能');
 const status=e.status??={};
 if(e.hp<=.405||removed(e)||hidden(e)||status.sourcePaused||status.yseraPaused||status.illidanPaused||status.stunUntil>now||status.cycloneUntil>now||status.silenceUntil>now)return fail('单位当前无法施法');
 // ANcl DataC1=13 includes the Universal flag: do not reject magic immunity.
 if(!t||t===e||t.hp<=.405||removed(t)||hidden(t)||has(t,'Aloc')||t.side===e.side||t.battleTeam!==e.battleTeam||api.scriptInvulnerable(t)||t.status?.cycloneUntil>now||id==='A14X'&&!ground(t))return fail('请选择可施法的敌人');
 const s=api.compileAbility(g,e,id),st=(e.skillStates??={})[id]??={readyAt:0,casts:0};
 if(distance(e,t)>s.range+1e-8)return fail('超出300施法范围');
 if(st.readyAt>now+1e-8)return fail('技能冷却中');
 const conflicts=(e.skillSpecs??[]).filter(a=>has(e,a.id)&&a.fields?.DataF1==='unflamingattack');
 if(conflicts.length>1)return fail('同名原生命令冲突尚待核定');
 st.readyAt=now+s.cooldown;st.casts++;e.pendingAttack=null;
 const report={at:now,abilityId:id,targetId:t.id,mode:params.mode??'manual',order:'unflamingattack',execution:'instant-adapter',manaCostKnown:false,scriptApplied:false};status.kodoCast=report;
 report.scriptApplied=kodoSpellEffect(g,e,id,t,api);
 return {ok:true,skillId:id,message:id==='A14T'?'已施放吞噬':'已施放暴食'};
}
// New_UnitAttack supplies its per-damage-source Attack recursion guard.
// Each independent if prefers the attacker even when all of its orders fail.
export function kodoAttackOrders(g,attacker,target,api){
 for(const id of ['A14T','A14X']){
  const e=has(attacker,id)?attacker:has(target,id)?target:null;if(!e)continue;
  const isAttacker=e===attacker,checkHidden=id==='A14T'?!isAttacker:isAttacker,limit=id==='A14T'?400:3000;
  const group=kodoRange(g,e),report={at:g.state.time,abilityId:id,branch:isAttacker?'attacker':'damaged',groupIds:group.map(t=>t.id),attempts:[]};
  (e.status??={}).kodoOrders??={};e.status.kodoOrders[id]=report;
  for(const t of group)if(t.hp<=limit&&ground(t)&&(!checkHidden||!hidden(t))){
   const result=castKodo(g,e,id,{target:t,mode:'auto'},api);report.attempts.push({targetId:t.id,ok:result.ok,message:result.message});if(result.ok)break;
  }
  // A damaged-side cast can cause a fresh weapon event with this unit as
  // source. Preserve that nested request without losing the outer branch.
  if(e.status.kodoOrders[id]!==report)report.nestedRequest=e.status.kodoOrders[id];
  e.status.kodoOrders[id]=report;
 }
}
