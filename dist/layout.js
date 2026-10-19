/**
 * Shared map geometry for rendering, building and combat navigation.
 *
 * Topology references: the historical 11-platform 5.0dJF preview and the
 * ninefold modified-map screenshots at
 * https://blog.csdn.net/ee9867/article/details/153603059
 * (published 2025-10-20, modified 2025-11-12; not an official 15A2 map).
 * Both show two side-by-side teams, with four build lanes in a 2 x 2 layout.
 * Northern lanes face south and southern lanes face north into a transverse
 * corridor; the central stem then leads south to that team's king.
 * All coordinates and widths below are Web logical dimensions, not extracted
 * Warcraft coordinates or verified 15A2 dimensions.
 */

const EPSILON = 1e-7;
const TEAM_OFFSET = 34;
const LANE_WIDTH = 6;
const LANE_LENGTH = 12;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const point = (x, y) => ({ x, y });

// IDs retain Warcraft player-color order; computer king slots are excluded.
// West: red NW, blue SW, teal NE, purple SE.
// East: yellow NW, orange SW, green NE, pink SE.
const laneSpecs = [
  { slot: 0, name: '西北', color: '#ff3030', x: 2, north: true },
  { slot: 1, name: '西南', color: '#3866ff', x: 2, north: false },
  { slot: 2, name: '东北', color: '#28d8c2', x: 18, north: true },
  { slot: 3, name: '东南', color: '#a83fe3', x: 18, north: false },
];
const eastColors = ['#f5d52c', '#ff9828', '#36d43b', '#f778ce'];

export const lanes = Array.from({ length: 8 }, (_, id) => {
  const team = Math.floor(id / 4), spec = laneSpecs[id % 4];
  const minX = spec.x + team * TEAM_OFFSET;
  return {
    id, laneId: id, team, slot: spec.slot, name: spec.name,
    color: team ? eastColors[spec.slot] : spec.color,
    north: spec.north, direction: spec.north ? 1 : -1,
    minX, maxX: minX + LANE_WIDTH,
    minY: spec.north ? 2 : 18, maxY: spec.north ? 14 : 30,
    spawnY: spec.north ? 2 : 30, exitY: spec.north ? 14 : 18,
    width: LANE_WIDTH, length: LANE_LENGTH,
  };
});

export const kingPositions = [point(13, 37.5), point(47, 37.5)];
export const kingWorld = team => ({ ...kingPositions[team] });

/** Local x runs left-to-right. Local y always runs spawn (0) to exit (12). */
export function laneToWorld(laneId, x, y) {
  const lane = lanes[laneId];
  if (!lane) return null;
  return point(lane.minX + x, lane.spawnY + lane.direction * y);
}

/** Returns local lane coordinates only inside a lane, never for a corridor. */
export function worldToLane(x, y, laneId) {
  const candidates = Number.isInteger(laneId) ? [lanes[laneId]] : lanes;
  for (const lane of candidates) {
    if (!lane) continue;
    if (x >= lane.minX - EPSILON && x <= lane.maxX + EPSILON &&
        y >= lane.minY - EPSILON && y <= lane.maxY + EPSILON) {
      return { laneId: lane.id, x: clamp(x - lane.minX, 0, LANE_WIDTH),
        y: clamp((y - lane.spawnY) * lane.direction, 0, LANE_LENGTH) };
    }
  }
  return null;
}

export const spawnWorld = (laneId, x = 3, y = 0) => laneToWorld(laneId, x, y);
/** Explicit defender warp destination just inside the lane's spawn gate. */
export const spawnWarpWorld = laneId => laneToWorld(laneId, 3, .5);
/** Explicit support warp destination on the shared stem in front of the king. */
export const supportWorld = team => {
  const king = kingWorld(team);
  return point(king.x, king.y - 5);
};

const rectangle = (id, type, team, minX, minY, maxX, maxY, extra = {}) =>
  ({ id, type, team, minX, minY, maxX, maxY, ...extra });

export const corridors = [0, 1].flatMap(team => {
  const dx = team * TEAM_OFFSET;
  return [
    rectangle(`cross-${team}`, 'corridor', team, dx + 1, 14, dx + 25, 18,
      { kind: 'crossbar', centerline: [point(dx + 1, 16), point(dx + 25, 16)] }),
    rectangle(`stem-${team}`, 'corridor', team, dx + 11, 16, dx + 15, 36,
      { kind: 'stem', centerline: [point(dx + 13, 16), point(dx + 13, 36)] }),
    rectangle(`court-${team}`, 'king', team, dx + 9, 34, dx + 17, 41,
      { kind: 'court' }),
  ];
});

const laneRegions = lanes.map(lane => rectangle(`lane-${lane.id}`, 'lane',
  lane.team, lane.minX, lane.minY, lane.maxX, lane.maxY, { laneId: lane.id }));
const spawnRegions = lanes.map(lane => rectangle(`spawn-${lane.id}`, 'spawn',
  lane.team, lane.minX, lane.north ? 0 : 30, lane.maxX, lane.north ? 2 : 32,
  { laneId: lane.id }));

