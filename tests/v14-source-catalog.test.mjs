import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ITEMS,TECHNOLOGIES,SPECIAL_MONSTERS,SPECIAL_GOLD_REWARDS,SACRIFICE_REWARDS,REFERENCE,RULES,UNIT_TEMPLATES} from '../dist/data.js';
import {SOURCE_CATALOG_RECORDS,sourceCatalogDetailMarkup,sourceCatalogSearchText} from '../dist/catalog-ui.js';

const root=new URL('../reference/v14-source/',import.meta.url);
function csv(text){const rows=[];let row=[],field='',quoted=false;text=text.replace(/^\uFEFF/,'');for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(field);field='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);field='';if(row.some(Boolean))rows.push(row);row=[];}else field+=c;}if(field||row.length){row.push(field);rows.push(row);}const header=rows.shift();return rows.map(row=>Object.fromEntries(header.map((k,i)=>[k,row[i]??''])));}
const table=async name=>csv(await readFile(new URL('data/'+name,root),'utf8'));
const jass=(await readFile(new URL('raw_extracted/war3map.j',root))).toString('latin1'),lines=jass.split('\n');
const [itemRows,technologyRows,sacrificeRows,unitRows,goldRows]=await Promise.all(['all_items.csv','all_upgrades.csv','easter_egg_sacrifice_rewards.csv','all_units.csv','special_gold_rewards.csv'].map(table));
const rawHex=code=>Buffer.from(code,'ascii').toString('hex').toUpperCase();

test('all item and technology source fields survive import, with no fabricated availability or blank costs',()=>{
 for(const [rows,objects,name] of [[itemRows,ITEMS,'all_items.csv'],[technologyRows,TECHNOLOGIES,'all_upgrades.csv']]){
  assert.equal(Object.keys(objects).length,rows.length);
  rows.forEach((row,index)=>{
   const object=objects[row.rawcode];assert.ok(object,row.rawcode);
   assert.equal(object.rawcode,row.rawcode);assert.deepEqual(object.fields,Object.fromEntries(Object.entries(row).filter(([,value])=>value!==''&&value!=='_')));
   assert.deepEqual(object.source,{table:name,row:index+2,rawcode:row.rawcode});
   assert.equal(object.availability,'source-only');assert.equal(object.status,'source-record');
   assert.equal(object.cost,undefined);assert.equal(object.woodCost,undefined);
  });
 }
 assert.equal(REFERENCE.sourceItemCount,114);assert.equal(REFERENCE.sourceTechnologyCount,815);
 assert.ok(itemRows.some(row=>row.lumbercost===''),'fixture contains missing item wood costs');
});

test('special monster registration and spawn policies refer to the actual source functions and literal objects',()=>{
 assert.deepEqual(SPECIAL_MONSTERS,REFERENCE.rules.specialMonsters);
 assert.deepEqual(RULES.specialMonsters,SPECIAL_MONSTERS);
 const {waveFive,treasure}=SPECIAL_MONSTERS;
 for(const entry of treasure.byWave){
  assert.ok(lines[entry.source.line-1].includes(`set Bw[${entry.wave}]=$${rawHex(entry.rawcode)}`));
  assert.ok(UNIT_TEMPLATES[entry.rawcode]);assert.equal(UNIT_TEMPLATES[entry.rawcode].sapScalingTarget,true);
 }
 assert.deepEqual(treasure.byWave.map(entry=>entry.wave),Array.from({length:13},(_,i)=>i+7));
 assert.equal(treasure.perTeam,1);assert.equal(treasure.maximumPerWave,1);
 const waveFiveFunction=lines.slice(waveFive.source.line-1,waveFive.source.endLine).join('\n');
 assert.ok(waveFiveFunction.includes(`SpawnWaveUnitForLane(OR,$${rawHex(waveFive.rawcode)},false)`));
 assert.ok(waveFiveFunction.includes(`UnitApplyTimedLife(i,$${rawHex(waveFive.timedLifeBuffRawcode)},${waveFive.lifetimeSeconds})`));
 assert.ok(waveFiveFunction.includes(`SetUnitState(i,UNIT_STATE_MAX_LIFE,${waveFive.maxHp})`));
 assert.match(waveFiveFunction,/if OR==1 then\s+call SetUnitState\(i,UNIT_STATE_LIFE,3000\)/);
 const batch=lines.slice(waveFive.batchSource.line-1,waveFive.batchSource.endLine).join('\n');
 assert.match(batch,/if ON-OM==1 and Dg==5 then\s+call SpawnWaveFiveRewardUnitForLane\(CT\)/);
 assert.match(batch,/if Bw\[Dg\]>0 and OJ<Bx\[Dg\] then/);
 const reward=lines.slice(waveFive.firstAndLastKillReward.source.line-1,waveFive.firstAndLastKillReward.source.endLine).join('\n');
 assert.ok(reward.includes(`PLAYER_STATE_RESOURCE_GOLD)+${waveFive.firstAndLastKillReward.gold})`));
 assert.ok(reward.includes(`PLAYER_STATE_RESOURCE_LUMBER)+${waveFive.firstAndLastKillReward.wood})`));
 assert.equal(waveFive.ordinaryKillGold,false);
 assert.deepEqual([treasure.creationHpScale.firstWave,treasure.creationHpScale.throughWave10,treasure.creationHpScale.fromWave11],[6,1.5,3]);
});

test('sacrifice reward handlers are imported without granting them to arbitrary easter units',()=>{
 assert.equal(SACRIFICE_REWARDS.length,sacrificeRows.length);
 for(const [index,entry] of SACRIFICE_REWARDS.entries()){
  const row=sacrificeRows[index];
  assert.equal(entry.abilityRawcode,row.ability_rawcode);assert.equal(entry.gold,Number(row.gold));assert.equal(entry.wood,Number(row.lumber));assert.equal(entry.kingMaxHp,Number(row.king_max_HP));
  assert.ok(jass.includes(`call EggResource___InitEggResourceLevel(${entry.tier},${entry.gold},${entry.wood},${entry.kingMaxHp},$${rawHex(entry.kingBonusAbilityRawcode)})`));
  assert.deepEqual(entry.carrierRawcodes,[]);
  assert.ok(!unitRows.some(unit=>`${unit.abilList},${unit.heroAbilList}`.split(',').includes(entry.abilityRawcode)));
  assert.equal(entry.consumesUnit,true);assert.equal(entry.preservesKingLifePercent,true);
 }
 assert.equal(REFERENCE.rules.easterSacrifice.availability,'ability-carrier-source-absent');
 assert.equal(SPECIAL_GOLD_REWARDS.length,goldRows.length);
 goldRows.forEach((row,index)=>{for(const [key,value]of Object.entries(row))assert.equal(SPECIAL_GOLD_REWARDS[index][key],value);});
});

test('source-only objects and special wave events are searchable and show source evidence without build actions',()=>{
 assert.equal(SOURCE_CATALOG_RECORDS.filter(record=>record.kind==='item').length,114);
 assert.equal(SOURCE_CATALOG_RECORDS.filter(record=>record.kind==='technology').length,815);
 assert.equal(SOURCE_CATALOG_RECORDS.filter(record=>record.kind==='special').length,14);
 for(const record of SOURCE_CATALOG_RECORDS){
  const search=sourceCatalogSearchText(record);assert.ok(search.includes(record.sourceRawcode.toLowerCase()));
  const markup=sourceCatalogDetailMarkup(record);
  assert.ok(markup.includes('原始字段'));assert.ok(markup.includes(record.sourceRawcode));
  if(record.kind!=='special'){
   assert.match(markup,/仅来源记录/);assert.match(markup,/对象表不单独证明其/);assert.ok(markup.includes(record.source.table));
   assert.ok(!markup.includes('data-build'));assert.ok(!markup.includes('data-upgrade'));
  }else assert.match(markup,/war3map\.j/);
 }
 const hunter=SOURCE_CATALOG_RECORDS.find(record=>record.sourceRawcode==='h0OU');
 assert.match(sourceCatalogDetailMarkup(hunter),/全局首只和最后一只/);
 assert.deepEqual(SOURCE_CATALOG_RECORDS.filter(record=>record.kind==='special'&&sourceCatalogSearchText(record).includes('藏宝猎人')).map(record=>record.sourceRawcode),['h0OU']);
 const treasure=SOURCE_CATALOG_RECORDS.find(record=>record.sourceRawcode==='h0V3');
 assert.match(sourceCatalogDetailMarkup(treasure),/第7波/);assert.match(sourceCatalogDetailMarkup(treasure),/第6—10波×1.5/);
 const hostile={...SOURCE_CATALOG_RECORDS[0],name:'<script>alert(1)</script>',fields:{raw:'<img src=x onerror=alert(1)>'}};
 assert.ok(!sourceCatalogDetailMarkup(hostile).includes('<script>'));assert.ok(!sourceCatalogDetailMarkup(hostile).includes('<img src=x'));
});
