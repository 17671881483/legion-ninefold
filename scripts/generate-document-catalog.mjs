#!/usr/bin/env node
// The reviewed workbook export is an explicit input; no local path is used at runtime.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {V14_UNITS,V14_ARCHIVE} from '../dist/v14-reference.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
const option=name=>{const i=args.indexOf(name);return i<0?null:args[i+1];};
const input=option('--input');
if(!input)throw new Error('Usage: node scripts/generate-document-catalog.mjs --input <reviewed-export.json> [--output <module.js>]');
const source=fs.readFileSync(input,'utf8'),data=JSON.parse(source),audit=data.audit;
const unitTable=data.tables.find(t=>t.name==='所有兵种'),recipeTable=data.tables.find(t=>t.name.includes('彩蛋'));
if(!unitTable||!recipeTable||audit.unitRawcodeOrder.length!==unitTable.rows.length)throw new Error('Workbook unit rows and rawcode order do not align.');
const categories=new Map(audit.unitCategories.map(row=>[row.rawcode,row]));
const appearances=new Map(audit.appearanceUnits.map(row=>[row.rawcode,row]));
const recipes=new Map(audit.recipeSources.map((row,i)=>[row.targetRawcode,{...row,sourceLabel:recipeTable.rows[i][0],targetLabel:recipeTable.rows[i][1],conditionText:recipeTable.rows[i][2],limitText:recipeTable.rows[i][3]}]));
const aliases=Object.fromEntries(Object.entries(audit.displayAliases).filter(([code])=>/^[A-Za-z0-9]{4}$/.test(code)));
const sourceUnits=[...V14_UNITS,...V14_ARCHIVE],byId=new Map(sourceUnits.map(unit=>[unit.id,unit]));
const parents=new Map();
for(const unit of sourceUnits)for(const targetId of unit.upgrades??[]){const target=byId.get(targetId);if(!target)continue;const codes=parents.get(target.sourceRawcode)??[];if(!codes.includes(unit.sourceRawcode))codes.push(unit.sourceRawcode);parents.set(target.sourceRawcode,codes);}
const baseCategory=(code,seen=new Set())=>{if(seen.has(code))throw new Error(`Appearance base cycle: ${code}`);seen.add(code);const info=categories.get(code);if(!info)return null;return info.baseRawcode?baseCategory(info.baseRawcode,seen):info.category;};
const rootBase=(code,seen=new Set())=>{if(seen.has(code))throw new Error(`Appearance base cycle: ${code}`);seen.add(code);const parent=categories.get(code)?.baseRawcode;return parent?rootBase(parent,seen):code;};
const dynamicEvidence=code=>{
 const dynamic=audit.dynamicAppearanceEvidence,result=[];
 if(dynamic.vip.rawcodes.includes(code))result.push({kind:'member',scriptLines:dynamic.vip.scriptLines});
 if(dynamic.shop[code])result.push({kind:'shop',...dynamic.shop[code]});
 if(dynamic.account[code])result.push({kind:'account',...dynamic.account[code]});
 return result;
};
const records={};
audit.unitRawcodeOrder.forEach((rawcode,index)=>{
 const row=unitTable.rows[index],category=categories.get(rawcode),appearance=appearances.get(rawcode),recipe=recipes.get(rawcode);
 if(!category)throw new Error(`Missing category for ${rawcode}`);
 records[rawcode]={rawcode,name:row[1],category:category.category,baseRawcode:category.baseRawcode,rootBaseRawcode:category.baseRawcode?rootBase(category.baseRawcode):null,baseCategory:category.baseRawcode?baseCategory(category.baseRawcode):null,branchKind:appearance?.kind??null,actualParentRawcodes:parents.get(rawcode)??[],acquisitionText:row[2],upgradeText:row[3],conditionText:row[4],aliases:aliases[rawcode]?['兽王萨尔','霜狼杜隆坦',aliases[rawcode]]:[],recipeStatus:recipe?.status==='confirmed'?'confirmed':recipe?'pending':audit.eggFollowupCodes.includes(rawcode)?'followup':'not-recipe',recipe:recipe??null,evidence:appearance?.evidence??[],dynamicEvidence:dynamicEvidence(rawcode),source:{table:'所有兵种',record:index+1}};
});
const gates={};
for(const rawcode of audit.dynamicAppearanceEvidence.vip.rawcodes)gates[rawcode]={type:'vip',status:'unconfirmed'};
for(const [rawcode,evidence]of Object.entries(audit.dynamicAppearanceEvidence.shop))gates[rawcode]={type:'shop',key:evidence.status};
for(const [rawcode,evidence]of Object.entries(audit.dynamicAppearanceEvidence.account))gates[rawcode]={type:'account',key:evidence.marker};
// The original script also exposes this member appearance via a separate shop entitlement.
gates.h160={type:'any',options:[gates.h160,{type:'shop',key:'20011312'}]};
const counts=Object.values(records).reduce((result,row)=>(result[row.category]=(result[row.category]??0)+1,result),{});
const meta={version:'v14.1A5',title:data.title,sourceFile:path.basename(input),sourceSha256:createHash('sha256').update(source).digest('hex'),unitRecords:Object.keys(records).length,confirmedRecipes:audit.recipeTargetCodes.length,pendingRecipes:audit.recipeUnconfirmedTargetCodes.length,counts,policy:audit.policy};
if(meta.unitRecords!==383||meta.confirmedRecipes!==32||meta.pendingRecipes!==2||counts['外观款']!==73||counts['权益变体']!==16)throw new Error('Reviewed document scope changed; verify the generator before exporting.');
const output=option('--output')??path.join(root,'dist/document-catalog.js');
const js=`// Generated by scripts/generate-document-catalog.mjs from the reviewed workbook export.\n// Classification and explanations only; source rawcodes, graph edges and gameplay values remain intact.\nexport const DOCUMENT_CATALOG_META = ${JSON.stringify(meta,null,2)};\nexport const DOCUMENT_DISPLAY_ALIASES = ${JSON.stringify(aliases,null,2)};\nexport const DOCUMENT_APPEARANCE_GATES = ${JSON.stringify(gates,null,2)};\nexport const DOCUMENT_CATALOG = ${JSON.stringify(records,null,2)};\n`;
fs.writeFileSync(output,js);console.log(JSON.stringify({output:path.relative(root,output),unitRecords:meta.unitRecords,confirmedRecipes:meta.confirmedRecipes,pendingRecipes:meta.pendingRecipes,counts}));
