import {V14_UNIT_TEMPLATES} from './v14-reference.js';
import {lanes,laneToWorld} from './layout.js';

const nativeBoundary='ANcl原生前摇、引导与同帧命令仲裁尚未核定，当前按显式耗魔/冷却/距离派发脚本。原生范围枚举、计时精度、马甲及SetUnitPosition碰撞沿用Web适配。';
export const MUSKETEER_RULES={
 A1PG:{status:'partial',active:true,targetKind:'point',description:'穿刺射击：8魔法、8秒冷却、500码施法距离。投射物按ChargeDistance的0秒首跳及0.04秒周期前进，每步80码；到达判定在移动之前，通常移动9次共720码后结束。每步扫描100码，每个敌人仅受一次147点混乱／通用武器伤害。正数敌对伤害事件优先向攻击者、否则受击者请求施法。',partial:nativeBoundary},
 A1PH:{status:'partial',active:true,targetKind:'point',description:'蜘蛛地雷：19魔法、6秒冷却、500码施法距离。在落点周围随机半径0—600、角度0—360尝试最多40次，放置最多4枚。0.2秒后若300码内已有敌人直接造成137点非武器伤害；否则埋雷，敌人进入200码时对300码内敌人造成137点武器伤害。施法者widget死亡或6秒超时只清理。没有后跳。',partial:nativeBoundary+'布雷范围使用userData对应玩家的Web建筑区；原生矩形尺寸、范围进入事件与同时触发顺序仍待核定。'},
 A1PI:{status:'marker',description:'爆裂弹夹说明图标，原脚本没有对A1PI的引用。实际前15次武器伤害事件由A1PJ处理；仅有此图标不会产生附伤或击退。'},
 A1PJ:{status:'partial',description:'爆裂弹夹：前15次独立武器伤害事件各追加35点混乱／通用伤害；目标仍存活才击退。ChargeDistance通常移动4次，每次34码，共136码后结束。第15次移除A1PJ；重新授予不重置计数，穿刺射击和踩雷的武器伤害也可消耗次数。',partial:'AIob的原生额外攻击/冰冻字段尚未闭合，本项只接入明确的JASS35点附伤，未把DataA1重复加到普通攻击。'+nativeBoundary},
 A1PK:{status:'marker',description:'开局蜘蛛地雷说明图标。PassiveSkill实际检查建筑A1PH；超级火枪及两个外观的建筑均只有A1PK，因此不会仅因这个图标获得开局免费布雷。战斗体A1PH仍可正常施放。'},
};
const has=(e,id)=>e?.skillSpecs?.some(s=>s.id===id)&&(e.abilityLevels?.[id]??1)>0;
const pos=e=>Number.isFinite(e.worldX)?{x:e.worldX,y:e.worldY}:laneToWorld(e.laneId,e.x,e.y)??{x:e.x,y:e.y};
const scale=e=>(e.distanceScale??1/3)/100;
const jobs=g=>g.state.sourceSkillJobs??=[];
const all=g=>[...g.state.entities,...(g.state.kings??[])];
const removed=e=>!e||e.status?.sourceRemoved||e.status?.yseraRemoved;
const observable=(s,e)=>e.battleTeam===s.battleTeam&&!removed(e)&&!e.status?.sourceHidden&&!e.status?.yseraHidden&&!has(e,'Aloc');
const nearby=(g,s,p,r,select=true)=>all(g).filter(e=>observable(s,e)&&e.side!==s.side&&(!select||e.hp>.405&&!has(e,'Avul'))&&Math.hypot(pos(e).x-p.x,pos(e).y-p.y)<=r*scale(s)+1e-8);
const unavailable=(g,e)=>removed(e)||e.hp<=.405||e.status?.sourceHidden||e.status?.yseraHidden||e.status?.sourcePaused||e.status?.yseraPaused||e.status?.illidanPaused||['stunUntil','cycloneUntil','silenceUntil'].some(k=>e.status?.[k]>g.state.time);
const report=(e,key,value)=>((e.status??={})[key]=value);
const enqueue=(g,e,type,extra)=>{const j={type,sourceId:e.id,source:e,...extra};jobs(g).push(j);return j;};
const inRect=(r,p)=>r&&p.x>=r.minX&&p.x<=r.maxX&&p.y>=r.minY&&p.y<=r.maxY;
export const canMusketeerCast=(e,id)=>!!MUSKETEER_RULES[id]?.active&&has(e,id);

