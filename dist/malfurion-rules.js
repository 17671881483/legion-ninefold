// war3map.j 39882–39892, 40378–40405, 41353–41411.
const boundary='原生施法命中、马甲句柄/队列及光环驻留有宿主差异；缺失原生默认字段不按文案补值。暮光的两次坐标判断依赖原图绝对坐标，当前地图尚无已核定转换，保留位移请求。';
export const MALFURION_RULES={
  A0JA:{status:'partial',active:true,targetKind:'unit',description:'宁静消耗28魔法、冷却14秒；有效友军目标距离600。施法效果在自身位置留下持续6秒的宁静光环，并停止当前命令：500范围友军每秒恢复最大生命4%，护甲+2。同名宁静不叠加，各自独立结束。',partial:'原生Ahea直接治疗量缺失，不额外猜测瞬时治疗；未发现自动施法开启脚本，提供手动施法。'+boundary},
  A0JB:{status:'partial',description:'星火术由宁静能力的伤害分支触发，不要求普攻或星火图标。每8秒可触发一次，在受击者当时位置等待0.9秒后请求战争践踏：200范围300伤害，普通目标眩晕2.5秒、英雄1秒。后续目标移动或来源死亡不取消计时器。',partial:'原生战争践踏缺失耗魔及施法默认字段，当前采用首次命令即时命中的适配；伤害按法术处理，不采用文案神圣伤害。'+boundary},
  A0JE:{status:'partial',description:'暮光梦境依赖宁静能力。受伤结算前生命不高于10%时，一次性回复200生命；先前伤害分支命中会阻止触发。对400范围枚举到的所有单位请求225法术攻击/普通伤害及醉酒云雾，包含友军，施法者只在这轮范围伤害期间无敌。原始伤害仍照常结算，随后留下5秒宁静光环。',partial:'醉酒云雾同一马甲连续命令的仲裁、沉默与致盲仍记录为未核定请求；不将文案的致命免疫当作脚本效果。'+boundary},
  A0J8:{status:'partial',preserveNativeKind:true,description:'宁静的500范围生命恢复光环：每秒恢复目标最大生命4%。相同B057只取一份；原生实体移除和驻留边界仍未验证。',partial:'DataA移动加成缺失；仅应用明确的生命恢复字段。'},
  A0J9:{status:'partial',preserveNativeKind:true,description:'宁静的500范围护甲光环：护甲+2，相同B058只取一份。',partial:'缺失原生驻留与百分比模式默认字段，当前按明确的2点护甲适配。'},
  A0JC:{status:'partial',description:'星火计时器请求的战争践踏：200范围300伤害，普通2.5秒/英雄1秒眩晕。',partial:'耗魔和施法字段缺失，首次命令采用即时命中适配；不是每6秒自动重复施法。'},
  A0JD:{status:'partial',description:'暮光梦境向同一马甲连续发出醉酒云雾命令：范围200、耗魔70、冷却12秒、持续3秒；对象DataA=8、DataB=100。',partial:'仅记录逐目标命令，不将DataA错误当作800%减速；原生队列、目标选中后的范围命中和沉默/致盲尚待统一原生施法适配。'},
};
const has=(e,id)=>e?.skillSpecs?.some(s=>s.id===id)&&(e.abilityLevels?.[id]??1)>0;
const all=g=>[...g.state.entities,...(g.state.kings??[])];
const pos=e=>({x:e.worldX??e.x,y:e.worldY??e.y});
const distance=(a,b)=>Math.hypot(pos(a).x-pos(b).x,pos(a).y-pos(b).y);
const removed=e=>e?.status?.sourceRemoved||e?.status?.yseraRemoved;
const hidden=e=>e?.status?.sourceHidden||e?.status?.yseraHidden;
const scale=e=>(e.distanceScale??1/3)/100;
const push=(g,j)=>{(g.state.sourceSkillJobs??=[]).push(j);return j;};
const find=(g,j)=>all(g).find(e=>e.id===j.sourceId)??j.source;
function dummy(g,source,point,lifetime,summoned){
  // A bounded, non-pathing host representation of native e008. Native
  // collision, handle enumeration and JW/JH participation remain partial.
  const e={id:g._uid('malfurion-dummy'),combatRawcode:'e008',sourceRawcode:'e008',skillVersion:'v14.1A5',distanceScale:source.distanceScale??1/3,side:source.side,team:source.team,battleTeam:source.battleTeam,ownerId:source.ownerId,sourceLaneId:source.sourceLaneId,laneId:source.laneId,userData:summoned?source.userData??(source.sourceLaneId??source.ownerId??-1)+1:0,worldX:point.x,worldY:point.y,hp:60,maxHp:60,mana:100000,maxMana:100000,status:{},buffs:[],skillSpecs:[],abilityLevels:{},isSummon:summoned,sourceGroups:summoned?['JW','JH']:[],createdAt:g.state.time,expiresAt:g.state.time+lifetime};
  return {e};
}
function aura(g,source,seconds,summoned,api){
  const {e}=dummy(g,source,pos(source),seconds,summoned);
  for(const id of ['Aloc','A0J8','A0J9'])api.addAbility(g,e,id);
  push(g,{type:'malfurion_aura',sourceId:source.id,dummy:e,at:e.expiresAt});return e;
}
export function malfurionAuraSources(g){return(g.state.sourceSkillJobs??[]).filter(j=>j.type==='malfurion_aura'&&!j.done&&j.dummy.hp>0&&j.at>g.state.time).map(j=>j.dummy);}
export function malfurionSpellEffect(g,source,api){
  if(g._sourceAbilityEffectDepth)return false;
  g._sourceAbilityEffectDepth=(g._sourceAbilityEffectDepth??0)+1;
  try{aura(g,source,6,true,api);source.pendingAttack=null;source.targetId=null;source.chase=null;(source.status??={}).malfurionStopRequest={at:g.state.time,order:'stop'};g._event?.('cast',source,'宁静',{skillId:'A0JA'});return true;}
  finally{g._sourceAbilityEffectDepth--;}
}
export function canMalfurionCast(e,id){return id==='A0JA'&&has(e,id);}
export function castMalfurionAbility(g,source,id,params,api){
  const fail=message=>({ok:false,message}),now=g.state.time,target=params.target;
  if(!canMalfurionCast(source,id))return fail('当前单位没有宁静');
  if(source.hp<=.405||removed(source)||hidden(source)||source.status?.sourcePaused||source.status?.yseraPaused||source.status?.illidanPaused||source.status?.stunUntil>now||source.status?.cycloneUntil>now)return fail('单位当前无法施法');
  const s=api.compileAbility(g,source,id);
  if(!target||target.hp<=.405||target.hp>=target.maxHp||removed(target)||hidden(target)||has(target,'Aloc')||!api.matchesTargets(s,source,target)||target.battleTeam!==source.battleTeam||api.scriptInvulnerable(target)||api.magicImmune(target)||target.status?.cycloneUntil>now)return fail('请选择受伤且可治疗的友军');
  if(distance(source,target)>s.range+1e-8)return fail('超出600施法范围');
  const st=(source.skillStates??={})[id]??={readyAt:0,casts:0};
  if(st.readyAt>now+1e-8)return fail('技能冷却中');if(source.mana<s.manaCost)return fail('魔法不足');
  source.mana-=s.manaCost;st.readyAt=now+s.cooldown;st.casts++;
  (source.status??={}).malfurionHealRequest={at:now,targetId:target.id,missingNativeHeal:true};
  malfurionSpellEffect(g,source,api);return {ok:true,skillId:id};
}
// The two SetUnitPositionLocFacingBJ calls do not mean an unconditional
// backward blink: the branches often explicitly reuse the original location.
export function malfurionNativeBlink(y){let first=y-450<=3292?y:y-450;return {firstY:first,finalY:first+450>=2340?first:first+450,facing:90};}
function twilight(g,e,api){
  e.status??={};e.status.malfurionTwilightUsed=true;
  const {e:d}=dummy(g,e,pos(e),1,false);api.addAbility(g,d,'A0JD');d.lifeRequest=10000;
  const group=all(g).filter(t=>t.battleTeam===e.battleTeam&&!removed(t)&&!hidden(t)&&!has(t,'Aloc')&&distance(e,t)<=400*scale(e)+1e-8);
  if(e.hp>0)e.hp=Math.min(e.maxHp,e.hp+200);
  api.addAbility(g,e,'Avul');
  try{for(const t of group){
    api.nativeDamage(g,t,225,e,{attackType:'spells',damageType:'normal',weapon:true});
    (d.status.orderRequests??=[]).push({order:'drunkenhaze',abilityId:'A0JD',targetId:t.id,at:g.state.time,outcome:'native-unverified'});
  }}finally{api.removeAbility(g,e,'Avul');}
  push(g,{type:'malfurion_dummy',sourceId:e.id,dummy:d,at:d.expiresAt});
  e.status.malfurionBlinkRequest={at:g.state.time,original:pos(e),nativeProgram:'y1 = y - 450 <= 3292 ? y : y - 450; y2 = y1 + 450 >= 2340 ? y1 : y1 + 450',nativeFacing:90,applied:false,reason:'native-world-coordinate-transform-unverified'};
  e.facing=90;aura(g,e,5,false,api);g._event?.('cast',e,'暮光梦境',{skillId:'A0JE'});
}
export function malfurionMainDamage(g,target,source,amount,api,prior){
  if(prior)return prior;
  if(!(amount>0)||!source||source.id===target.id||source.side===target.side||has(source,'A2Y7'))return null;
  if(has(source,'A0JA')&&!source.status?.malfurionStarfireCooldown){
    (source.status??={}).malfurionStarfireCooldown=true;
    push(g,{type:'malfurion_starfire',sourceId:source.id,source,point:pos(target),at:g.state.time+.9});
    push(g,{type:'malfurion_cooldown',sourceId:source.id,source,at:g.state.time+8});return 'A0JA-starfire';
  }
  if(has(target,'A0JA')&&target.hp<=target.maxHp*.1&&!target.status?.malfurionTwilightUsed){twilight(g,target,api);return 'A0JA-twilight';}
  return null;
}
export function tickMalfurionJob(g,j,api){
  if(j.done)return false;if(j.at>g.state.time+1e-8)return true;
  const time=g.state.time;g.state.time=j.at;
  try{
    if(j.type==='malfurion_aura'||j.type==='malfurion_dummy'){j.dummy.status.sourceRemoved=true;j.dummy.hp=0;}
    else{const source=find(g,j);if(source&&!removed(source)){
      if(j.type==='malfurion_cooldown')delete source.status.malfurionStarfireCooldown;
      else{
        const {e:d}=dummy(g,source,j.point,1,true);for(const id of ['Aloc','A0JC'])api.addAbility(g,d,id);
        const s=api.compileAbility(g,d,'A0JC');d.status.stompRequest={at:g.state.time,abilityId:'A0JC',order:'stomp',outcome:'adapted-instant',missingNativeManaCost:true};
        push(g,{type:'malfurion_dummy',sourceId:source.id,dummy:d,at:d.expiresAt});
        for(const t of all(g))if(t.hp>.405&&!removed(t)&&!hidden(t)&&!has(t,'Aloc')&&t.battleTeam===d.battleTeam&&distance(d,t)<=s.radius+1e-8&&api.matchesTargets(s,d,t)&&!api.magicImmune(t)&&!api.scriptInvulnerable(t)){
          api.nativeDamage(g,t,Number(s.fields.DataA1),d,{attackType:'spells',damageType:'magic'});
          api.applyNativeStun(g,d,t,'A0JC');
        }
        g._event?.('cast',d,'星火术',{skillId:'A0JB'});
      }
    }else j.boundary='native-removed-source-handle-unverified';}
  }finally{g.state.time=time;j.done=true;}
  return false;
}
