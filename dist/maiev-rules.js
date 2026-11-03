import {laneToWorld} from './layout.js';

const boundary='原生施法前摇、命令仲裁、范围枚举与路径网格仍为宿主适配；原图模型和特效缺失。';
export const MAIEV_RULES={
 A1TV:{status:'partial',active:true,targetKind:'enemy',description:'暗影突袭：5魔法、9秒冷却、300码选敌；75初伤，随后第3、6秒各10持续伤害，8秒结束，并非提示中的15秒。',partial:'Web暂按法术攻击/暗影突袭伤害、即时命中及同B084刷新适配；原生初伤/持续伤害各自攻击类型、免疫/虚无与弹道仍待核定。减移速/攻速字段各20%，但衰减参数缺失，暂不结算减速。'},
 A1TW:{status:'partial',active:true,targetKind:'none',description:'复仇之魂：13魔法、15秒冷却，手动召唤1个1300生命的复仇天神，持续30秒。古树的spiritofvengeance命令被停止。',partial:'主伤害脚本错误下达waterelemental，保留失败请求；auto字段不直接补造成功入口。天神A1TY的尸体转化耗魔缺失，尚未实现；重复召唤暂按多天神并存适配，原生替换策略未核定。'+boundary},
 A1TY:{status:'unresolved',description:'天神的原生Avng：每次1个e01J，最多6个，30秒生命，随直接施法父体死亡而消失。',partial:'Cost字段缺失，不能默认免费；尸体转化、消耗和子体生命周期尚未执行，原生自动施法/尸体资格与枚举仍待核定。'},
 A1TX:{status:'partial',description:'闪烁：受到正敌对伤害时，按当前朝向反方向检查路径；原脚本RMax逻辑先检查200码位置，通畅才最终尝试224码，成功后独立冷却8秒。不消耗魔法，不减免当前伤害。',partial:'按Web行走网格判定，未用最近可通行点替换失败落点。'+boundary},
 A1TZ:{status:'partial',active:true,targetKind:'none',description:'刀阵：16魔法、9秒冷却，跟随施法者当前位置，对350码内敌人每0.04秒造成5.4混乱攻击/通用武器伤害；第1至149次回调伤害，第150次清理，站满总计804.6。施法者死亡立即取消。',partial:boundary},
};
const has=(e,id)=>e?.skillSpecs?.some(s=>s.id===id)&&(e.abilityLevels?.[id]??1)>0;
const pos=e=>Number.isFinite(e?.worldX)?{x:e.worldX,y:e.worldY}:laneToWorld(e?.laneId,e?.x,e?.y)??{x:e?.x??0,y:e?.y??0};
const scale=e=>(e.distanceScale??1/3)/100;
const removed=e=>!e||e.status?.sourceRemoved||e.status?.yseraRemoved;
const all=g=>[...g.state.entities,...(g.state.kings??[])];
const jobs=g=>g.state.sourceSkillJobs??=[];
const state=e=>(e.status??={}).maiev??={};
const queue=(g,e,type,data)=>{const j={type,sourceId:e.id,source:e,...data};jobs(g).push(j);return j;};
const ally=(a,b)=>a.team!==undefined&&b.team!==undefined?a.team===b.team:a.side===b.side&&a.battleTeam===b.battleTeam;
const group=(g,e,p,r)=>all(g).filter(t=>t.hp>.405&&!removed(t)&&!t.status?.sourceHidden&&!t.status?.yseraHidden&&!has(t,'Aloc')&&!has(t,'Avul')&&!ally(e,t)&&Math.hypot(pos(t).x-p.x,pos(t).y-p.y)<=r*scale(e)+1e-8);
const unavailable=(g,e)=>removed(e)||e.hp<=.405||e.status?.sourcePaused||e.status?.yseraPaused||e.status?.illidanPaused||e.status?.sourceHidden||e.status?.yseraHidden||['stunUntil','cycloneUntil','silenceUntil'].some(k=>e.status?.[k]>g.state.time);
export const canMaievCast=(e,id)=>!!MAIEV_RULES[id]?.active&&has(e,id);
export function maievBlink(g,t,e,n,api){
 if(!(n>0)||!e||t===e||ally(t,e)||has(e,'A2Y7')||!has(t,'A1TX'))return;
 const origin=pos(t),angle=(t.facing??0)*Math.PI/180,report={at:g.state.time,from:origin,moved:false,checks:[]};let p;
 for(let i=1;i<=7;i++){
  const distance=Math.max(32*i,200)*scale(t);p={x:origin.x-Math.cos(angle)*distance,y:origin.y-Math.sin(angle)*distance};
  if(32*i>=200)break;
  const blocked=api.isTerrainBlocked(g,p,t);report.checks.push({point:p,blocked});if(blocked)break;
 }
 const st=state(t);report.to=p;
 if((st.blinkReadyAt??0)<=g.state.time&&!api.isTerrainBlocked(g,p,t)){
  st.blinkReadyAt=g.state.time+8;t.worldX=p.x;t.worldY=p.y;g._syncLocal?.(t);t.chase=null;t.movePath=null;report.moved=true;
  g._event?.('warp',t,'闪烁',{skillId:'A1TX'});
 }
 st.blink=report;
}
export function castMaiev(g,e,id,params,api){
 const fail=message=>({ok:false,message});if(!canMaievCast(e,id))return fail('当前单位没有此技能');if(unavailable(g,e))return fail('单位当前无法施法');
 if(id==='A1TW'&&(e.isAncient||e.traits?.includes('ancient')))return fail('古树单位不能执行复仇之魂命令');
 const s=api.compileAbility(g,e,id),t=params.target;
 if(id==='A1TV'){
  if(!t||t.hp<=.405||removed(t)||t.isBuilding||t.targetType==='structure'||t.traits?.includes('structure')||ally(e,t)||t.battleTeam!==e.battleTeam||has(t,'Aloc')||api.scriptInvulnerable(t)||api.magicImmune(t)||t.status?.sourceHidden||t.status?.yseraHidden||!api.matchesTargets(s,e,t))return fail('请选择可施法的敌人');
  if(Math.hypot(pos(e).x-pos(t).x,pos(e).y-pos(t).y)>s.range+1e-8)return fail('超出施法范围');
 }
 const st=(e.skillStates??={})[id]??={readyAt:0,casts:0};
 if(st.readyAt>g.state.time+1e-8)return fail('技能冷却中');if(e.mana<s.manaCost)return fail('魔法不足');
 e.mana-=s.manaCost;st.readyAt=g.state.time+s.cooldown;st.casts++;e.pendingAttack=null;
 const record={id,at:g.state.time,scriptApplied:false};
 if(id==='A1TV'){
  record.nativeDamageApproximation=true;record.targetId=t.id;
  api.nativeDamage(g,t,75,e,{attackType:'spells',damageType:'shadow_strike'});
  if(t.hp>.405&&!removed(t)){
   for(const j of jobs(g))if(j.type==='maiev_shadow'&&j.targetId===t.id)j.done=true;
   const token=g._uid('shadow'),expiresAt=g.state.time+8;
   t.buffs=(t.buffs??[]).filter(b=>b.key!=='B084');t.buffs.push({key:'B084',skillId:id,sourceId:e.id,ownerId:e.ownerId,expiresAt,maievShadowToken:token,nativeMoveDecrease:.2,nativeAttackDecrease:.2,slowResolution:'decay-unresolved'});
   queue(g,e,'maiev_shadow',{targetId:t.id,target:t,token,expiresAt,nextAt:g.state.time+3,ticks:0});
  }
 }else if(id==='A1TZ'&&!g._sourceAbilityEffectDepth){
  record.scriptApplied=true;queue(g,e,'maiev_blade',{startAt:g.state.time,nextAt:g.state.time+.04,ticks:0});
 }else if(id==='A1TW'){
  const body=api.spawnUnit(g,e,'e01I',{userData:e.userData??0,isSummon:true,isHero:false,isNativeHero:false,buildingId:undefined,expiresAt:g.state.time+30});
  if(body){body.status.sourceJWMember=true;body.status.sourceJHMember=body.userData;record.summonId=body.id;state(body).vengeance={casterId:e.id,corpseConversion:'native-cost-unresolved'};}
 }
 state(e).lastCast=record;g._event?.('cast',e,s.name,{skillId:id});return {ok:true,skillId:id,message:'已施放'+s.name};
}
export function maievMainDamage(g,t,e,n,api,phase){
 if(!(n>0)||!e||t===e||ally(t,e)||has(e,'A2Y7'))return;
 const ids=phase==='shadow'?['A1TV']:['A1TW','A1TZ'];
 for(const id of ids){const source=has(t,id)?t:has(e,id)?e:null;if(!source)continue;const target=source===t?e:t;
  let record={id,at:g.state.time,targetId:target.id};
  if(id==='A1TW')Object.assign(record,{order:'waterelemental',ok:false,reason:'wrong-native-order'});
  else if(id==='A1TV'){const result=castMaiev(g,source,id,{target},api);Object.assign(record,{order:'shadowstrike',ok:result.ok,reason:result.ok?null:result.message});}
  else{const result=castMaiev(g,source,id,{},api);Object.assign(record,{order:'unloadallcorpses',ok:result.ok,reason:result.ok?null:result.message});}
  const st=state(source);(st.orders??=[]).push(record);st.orders=st.orders.slice(-8);
 }
}
export function maievWidgetDeath(g,e){
 for(const j of jobs(g))if(j.type==='maiev_blade'&&j.sourceId===e.id||j.type==='maiev_shadow'&&j.targetId===e.id)j.done=true;
 e.buffs=(e.buffs??[]).filter(b=>!b.maievShadowToken);
}
export function tickMaievJobs(g,api){
 const frame=g.state.time;
 try{while(true){const j=jobs(g).filter(j=>!j.done&&j.type?.startsWith('maiev_')&&j.nextAt<=frame+1e-8).sort((a,b)=>a.nextAt-b.nextAt)[0];if(!j)break;g.state.time=j.nextAt;
  if(j.type==='maiev_blade'){
   j.ticks++;if(j.ticks>=150||removed(j.source)){j.done=true;continue;}
   for(const t of group(g,j.source,pos(j.source),350))api.nativeDamage(g,t,135*.04,j.source,{attackType:'chaos',damageType:'universal',weapon:true});
   j.nextAt=j.startAt+(j.ticks+1)*.04;
  }else if(j.type==='maiev_shadow'){
   if(removed(j.target)||j.target.hp<=.405||!j.target.buffs?.some(b=>b.maievShadowToken===j.token)){j.done=true;continue;}
   if(g.state.time>=j.expiresAt-1e-8){j.target.buffs=j.target.buffs.filter(b=>b.maievShadowToken!==j.token);j.done=true;continue;}
   api.nativeDamage(g,j.target,10,j.source,{attackType:'spells',damageType:'shadow_strike'});j.ticks++;j.nextAt=Math.min(j.nextAt+3,j.expiresAt);
  }
 }}finally{g.state.time=frame;}
}
export function restoreMaiev(g){
 const handles=new Map(all(g).map(e=>[e.id,e]));
 for(const j of jobs(g))if(j.type?.startsWith('maiev_'))for(const key of ['source','target'])if(j[key]){const e=j[key];if(!handles.has(e.id))handles.set(e.id,e);j[key]=handles.get(e.id);}
}