export function musketeerGrenades(g,e,point){
 const r=report(e,'musketeerGrenades',{at:g.state.time,point:{...point},attempts:0,points:[],boundary:'web-building-rectangle'});
 while(r.points.length<4&&r.attempts<40){
  r.attempts++;const radius=g._random()*600*scale(e),angle=g._random()*Math.PI*2,p={x:point.x+Math.cos(angle)*radius,y:point.y+Math.sin(angle)*radius};
  // The original draws two random values BEFORE rejecting userData <= 0.
  if(!(e.userData>0)){r.rejected='missing-user-data';return r;}
  const rect=lanes[e.userData-1];
  if(inRect(rect,p)||!inRect(rect,pos(e))){r.points.push(p);enqueue(g,e,'musketeer_mine',{...p,stage:'flight',nextAt:g.state.time+.2,createdAt:g.state.time});}
 }
 return r;
}
export function initializeMusketeerDeployment(g,b,e){
 if(!b||e.status?.musketeerDeploymentChecked)return;
 const code=b.unitId?.replace(/^v14_/,'')??b.sourceRawcode,ids=[...(V14_UNIT_TEMPLATES[code]?.abilityIds??b.abilityIds??[]),...(b.permanentAbilityIds??[]),...(b.skillSpecs??[]).map(s=>s.id)];
 if(!ids.some(id=>id==='A1PH'||id==='A1PK'))return;
 report(e,'musketeerDeploymentChecked',{buildingRawcode:code,at:g.state.time,registered:ids.includes('A1PH')&&(b.abilityLevels?.A1PH??1)>0});
 if(e.status.musketeerDeploymentChecked.registered)musketeerGrenades(g,e,pos(e));
}
export function musketeerSpellEffect(g,e,id,point){
 if(g._sourceAbilityEffectDepth)return false;
 g._sourceAbilityEffectDepth=(g._sourceAbilityEffectDepth??0)+1;
 try{
  if(id==='A1PH')musketeerGrenades(g,e,point);
  else if(id==='A1PG'){const p=pos(e);enqueue(g,e,'musketeer_shot',{...p,angle:Math.atan2(point.y-p.y,point.x-p.x),distance:800,duration:.4,moved:0,steps:0,nextAt:g.state.time,hitIds:[]});}
  else return false;
  g._event?.('cast',e,MUSKETEER_RULES[id].description.split('：')[0],{skillId:id});return true;
 }finally{g._sourceAbilityEffectDepth--;}
}
export function castMusketeer(g,e,id,params,api){
 const fail=message=>({ok:false,message}),p=params.point,now=g.state.time;
 if(!canMusketeerCast(e,id))return fail('当前单位没有此技能');
 if(unavailable(g,e))return fail('单位当前无法施法');
 if(!Number.isFinite(p?.x)||!Number.isFinite(p?.y))return fail('请选择施法位置');
 const s=api.compileAbility(g,e,id),st=(e.skillStates??={})[id]??={readyAt:0,casts:0};
 if(Math.hypot(pos(e).x-p.x,pos(e).y-p.y)>s.range+1e-8)return fail('超出施法范围');
 if(st.readyAt>now+1e-8)return fail('技能冷却中');if(e.mana<s.manaCost)return fail('魔法不足');
 e.mana-=s.manaCost;st.readyAt=now+s.cooldown;st.casts++;e.pendingAttack=null;
 const scriptApplied=musketeerSpellEffect(g,e,id,p);
 report(e,'musketeerCast',{at:now,id,point:{...p},scriptApplied,nativeTimingUnverified:true});
 return {ok:true,skillId:id,message:'已施放'+s.name};
}
export function musketeerMainDamage(g,target,attacker,amount,api){
 if(!(amount>0)||target===attacker||target.side===attacker.side||has(attacker,'A2Y7'))return;
 for(const [id,order]of [['A1PG','unloadall'],['A1PH','unloadallcorpses']]){
  const e=has(attacker,id)?attacker:has(target,id)?target:null;if(!e)continue;
  const other=e===attacker?target:attacker,r={at:g.state.time,id,order,targetId:other.id};
  const result=castMusketeer(g,e,id,{point:pos(other)},api);r.outcome=result.ok?'adapted-success':'failed';r.reason=result.ok?null:result.message;
  report(e,'musketeerOrder'+id,r);
 }
}
export function musketeerAttackDamage(g,e,target,api){
 if(!has(e,'A1PJ')||!target)return;
 const n=(e.status?.musketeerMagazineCount??0)+1;if(n>15)return;
 report(e,'musketeerMagazineCount',n);
 api.nativeDamage(g,target,35,e,{attackType:'chaos',damageType:'universal',weapon:true});
 if(target.hp>.405&&!removed(target)){
  const a=pos(e),p=pos(target);enqueue(g,target,'musketeer_push',{angle:Math.atan2(p.y-a.y,p.x-a.x),distance:170,duration:.2,moved:0,steps:0,nextAt:g.state.time,attackerId:e.id});
 }
 if(n>=15)api.removeAbility(g,e,'A1PJ');
}
function finishMine(g,j,reason,api){
 // Mark before host callbacks to prevent re-entrancy; native cleanup occurs
 // after damage. Simultaneous native range/death ordering remains partial.
 j.done=true;j.reason=reason;
 if(reason==='range')for(const t of nearby(g,j.source,j,300))api.nativeDamage(g,t,137,j.source,{attackType:'chaos',damageType:'universal',weapon:true});
 report(j.source,'musketeerMineEnd',{at:g.state.time,point:{x:j.x,y:j.y},reason,damage:reason==='range'?137:0});
 g._event?.('splash',j.source,'地雷'+(reason==='range'?'爆炸':'消散'),{skillId:'A1PH',worldX:j.x,worldY:j.y,radius:300*scale(j.source)});
}
export function musketeerWidgetDeath(g,e,api){
 for(const j of [...jobs(g)])if(j.sourceId===e.id&&j.type?.startsWith('musketeer_')){
  j.source=e;if(j.done)continue;
  if(j.type==='musketeer_mine'&&j.stage==='armed')finishMine(g,j,'source-death',api);
  else if(j.type==='musketeer_push')j.done=true;
 }
}
export function tickMusketeerJob(g,j,api){
 if(j.done)return false;
 const e=all(g).find(e=>e.id===j.sourceId)??j.source;if(!e)return false;j.source=e;
 if(removed(e)){j.removalBoundary=true;return false;}
 const frameTime=g.state.time;
 try{
  if(j.type==='musketeer_mine'){
   if(j.stage==='flight'&&j.nextAt<=frameTime+1e-8){
    g.state.time=j.nextAt;
    if(nearby(g,e,j,300).length){
     // AoeDamage enumerates again, checks only enemy, and uses attack=false.
     j.done=true;for(const t of nearby(g,e,j,300,false))api.nativeDamage(g,t,137,e,{attackType:'chaos',damageType:'universal',weapon:false});
     report(e,'musketeerMineEnd',{at:g.state.time,point:{x:j.x,y:j.y},reason:'landing',damage:137});
     g._event?.('splash',e,'地雷爆炸',{skillId:'A1PH',worldX:j.x,worldY:j.y,radius:300*scale(e)});return false;
    }
    j.stage='armed';j.expiresAt=j.nextAt+6;j.insideIds=nearby(g,e,j,200,false).map(t=>t.id);
   }
   if(j.stage==='armed'){
    g.state.time=frameTime;
    if(j.expiresAt<=frameTime+1e-8){g.state.time=j.expiresAt;finishMine(g,j,'timeout',api);return false;}
    const group=nearby(g,e,j,200,false),entered=group.find(t=>!j.insideIds.includes(t.id));j.insideIds=group.map(t=>t.id);
    if(entered){j.entrantId=entered.id;finishMine(g,j,'range',api);return false;}
   }
   return true;
  }
  while(j.nextAt<=frameTime+1e-8){
   g.state.time=j.nextAt;
   if(j.type==='musketeer_push'&&e.hp<=.405)return false;
   const step=j.distance/j.duration*.04;
   if(j.moved+step>=j.distance-1e-8){report(e,'musketeerChargeEnd',{type:j.type,at:j.nextAt,moved:j.moved,steps:j.steps});return false;}
   j.moved+=step;j.steps++;j.nextAt+=.04;
   const p=j.type==='musketeer_push'?pos(e):j,next={x:p.x+Math.cos(j.angle)*step*scale(e),y:p.y+Math.sin(j.angle)*step*scale(e)};
   if(j.type==='musketeer_push'){api.moveUnit(g,e,next);g._event?.('cast',e,'击退',{skillId:'A1PJ'});}
   else{
    Object.assign(j,next);
    for(const t of nearby(g,e,j,100))if(!j.hitIds.includes(t.id)){j.hitIds.push(t.id);api.nativeDamage(g,t,147,e,{attackType:'chaos',damageType:'universal',weapon:true});}
   }
  }
  return true;
 }finally{g.state.time=frameTime;}
}
