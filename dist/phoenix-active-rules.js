import {lanes,laneToWorld} from './layout.js';

const boundary='ANcl原生前摇、引导及同帧命令仲裁、计时浮点精度、原生范围枚举和SetUnitPosition碰撞尚未核定。建筑区与地形使用Web地图映射；马甲未作为军团单位计数，其缺失的原生移速/武器字段不采用通用战士默认值。';
export const PHOENIX_ACTIVE_RULES={
 A1SB:{status:'partial',active:true,targetKind:'enemy',description:'烈焰打击实际绑定PhoenixShot（与旧提示不符）：10魔法、13秒冷却、800码距离。以目标方向、至少300码半径确定圆心，每0.02秒增加10度并移动本体；角度360前结束。每步225码内每个敌人只受一次75混乱／通用武器伤害，并在其当前位置创建7次、每秒10点的225码灼烧区。离开所属玩家建筑区或遇不可通行地形即停止；没有提示中的5精灵、89伤害或8%暴击。',partial:boundary},
 A1SC:{status:'partial',active:true,targetKind:'enemy',description:'火之羽实际绑定PhoenixFlamestrike（与旧提示不符）：15魔法、18秒冷却、500码距离。生成4枚火羽围绕本体，第1、2、3、4秒各派出一枚追踪同一目标，每0.02秒移动1码，移动后距离严格小于50码时造成102混乱／通用武器伤害并杀死隐藏该火羽。未派出的火羽在施法者widget死亡或5秒时被清理；追踪期任一登记单位普通死亡则隐藏火羽并停止追踪。没有减速、暴击或15秒20点灼烧。',partial:boundary+'隐藏不等于KillUnit，仍存活的马甲保留并按已知-1生命恢复字段衰减；原生创建钩子及隐藏/蝗虫的完整生命周期仍待核定。'},
};
const pos=e=>Number.isFinite(e?.worldX)?{x:e.worldX,y:e.worldY}:laneToWorld(e?.laneId,e?.x,e?.y)??{x:e?.x??0,y:e?.y??0};
const scale=e=>(e.distanceScale??1/3)/100;
const has=(e,id)=>e?.skillSpecs?.some(s=>s.id===id)&&(e.abilityLevels?.[id]??1)>0;
const removed=e=>!e||e.status?.sourceRemoved||e.status?.yseraRemoved;
const jobs=g=>g.state.sourceSkillJobs??=[];
const report=(e,key,v)=>((e.status??={})[key]=v);
const queue=(g,e,type,data)=>{const j={type,sourceId:e.id,source:e,...data};jobs(g).push(j);return j;};
const all=g=>[...g.state.entities,...g.state.kings];
const group=(g,e,p)=>all(g).filter(t=>t.hp>.405&&t.battleTeam===e.battleTeam&&t.side!==e.side&&!removed(t)&&!t.status?.sourceHidden&&!t.status?.yseraHidden&&!has(t,'Aloc')&&!has(t,'Avul')&&Math.hypot(pos(t).x-p.x,pos(t).y-p.y)<=225*scale(e)+1e-8);
const unavailable=(g,e)=>removed(e)||e.hp<=.405||e.status?.sourcePaused||e.status?.yseraPaused||e.status?.illidanPaused||e.status?.sourceHidden||e.status?.yseraHidden||['stunUntil','cycloneUntil','silenceUntil'].some(k=>e.status?.[k]>g.state.time);
export const canPhoenixCast=(e,id)=>!!PHOENIX_ACTIVE_RULES[id]&&has(e,id);
function finishCircle(g,j,reason,api){
 j.done=true;j.reason=reason;api.pauseUnit(g,j.source,false);j.source.status.phoenixPathingDisabled=false;j.source.status.phoenixVertexAlpha=255;
 report(j.source,'phoenixCircleEnd',{at:g.state.time,reason,steps:j.steps,angle:j.angle});
}
function hideOrb(g,e,orb,api,kill=false){
 if(kill&&orb.hp>0)api.killUnit(g,orb);
 orb.status.sourceHidden=true;
 if(orb.hp>0&&!orb.status.phoenixDecayQueued){orb.status.phoenixDecayQueued=true;queue(g,e,'phoenix_aux_decay',{orb,orbId:orb.id});}
}
function createOrb(g,e,angle,api){
 const p=pos(e),orb=api.spawnUnit(g,e,'e01G',{worldX:p.x+200*scale(e)*Math.cos(angle),worldY:p.y+200*scale(e)*Math.sin(angle),facing:angle*180/Math.PI,isSummon:false,isHero:false,isNativeHero:false,userData:0,nav:undefined,buildingId:undefined});
 if(!orb)return null;
 // These Aloc auxiliaries are not added to source JW/JH army groups. Retain
 // their real handles in script jobs; do not let generic fighter AI act on them.
 g.state.entities=g.state.entities.filter(t=>t.id!==orb.id);
 Object.assign(orb.status,{phoenixFireSpirit:true,phoenixCreatedAt:g.state.time,phoenixInitialHp:orb.hp,phoenixBlue:!!e.status?.phoenixBlue,phoenixNativeActionBoundary:true});
 orb.sourceModelOverride=e.status?.phoenixBlue?'firespirit_Blue01.mdx':'firespirit_2.mdx';return orb;
}
function changeOrb(g,j,orb,target,api){
 if(!target||target===j.source||target.hp<=.405||orb.hp<=.405){hideOrb(g,j.source,orb,api,true);return;}
 orb.status.phoenixPathingDisabled=true;orb.status.phoenixVertexAlpha=255;
 queue(g,j.source,'phoenix_feather',{targetId:target.id,target,orbId:orb.id,orb,nextAt:g.state.time+.02,steps:0});
}
function finishOrbit(g,j,reason,api){
 j.done=true;j.reason=reason;
 for(const orb of j.orbs)if(orb&&orb.hp>.405)changeOrb(g,j,orb,j.source,api);
 report(j.source,'phoenixOrbitEnd',{at:g.state.time,reason,evalCount:j.evalCount,rotationTicks:j.rotationTicks});
}
export function phoenixSpellEffect(g,e,id,target,api){
 if(g._sourceAbilityEffectDepth)return false;
 g._sourceAbilityEffectDepth=(g._sourceAbilityEffectDepth??0)+1;
 try{
  if(id==='A1SB'){
   const p=pos(e),t=pos(target),heading=Math.atan2(t.y-p.y,t.x-p.x),radius=Math.max(300*scale(e),Math.hypot(t.x-p.x,t.y-p.y));
   queue(g,e,'phoenix_circle',{x:p.x+Math.cos(heading)*radius,y:p.y+Math.sin(heading)*radius,radius,heading,angle:0,steps:0,hitIds:[],nextAt:g.state.time+.02});
   api.pauseUnit(g,e,true);e.status.phoenixPathingDisabled=true;e.status.phoenixVertexAlpha=50;
  }else if(id==='A1SC'){
   const orbs=[4,3,2,1].map(v=>createOrb(g,e,-Math.PI*2*v/4,api));
   queue(g,e,'phoenix_orbit',{targetId:target?.id,target,orbs,evalCount:0,rotationTicks:0,nextAt:g.state.time+.02});
   report(e,'phoenixFireSpiritIds',orbs.filter(Boolean).map(o=>o.id));
  }else return false;
  g._event?.('cast',e,PHOENIX_ACTIVE_RULES[id].description.split('实际')[0],{skillId:id});return true;
 }finally{g._sourceAbilityEffectDepth--;}
}
export function castPhoenix(g,e,id,{target},api){
 const fail=message=>({ok:false,message}),now=g.state.time;
 if(!canPhoenixCast(e,id))return fail('当前单位没有此技能');
 if(unavailable(g,e))return fail('单位当前无法施法');
 if(!target||target.hp<=.405||removed(target)||target.side===e.side||target.battleTeam!==e.battleTeam||target.status?.sourceHidden||target.status?.yseraHidden||has(target,'Aloc')||has(target,'Avul')||api.magicImmune(target))return fail('请选择可施法的敌人');
 const s=api.compileAbility(g,e,id),st=(e.skillStates??={})[id]??={readyAt:0,casts:0};
 if(!api.matchesTargets(s,e,target))return fail('目标不符合技能条件');
 if(Math.hypot(pos(e).x-pos(target).x,pos(e).y-pos(target).y)>s.range+1e-8)return fail('超出施法范围');
 if(st.readyAt>now+1e-8)return fail('技能冷却中');if(e.mana<s.manaCost)return fail('魔法不足');
 e.mana-=s.manaCost;st.readyAt=now+s.cooldown;st.casts++;e.pendingAttack=null;
 const scriptApplied=phoenixSpellEffect(g,e,id,target,api);
 report(e,'phoenixCast',{at:now,id,targetId:target.id,scriptApplied,nativeTimingUnverified:true});return {ok:true,skillId:id,message:'已施放'+s.name};
}
export function phoenixMainDamage(g,target,attacker,amount,api){
 if(!(amount>0)||!attacker||target===attacker||target.side===attacker.side||has(attacker,'A2Y7'))return;
 // i=GetTriggerUnit() is the damaged unit, bV=GetEventDamageSource().
 for(const [id,order]of [['A1SB','unloadall'],['A1SC','unloadallcorpses']]){
  const e=has(target,id)?target:has(attacker,id)?attacker:null;if(!e)continue;
  const other=e===target?attacker:target,result=castPhoenix(g,e,id,{target:other},api);
  report(e,'phoenixOrder'+id,{at:g.state.time,id,order,targetId:other.id,outcome:result.ok?'adapted-success':'failed',reason:result.ok?null:result.message});
 }
}
function rotate(g,j){
 j.rotationTicks++;const p=pos(j.source);
 for(let i=0;i<j.orbs.length;i++){const o=j.orbs[i];if(!o||o.hp<=.405)continue;const angle=(360*(4-i)/4-1.8*j.rotationTicks)*Math.PI/180;o.worldX=p.x+200*scale(j.source)*Math.cos(angle);o.worldY=p.y+200*scale(j.source)*Math.sin(angle);o.facing=angle*180/Math.PI-90;o.status.phoenixScale=2.25;}
}
export function phoenixWidgetDeath(g,e,api){
 for(const j of [...jobs(g)])if(!j.done&&j.type==='phoenix_orbit'&&j.sourceId===e.id){j.source=e;j.evalCount++;rotate(g,j);finishOrbit(g,j,'source-widget-death',api);}
}
export function phoenixActiveUnitDeath(g,e,api){
 for(const j of [...jobs(g)]){
  if(j.done)continue;
  if(j.type==='phoenix_circle'&&j.sourceId===e.id){j.source=e;finishCircle(g,j,'source-unit-death',api);}
  if(j.type==='phoenix_feather'&&[j.sourceId,j.targetId,j.orbId].includes(e.id)){
   if(j.sourceId===e.id)j.source=e;if(j.targetId===e.id)j.target=e;if(j.orbId===e.id)j.orb=e;
   j.done=true;j.reason='registered-unit-death';hideOrb(g,j.source,j.orb,api);
  }
 }
}
function decay(g,j,orb,api){
 if(!orb||orb.hp<=0)return;
 const elapsed=Math.max(0,g.state.time-orb.status.phoenixCreatedAt),hp=Math.max(0,orb.status.phoenixInitialHp-elapsed);
 if(hp<=0)api.killUnit(g,orb);else orb.hp=Math.min(orb.hp,hp);
}
export function tickPhoenixActive(g,j,api){
 if(j.done)return false;
 const frame=g.state.time;j.source=all(g).find(e=>e.id===j.sourceId)??j.source;
 if(j.targetId)j.target=all(g).find(e=>e.id===j.targetId)??j.target;
 if(!j.source)return false;
 try{
  if(j.type==='phoenix_aux_decay'){decay(g,j,j.orb,api);return j.orb.hp>0;}
  while(j.nextAt<=frame+1e-8&&!j.done){
   g.state.time=j.nextAt;
   if(j.type==='phoenix_circle'){
    if(removed(j.source)){finishCircle(g,j,'removed-source-native-boundary',api);break;}
    j.angle+=10;const a=j.heading+j.angle*Math.PI/180,p={x:j.x+Math.cos(a)*j.radius,y:j.y+Math.sin(a)*j.radius},rect=lanes[(j.source.userData??0)-1];
    if(j.angle>=360||api.isTerrainBlocked(g,p,j.source)||!rect||p.x<rect.minX||p.x>rect.maxX||p.y<rect.minY||p.y>rect.maxY){finishCircle(g,j,j.angle>=360?'complete':'terrain-or-player-rect',api);break;}
    j.steps++;j.source.worldX=p.x;j.source.worldY=p.y;j.source.facing=a*180/Math.PI-90;g._syncLocal?.(j.source);
    for(const t of group(g,j.source,p))if(!j.hitIds.includes(t.id)){
     j.hitIds.push(t.id);api.nativeDamage(g,t,75,j.source,{attackType:'chaos',damageType:'universal',weapon:true});
     queue(g,j.source,'phoenix_burn',{...pos(t),nextAt:g.state.time+1,ticks:0});
    }
   }else if(j.type==='phoenix_burn'){
    for(const t of group(g,j.source,j))api.nativeDamage(g,t,10,j.source,{attackType:'chaos',damageType:'universal',weapon:true});
    j.ticks++;if(j.ticks>=7)j.done=true;
   }else if(j.type==='phoenix_orbit'){
    j.evalCount++;for(const o of j.orbs)decay(g,j,o,api);
    const elapsed=.02*j.evalCount;
    if(elapsed>=5){finishOrbit(g,j,'five-second-timeout',api);break;}
    if(Number.isInteger(elapsed)){
     const i=j.orbs.findIndex(o=>o&&o.hp>.405);
     if(i>=0){const o=j.orbs[i];j.orbs[i]=null;changeOrb(g,j,o,j.target,api);if(i===3){j.done=true;j.reason='fourth-dispatched';}}
    }else{rotate(g,j);if(j.rotationTicks>800)finishOrbit(g,j,'rotation-limit',api);}
   }else if(j.type==='phoenix_feather'){
    decay(g,j,j.orb,api);if(j.done)break;
    if(j.target.hp<=.405||removed(j.target)||removed(j.source)||removed(j.orb)){j.done=true;j.reason='dead-target-or-removed-handle';hideOrb(g,j.source,j.orb,api);break;}
    const p=pos(j.target),o=j.orb,a=Math.atan2(p.y-o.worldY,p.x-o.worldX);o.facing=a*180/Math.PI;o.worldX+=Math.cos(a)*scale(j.source);o.worldY+=Math.sin(a)*scale(j.source);j.steps++;
    if(Math.hypot(o.worldX-p.x,o.worldY-p.y)<50*scale(j.source)){
     api.nativeDamage(g,j.target,102,j.source,{attackType:'chaos',damageType:'universal',weapon:true});hideOrb(g,j.source,o,api,true);j.done=true;j.reason='impact';
    }
   }
   j.nextAt+=j.type==='phoenix_burn'?1:.02;
  }
  return !j.done;
 }finally{g.state.time=frame;}
}
export function restorePhoenixActive(g){
 const handles=new Map(all(g).map(e=>[e.id,e]));
 const bind=e=>{if(!e)return e;if(!handles.has(e.id))handles.set(e.id,e);return handles.get(e.id);};
 for(const j of jobs(g))if(j.type?.startsWith('phoenix_')){j.source=bind(j.source);if(j.target)j.target=bind(j.target);if(j.orb)j.orb=bind(j.orb);if(j.orbs)j.orbs=j.orbs.map(bind);}
}
