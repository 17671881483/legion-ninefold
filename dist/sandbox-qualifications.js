import { UNITS, UNIT_TEMPLATES } from './data.js';
import { EGG_REQUIREMENTS } from './egg-rules.js';

// Match the real entitlement branch in Game.requirementStatus. Recipe/history
// technologies are handled earlier by eggRequirementStatus and stay separate.
const MARKERS = ['h200', 'h210', 'h220', 'h230', 'h240'];
const QUALIFICATION_NAME = /赞助|会员|荣誉|道具|皮肤|尊享/;
const registry = new Map();
const label = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const add = entry => {
  const existing = registry.get(entry.key);
  if (existing) {
    existing.unitNames = [...new Set([...existing.unitNames, ...(entry.unitNames ?? [])])];
    existing.aliases = [...new Set([...existing.aliases, ...(entry.aliases ?? [])])];
  } else registry.set(entry.key, { ...entry, aliases: entry.aliases ?? [], unitNames: entry.unitNames ?? [] });
};

for (const key of MARKERS) {
  const def = UNIT_TEMPLATES[key];
  if (!def) continue;
  add({ key, label: def.name === '？' ? '未命名资格标记（h240）' : def.name, kind: 'marker',
    source: { table: 'all_units.csv', rawcode: key, row: def.source?.row } });
}

function addAppearanceGate(gate, unit) {
  if (!gate) return;
  if (gate.type === 'any') { for (const option of gate.options ?? []) addAppearanceGate(option, unit); return; }
  // gateResult explicitly leaves vip tiers unresolved; no invented key unlocks
  // those seven appearances, including after enabling source marker h200.
  if (!['shop', 'account'].includes(gate.type) || !gate.key) return;
  const key = String(gate.key), title = gate.type === 'shop' ? '商城外观' : '专属外观';
  add({ key, label: `${unit.name} · ${title}`, kind: gate.type, aliases: [`${gate.type}:${key}`],
    unitNames: [unit.name], source: { file: 'dist/document-catalog.js', rawcode: unit.sourceRawcode, gateType: gate.type, key } });
}

for (const unit of UNITS.filter(entry => !entry.legacy)) {
  for (const requirement of unit.requiresDetails ?? []) {
    const key = requirement.rawcode;
    if (!key || EGG_REQUIREMENTS[key] || !(MARKERS.includes(key) || QUALIFICATION_NAME.test(requirement.name ?? ''))) continue;
    add({ key, label: label(requirement.name) || UNIT_TEMPLATES[key]?.name || key,
      kind: MARKERS.includes(key) ? 'marker' : 'item', unitNames: [unit.name],
      source: { ...requirement.source, script: 'war3map.j', line: requirement.scriptLine } });
  }
  addAppearanceGate(unit.documentGate, unit);
}

export const SANDBOX_QUALIFICATIONS = Object.freeze([...registry.values()].map(entry => Object.freeze({
  ...entry, aliases: Object.freeze(entry.aliases), unitNames: Object.freeze(entry.unitNames), source: Object.freeze(entry.source),
})));
export const SANDBOX_QUALIFICATION_KEYS = Object.freeze(SANDBOX_QUALIFICATIONS.map(entry => entry.key));

/** Test-only account state, persisted by the existing player snapshot. */
export function applySandboxQualification(game, payload = {}) {
  if (game.state?.mode !== 'sandbox') return { ok: false, message: '测试资格仅能在沙盒模式修改' };
  const playerId = payload.playerId ?? 0;
  if (!Number.isInteger(playerId) || !game.state.players?.some(player => player.id === playerId)) return { ok: false, message: '玩家不存在' };
  if (typeof payload.enabled !== 'boolean') return { ok: false, message: '请选择开启或关闭测试资格' };
  if (payload.key !== undefined && payload.keys !== undefined) return { ok: false, message: '请指定单个资格或资格列表' };
  const requested = payload.keys ?? (payload.key === undefined ? [] : [payload.key]);
  if (!Array.isArray(requested) || !requested.length || requested.some(key => typeof key !== 'string' || !registry.has(key))) {
    return { ok: false, message: '资格标记未在当前来源数据中登记' };
  }
  const keys = [...new Set(requested)], player = game.state.players.find(entry => entry.id === playerId);
  // Validate every key before writing so an invalid batch cannot partially
  // enable account qualifications or overwrite unrelated player progression.
  player.entitlements ??= {};
  for (const key of keys) {
    player.entitlements[key] = payload.enabled ? 1 : 0;
    // The source appearance gate accepts both canonical and typed forms. Turn
    // off a stored typed alias too, so a disable action actually closes it.
    if (!payload.enabled) for (const alias of registry.get(key).aliases) if (Object.hasOwn(player.entitlements, alias)) player.entitlements[alias] = 0;
  }
  const names = keys.map(key => registry.get(key).label), action = payload.enabled ? '开启' : '关闭';
  return { ok: true, message: `已${action}沙盒测试资格：${names.length <= 3 ? names.join('、') : `${names.length}项`}`,
    keys, enabled: payload.enabled, playerId };
}
