import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {
  V14_REFERENCE, V14_UNITS, V14_BOX_TRAINING_RULES as TRAINING,
  V14_UNIT_TEMPLATES, V14_BUILDERS, V14_POOLS, V14_ARCHIVE,
  V14_UPGRADE_EDGES, V14_SUPPLEMENTAL_UPGRADE_EDGES,
  V14_HERO_ENTRIES, V14_HERO_UPGRADE_EDGES, V14_BUILD_LIMITS,
} from '../dist/v14-reference.js';

const sourceRoot=new URL('../reference/v14-source/',import.meta.url);
const jass=(await readFile(new URL('raw_extracted/war3map.j',sourceRoot))).toString('latin1');
// splitlines() would treat source byte 0x85 as another newline and corrupt IDs.
const lines=jass.split('\n');
const byRaw=new Map(V14_UNITS.map(u=>[u.sourceRawcode,u]));
const hex=raw=>Buffer.from(raw,'ascii').toString('hex').toUpperCase();
const unhex=raw=>Buffer.from(raw,'hex').toString('ascii');
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function csv(text){
  const rows=[];let row=[],field='',quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}
    else if(c===','&&!quoted){row.push(field);field='';}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);field='';if(row.some(Boolean))rows.push(row);row=[];}
    else field+=c;
  }
  if(field||row.length){row.push(field);rows.push(row);}
  const header=rows.shift().map(k=>k.replace(/^\uFEFF/,''));
  return rows.map(values=>Object.fromEntries(header.map((k,i)=>[k,values[i]??''])));
}
const rawUnits=new Map(csv(await readFile(new URL('data/all_units.csv',sourceRoot),'utf8')).map(u=>[u.rawcode,u]));
const sourceBody=source=>lines.slice(source.line-1,source.endLine).join('\n');

function literalTable(prefix,rawKey,valueKey){
  const start=lines.findIndex(line=>line.startsWith('function BoxUpgradeTreeRegister___Register '));
  const result={};
  for(let i=start+1;i<lines.length&&!lines[i].startsWith('endfunction');i++){
    const match=lines[i].match(new RegExp(`^call SaveInteger\\(O,\\$([0-9A-F]{8}),StringHash\\("${prefix}_(count|[0-9]+)"\\),(\\$[0-9A-F]{8}|[0-9]+)\\)\\r?$`));
    if(!match)continue;
    const [,encoded,key,value]=match,raw=unhex(encoded);
    result[raw]??={[rawKey]:raw,indices:[],[valueKey]:[],scriptLines:[]};
    if(key==='count'){result[raw].count=Number(value);result[raw].countScriptLine=i+1;}
    else{result[raw].indices.push(Number(key));result[raw][valueKey].push(unhex(value.slice(1)));result[raw].scriptLines.push(i+1);}
  }
  return result;
}

test('all 225 BoxGift selections and 461 native training requirements retain literal order and byte-correct source lines',()=>{
  const selections=literalTable('box_train_select','sourceRawcode','rawTargets');
  const requirements=literalTable('box_train_upgrade_require','targetRawcode','rawRequirements');
  assert.deepEqual(TRAINING.selections,selections);
  assert.deepEqual(TRAINING.targetRequirements,requirements);
  assert.equal(Object.keys(selections).length,183);
  assert.equal(TRAINING.selectionCount,225);
  assert.equal(Object.keys(requirements).length,274);
  assert.equal(TRAINING.requirementCount,461);
  for(const entry of [...Object.values(selections),...Object.values(requirements)]){
    assert.deepEqual(entry.indices,Array.from({length:entry.count},(_,i)=>i+1));
    assert.equal(entry.scriptLines.length,entry.count);
  }
  assert.deepEqual(TRAINING.selections.h0DV.rawTargets,['n08Y','n08Z','n02S']);
  assert.deepEqual(TRAINING.selections.h0DV.scriptLines,[2594,2595,2596]);
});

