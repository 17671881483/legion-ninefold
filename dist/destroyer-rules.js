import {spawnWarpWorld,navigationPath} from './layout.js';

const nativeBoundary='AHtc缺失Cool1、Cast1、减速和Buff字段；当前仅适配显式伤害与耗魔，未核定原生施法仲裁、伤害分类和默认减速。';
export const DESTROYER_RULES={
  A0IN:{status:'partial',description:'独立武器伤害事件中，当前魔法不等于15时增加1点（受魔法上限限制）；加完恰为15才请求thunderclap。原本已经15不会发令。',partial:nativeBoundary+'原型初始魔法沿用解析器的0值适配，mana0继承默认值未提供。'},
  A0IO:{status:'partial',description:'武器伤害事件先检查旧计数是否等于15，成立且有繁衍、累计出生数不足2时创建猎手并清零计数，否则计数加1。因此从0开始在第16、32次事件各诞生一只；死掉的子体不归还名额。剧毒异虫使用h2AC，其他原型使用n0SD。',partial:'JW/JH与玩家起点使用宿主路线映射；原生出生、碰撞、科技加成和句柄生命周期仍需原图验证。'},
  A0J5:{status:'partial',description:'攻击回魔触发的翼族毁灭：AHtc显式范围300、伤害50、耗魔15；不再因敌人靠近自行消耗魔法。Dur1与HeroDur1均0.001，但不能据此视为眩晕。',partial:nativeBoundary+'即时执行为宿主适配；没有把说明中的无内置CD当作已验证的原生字段。'},
  A116:{status:'unresolved',description:'Healing Ward Aura对象存在，但Aoar恢复量、百分比开关、范围与目标默认值未提供。',partial:'停用原先零恢复量却标为已实现的光环；不得从名称推测恢复数值。'},
};
const level=(e,id)=>e?.skillSpecs?.some(s=>s.id===id)?e.abilityLevels?.[id]??1:0;
const pos=e=>({x:e.worldX??e.x,y:e.worldY??e.y});
const removed=e=>!e||e.status?.sourceRemoved||e.status?.yseraRemoved;

function breed(g,e,api){
  const st=e.status??={},count=st.destroyerAttackCount??0,born=st.destroyerOffspringCount??0;
  // The source else increments even when the ability is absent or the cap is
  // reached. Adding the ability later must not reset the unit's hashtable.
  if(count!==15||level(e,'A0IO')<=0||born>=2){st.destroyerAttackCount=(count+1)|0;return;}
  const code=['h2A8','h2A9'].includes(e.combatRawcode??e.sourceRawcode)?'h2AC':'n0SD';
  const point=pos(e),userData=e.userData??(Number.isInteger(e.ownerId)?e.ownerId+1:0);
  const body=api.spawnUnit(g,e,code,{worldX:point.x,worldY:point.y,facing:e.facing??0,userData,isSummon:true,isIllusion:false,nav:undefined,expiresAt:undefined});
  st.destroyerOffspringCount=born+1;st.destroyerAttackCount=0;
  if(!body){st.destroyerMissingTemplate=code;return;}
  body.traits=[...new Set([...(body.traits??[]),'summoned'])];
  Object.assign(body.status,{destroyerOffspring:true,destroyerParentId:e.id,sourceJWMember:true,sourceJHMember:userData});
  const playerId=userData-1,order={order:'attack',playerId};body.status.destroyerAttackOrder=order;
  if(Number.isInteger(playerId)&&playerId>=0&&playerId<8){
    const goal=spawnWarpWorld(playerId);order.goal=goal;body.sourceLaneId=playerId;
    body.nav={mode:'return',routeId:playerId,path:navigationPath(point,goal,body.battleTeam,body.radius),index:1,distance:0,goal,interrupted:false};body.routeMode='return';
  }else order.unresolvedStartLocation=true;
  g._event?.('summon',body,'繁衍 · 翼族猎手',{skillId:'A0IO',sourceId:e.id});
}

function clap(g,e,api){
  const st=e.status??={},now=g.state.time,spec=e.skillSpecs?.find(s=>s.id==='A0J5'),state=(e.skillStates??={}).A0J5??={readyAt:0,casts:0};
  const request=st.destroyerClapRequest={at:now,order:'thunderclap',abilityId:'A0J5',outcome:'requested',missingNativeFields:['Cool1','Cast1','DataC1','DataD1','BuffID1']};
  if(!spec||level(e,'A0J5')<=0){request.outcome='missing-ability';return;}
  if(e.hp<=.405||removed(e)||st.sourceHidden||st.yseraHidden||st.sourcePaused||st.yseraPaused||st.illidanPaused||st.stunUntil>now||st.cycloneUntil>now){request.outcome='blocked';return;}
  if(state.readyAt>now+1e-8){request.outcome='cooldown';return;}
  if(e.mana<spec.manaCost){request.outcome='mana';return;}
  e.mana-=spec.manaCost;state.casts++;state.readyAt=now;request.outcome='adapted-instant';
  const point=pos(e),group=[...g.state.entities,...(g.state.kings??[])].filter(t=>t.hp>.405&&!removed(t)&&!t.status?.sourceHidden&&!t.status?.yseraHidden&&!level(t,'Aloc')&&t.battleTeam===e.battleTeam&&Math.hypot(pos(t).x-point.x,pos(t).y-point.y)<=spec.radius+1e-8&&api.matchesTargets(spec,e,t)&&!api.magicImmune(t)&&!api.scriptInvulnerable(t));
  for(const target of group)api.nativeDamage(g,target,Number(spec.fields.DataA1),e,{attackType:'spells',damageType:'magic'});
  g._event?.('stomp',e,'翼族毁灭',{skillId:'A0J5',radius:spec.radius});
}

// Runs inside the independent per-attacker recursion guard (42270). Return
// the BEFORE-mutation elseif decision, so later Tauren logic cannot reselect
// the branch using the newly filled or spent mana value.
export function destroyerAttackDamage(g,e,api){
  breed(g,e,api);
  if(level(e,'A0IN')<=0||e.mana===15)return false;
  e.mana=Math.max(0,Math.min(e.maxMana,e.mana+1));
  if(e.mana===15)clap(g,e,api);
  return true;
}
