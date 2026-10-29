// war3map.j 42150–42160 and 42713–42724. Ability text is not the execution rule.
const nativeBoundary='AOws缺失耗魔/施法默认字段，当前使用即时法术伤害适配；原生音波伤害分类、施法仲裁、伤害/眩晕顺序及最小控制时长仍待原图验证。';
export const TAUREN_RULES={
  A0N5:{status:'partial',description:'独立武器伤害事件中，能力等级必须为1。抽整数1—101，普通状态≤25触发；Avul等级恰为1时≤85触发。每次成功移除并重新添加A0N7，再请求战争践踏；不是每次攻击启动就抽签。',partial:'共享elseif链保留已定位的前置条件；其他分支效果及原生事件先后仍未全部闭合。'+nativeBoundary},
  A0N6:{status:'partial',description:'主死亡链到达该分支时立即创建同类型的新单位，使用原型初始属性，保留归属、死亡位置、朝向和路线编号。新单位标为召唤物，持续9秒，移除先祖之魂并获得Avul和Aloc；不会继承尸体的伤害、增益、冷却或再次复活能力。',partial:'JW/JH采用宿主路线登记；原生创建钩子、建筑/科技属性、碰撞和死亡链尚未实现的前置分支仍有边界。'},
  A0N7:{status:'partial',description:'粉碎震击实际调用的战争践踏：物编范围300、伤害100，普通和英雄控制字段均为0.001秒，冷却80秒。每次成功触发重新添加能力，重置其原生冷却；只处理敌对有机目标。',partial:nativeBoundary+'原生目标默认许可未闭合；没有按文案改成100神圣伤害或0.01秒。'},
  Aloc:{status:'partial',description:'蝗虫能力具有选中与碰撞副作用。先祖之魂适配为可见、不可点击选择，且不参与单位间排斥；自身仍能攻击。',partial:'其他携带者、原生范围枚举、地形路径与移除Aloc后的行为未统一实现，不能视为纯装饰标记。'},
};
const level=(e,id)=>e?.skillSpecs?.some(s=>s.id===id)?e.abilityLevels?.[id]??1:0;
const raw=e=>e?.combatRawcode??e?.sourceRawcode;
const pos=e=>({x:e.worldX??e.x,y:e.worldY??e.y});
const removed=e=>!e||e.status?.sourceRemoved||e.status?.yseraRemoved;
const all=g=>[...g.state.entities,...(g.state.kings??[])];

// Preserve selection of earlier 42618–42712 elseif branches. Their unfinished
// effects stay in their own families; a match must not also execute A0N5.
function earlierAttackBranch(g,e){
  if(e.mana!==15&&level(e,'A0IN')>0)return 'A0IN';
  if(level(e,'A0JV')===1&&1+105*g._random()>=73)return 'A0JV';
  if(level(e,'A0TH')>0&&1+100*g._random()>=68)return 'A0TH';
  if(level(e,'A0P0')===1)return 'A0P0';
  if(raw(e)==='h0OV'&&101*g._random()<=25)return 'h0OV';
  if(raw(e)==='h0BR')return 'h0BR';
  if(level(e,'A0PV')===1)return 'A0PV';
  return null;
}
export function taurenAttackDamage(g,e,target,api){
  if(level(e,'A0N5')!==1)return;
  const st=e.status??={},prior=earlierAttackBranch(g,e);
  if(prior){st.taurenSkippedBranch=prior;return;}
  const roll=1+Math.floor(g._random()*101),threshold=level(e,'Avul')===1?85:25;
  st.taurenLastRoll={at:g.state.time,roll,threshold};if(roll>threshold)return;
  api.removeAbility(g,e,'A0N7');api.addAbility(g,e,'A0N7');
  const s=api.compileAbility(g,e,'A0N7'),state=e.skillStates.A0N7;
  const blocked=e.hp<=.405||removed(e)||st.sourceHidden||st.yseraHidden||st.sourcePaused||st.yseraPaused||st.illidanPaused||st.stunUntil>g.state.time||st.cycloneUntil>g.state.time;
  st.taurenStompRequest={at:g.state.time,order:'stomp',abilityId:'A0N7',outcome:blocked?'blocked':'adapted-instant',missingNativeManaCost:true};
  if(blocked)return;
  state.casts++;state.readyAt=g.state.time+s.cooldown;
  // Native AOws executes independently of the map's SPELL_EFFECT trigger.
  const p=pos(e),group=all(g).filter(t=>t.hp>.405&&!removed(t)&&!t.status?.sourceHidden&&!t.status?.yseraHidden&&!level(t,'Aloc')&&t.battleTeam===e.battleTeam&&Math.hypot(pos(t).x-p.x,pos(t).y-p.y)<=s.radius+1e-8&&api.matchesTargets(s,e,t)&&!api.magicImmune(t)&&!api.scriptInvulnerable(t));
  for(const t of group){api.nativeDamage(g,t,Number(s.fields.DataA1),e,{attackType:'spells',damageType:'magic'});api.applyNativeStun(g,e,t,'A0N7');}
  g._event?.('stomp',e,'粉碎震击',{skillId:'A0N7',radius:s.radius});
}

export function taurenMainDeath(g,e,api){
  if(!level(e,'A0N6'))return false;
  // These earlier branches match on prototype regardless of A0N6. The
  // destruction tag "7" is recorded as a remaining cross-family boundary.
  if(['h0PC','h0D3','h2A2','n004'].includes(raw(e)))return false;
  const p=pos(e),userData=e.userData??(Number.isInteger(e.ownerId)?e.ownerId+1:0),body=api.spawnUnit(g,e,raw(e),{worldX:p.x,worldY:p.y,facing:e.facing??0,userData,expiresAt:g.state.time+9,isSummon:true,isIllusion:false});
  if(!body){(e.status??={}).taurenMissingTemplate=raw(e);return true;}
  api.removeAbility(g,body,'A0N6');api.addAbility(g,body,'Avul');api.addAbility(g,body,'Aloc');
  body.traits=[...new Set([...(body.traits??[]),'summoned'])];
  Object.assign(body.status,{taurenSpirit:true,sourceLocust:true,sourceJWMember:true,sourceJHMember:userData});
  body.radius=0;body.targetId=null;body.pendingAttack=null;
  (e.status??={}).taurenSpiritId=body.id;
  g._event?.('revive',body,'先祖之魂 · 9秒',{skillId:'A0N6',sourceId:e.id});return true;
}
