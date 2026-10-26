import {V14_ABILITIES,V14_UNIT_TEMPLATES} from './v14-reference.js';

// war3map.j 36392–36601, 39276–39283, 40689–40708, 41166,
// 43839–43840; helper timers 29735–29772 and ChargeDistance 30152–30225.
const nativeBoundary='原生命令仲裁、前摇、e008虚体碰撞及同帧事件次序尚待原图验证；Web同步派发。';
export const BRIGHT_ARTHAS_RULES=Object.freeze({
  A1VX:{name:'王者之光',status:'partial',active:true,targetKind:'none',manaCost:16,cooldown:12,
    description:'创建3个环绕光球，每个给施法者+10护甲。各自每0.04秒旋转7°、距施法者200码，给当前位置300范围存活非Avul友军恢复40生命。第150次（6秒）治疗后杀光球，死亡清理各减10甲；施法者先死则只清理监听，不杀光球。',partial:nativeBoundary},
  A1VY:{name:'神圣壁垒',status:'partial',active:true,targetKind:'none',manaCost:14,cooldown:9,
    description:'先给自身A1W2三秒，再对500范围友军组的前2个单位施加；组内未排除自身，可能重复命中自身。A1W2令主伤害事件变为80%，即减伤20%。源调用清除正面增益，并不清除负面效果；同名刷新，死亡移除。',partial:nativeBoundary+'FirstOfGroup顺序、原生增益可移除性与光环重加待核定；仅清除已识别原生正面技能增益，未知项保留并记录。'},
  A1VZ:{name:'圣光之怒',status:'implemented',description:'原图按部署建筑拥有A1VY注册此监听，并不检查A1VZ。首次任意单位的PLAYER_UNIT_DEATH事件先销毁监听，20杀计数分支位于elseif，正常死亡不会累积至奖励。保留源行为，不添加文案的攻速、攻击或护甲增益。'},
  A1W0:{name:'圣光审判',status:'partial',active:true,targetKind:'enemy',range:400,manaCost:17,cooldown:14,
    description:'选中400射程敌人，取其施法时位置400范围存活非Avul敌人，分别将移动速度设为0；3秒后先恢复该单位原型默认移动速度，再造成311通用伤害。可以攻击和施法；多次审判独立计时，先到期者即恢复速度，死亡不取消。',partial:nativeBoundary+'原生移动速度钳制与ANcl目标许可待核定，Web保留直接速度赋值，不替换成眩晕。'},
  A1W1:{name:'圣光之锤',status:'partial',active:true,targetKind:'enemy',range:400,manaCost:13,cooldown:20,
    description:'朝目标初始方向配置600码/0.2秒投锤，0秒起每0.04秒前进120；末步前480码、0.16秒处结束。终点300范围造成266通用伤害，再调用A0I7第3级眩晕（普通3秒、原生英雄1.5秒）。施法者死亡不取消，虚体死亡会立即触发终点伤害。',partial:nativeBoundary},
  A1W2:{name:'圣骑减伤',status:'implemented',description:'主伤害监听在自动施法后检查A1W2，把当前P8的80%写入事件伤害；排除空来源、自伤、盟友、A2Y7来源及主监听重入。同名3秒刷新、死亡移除。'},
});
const has=(e,id)=>Array.isArray(e?.skillSpecs)?e.skillSpecs.some(s=>s.id===id):(e?.abilityIds??[]).includes(id);
const raw=e=>e?.combatRawcode??e?.sourceRawcode??e?.rawcode;
const pos=e=>({x:e.worldX??e.x??0,y:e.worldY??e.y??0});
const scale=e=>(e.distanceScale??1/3)/100;
const alive=e=>e&&e.hp>0&&!e.status?.sourceDeathHandled&&!e.status?.deathCounted;
const now=g=>g._brightArthasEventAt??g._arthasEventAt??g.state.time;
const all=g=>[...g.state.entities,...(g.state.kings??[])];
const find=(g,id)=>all(g).find(e=>e.id===id)??g.state.brightArthasHandles?.[id];
const copy=e=>JSON.parse(JSON.stringify(e));
const retain=(g,e)=>{(g.state.brightArthasHandles??={})[e.id]=e;return e;};
const queue=(g,e,type,extra={})=>{retain(g,e);const j={type,sourceId:e.id,source:copy(e),...extra};(g.state.sourceSkillJobs??=[]).push(j);return j;};
const selected=(g,e,p,r,ally)=>all(g).filter(t=>alive(t)&&(t.team===e.team)===ally&&(t.battleTeam===undefined||e.battleTeam===undefined||t.battleTeam===e.battleTeam)&&!has(t,'Avul')&&Math.hypot(pos(t).x-p.x,pos(t).y-p.y)<=r*scale(e)+1e-8);
const atTime=(g,t,fn)=>{const prior=g._brightArthasEventAt;g._brightArthasEventAt=t;try{return fn();}finally{if(prior===undefined)delete g._brightArthasEventAt;else g._brightArthasEventAt=prior;}};
export const canBrightArthasCastAbility=(e,id)=>!!BRIGHT_ARTHAS_RULES[id]?.active&&has(e,id);
export const isBrightArthasJobType=type=>type.startsWith('bright_arthas_');