test('native training contract retains the reward, owned-alive/native-hero checks, target costs and success-only consumption',()=>{
  const c=TRAINING.contract;
  assert.equal(c.abilityRawcode,'A2ZA');assert.equal(c.costPercent,40);
  assert.match(lines[c.source.abilityAlias.line-1],/^integer Oh=\$41325A41/);
  assert.equal(c.ownedAliveOnly,true);assert.equal(c.excludesNativeHeroes,true);
  assert.equal(c.excludesBuildings,false);assert.equal(c.excludesRewardProvider,true);
  assert.equal(c.consumeReward,'once-on-success');assert.equal(c.immediate,true);
  assert.match(sourceBody(c.source.target),/if not IsUnitType\(Om,UNIT_TYPE_HERO\) then/);
  assert.match(sourceBody(c.source.target),/Om!=Pf/);
  assert.doesNotMatch(sourceBody(c.source.target),/UNIT_TYPE_STRUCTURE/);
  assert.match(sourceBody(c.source.ownedAlive),/GetOwningPlayer\(i\)==h and not IsUnitType\(i,UNIT_TYPE_DEAD\)/);
  const action=sourceBody(c.source.action);
  assert.match(action,/set BU=GetUnitGoldCost\(Y4\)\*40\/100/);
  assert.match(action,/set BV=GetUnitWoodCost\(Y4\)\*40\/100/);
  assert.match(action,/GetUnitAbilityLevel\(Pf,Oh\)<=0/);
  assert.match(action,/BoxGiftIsUpgradeTechReady\(h,Y4\)/);
  assert.match(action,/BoxGiftIsUpgradeLimitReady\(h,Om,Y4\)/);
  assert.match(sourceBody(c.source.consume),/if BoxGiftTryUpgradeTargetUnitNowByType\(Pf,Om,Y4\) then\r?\ncall BoxGiftConsumeBoxReward\(Pf\)/);
});

const leaves={
  n02S:{combat:'h0M0',parent:'h0DV',family:'h0DE',gold:300,pop:15,points:650,requirements:['R0HS','u00S','u004'],mappingLine:17508},
  n05H:{combat:'h0OV',parent:'h0H4',family:'h0HC',gold:650,pop:16,points:1000,requirements:['h220','R05E','u00S','u004'],mappingLine:17883},
  n07I:{combat:'h0UQ',parent:'h0U2',family:'h0U3',gold:500,pop:17,points:875,requirements:['u004','h220','R0D2'],mappingLine:18456},
  n08Y:{combat:'h0X9',parent:'h0DV',family:'h0DE',gold:605,pop:17,points:955,requirements:['u004','h220','R0HM','R0HS'],mappingLine:18582},
  n08Z:{combat:'h0XA',parent:'h0DV',family:'h0DE',gold:505,pop:17,points:855,requirements:['u004','R01D','h220','R0HS'],mappingLine:17451},
};

test('five training leaves use source combat forms, prices, requirements and native identity while retaining their altar families',()=>{
  assert.deepEqual(TRAINING.importedRawcodes,Object.keys(leaves));
  assert.deepEqual(V14_UNITS.filter(u=>u.trainingOnly).map(u=>u.sourceRawcode).sort(),Object.keys(leaves));
  for(const [raw,expected] of Object.entries(leaves)){
    const u=byRaw.get(raw),building=rawUnits.get(raw),combat=rawUnits.get(expected.combat),parent=byRaw.get(expected.parent);
    assert.equal(u.combatRawcode,expected.combat);assert.equal(u.heroFamily,expected.family);
    assert.equal(u.heroFamily,parent.heroFamily);assert.equal(u.heroPage,parent.heroPage);
    assert.equal(u.hero,true);assert.equal(u.isNativeHero,false);
    assert.ok(!['STR','AGI','INT'].includes(combat.Primary));
    assert.ok(!['STR','AGI','INT'].includes(building.Primary));
    assert.equal(u.heroStage,null);assert.equal(u.heroLevel,null);assert.equal(u.heroChoice,false);
    assert.equal(u.cost,expected.gold);assert.equal(u.cost,Number(building.goldcost));
    assert.equal(u.population,expected.pop);assert.equal(u.sourcePoints,expected.points);
    assert.equal(u.population,Number(building.fused));assert.equal(u.sourcePoints,Number(building.points));
    assert.equal(u.hp,Number(combat.HP));assert.equal(u.damage,Number(combat.damage_avg_1));
    assert.deepEqual(u.abilityIds,combat.abilList.split(',').filter(x=>x&&x!=='_'));
    assert.deepEqual(u.requires,expected.requirements);
    assert.deepEqual(TRAINING.targetRequirements[raw].rawRequirements,expected.requirements);
    assert.equal(u.initialBuildLimit,1);assert.equal(u.buildLimit,1);
    assert.equal(u.sourceEvidence.combatMapping.line,expected.mappingLine);
    assert.ok(lines[expected.mappingLine-1].includes(`set Mk[Bi]=$${hex(expected.combat)}`));
    assert.ok(lines[expected.mappingLine].includes(`set Ml[Bi]=$${hex(raw)}`));
    // The numeric catalog adapter still uses zero for absent wood costs; the
    // missing native field remains visible rather than becoming fabricated data.
    assert.ok(['','_'].includes(building.lumbercost));
    assert.equal(u.woodCost,0);assert.equal(u.buildingRawFields.lumbercost,undefined);
    assert.ok(u.sourceEvidence.missingNativeFields.includes('lumbercost'));
    const allParents=Object.values(TRAINING.selections).filter(s=>s.rawTargets.includes(raw)).map(s=>s.sourceRawcode);
    assert.deepEqual(u.trainingSources,allParents);
  }
  assert.deepEqual(byRaw.get('n05H').trainingSources,['h0H4','n01F']);
});