export const routes = lanes.map(lane => {
  const dx = lane.team * TEAM_OFFSET, exit = laneToWorld(lane.id, 3, 12);
  return [exit, point(exit.x, 16), point(dx + 13, 16),
    point(dx + 13, 34), point(dx + 13, 36)];
});

/** Exit -> transverse corridor -> central stem -> 1.5 units before the king. */
export const routePoints = laneId => routes[laneId] || [];

export const MAP = {
  id: 'legion-classic-2x2-web', version: 1,
  bounds: { minX: 0, minY: 0, maxX: 60, maxY: 41 },
  width: 60, height: 41, teamOffset: TEAM_OFFSET,
  laneWidth: LANE_WIDTH, laneLength: LANE_LENGTH,
  lanes, regions: [...laneRegions, ...spawnRegions, ...corridors], corridors,
  routes, kingPositions,
  referenceNotes: [
    '2×2防区与横廊、纵干道拓扑交叉参考11平台历史5.0dJF原图预览及九倍修改版截图；不作为15A2精确地图证明。',
    '历史原图存在守军传送机制。spawnWarpWorld和supportWorld提供显式传送落点；导航约束只适用于实际步行阶段，不表示协防全程步行。',
    '门内local y=0.5、王前king.y−5、地图60×41以及全部宽度和路径长度均是Web逻辑配置。',
  ],
  provenance: {
    topology: '11平台历史5.0dJF预览及九倍修改版画面交叉参考；非15A2精确地图。',
    dimensions: '全部坐标、通道宽度与防区比例是Web逻辑尺寸。',
    playerOrder: '红西北、蓝西南、青东北、紫东南；敌方黄、橙、绿、粉同序。',
    source: 'https://blog.csdn.net/ee9867/article/details/153603059',
  },
};

const teamRegions = [0, 1].map(team => MAP.regions.filter(region => region.team === team));
const inside = (x, y, region) => x >= region.minX - EPSILON &&
  x <= region.maxX + EPSILON && y >= region.minY - EPSILON && y <= region.maxY + EPSILON;
const pointWalkable = (x, y, team) => (teamRegions[team] || []).some(region => inside(x, y, region));

// A radius uses a 16-point circular footprint, including the four cardinal axes.
function offsets(radius) {
  if (!(radius > 0)) return [point(0, 0)];
  return [point(0, 0), ...Array.from({ length: 16 }, (_, i) =>
    point(Math.cos(i * Math.PI / 8) * radius, Math.sin(i * Math.PI / 8) * radius))];
}

export function isWalkable(x, y, team, radius = 0) {
  return Number.isFinite(x) && Number.isFinite(y) &&
    offsets(radius).every(offset => pointWalkable(x + offset.x, y + offset.y, team));
}

// Clip a segment to one rectangle and return the parameter interval it covers.
function segmentInterval(from, to, region) {
  let enter = 0, leave = 1;
  for (const axis of ['x', 'y']) {
    const delta = to[axis] - from[axis], low = region[axis === 'x' ? 'minX' : 'minY'],
      high = region[axis === 'x' ? 'maxX' : 'maxY'];
    if (Math.abs(delta) < EPSILON) {
      if (from[axis] < low - EPSILON || from[axis] > high + EPSILON) return null;
    } else {
      const a = (low - from[axis]) / delta, b = (high - from[axis]) / delta;
      enter = Math.max(enter, Math.min(a, b));
      leave = Math.min(leave, Math.max(a, b));
      if (enter > leave + EPSILON) return null;
    }
  }
  return enter <= 1 + EPSILON && leave >= -EPSILON
    ? [clamp(enter, 0, 1), clamp(leave, 0, 1)] : null;
}

// Furthest connected covered portion starting exactly at from. Later walkable
// islands are deliberately ignored, so a movement can never jump a wall.
function coveredFraction(from, to, team) {
  const intervals = (teamRegions[team] || []).map(region => segmentInterval(from, to, region))
    .filter(Boolean).sort((a, b) => a[0] - b[0]);
  let covered = 0, started = false;
  for (const [enter, leave] of intervals) {
    if (enter > covered + EPSILON) break;
    started = true;
    covered = Math.max(covered, leave);
    if (covered >= 1 - EPSILON) return 1;
  }
  return started ? covered : 0;
}

function movementFraction(from, to, team, radius) {
  if (!isWalkable(from.x, from.y, team, radius)) return 0;
  return Math.min(...offsets(radius).map(offset => coveredFraction(
    point(from.x + offset.x, from.y + offset.y),
    point(to.x + offset.x, to.y + offset.y), team)));
}

export function isSegmentWalkable(from, to, team, radius = 0) {
  return movementFraction(from, to, team, radius) >= 1 - EPSILON &&
    isWalkable(to.x, to.y, team, radius);
}