export function initializeBrightArthasDeployment(g,building,body){
  if(!building||body.status?.brightFuryRegistered)return;
  const code=building.sourceRawcode??building.unitId?.replace(/^v14_/,'');
  if(!(V14_UNIT_TEMPLATES[code]?.abilityIds??[]).includes('A1VY')&&!(building.permanentAbilityIds??[]).includes('A1VY'))return;
  (body.status??={}).brightFuryRegistered=true;body.status.brightFuryActive=true;
}

export function tryBrightArthasAutoCast(g,victim,attacker,amount,api){
  if(!(amount>0)||has(attacker,'A2Y7'))return;
  for(const id of ['A1VX','A1VY','A1W0','A1W1']){
    const e=has(victim,id)?victim:has(attacker,id)?attacker:null;
    if(e)castBrightArthasAbility(g,e,id,{target:e===victim?attacker:victim},api);
  }
}
export function brightArthasEventDamage(g,target,amount,attacker){
  if(!(amount>0)||!attacker||attacker.id===target.id||attacker.side===target.side||has(attacker,'A2Y7')||g._sourceDamageTriggerDepth)return amount;
  return has(target,'A1W2')?amount*.8:amount;
}

// common.j UnitRemoveBuffs(whichUnit, removePositive, removeNegative):
// the source passes true,false. Do not remove roots/stuns or raw abilities.
function removeKnownPositiveBuffs(target){
  const known=new Set(['Ablo','Aroa','Ainf','Afzy','AUfa','Absk']);
  target.buffs=(target.buffs??[]).filter(b=>{
    const base=V14_ABILITIES[b.skillId]?.base_code;
    if(known.has(base))return false;
    if(!['Aslo','Acri','ANdh','AEer','Aens','AUfn','Afra','Afrb','Aspo','Aven'].includes(base))(target.status.brightUnclassifiedBuffs??=[]).push(b.key??b.skillId??'unknown');
    return true;
  });
}
function shield(g,e,target,api){
  retain(g,target);
  for(const j of g.state.sourceSkillJobs??[])if(j.type==='bright_arthas_shield'&&j.targetId===target.id&&!j.done)j.done=true;
  api.addAbility(g,target,'A1W2');
  queue(g,e,'bright_arthas_shield',{targetId:target.id,nextAt:now(g)+3});
  removeKnownPositiveBuffs(target);
}
function dummy(g,e,p){return {id:g._uid(),combatRawcode:'e008',sourceRawcode:'e008',skillVersion:'v14.1A5',skillSpecs:[],status:{},hp:60,maxHp:60,team:e.team,side:e.side,battleTeam:e.battleTeam,laneId:e.laneId,ownerId:e.ownerId,userData:0,worldX:p.x,worldY:p.y};}
export function castBrightArthasAbility(g,e,id,params={},api={}){
  const rule=BRIGHT_ARTHAS_RULES[id],time=now(g),fail=message=>({ok:false,message}),target=params.target;
  if(!canBrightArthasCastAbility(e,id))return fail('该单位没有此圣光圣骑技能');
  if(!alive(e)||e.status?.stunUntil>time||e.status?.cycloneUntil>time||e.status?.sourcePaused||e.status?.illidanPaused||e.status?.yseraPaused||e.status?.yseraHidden)return fail('单位当前无法施法');
  if(rule.targetKind==='enemy'&&(!alive(target)||target.team===e.team||target.battleTeam!==e.battleTeam||api.scriptInvulnerable?.(target)||Math.hypot(pos(target).x-pos(e).x,pos(target).y-pos(e).y)>rule.range*scale(e)+1e-8))return fail('请选择400范围内的有效敌人');
  const st=(e.skillStates??={})[id]??={readyAt:0,casts:0};
  if(st.readyAt>time+1e-8)return fail('技能冷却中');if(e.mana<rule.manaCost)return fail('魔法不足');
  e.mana-=rule.manaCost;st.readyAt=time+rule.cooldown;st.casts++;g._event?.('cast',e,rule.name,{skillId:id});
  if(g._sourceAbilityEffectDepth>0)return {ok:true,skillId:id,scriptSuppressed:true};
  g._sourceAbilityEffectDepth=(g._sourceAbilityEffectDepth??0)+1;
  try{
    if(id==='A1VX')for(let i=0;i<3;i++){
      const angle=i*120,p={x:pos(e).x+Math.cos(angle*Math.PI/180)*200*scale(e),y:pos(e).y+Math.sin(angle*Math.PI/180)*200*scale(e)};
      e.armor+=10;queue(g,e,'bright_arthas_light',{...p,angle,dummy:dummy(g,e,p),count:0,nextAt:time+.04,armorHeld:true});
    }
    if(id==='A1VY'){const group=selected(g,e,pos(e),500,true);shield(g,e,e,api);for(const t of group.slice(0,2))shield(g,e,t,api);}
    if(id==='A1W0')for(const t of selected(g,e,pos(target),400,false)){
      retain(g,t);queue(g,e,'bright_arthas_judgment',{targetId:t.id,fallbackSpeed:t.moveSpeed,nextAt:time+3,...pos(t)});t.moveSpeed=0;
    }
    if(id==='A1W1')queue(g,e,'bright_arthas_hammer',{...pos(e),angle:Math.atan2(pos(target).y-pos(e).y,pos(target).x-pos(e).x),steps:0,nextAt:time,dummy:dummy(g,e,pos(e))});
  }finally{g._sourceAbilityEffectDepth--;}
  return {ok:true,skillId:id};
}

