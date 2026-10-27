import {DOCUMENT_CATALOG,DOCUMENT_DISPLAY_ALIASES,DOCUMENT_APPEARANCE_GATES} from './document-catalog.js';

/** Reviewed document explanations stay separate from the generated map objects. */
const rawcodes=unit=>[unit?.sourceRawcode,unit?.rawcode,unit?.combatRawcode,/^v14_([A-Za-z0-9]{4})$/.exec(unit?.id??'')?.[1],unit?.id].filter(code=>/^[A-Za-z0-9]{4}$/.test(code??''));
export const documentUnit=unit=>rawcodes(unit).map(code=>DOCUMENT_CATALOG[code]).find(Boolean)??null;
export const unitDisplayName=unit=>rawcodes(unit).map(code=>DOCUMENT_DISPLAY_ALIASES[code]).find(Boolean)??unit?.name??'';
export const unitCategory=unit=>unit?.heroEgg?'彩蛋兵种':documentUnit(unit)?.category??(unit?.heroEntry?'英雄入口':unit?.hero?'英雄':unit?.morphProxy?'变形入口':unit?.skinBaseRawcode?'外观款':'');
export const unitCategoryLabel=unit=>unitCategory(unit)||'未登记分类';
export const isEntitlementVariant=unit=>unitCategory(unit)==='权益变体';
// This helper already groups separate appearance actions in the app. Keep its public shape.
export const isAppearanceVariant=unit=>['外观款','权益变体'].includes(unitCategory(unit));
export const unitBranchLabel=unit=>isEntitlementVariant(unit)?'权益分支':isAppearanceVariant(unit)?'外观款':unitCategoryLabel(unit);
export function appearanceBase(unit,units=[]){
 const code=documentUnit(unit)?.baseRawcode??unit?.skinBaseRawcode;
 return code?units.find(candidate=>!candidate.legacy&&candidate.sourceRawcode===code)??null:null;
}
export function appearanceBaseLabel(unit,units=[]){
 const base=appearanceBase(unit,units),code=documentUnit(unit)?.baseRawcode??unit?.skinBaseRawcode;
 return base?unitDisplayName(base):DOCUMENT_CATALOG[code]?.name??code??'';
}
export function unitSearchText(unit){
 const record=documentUnit(unit);
 const aliasNames=rawcodes(unit).some(code=>DOCUMENT_DISPLAY_ALIASES[code])?['兽王萨尔','霜狼杜隆坦']:[];
 return [unitDisplayName(unit),unit?.name,...aliasNames,...(record?.aliases??[]),unitCategory(unit),unit?.heroEgg?'英雄彩蛋 升级 兵种训练 四折 宝箱 神秘礼物':'',...(unit?.requiresDetails??[]).map(r=>r.name??r.rawcode),record?.category,record?.acquisitionText,record?.conditionText,record?.baseRawcode?DOCUMENT_CATALOG[record.baseRawcode]?.name:''].filter(Boolean).join(' ');
}
export function applyDocumentUnitOverlay(unit){
 const name=unitDisplayName(unit),documentCatalog=documentUnit(unit);
 const gate=rawcodes(unit).map(code=>DOCUMENT_APPEARANCE_GATES[code]).find(Boolean);
 if(name===unit.name&&!documentCatalog&&!gate)return unit;
 return {...unit,name,...(documentCatalog?{documentCatalog,documentCategory:documentCatalog.category,acquisitionText:documentCatalog.acquisitionText,conditionText:documentCatalog.conditionText,documentBaseRawcode:documentCatalog.baseRawcode,...(documentCatalog.branchKind==='appearance'?{appearanceBaseRawcode:documentCatalog.rootBaseRawcode}:{})}:{}),...(gate?{documentGate:gate}:{})};
}
export function splitUnitCategories(units=[]){
 const appearances=units.filter(isAppearanceVariant),upgrades=units.filter(unit=>!isAppearanceVariant(unit));
 return {upgrades,appearances,normal:upgrades.filter(unit=>!unitCategory(unit).startsWith('彩蛋')),easter:upgrades.filter(unit=>unitCategory(unit)==='彩蛋兵种'),pending:upgrades.filter(unit=>unitCategory(unit)==='彩蛋兵种（待核定）'),followups:upgrades.filter(unit=>unitCategory(unit)==='彩蛋后续升级'),entitlements:appearances.filter(isEntitlementVariant)};
}
