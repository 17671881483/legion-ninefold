import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {UNITS,MERCENARIES,WAVES,BUILDERS,PROPHET_POOLS,REFERENCE,RULES,ECONOMY,ARCHIVE_UNITS} from '../dist/data.js';
import {V14_ABILITIES,V14_UNIT_TEMPLATES,V14_UPGRADE_EDGES,V14_SUPPLEMENTAL_UPGRADE_EDGES,V14_HERO_ENTRIES,V14_HERO_UPGRADE_EDGES,V14_EASTER_CATALOG,V14_EASTER_RECIPES} from '../dist/v14-reference.js';
const root=new URL('../reference/v14-source/',import.meta.url);
function csv(text){const rows=[];let row=[],field='',quoted=false;text=text.replace(/^\uFEFF/,'');for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(field);field='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);field='';if(row.some(Boolean))rows.push(row);row=[];}else field+=c;}if(field||row.length){row.push(field);rows.push(row);}const header=rows.shift();return rows.map(row=>Object.fromEntries(header.map((k,i)=>[k,row[i]??''])));}
const table=async name=>csv(await readFile(new URL('data/'+name,root),'utf8'));
const [sourceUnits,roster,sourceWaves,sends,tech]=await Promise.all(['all_units.csv','player_buildable_units.csv','waves_x9.csv','sent_units.csv','lumber_technology_levels.csv'].map(table));
const raw=new Map(sourceUnits.map(u=>[u.rawcode,u]));
const active=UNITS.filter(u=>!u.legacy);
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);