function releaseArmor(g,j){if(j.armorHeld){const e=find(g,j.sourceId)??j.source;e.armor-=10;j.armorHeld=false;}}
function hammerFinish(g,j,api){
  if(j.done)return;j.done=true;const e=find(g,j.sourceId)??j.source;
  for(const t of selected(g,e,j,300,false)){api.universalDamage(g,t,266,e);if(alive(t))api.vertigoTarget(g,e,t,3);}
  // RemoveUnit does not create a native death event.
}
export function tickBrightArthasJob(g,j,api){
  if(j.done)return false;if(j.type==='bright_arthas_orphan')return true;
  const e=find(g,j.sourceId)??j.source;
  while(!j.done&&j.nextAt<=g.state.time+1e-8)atTime(g,j.nextAt,()=>{
    if(j.type==='bright_arthas_shield'){const t=find(g,j.targetId);if(t)api.removeAbility(g,t,'A1W2');j.done=true;return;}
    if(j.type==='bright_arthas_judgment'){
      j.done=true;const t=find(g,j.targetId);if(!t)return;
      const speed=Number(V14_UNIT_TEMPLATES[raw(t)]?.sourceSpeed??t.sourceRawFields?.spd);
      if(Number.isFinite(speed))t.moveSpeed=speed*scale(t);else{t.moveSpeed=j.fallbackSpeed;(t.status??={}).brightDefaultSpeedUnresolved=true;}
      api.universalDamage(g,t,311,e);return;
    }
    if(j.type==='bright_arthas_hammer'){
      if(j.steps>=4){hammerFinish(g,j,api);return;}
      const p={x:j.x+Math.cos(j.angle)*120*scale(e),y:j.y+Math.sin(j.angle)*120*scale(e)};
      Object.assign(j,api.clampDummyPosition?.(g,p,e)??p);j.dummy.worldX=j.x;j.dummy.worldY=j.y;j.steps++;j.nextAt+=.04;return;
    }
    if(j.type==='bright_arthas_light'){
      j.angle+=7;const p={x:pos(e).x+Math.cos(j.angle*Math.PI/180)*200*scale(e),y:pos(e).y+Math.sin(j.angle*Math.PI/180)*200*scale(e)};
      Object.assign(j,api.clampDummyPosition?.(g,p,e)??p);j.dummy.worldX=j.x;j.dummy.worldY=j.y;j.count++;
      for(const t of selected(g,e,j,300,true))t.hp=Math.min(t.maxHp,t.hp+40);
      if(j.count>=150){j.dummy.hp=0;api.sourceDeath(g,j.dummy,null);releaseArmor(g,j);j.done=true;}
      j.nextAt+=.04;
    }
  });
  return !j.done;
}
export function sourceBrightArthasDeath(g,dead,api){
  if(g.state.brightArthasHandles?.[dead.id])retain(g,dead);
  // PLAYER_UNIT_DEATH is the first branch, regardless of killer or faction.
  for(const e of all(g))if(e.status?.brightFuryActive){e.status.brightFuryActive=false;e.status.brightFuryEndedBy=dead.id;}
  for(const j of g.state.sourceSkillJobs??[]){
    if(j.done||!isBrightArthasJobType(j.type))continue;
    if(j.sourceId===dead.id)j.source=copy(dead);
    if(j.type==='bright_arthas_light'&&(j.sourceId===dead.id||j.dummy.id===dead.id)){
      releaseArmor(g,j);
      if(j.dummy.id===dead.id)j.done=true;else j.type='bright_arthas_orphan';
    }
    if(j.type==='bright_arthas_orphan'&&j.dummy.id===dead.id)j.done=true;
    if(j.type==='bright_arthas_shield'&&j.targetId===dead.id){api.removeAbility(g,dead,'A1W2');j.done=true;}
    if(j.type==='bright_arthas_hammer'&&j.dummy.id===dead.id)hammerFinish(g,j,api);
  }
}
