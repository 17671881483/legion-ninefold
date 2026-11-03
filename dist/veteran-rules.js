export const VETERAN_RULE={status:'partial',description:'击杀时有60%概率额外获得1金币；开局恰有2名人类玩家时为30%。按原图实际规则，蓝方仅老兵触发，红方任意兵种均可触发。普通攻击、技能击杀和竞技场均可生效，奖励不受波次限制。',partial:'召唤物、国王等特殊单位的金币归属及原生事件顺序仍有边界。累计125次奖励不能直接解锁泰兰，原图另外两个必要条件从未被设置。'};
const v14=e=>e?.skillVersion==='v14.1A5';

// T0 is independent from the main death chain and the normal qC bounty.
// Call after the host's ordinary kill settlement, matching its later registration.
export function veteranDeath(g,dead,killer){
 if(!dead||dead.status?.veteranDeathHandled||!killer||!(v14(dead)||v14(killer)))return;
 const owner=killer.sourceNativeOwnerId,code=killer.combatRawcode??killer.sourceRawcode;
 if(!((code==='h028'&&owner===8)||owner===9))return;
 (dead.status??={}).veteranDeathHandled=true;
 const humanCount=g.state.sourceHumanPlayerCount??1,limit=humanCount===2?3:6;
 const roll=1+Math.floor(g._random()*10),userData=killer.userData??0,playerId=userData-1;
 const report={sourceId:killer.id,nativeOwnerId:owner,userData,playerId,humanCount,limit,roll,success:roll<=limit,awarded:0};
 dead.status.veteranReward=report;
 if(!report.success)return;
 // T1 counts successful rewards, not every kill. JASS arrays also have index0.
 if(Number.isInteger(userData)&&userData>=0){const counts=g.state.sourceVeteranCounts??={};counts[userData]=(counts[userData]??0)+1;report.count=counts[userData];}
 const p=Number.isInteger(playerId)?g.state.players.find(p=>p.id===playerId):null;
 if(!p){report.boundary='native-player-not-represented';return;}
 p.gold+=1;p.stats.goldEarned+=1;report.awarded=1;
 g._event?.('gold',killer,'老练 +1',{skillId:'A113',playerId,amount:1});
}

// Only the original, identifiable deployed building proves the native owner
// and userData on an old save. Do not substitute economic owner for a dummy.
export function restoreVeteranIdentity(g,e,units){
 if(!v14(e)||!e.buildingId||e.isSummon||e.isIllusion)return;
 const p=g.state.players.find(p=>p.id===e.ownerId),b=p?.buildings.find(b=>b.id===e.buildingId);
 if(!b||units[b.unitId]?.combatRawcode!==e.combatRawcode)return;
 e.sourceNativeOwnerId??=8+p.team;e.userData??=p.id+1;
}