test('new runtime selects the v14 platform identity and source registry, isolating the older workbook',()=>{assert.match(REFERENCE.sourceVersion,/14\.1A5/);assert.equal(REFERENCE.sourceRegistryCount,374);assert.equal(REFERENCE.sourceMetadata.map_identity.platform_map_id,20197574);assert.equal(RULES.monsterMultiplier,9);assert.ok(active.every(u=>u.id.startsWith('v14_')&&u.provenance==='v14.1A5-dataset'));assert.ok(UNITS.some(u=>u.legacy&&u.provenance==='5.0dJF-workbook'));});
test('all vendored source files match their recorded byte lengths and SHA256',async()=>{const manifest=JSON.parse(await readFile(new URL('import-manifest.json',root),'utf8'));assert.ok(Object.keys(manifest.files).length>=35);for(const [name,expected]of Object.entries(manifest.files)){const bytes=await readFile(new URL(name,root));assert.equal(bytes.length,expected.bytes,name);assert.equal(createHash('sha256').update(bytes).digest('hex'),expected.sha256,name);}});
test('twenty source builders and six actual prophet pools expose only current source units',()=>{assert.equal(BUILDERS.length,20);assert.deepEqual(PROPHET_POOLS.map(p=>p.length),[18,18,18,18,18,17]);const ids=new Set(active.map(u=>u.id));assert.equal(ids.size,534);for(const b of BUILDERS){for(const id of b.rosterIds)assert.ok(ids.has(id),`${b.id}:${id}`);assert.deepEqual(b.heroEntryIds,['v14_h0DB']);}for(const p of PROPHET_POOLS)for(const id of p)assert.ok(ids.has(id),id);assert.ok(BUILDERS.some(b=>b.name==='鱼人'));assert.ok(PROPHET_POOLS.flat().some(id=>id.endsWith('n085')));assert.ok(PROPHET_POOLS.flat().some(id=>id.endsWith('n2YS')));});
test('registered records, extra pool entries, morph proxies, heroes and unresolved catalogue records are counted separately',()=>{assert.equal(roster.length,374);assert.equal(active.length,534);assert.equal(active.filter(u=>!u.hero).length,381);assert.equal(active.filter(u=>u.hero&&!u.heroEntry&&!u.heroEgg).length,147);assert.equal(active.filter(u=>u.heroEgg).length,5);assert.equal(active.filter(u=>u.morphProxy).length,6);assert.equal(REFERENCE.heroEntryCount,1);assert.equal(REFERENCE.heroChoiceCount,17);assert.equal(REFERENCE.heroStageCount,147);assert.equal(ARCHIVE_UNITS.length,2);assert.deepEqual(ARCHIVE_UNITS.map(u=>u.sourceRawcode).sort(),['n07D','n07E']);assert.ok(!active.some(u=>u.sourceRawcode==='e003'));assert.equal(V14_EASTER_CATALOG.length,248);assert.equal(V14_EASTER_RECIPES.length,88);});
test('building prices and military points follow their source rows while combat values follow mapped combat bodies',()=>{for(const u of active){if(u.morphProxy)continue;const b=raw.get(u.sourceRawcode);assert.ok(b,u.id);near(u.cost,Number(b.goldcost||0));near(u.woodCost,Number(b.lumbercost||0));near(u.sourcePoints,Number(b.points||0));assert.ok(u.buildingRawFields.bldtm!==undefined||!b.bldtm,u.id);if(u.heroEntry){assert.equal(u.combatRawcode,null);continue;}const c=raw.get(u.combatRawcode);assert.ok(c,u.id);near(u.hp,Number(c.HP||0));near(u.damage,Number(c.damage_avg_1||0));assert.equal(u.sourceArmorTypeRaw,c.defType,u.id);}});
test('302 source edges plus two JASS-only reachable edges and separate hero paths resolve and preserve requirements',()=>{assert.equal(V14_UPGRADE_EDGES.length,456);assert.equal(V14_UPGRADE_EDGES.filter(e=>!e.heroProgression).length,304);assert.equal(V14_SUPPLEMENTAL_UPGRADE_EDGES.length,2);assert.deepEqual(V14_SUPPLEMENTAL_UPGRADE_EDGES.map(e=>[e.fromRawcode,e.toRawcode,e.scriptLine]),[['n2YS','n2YR',2600],['n085','n084',2602]]);const all=new Map([...active,...ARCHIVE_UNITS].map(u=>[u.id,u]));for(const u of active)for(const id of u.upgrades??[])assert.ok(all.has(id),`${u.id}->${id}`);const restricted=active.filter(u=>(u.requiresDetails??u.requirementDetails??[]).some(r=>r.rawcode!=='u004'));assert.ok(restricted.length>30);assert.ok(restricted.some(u=>(u.requiresDetails??u.requirementDetails).some(r=>/皮肤|会员|赞助/.test(r.name))));});
test('35 waves use actual ninefold counts and effective life exactly once',()=>{assert.equal(WAVES.length,35);assert.equal(WAVES[0].count,108);assert.equal(WAVES[19].count,10);assert.equal(WAVES[29].count,6);assert.equal(WAVES.reduce((n,w)=>n+w.count,0),2932);for(let i=0;i<35;i++){const w=WAVES[i],r=sourceWaves[i];near(w.hp,Number(r.x9_effective_HP));assert.equal(w.count,Number(r.x9_count_per_lane));assert.equal(w.sourceArmorTypeRaw,raw.get(w.combatRawcode).defType);assert.equal(w.damage,Number(raw.get(w.combatRawcode).damage_avg_1));}});
test('all sixty send records retain source prices, point incomes and preview stock distinction',()=>{assert.equal(MERCENARIES.length,60);const by=new Map(sends.map(s=>[s.rawcode,s]));for(const m of MERCENARIES){const s=by.get(m.sourceRawcode);assert.ok(s,m.id);near(m.wood,Number(s.lumber_cost||0));near(m.income,Number(s.x9_income_credit_wave_1_10));near(m.incomeLate,Number(s.x9_income_credit_wave_11_plus));assert.equal(m.incomeLate,Math.floor(m.income/2));if(m.shopPreview)assert.equal(m.stockMax,0);}assert.equal(MERCENARIES.filter(m=>!m.shopPreview).length,36);});
test('worker and all thirty technology costs and durations follow the new source, not old seven/fifteen caps',()=>{assert.equal(RULES.maxWorkers,10);assert.equal(RULES.maxLumberLevel,30);assert.equal(RULES.workerCostBase,50);assert.equal(RULES.workerTrainingSeconds,12);const levels=tech.filter(t=>t.available_in_x9==='True');assert.equal(levels.length,30);for(let i=0;i<30;i++){const r=levels[i],l=RULES.lumberLevels[i];near(l.gold,Number(r.gold_cost));near(l.wood,Number(r.lumber_cost));near(l.duration,Number(r.research_time_seconds));}assert.equal(RULES.initialGold,500);assert.equal(RULES.initialWood,94);});
test('native ability and unit dictionaries contain their complete current-version records',()=>{assert.equal(Object.keys(V14_ABILITIES).length,2949);assert.equal(Object.keys(V14_UNIT_TEMPLATES).length,2154);const missing=new Set();for(const u of [...active,...MERCENARIES,...WAVES])for(const id of u.abilityIds??[])if(!V14_ABILITIES[id])missing.add(id);assert.deepEqual([...missing].sort(),['Bm26','Bm29','Bm31']);assert.ok(V14_ABILITIES.A1TT);});