test('training limit helper uses saved count and limitid_ex independently from BAN native max-allowed',()=>{
  const registrations=Object.values(TRAINING.targetLimits).flatMap(l=>l.registrations);
  assert.equal(registrations.length,47);assert.equal(Object.keys(TRAINING.targetLimits).length,46);
  for(const [raw,limit] of Object.entries(TRAINING.targetLimits)){
    const originals=V14_BUILD_LIMITS.filter(l=>l.unitRawcode===raw);
    assert.equal(limit.count,originals.at(-1).maxAllowed);
    assert.equal(limit.limitidEx,originals.some(l=>l.releaseOnUpgrade));
    for(const call of limit.registrations){
      assert.equal(lines[call.scriptLine-1].trim(),`call ${call.api}($${hex(raw)},${call.counterMarkerRawcode?'$'+hex(call.counterMarkerRawcode):'0'},${call.count})`);
    }
    assert.match(lines[limit.source.countStoreLine-1],/SaveInteger\(O,x,StringHash\("count"\),y\)/);
    assert.match(lines[limit.source.extendedFlagLine-1],/SaveBoolean\(O,x,StringHash\("limitid_ex"\),true\)/);
  }
  for(const raw of ['n08Y','n08Z']){assert.equal(TRAINING.targetLimits[raw].count,1);assert.equal(TRAINING.targetLimits[raw].limitidEx,false);}
  for(const raw of ['n02S','n05H','n07I']){
    assert.equal(TRAINING.targetLimits[raw],undefined);
    assert.equal(byRaw.get(raw).sourceCaps.banInitialLimit.maxAllowed,1);
    assert.equal(byRaw.get(raw).sourceCaps.trainingLimit,null);
  }
  assert.match(sourceBody(TRAINING.contract.source.limit),/HaveSavedInteger\(O,Y4,StringHash\("count"\)\)/);
  const counting=sourceBody(TRAINING.contract.source.countLimitEnum);
  assert.match(counting,/i!=Y6/);assert.match(counting,/not IsUnitType\(i,UNIT_TYPE_DEAD\)/);
  assert.match(counting,/not ZB and LoadInteger\(O,GetHandleId\(i\),StringHash\("base_id"\)\)==Y9/);
  assert.match(sourceBody(TRAINING.contract.source.countLimits),/if ZD>DJ then\r?\nset DJ=ZD/);
});

