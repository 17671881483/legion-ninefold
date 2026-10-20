import assert from 'node:assert/strict';
import fs from 'node:fs';
import {V14_UNITS,V14_ARCHIVE,V14_UNIT_TEMPLATES} from '../dist/v14-reference.js';
import {DOCUMENT_CATALOG,DOCUMENT_CATALOG_META,DOCUMENT_DISPLAY_ALIASES,DOCUMENT_APPEARANCE_GATES} from '../dist/document-catalog.js';
import {documentUnit,unitDisplayName,unitSearchText,unitCategory,isAppearanceVariant,isEntitlementVariant,appearanceBaseLabel,applyDocumentUnitOverlay,splitUnitCategories} from '../dist/unit-categories.js';

const units=[...V14_UNITS,...V14_ARCHIVE],byCode=new Map(units.map(u=>[u.sourceRawcode,u]));
const documented=Object.values(DOCUMENT_CATALOG),branches=documented.filter(row=>row.branchKind);
assert.equal(documented.length,383);
assert.equal(documented.filter(row=>row.recipeStatus==='confirmed').length,32);
assert.equal(documented.filter(row=>row.recipeStatus==='pending').length,2);
assert.equal(documented.filter(row=>row.recipeStatus==='followup').length,1);
assert.equal(branches.length,89);
assert.deepEqual(DOCUMENT_CATALOG_META.counts,{'变形入口':6,'基础兵种':107,'普通升级兵种':144,'外观款':73,'权益变体':16,'彩蛋兵种':32,'彩蛋兵种（待核定）':2,'彩蛋后续升级':1,'入口待确认':2});
for(const row of documented){
 const original=byCode.get(row.rawcode);assert.ok(original,`documented object ${row.rawcode} exists`);
 const overlay=applyDocumentUnitOverlay(original);
 for(const key of Object.keys(original))if(key!=='name')assert.deepEqual(overlay[key],original[key],`${row.rawcode}: preserve ${key}`);
 assert.equal(documentUnit(overlay),row);
 assert.equal(overlay.documentCategory,row.category);
 assert.equal(overlay.acquisitionText,row.acquisitionText);
 assert.equal(overlay.conditionText,row.conditionText);
 const actualParents=units.filter(unit=>unit.upgrades?.includes(original.id)).map(unit=>unit.sourceRawcode);
 assert.deepEqual(new Set(row.actualParentRawcodes),new Set(actualParents));
 if(row.branchKind){
  assert.equal(isAppearanceVariant(original),true);
  assert.ok(row.baseRawcode&&row.baseCategory&&row.actualParentRawcodes.length&&row.conditionText);
  assert.equal(row.recipe,null,'appearance and entitlement branches cannot become recipes');
  if(row.branchKind==='appearance')assert.equal(overlay.appearanceBaseRawcode,row.rootBaseRawcode);
  else{assert.equal(isEntitlementVariant(original),true);assert.equal(overlay.appearanceBaseRawcode,undefined);}
 }else assert.equal(isAppearanceVariant(original),false);
}
assert.deepEqual(DOCUMENT_CATALOG.h205.actualParentRawcodes,['h04A']);
assert.equal(DOCUMENT_CATALOG.h205.baseRawcode,'h04B');
assert.deepEqual(DOCUMENT_CATALOG.h204.actualParentRawcodes,['h07O']);
assert.equal(DOCUMENT_CATALOG.h204.baseRawcode,'h201');
assert.deepEqual(DOCUMENT_CATALOG.h11B.actualParentRawcodes,['h01A']);
assert.equal(DOCUMENT_CATALOG.h11B.baseRawcode,'h01B');
assert.equal(DOCUMENT_CATALOG.h0SS.baseCategory,'彩蛋兵种');
assert.equal(DOCUMENT_CATALOG.h0VL.baseCategory,'彩蛋兵种（待核定）');
assert.equal(unitCategory(byCode.get('n083')),'彩蛋后续升级');
assert.equal(DOCUMENT_CATALOG.n083.recipe,null);
assert.equal(DOCUMENT_CATALOG.h203.recipeStatus,'pending');
assert.equal(DOCUMENT_CATALOG.h2C2.recipeStatus,'pending');
assert.match(DOCUMENT_CATALOG.h2C2.conditionText,/166.*101.*待确认/);
assert.match(DOCUMENT_CATALOG.n07R.conditionText,/不要求两者持续在场/);
assert.match(appearanceBaseLabel(byCode.get('h2AB'),units),/电枪兵/);
assert.equal(Object.keys(DOCUMENT_APPEARANCE_GATES).length,11);
assert.deepEqual(DOCUMENT_APPEARANCE_GATES.n05M,{type:'shop',key:'20011313'});
assert.deepEqual(DOCUMENT_APPEARANCE_GATES.h205,{type:'account',key:'Legion_Penix'});
assert.deepEqual(DOCUMENT_APPEARANCE_GATES.h204,{type:'account',key:'Legion_Grail'});
assert.deepEqual(DOCUMENT_APPEARANCE_GATES.h160,{type:'any',options:[{type:'vip',status:'unconfirmed'},{type:'shop',key:'20011312'}]});
for(const [code,name] of Object.entries(DOCUMENT_DISPLAY_ALIASES)){
 assert.equal(name,'兽王萨尔（霜狼杜隆坦）');
 assert.equal(unitDisplayName(V14_UNIT_TEMPLATES[code]),name);
 for(const field of ['sourceRawcode','combatRawcode','rawcode','id'])assert.equal(unitDisplayName({[field]:code}),name);
 assert.equal(unitDisplayName({id:`v14_${code}`}),name);
 assert.match(unitSearchText({rawcode:code}),/兽王萨尔/);
 assert.match(unitSearchText({rawcode:code}),/霜狼杜隆坦/);
}
const fireChoices=byCode.get('h0JF').upgrades.map(id=>units.find(u=>u.id===id)),groups=splitUnitCategories(fireChoices);
assert.equal(groups.appearances.length,2);
assert.equal(groups.upgrades.length,0);
assert.equal(splitUnitCategories([byCode.get('h00X'),byCode.get('n07R'),byCode.get('h2C2'),byCode.get('n083'),byCode.get('h0SS')]).entitlements.length,1);
const undocumentedHero={id:'v14_test_hero',name:'英雄',hero:true,cost:150,upgrades:[]};
assert.equal(unitCategory(undocumentedHero),'英雄');assert.equal(applyDocumentUnitOverlay(undocumentedHero),undocumentedHero);
assert.equal(fs.readFileSync(new URL('../dist/document-catalog.js',import.meta.url),'utf8').includes('/Users/'),false);
console.log('Document catalog: 383 records, 32 confirmed + 2 pending recipes, 73 appearances + 16 entitlement branches, 11 dynamic gates and all aliases verified.');
