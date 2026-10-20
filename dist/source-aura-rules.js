// v14 war3map.j:22273–22283,22505–22509,27294–27297.
// The periodic callback writes life directly; it is not a damage event and
// must neither credit a killer nor trigger any damaged listener.
export const SOURCE_AURA_RULES = Object.freeze({
  A0BH: Object.freeze({id:'A0BH',status:'partial',runtimeImplemented:true,kind:'source_heartstopper',sourceLines:[22273,22283,22505,22509,27294,27297],
    description:'战斗期间全局每秒检查B03Q：生命比例严格大于2%时直接扣除最大生命1.2%，不产生伤害事件。减后比例小于1%时设为0.8%；多个同名光环不重复扣血，低血量不会被该回调杀死。',
    partial:'B03Q原生光环的进入刷新、离圈驻留与特殊目标判定缺少原生宿主实测；显式nativeBuffIds按真实buff执行，否则按当前存活光环的800范围推导。'}),
});
const uniqueUnits=game=>{const seen=new Set();return [...game.state.entities,...(game.state.kings??[])].filter(e=>!seen.has(e.id)&&seen.add(e.id));};
const position=e=>({x:e.worldX??e.x,y:e.worldY??e.y});
export function tickSourceAuraRules(game,api={}){
  const now=game.state.time;
  game.state.sourceAuraNextAt??=Math.floor(now)+1;
  if(game.state.phase!=='combat'){game.state.sourceAuraNextAt=Math.floor(now)+1;return;}
  const units=uniqueUnits(game),sources=units.filter(e=>e.hp>0&&e.skillVersion==='v14.1A5'&&e.skillSpecs?.some(s=>s.id==='A0BH'));
  while(game.state.sourceAuraNextAt<=now+1e-8){
    for(const target of units){
      if(!(target.hp*100/target.maxHp>2))continue;
      const explicit=target.nativeBuffIds;
      const active=Array.isArray(explicit)?explicit.includes('B03Q'):sources.some(source=>{
        const skill=source.skillSpecs.find(s=>s.id==='A0BH'),p=position(source),q=position(target);
        return source.side!==target.side&&source.battleTeam===target.battleTeam&&Math.hypot(p.x-q.x,p.y-q.y)<=skill.radius+1e-8&&(api.matchesTargets?.(skill,source,target)??true);
      });
      if(!active)continue;
      const life=target.hp*100/target.maxHp-1.2;
      target.hp=target.maxHp*(life<1?.8:life)/100;
    }
    game.state.sourceAuraNextAt+=1;
  }
}