test('new paths remain reward-only and do not add ordinary upgrade edges, pool entries, stage numbers or archived entrypoints',()=>{
  const trainingIds=new Set(Object.keys(leaves).map(c=>'v14_'+c));
  assert.equal(V14_UPGRADE_EDGES.length,451);assert.equal(V14_HERO_UPGRADE_EDGES.length,147);
  assert.equal(V14_UPGRADE_EDGES.filter(e=>!e.heroProgression).length,304);
  assert.equal(TRAINING.ordinaryUpgradeEdgesAdded,0);
  assert.deepEqual(V14_SUPPLEMENTAL_UPGRADE_EDGES.map(e=>[e.fromRawcode,e.toRawcode,e.scriptLine]),[['n2YS','n2YR',2600],['n085','n084',2602]]);
  for(const edge of V14_UPGRADE_EDGES)assert.ok(!trainingIds.has(edge.fromId)&&!trainingIds.has(edge.toId));
  for(const u of V14_UNITS){
    for(const id of u.upgrades)assert.ok(!trainingIds.has(id),`${u.id}->${id}`);
    const selection=TRAINING.selections[u.sourceRawcode];
    assert.deepEqual(u.trainTargets,selection?selection.rawTargets.filter(raw=>byRaw.has(raw)).map(raw=>'v14_'+raw):undefined);
  }
  assert.deepEqual(byRaw.get('h0DV').trainTargets,['v14_n08Y','v14_n08Z','v14_n02S']);
  for(const u of V14_UNITS.filter(u=>u.trainingOnly)){assert.deepEqual(u.upgrades,[]);assert.equal(u.randomPool,false);assert.equal(u.isBase,false);}
  for(const id of [...V14_POOLS.flat(),...V14_BUILDERS.flatMap(b=>b.rosterIds)])assert.ok(!trainingIds.has(id));
  assert.deepEqual(TRAINING.selections.n07E.rawTargets,['n07D']);
  assert.ok(!byRaw.has('n07E')&&!byRaw.has('n07D')&&!byRaw.has('n01F'));
  assert.deepEqual(V14_ARCHIVE.map(u=>u.sourceRawcode),['n07D','n07E']);
  assert.equal(V14_UNITS.filter(u=>u.hero&&!u.heroEntry&&!u.trainingOnly).length,147);
});

test('the pre-training 529 objects and existing normal content stay byte-equivalent apart from explicit trainTargets',()=>{
  const oldUnits=V14_UNITS.filter(u=>!u.trainingOnly).map(({trainTargets,...u})=>u);
  assert.equal(oldUnits.length,529);
  // Baseline is the hydrated generated catalog before this source-backed import.
  assert.equal(digest(oldUnits),'b9cf316570f79d4fa6cd21bcc3eab30b20c728bd9db4b6c9a8669fd93ac821fd');
  assert.equal(digest(V14_UPGRADE_EDGES),'b5544d02b84b9545f7fcc2dd66542cb837c8f3935178428997821b4dce5dc086');
  assert.equal(digest(V14_HERO_UPGRADE_EDGES),'6005f00bdbb04abc83ddd1befbc308e50d4fc13c61cb73e68d1feeafef791992');
  assert.equal(digest(V14_UNIT_TEMPLATES),'2a13d0f678d678b7c75e84461cad217051ec26dbf8e1e7c8b9c235774ea06d00');
  assert.equal(digest(V14_BUILDERS),'76b192d2bfd83f36996e39e51100c87adc264bcffda1e9153d87a2d8b0c1d8fe');
  assert.equal(digest(V14_POOLS),'6eb5b2800a3a2f09da00107dca61b7290107a6dd897fba7c28be68489c23fad8');
  assert.deepEqual(V14_HERO_ENTRIES,['v14_h0DB']);
});

test('generated report and public counts distinguish training leaves from numbered hero stages and ordinary edges',async()=>{
  const report=JSON.parse(await readFile(new URL('../reference/v14-import-report.json',import.meta.url),'utf8'));
  assert.equal(V14_REFERENCE.activeUnitCount,534);assert.equal(V14_REFERENCE.counts.units,534);
  assert.equal(V14_REFERENCE.heroStageCount,147);assert.equal(V14_REFERENCE.counts.heroStages,147);
  assert.equal(V14_REFERENCE.trainingOnlyUnitCount,5);assert.equal(V14_REFERENCE.counts.trainingLeaves,5);
  assert.equal(V14_REFERENCE.boxTrainingSelectionCount,225);
  assert.equal(V14_REFERENCE.upgradeEdgeCount,451);
  assert.equal(TRAINING.ordinaryUnitCount,529);assert.equal(TRAINING.trainingOnlyUnitCount,5);
  assert.equal(report.activeUnitCount,534);
  const {importedUnits,...rules}=report.boxTraining;
  assert.deepEqual(rules,TRAINING);
  assert.deepEqual(importedUnits.map(u=>u.sourceRawcode).sort(),Object.keys(leaves));
});
