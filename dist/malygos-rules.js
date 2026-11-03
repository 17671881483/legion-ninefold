import {laneToWorld} from './layout.js';

const boundary='ANcl原生前摇、引导、同帧命令仲裁、原生范围枚举和浮点计时尚未闭合；SetUnitPosition使用Web通行图。e008作为脚本辅助句柄保留，不加入军团计数，缺失的原生行动字段不使用普通战士默认值。';
export const MALYGOS_RULES={
 A1PZ:{status:'partial',active:true,targetKind:'point',description:'奥术风暴：10魔法、8秒冷却、500码施法距离。依次抽取角度和0—350码半径，创建5枚飞弹；各在0.5秒后对当前位置250码内每个敌人造成137点混乱／通用武器伤害并移除。不是持续5秒的伤害区。',partial:boundary},
 A1Q0:{status:'partial',description:'碧蓝之火：独立武器伤害事件追加20点混乱／通用武器伤害，包括技能产生的attack=true事件；不是只在普通攻击命中后追加魔法伤害。同来源事件防重入。',partial:'原生YDWE武器事件分类、零伤害事件和不同监听器的原生注册时序仍保留宿主边界。'},
 A1Q1:{status:'partial',active:true,targetKind:'enemy',description:'魔法之网：20魔法、12秒冷却、500码施法距离。e008每0.04秒按初始距离的1/10追踪，0秒首跳，通常0.36秒结束；以目标届时位置为中心，400码内敌人先移速设0，再受776点混乱／通用武器伤害。6秒后各自恢复原型默认移速，重复施放不延长较早的恢复计时器。目标或马甲widget死亡也立即结算。',partial:boundary+'SetUnitMoveSpeed原生限值与原生恢复节拍仍待实测；缺失默认移速的对象显式保留边界。'},
 A1Q2:{status:'partial',active:true,targetKind:'point',description:'奥术炸弹：10魔法、16秒冷却、500码施法距离。沿目标方向-44.75°/+0.5°/+45.75°发射3枚炸弹，0秒首跳，每0.04秒移动60码；通常各9步共540码，0.36秒结束。每步各创建独立300码灼烧区，1秒后开始，每秒63点混乱／通用武器伤害，共3次，可重叠。不附加击退。',partial:boundary},
 A1Q3:{status:'partial',active:true,targetKind:'unit',description:'蓝龙护盾：13魔法、8秒冷却、500码施法距离，选择友军或自身。脚本实际给施法者授予A1Q5，仅把视觉特效挂在目标身上；6秒后移除施法者能力，多个计时器独立。没有脚本击退。',partial:boundary+'AIsr的混合法术抗性叠加仍待核定。'},
 A1Q4:{status:'partial',description:'魔法汲取：首次作为正数敌对伤害来源时先移除本能力，再从999999码内每个当前魔法至少5的敌人扣5点并给自身加5，按自身上限钳制，满魔仍扣敌方魔法。竞技场部署实际先移除此能力，与旧提示相反。',partial:'世界范围覆盖已实例化的两队战士、召唤物与国王，按阵营关系筛选；尚未实体化的建筑、商店和建造者魔法状态仍缺宿主。原生枚举顺序、联盟变更与魔法上下限仍为部分适配。'},
 A1Q5:{status:'partial',description:'蓝龙护盾动态授予的AIsr，DataB1=0.18：对施法者提供18%法术伤害减免，不降低普通魔法类型攻击或混乱／通用脚本伤害。',partial:'与A19A或A1CG并存时不猜测叠加规则，保留既有抗性宿主并标记重叠待核定。'},
};
const has=(e,id)=>e?.skillSpecs?.some(s=>s.id===id)&&(e.abilityLevels?.[id]??1)>0;
const pos=e=>Number.isFinite(e?.worldX)?{x:e.worldX,y:e.worldY}:laneToWorld(e?.laneId,e?.x,e?.y)??{x:e?.x??0,y:e?.y??0};
const scale=e=>(e.distanceScale??1/3)/100;
const removed=e=>!e||e.status?.sourceRemoved||e.status?.yseraRemoved;
const all=g=>[...g.state.entities,...(g.state.kings??[])];
const jobs=g=>g.state.sourceSkillJobs??=[];
const report=(e,key,v)=>((e.status??={})[key]=v);
const queue=(g,e,type,data)=>{const j={type,sourceId:e.id,source:e,...data};jobs(g).push(j);return j;};
const ally=(a,b)=>a.team!==undefined&&b.team!==undefined?a.team===b.team:a.side===b.side&&a.battleTeam===b.battleTeam;
const group=(g,e,p,r,friendly=false)=>all(g).filter(t=>t.hp>.405&&!removed(t)&&!t.status?.sourceHidden&&!t.status?.yseraHidden&&!has(t,'Aloc')&&!has(t,'Avul')&&ally(e,t)===friendly&&Math.hypot(pos(t).x-p.x,pos(t).y-p.y)<=r*scale(e)+1e-8);
const unavailable=(g,e)=>removed(e)||e.hp<=.405||e.status?.sourcePaused||e.status?.yseraPaused||e.status?.illidanPaused||e.status?.sourceHidden||e.status?.yseraHidden||['stunUntil','cycloneUntil','silenceUntil'].some(k=>e.status?.[k]>g.state.time);
export const canMalygosCast=(e,id)=>!!MALYGOS_RULES[id]?.active&&has(e,id);
function dummy(g,e,p,angle,api){
 const d=api.spawnUnit(g,e,'e008',{worldX:p.x,worldY:p.y,facing:angle,scriptAuxiliary:true,isSummon:false,isHero:false,isNativeHero:false,userData:0,nav:undefined,buildingId:undefined});
 if(d){g.state.entities=g.state.entities.filter(t=>t.id!==d.id);report(d,'malygosAuxiliary',true);}return d;
}
function impactNet(g,j,api){
 if(j.done)return;j.done=true;const p=pos(j.target),victims=group(g,j.source,p,400);
 api.removeUnit(g,j.dummy);
 for(const t of victims){
  const raw=t.sourceRawFields?.spd,known=raw!==undefined&&Number.isFinite(Number(raw));
  const defaultSpeed=known?Number(raw)*scale(t):(t.status?.malygosDefaultMoveSpeed??t.moveSpeed);
  report(t,'malygosDefaultMoveSpeed',defaultSpeed);if(!known)report(t,'malygosDefaultSpeedUnresolved',true);
  t.moveSpeed=0;report(t,'malygosNetUntil',g.state.time+6);
  api.nativeDamage(g,t,776,j.source,{attackType:'chaos',damageType:'universal',weapon:true});
  queue(g,j.source,'malygos_net_restore',{targetId:t.id,target:t,defaultSpeed,nextAt:g.state.time+6});
 }
 report(j.source,'malygosNetImpact',{at:g.state.time,point:p,steps:j.steps,victimIds:victims.map(t=>t.id)});
 g._event?.('splash',j.source,'魔法之网',{worldX:p.x,worldY:p.y,radius:400*scale(j.source)});
}
export function malygosSpellEffect(g,e,id,params,api){
 if(g._sourceAbilityEffectDepth)return false;
 g._sourceAbilityEffectDepth=(g._sourceAbilityEffectDepth??0)+1;
 try{
  const origin=pos(e),p=params.point??pos(params.target);
  if(id==='A1PZ')for(let i=0;i<5;i++){
   const angle=g._random()*Math.PI*2,radius=g._random()*350*scale(e),spot={x:p.x+Math.cos(angle)*radius,y:p.y+Math.sin(angle)*radius},d=dummy(g,e,spot,angle*180/Math.PI,api);
   if(d){d.status.malygosScale=2;queue(g,e,'malygos_missile',{dummyId:d.id,dummy:d,nextAt:g.state.time+.5});}
  }
  else if(id==='A1Q1'){
   const d=dummy(g,e,origin,Math.atan2(p.y-origin.y,p.x-origin.x)*180/Math.PI,api);
   if(d)queue(g,e,'malygos_net',{dummyId:d.id,dummy:d,targetId:params.target.id,target:params.target,distance:Math.hypot(p.x-origin.x,p.y-origin.y),moved:0,steps:0,nextAt:g.state.time});
  }else if(id==='A1Q2')for(const offset of [-44.75,.5,45.75]){
   const angle=Math.atan2(p.y-origin.y,p.x-origin.x)+offset*Math.PI/180,d=dummy(g,e,origin,angle*180/Math.PI,api);
   if(d)queue(g,e,'malygos_bomb',{dummyId:d.id,dummy:d,angle,moved:0,steps:0,nextAt:g.state.time});
  }
  else if(id==='A1Q3'){
   api.addAbility(g,e,'A1Q5');queue(g,e,'malygos_shield',{targetId:params.target.id,target:params.target,nextAt:g.state.time+6});
  }else return false;
  g._event?.('cast',e,MALYGOS_RULES[id].description.split('：')[0],{skillId:id});return true;
 }finally{g._sourceAbilityEffectDepth--;}
}
export function castMalygos(g,e,id,params,api){
 const fail=message=>({ok:false,message}),r=MALYGOS_RULES[id],now=g.state.time;
 if(!canMalygosCast(e,id))return fail('当前单位没有此技能');if(unavailable(g,e))return fail('单位当前无法施法');
 const s=api.compileAbility(g,e,id),t=params.target,p=r.targetKind==='point'?params.point:pos(t);
 if(!Number.isFinite(p?.x)||!Number.isFinite(p?.y))return fail('请选择施法位置');
 if(r.targetKind!=='point'&&(!t||t.hp<=.405||removed(t)||t.battleTeam!==e.battleTeam||has(t,'Aloc')||has(t,'Avul')||t.status?.sourceHidden||t.status?.yseraHidden||ally(e,t)!==(id==='A1Q3')||!api.matchesTargets(s,e,t)||id==='A1Q1'&&api.magicImmune(t)))return fail(id==='A1Q3'?'请选择友军或自身':'请选择可施法的敌人');
 const st=(e.skillStates??={})[id]??={readyAt:0,casts:0};
 if(Math.hypot(pos(e).x-p.x,pos(e).y-p.y)>s.range+1e-8)return fail('超出施法范围');
 if(st.readyAt>now+1e-8)return fail('技能冷却中');if(e.mana<s.manaCost)return fail('魔法不足');
 e.mana-=s.manaCost;st.readyAt=now+s.cooldown;st.casts++;e.pendingAttack=null;
 const scriptApplied=malygosSpellEffect(g,e,id,params,api);report(e,'malygosCast',{at:now,id,point:p,targetId:t?.id,scriptApplied,nativeTimingUnverified:true});return {ok:true,skillId:id,message:'已施放'+s.name};
}
export function malygosTakeMana(g,target,attacker,amount,api){
 if(!(amount>0)||!attacker||target===attacker||ally(target,attacker)||has(attacker,'A2Y7')||!has(attacker,'A1Q4'))return;
 api.removeAbility(g,attacker,'A1Q4');const victims=[];
 for(const t of group(g,attacker,pos(attacker),999999))if(t.mana>=5){t.mana-=5;attacker.mana=Math.min(attacker.maxMana,attacker.mana+5);victims.push(t.id);}
 report(attacker,'malygosManaDrain',{at:g.state.time,victimIds:victims,drained:victims.length*5,worldRuntimeScope:true});
}
export function malygosMainDamage(g,target,attacker,amount,api){
 if(!(amount>0)||!attacker||target===attacker||ally(target,attacker)||has(attacker,'A2Y7'))return;
 for(const [id,order]of [['A1PZ','unloadall'],['A1Q1','unloadallcorpses'],['A1Q2','unpoisonarrows'],['A1Q3','unravenform']]){
  const e=has(target,id)?target:has(attacker,id)?attacker:null;if(!e)continue;
  let other=e===target?attacker:target;
  if(id==='A1Q3'){const candidates=group(g,e,pos(target),500,true);other=candidates.length?candidates[Math.floor(g._random()*candidates.length)]:null;}
  const result=other?castMalygos(g,e,id,id==='A1PZ'||id==='A1Q2'?{point:pos(other)}:{target:other},api):{ok:false,message:'范围内没有友军'};
  report(e,'malygosOrder'+id,{at:g.state.time,id,order,targetId:other?.id,outcome:result.ok?'adapted-success':'failed',reason:result.ok?null:result.message});
 }
}
export function malygosAttackDamage(g,e,t,api){if(has(e,'A1Q0'))api.nativeDamage(g,t,20,e,{attackType:'chaos',damageType:'universal',weapon:true});}
export function initializeMalygosDeployment(g,e,api){if(e.isArena&&has(e,'A1Q4')){api.removeAbility(g,e,'A1Q4');report(e,'malygosArenaManaRemoved',true);}}
export function malygosIncoming(e,amount,options){
 if(!has(e,'A1Q5')||options.universal||!(options.magic&&options.spell||options.nativeDamageType==='magic'||options.attackType==='spells'))return amount;
 if(has(e,'A19A')||has(e,'A1CG')){report(e,'malygosResistanceOverlapUnresolved',true);return amount;}return amount*.82;
}
export function malygosWidgetDeath(g,e,api){
 for(const j of [...jobs(g)])if(!j.done&&j.type?.startsWith('malygos_')){
  if(j.type==='malygos_net'&&[j.dummyId,j.targetId].includes(e.id)){if(j.targetId===e.id)j.target=e;impactNet(g,j,api);}
  else if(j.type==='malygos_bomb'&&j.dummyId===e.id){j.done=true;api.removeUnit(g,j.dummy);}
 }
}
export function tickMalygos(g,j,api){
 if(j.done)return false;const frame=g.state.time;
 j.source=all(g).find(e=>e.id===j.sourceId)??j.source;if(j.targetId)j.target=all(g).find(e=>e.id===j.targetId)??j.target;
 try{while(j.nextAt<=frame+1e-8&&!j.done){
  g.state.time=j.nextAt;
  if(j.type==='malygos_missile'){
   const p=pos(j.dummy);for(const t of group(g,j.source,p,250))api.nativeDamage(g,t,137,j.source,{attackType:'chaos',damageType:'universal',weapon:true});
   api.removeUnit(g,j.dummy);j.done=true;g._event?.('splash',j.source,'奥术飞弹',{worldX:p.x,worldY:p.y,radius:250*scale(j.source)});
  }else if(j.type==='malygos_net'){
   const p=pos(j.dummy),t=pos(j.target),step=j.distance*.1;
   if(j.moved+step>=j.distance-1e-8||Math.hypot(t.x-p.x,t.y-p.y)<=step+1e-8){impactNet(g,j,api);continue;}
   const a=Math.atan2(t.y-p.y,t.x-p.x);api.moveUnit(g,j.dummy,{x:p.x+Math.cos(a)*step,y:p.y+Math.sin(a)*step});j.moved+=step;j.steps++;j.nextAt+=.04;
  }else if(j.type==='malygos_net_restore'){
   j.target.moveSpeed=j.defaultSpeed;report(j.target,'malygosNetUntil',0);j.done=true;
  }else if(j.type==='malygos_bomb'){
   if(j.moved+60>=600){api.removeUnit(g,j.dummy);j.done=true;continue;}
   const p=pos(j.dummy);api.moveUnit(g,j.dummy,{x:p.x+Math.cos(j.angle)*60*scale(j.source),y:p.y+Math.sin(j.angle)*60*scale(j.source)});j.moved+=60;j.steps++;
   queue(g,j.source,'malygos_burn',{...pos(j.dummy),ticks:0,nextAt:g.state.time+1});j.nextAt+=.04;
  }else if(j.type==='malygos_burn'){
   for(const t of group(g,j.source,j,300))api.nativeDamage(g,t,63,j.source,{attackType:'chaos',damageType:'universal',weapon:true});
   j.ticks++;j.nextAt+=1;if(j.ticks===3)j.done=true;
  }else if(j.type==='malygos_shield'){api.removeAbility(g,j.source,'A1Q5');j.done=true;}
  else return false;
 }return !j.done;}finally{g.state.time=frame;}
}
export function restoreMalygos(g){
 const handles=new Map(all(g).map(e=>[e.id,e])),bind=e=>{if(!e)return e;if(!handles.has(e.id))handles.set(e.id,e);return handles.get(e.id);};
 for(const j of jobs(g))if(j.type?.startsWith('malygos_'))for(const key of ['source','target','dummy'])if(j[key])j[key]=bind(j[key]);
}
