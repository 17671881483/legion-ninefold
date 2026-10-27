// Registered path: InitRecord -> Skills_Con / Play_Con -> con.
// The similarly named A_Moving_* functions are never registered in this JASS.
// Evidence and native-placement boundaries: reference/relocation-evidence.json.
export const RELOCATION_RULES=Object.freeze({
  A118:{status:'partial',description:'备战期免费移位。每名玩家共3次，普通建筑移动成功后移除自身A118并扣1次；取消或未落位不扣次数。神灵武士豁免也须先通过剩余次数大于0的检查。'},
  A0IH:{status:'partial',description:'无限位移是A118完成回调检查的豁免能力：保留自身移位技能且不扣全局次数；全局3次耗尽后不能再发起。h0JM/h0ST原型也有相同豁免。'},
  A0IG:{status:'marker',description:'神出鬼没是说明标记。实际移位豁免检查建筑的A0IH或h0JM/h0ST原型，不以A0IG图标本身授予无限移动。'},
});
export const RELOCATION_BOUNDARY='Web使用现有6×8布阵格完成选点，未复现原生代理单位行走、占位单位残留、地形/路径纹理及SetUnitPosition碰撞修正；普通升级后原生能力重建仍待核定。';
export function relocationRemaining(player){
  const n=player?.relocationsRemaining;
  // Older Web saves predate relocation entirely; there is no spent history.
  return n===undefined?3:Number.isInteger(n)&&n>=0&&n<=3?n:0;
}
const abilities=(def,b)=>new Set((def?.buildingAbilityIds??def?.abilityIds??[]).filter(id=>!b?.sourceRemovedBuildingAbilities?.includes(id)));
export function relocationStatus(state,player,building,def){
  const ids=abilities(def,building),raw=def?.sourceRawcode??def?.rawcode;
  const remaining=relocationRemaining(player),exempt=ids.has('A0IH')||['h0JM','h0ST'].includes(raw);
  const available=!!def&&(def.buildingAbilityIds??def.abilityIds??[]).includes('A118');
  let reason=!player||!building?'请选择自己的建筑':!available?'该源建筑没有移位指令':!ids.has('A118')?'该建筑已使用过移位':state.phase!=='build'?'等待战斗结束':['arena-prep','arena-transition'].includes(state.roundMode)?'竞技场期间无法移位':building.construction?'等待施工完成':remaining<=0?'本局移位次数已用完':'';
  return {available,canStart:!reason,reason,remaining,exempt,cost:0};
}
export function completeRelocation(player,building,def,col,row){
  const ids=abilities(def,building),raw=def.sourceRawcode??def.rawcode;
  const exempt=ids.has('A0IH')||['h0JM','h0ST'].includes(raw);
  // Keep the same building handle and all of its history/state.
  building.col=col;building.row=row;
  if(!exempt){
    building.sourceRemovedBuildingAbilities=[...new Set([...(building.sourceRemovedBuildingAbilities??[]),'A118'])];
    player.relocationsRemaining=relocationRemaining(player)-1;
  }
  return {remaining:relocationRemaining(player),exempt};
}
