import { writeFile } from 'node:fs/promises';
import { UNITS, MERCENARIES, WAVES, ITEMS, TECHNOLOGIES, SPECIAL_MONSTERS, UNIT_TEMPLATES } from '../dist/data.js';
import { compileSkills, SKILL_IMPLEMENTATION_REVISION } from '../dist/skills.js';

// Coverage records describe implementation, not just object-table presence.
const current=UNITS.filter(u=>!u.legacy);
const specialCodes=[SPECIAL_MONSTERS.waveFive.rawcode,...SPECIAL_MONSTERS.treasure.byWave.map(e=>e.rawcode)];
const collect=definitions=>{
  const abilities=new Map();
  for(const unit of definitions)for(const skill of compileSkills(unit)){
    const prior=abilities.get(skill.id)??{rawcode:skill.id,name:skill.name,status:skill.status,kind:skill.kind,unitRawcodes:[]};
    const code=unit.sourceRawcode??unit.combatRawcode;
    if(!prior.unitRawcodes.includes(code))prior.unitRawcodes.push(code);
    abilities.set(skill.id,prior);
  }
  const entries=[...abilities.values()].sort((a,b)=>a.rawcode.localeCompare(b.rawcode,'en'));
  for(const entry of entries)entry.unitRawcodes.sort();
  return {counts:Object.fromEntries(['implemented','marker','unresolved'].map(status=>[status,entries.filter(e=>e.status===status).length])),abilities:entries};
};
const result={
  sourceVersion:'v14.1A5',skillImplementationRevision:SKILL_IMPLEMENTATION_REVISION,
  units:current.length,mercenaryRecords:MERCENARIES.length,mainWaves:WAVES.length,specialMonsterTypes:specialCodes.length,
  sourceOnly:{items:Object.keys(ITEMS).length,technologies:Object.keys(TECHNOLOGIES).length},
  playerSkills:collect(current),
  battleSkills:collect([...current,...MERCENARIES,...WAVES,...specialCodes.map(c=>UNIT_TEMPLATES[c])]),
  remainingSourceGaps:[
    '未核定技能逐项保留在abilities中；已实现状态也不代表整套兵种联动已还原。',
    '包内未提供完整原生商店/菜单字段，部分商品与单位入口仍待补证。',
    'A1U4/A1U5/A1U6献祭奖励可核定，但没有可证实的携带单位或授予路径。',
    '原始地图模型、贴图、音频和v14地形通行格不在解析包内。',
  ],
};
if(process.argv.includes('--write'))await writeFile(new URL('../reference/content-coverage.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({units:result.units,specialMonsterTypes:result.specialMonsterTypes,sourceOnly:result.sourceOnly,playerSkills:result.playerSkills.counts,battleSkills:result.battleSkills.counts},null,2));