/** Advance only along from->to until its first wall; never project across one. */
export function constrainPoint(from, to, team, radius = 0) {
  const fraction = movementFraction(from, to, team, radius);
  const safe = fraction >= 1 - EPSILON ? 1 : Math.max(0, fraction - 1e-5);
  return point(from.x + (to.x - from.x) * safe, from.y + (to.y - from.y) * safe);
}

/** Explicit repair helper for loading/spawning only, not continuous movement. */
export function closestWalkable(position, team, radius = 0) {
  if (isWalkable(position.x, position.y, team, radius)) return { ...position };
  let best = null, bestDistance = Infinity;
  for (const region of teamRegions[team] || []) {
    if (region.maxX - region.minX < radius * 2 || region.maxY - region.minY < radius * 2) continue;
    const candidate = point(clamp(position.x, region.minX + radius, region.maxX - radius),
      clamp(position.y, region.minY + radius, region.maxY - radius));
    const delta = distance(candidate, position);
    if (delta < bestDistance && isWalkable(candidate.x, candidate.y, team, radius)) {
      best = candidate; bestDistance = delta;
    }
  }
  return best;
}

const graphCache = new Map();
function navigationGraph(team, radius) {
  const key = `${team}:${radius}`;
  if (graphCache.has(key)) return graphCache.get(key);
  const dx = TEAM_OFFSET * team;
  const nodes = [
    ...[5, 21].flatMap(x => [1, 2, 8, 14, 16, 18, 24, 30, 31].map(y => point(dx + x, y))),
    ...[16, 25, 34, 36, 37.5, 40].map(y => point(dx + 13, y)),
  ].filter(node => isWalkable(node.x, node.y, team, radius));
  const edges = nodes.map(() => []);
  for (let a = 0; a < nodes.length; a++) for (let b = a + 1; b < nodes.length; b++) {
    if (!isSegmentWalkable(nodes[a], nodes[b], team, radius)) continue;
    const cost = distance(nodes[a], nodes[b]);
    edges[a].push([b, cost]); edges[b].push([a, cost]);
  }
  const graph = { nodes, edges };
  graphCache.set(key, graph);
  return graph;
}

/**
 * Small shared visibility graph, computed once per team/radius. Returns a
 * world-space path including from and to, or [] if either end is outside the
 * walkable region. Every returned segment is checked against the region union.
 */
export function navigationPath(from, to, team, radius = 0) {
  if (!isWalkable(from.x, from.y, team, radius) || !isWalkable(to.x, to.y, team, radius)) return [];
  if (isSegmentWalkable(from, to, team, radius)) return [{ ...from }, { ...to }];
  const graph = navigationGraph(team, radius), nodes = [...graph.nodes, { ...from }, { ...to }];
  const edges = graph.edges.map(list => [...list]);
  const start = nodes.length - 2, finish = nodes.length - 1;
  edges.push([], []);
  for (const index of [start, finish]) for (let other = 0; other < graph.nodes.length; other++) {
    if (!isSegmentWalkable(nodes[index], nodes[other], team, radius)) continue;
    const cost = distance(nodes[index], nodes[other]);
    edges[index].push([other, cost]); edges[other].push([index, cost]);
  }
  const costs = nodes.map(() => Infinity), previous = nodes.map(() => -1), seen = new Set();
  costs[start] = 0;
  while (seen.size < nodes.length) {
    let current = -1;
    for (let i = 0; i < nodes.length; i++) if (!seen.has(i) &&
      (current < 0 || costs[i] < costs[current])) current = i;
    if (current < 0 || !Number.isFinite(costs[current])) break;
    if (current === finish) {
      const path = []; let cursor = finish;
      while (cursor >= 0) { path.push({ ...nodes[cursor] }); cursor = previous[cursor]; }
      return path.reverse();
    }
    seen.add(current);
    for (const [next, cost] of edges[current]) if (costs[current] + cost < costs[next]) {
      costs[next] = costs[current] + cost; previous[next] = current;
    }
  }
  return [];
}

export const routeLength = laneId => routePoints(laneId).slice(1).reduce(
  (sum, current, i) => sum + distance(routePoints(laneId)[i], current), 0);

export function pointAlongRoute(laneId, traveled) {
  const path = routePoints(laneId);
  if (!path.length) return null;
  let remaining = Math.max(0, traveled);
  for (let i = 1; i < path.length; i++) {
    const length = distance(path[i - 1], path[i]);
    if (remaining <= length) {
      const fraction = length > 0 ? remaining / length : 1;
      return { x: path[i - 1].x + (path[i].x - path[i - 1].x) * fraction,
        y: path[i - 1].y + (path[i].y - path[i - 1].y) * fraction,
        segment: i - 1, done: traveled >= routeLength(laneId) };
    }
    remaining -= length;
  }
  return { ...path[path.length - 1], segment: path.length - 2, done: true };
}

export function advanceAlongRoute(laneId, traveled, step) {
  const nextDistance = clamp(traveled + Math.max(0, step), 0, routeLength(laneId));
  return { ...pointAlongRoute(laneId, nextDistance), distance: nextDistance };
}