test('separate object overlays are applied while native CSV fields stay inspectable',()=>{const b=BUILDERS.find(b=>b.rawcode==='u03N');assert.equal(b.name,'鱼人');const covered=Object.values(V14_ABILITIES).filter(a=>a.object_overrides?.length);assert.ok(covered.length>20);for(const a of covered)assert.ok(a.resolved_fields&&a.native_slk_fields);});

test('hero altar and all seventeen current-version families use JASS entries, current combat mappings and explicit progression provenance',async()=>{
  const jass=(await readFile(new URL('raw_extracted/war3map.j',root))).toString('latin1'),lines=jass.split('\n');
  const byId=new Map(active.map(u=>[u.id,u])),altar=byId.get('v14_h0DB');
  assert.deepEqual(V14_HERO_ENTRIES,[altar.id]);assert.equal(altar.population,0);assert.equal(altar.cost,0);assert.equal(altar.buildingRawFields.bldtm,'1');assert.equal(altar.combatRawcode,null);assert.equal(altar.upgrades.length,17);
  assert.equal(altar.sourceEvidence.altarRules.ninefoldMaximum,2);
  const choices=active.filter(u=>u.heroChoice);assert.equal(choices.length,17);assert.deepEqual(new Set(altar.upgrades),new Set(choices.map(u=>u.id)));
  const familySizes=[];
  for(const first of choices){
    const family=active.filter(u=>u.hero&&!u.heroEntry&&!u.heroEgg&&u.heroFamily===first.heroFamily).sort((a,b)=>a.heroStage-b.heroStage);familySizes.push(family.length);
    const hex=Buffer.from(first.sourceRawcode).toString('hex').toUpperCase(),pageLine=lines[first.sourceEvidence.heroPage.line-1];assert.ok(pageLine.includes(`LimitHeroTypeCount(h,$${hex},true)`),first.id);
    assert.deepEqual(family.map(u=>u.heroStage),Array.from({length:family.length},(_,i)=>i+1));
    for(let i=0;i<family.length;i++){
      const u=family[i],b=raw.get(u.sourceRawcode),c=raw.get(u.combatRawcode),mapping=u.sourceEvidence.combatMapping;
      assert.ok(mapping&&mapping.building===u.sourceRawcode&&mapping.combat===u.combatRawcode,u.id);
      assert.match(lines[mapping.line-1],new RegExp(`\\$${Buffer.from(c.rawcode).toString('hex').toUpperCase()}`),u.id);
      assert.equal(u.population,Number(b.fused));assert.equal(u.heroChoice,i===0);assert.deepEqual(u.upgrades.filter(id=>!byId.get(id).heroEgg),i+1<family.length?[family[i+1].id]:[]);
      assert.match(u.sourceEvidence.progressionPolicy,/Web reconstruction/);
    }
  }
  assert.deepEqual(familySizes.sort((a,b)=>a-b),[3,3,3,3,3,...Array(12).fill(11)]);
  assert.equal(V14_HERO_UPGRADE_EDGES.length,147);assert.equal(V14_HERO_UPGRADE_EDGES.filter(e=>e.fromRawcode==='h0DB').length,17);assert.equal(V14_HERO_UPGRADE_EDGES.filter(e=>e.inferred).length,130);
  const morph=BUILDERS.find(b=>b.mode==='morph'),hellscream=byId.get('v14_hh01'),alchemist=byId.get('v14_n091');
  assert.equal(hellscream.heroLevel,10);assert.ok(!hellscream.heroAllowedBuilderIds.includes(morph.id));assert.equal(byId.get('v14_hh03').heroLevel,0);
  assert.equal(byId.get('v14_hh02').heroLevel,11);
  for(const family of ['n067','n03U','n08J','n091'])for(const u of active.filter(u=>u.heroFamily===family))assert.ok(u.heroLevel<=3,u.id);
  assert.deepEqual(alchemist.requires,['R2Z0']);assert.match(alchemist.requiresDetails[0].name,/发条地精.*地精伐木机/);
  assert.ok(!altar.requiresDetails.some(r=>/兵力|军力/.test(r.name)));
});
