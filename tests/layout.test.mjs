/**
 * Run: node tests/layout.test.mjs from legion-ninefold, or
 * node outputs/legion-ninefold/tests/layout.test.mjs from the task workspace.
 * Standalone node:assert checks; no DOM, browser, server or dependencies.
 * The renderer import is used only for its pure minimap/projection methods.
 */
import assert from 'node:assert/strict';
import {
  MAP, lanes, corridors, routes, kingPositions, kingWorld,
  laneToWorld, worldToLane, spawnWorld, spawnWarpWorld, supportWorld,
  routePoints, routeLength, pointAlongRoute, advanceAlongRoute,
  isWalkable, isSegmentWalkable, constrainPoint, closestWalkable, navigationPath,
} from '../dist/layout.js';
import { Battlefield } from '../dist/renderer.js';

let groups = 0, samples = 0;
const near = (actual, expected, epsilon = 1e-7) => assert.ok(
  Math.abs(actual - expected) < epsilon, `${actual} != ${expected}`);
const samePoint = (actual, expected) => {
  near(actual.x, expected.x); near(actual.y, expected.y);
};
const test = (name, fn) => { fn(); groups++; console.log(`✓ ${name}`); };
const pathLength = path => path.slice(1).reduce((sum, p, i) =>
  sum + Math.hypot(p.x - path[i].x, p.y - path[i].y), 0);
const checkPath = (path, from, to, team, radius = .18) => {
  assert.ok(path.length >= 2, `Missing path: ${JSON.stringify({ from, to, team })}`);
  samePoint(path[0], from); samePoint(path.at(-1), to);
  for (let i = 1; i < path.length; i++) {
    assert.ok(isSegmentWalkable(path[i - 1], path[i], team, radius),
      `Path crosses a wall: ${JSON.stringify(path.slice(i - 1, i + 1))}`);
  }
  assert.ok(pathLength(path) + 1e-7 >= Math.hypot(to.x - from.x, to.y - from.y));
};

test('Map identity, finite bounds and serializable geometric regions', () => {
  assert.equal(MAP.id, 'legion-classic-2x2-web');
  assert.equal(MAP.version, 1);
  assert.equal(lanes.length, 8);
  assert.equal(routes.length, 8);
  assert.equal(kingPositions.length, 2);
  assert.equal(corridors.length, 6);
  const { minX, minY, maxX, maxY } = MAP.bounds;
  assert.ok(maxX > minX && maxY > minY);
  for (const region of MAP.regions) {
    assert.ok([0, 1].includes(region.team));
    assert.ok(region.minX < region.maxX && region.minY < region.maxY);
    assert.ok(region.minX >= minX && region.maxX <= maxX);
    assert.ok(region.minY >= minY && region.maxY <= maxY);
  }
  assert.equal(JSON.parse(JSON.stringify(MAP)).regions.length, MAP.regions.length);
  assert.ok(MAP.referenceNotes.some(note => note.includes('传送')));
  assert.ok(MAP.referenceNotes.some(note => note.includes('Web')));
});

test('Warcraft color order is NW red, SW blue, NE teal, SE purple and mirrored east', () => {
  const expected = [
    [2, 2, 1], [2, 30, -1], [18, 2, 1], [18, 30, -1],
    [36, 2, 1], [36, 30, -1], [52, 2, 1], [52, 30, -1],
  ];
  assert.deepEqual(lanes.map(l => l.color),
    ['#ff3030', '#3866ff', '#28d8c2', '#a83fe3', '#f5d52c', '#ff9828', '#36d43b', '#f778ce']);
  expected.forEach(([x, y, direction], id) => {
    samePoint(laneToWorld(id, 0, 0), { x, y });
    assert.equal(lanes[id].direction, direction);
    assert.equal(lanes[id].team, Math.floor(id / 4));
    assert.equal(lanes[id].slot, id % 4);
    near(laneToWorld(id, 3, 12).y, direction === 1 ? 14 : 18);
  });
});

test('40 lane/world round trips cover corners, spawn, exits and building cell centers', () => {
  for (let id = 0; id < 8; id++) for (const [x, y] of
    [[0, 0], [3, 12], [6, 4], [.5, 4.5], [5.5, 11.5]]) {
    const world = laneToWorld(id, x, y), local = worldToLane(world.x, world.y, id);
    assert.equal(local.laneId, id); samePoint(local, { x, y }); samples++;
  }
  assert.equal(laneToWorld(8, 3, 12), null);
  assert.equal(worldToLane(13, 24), null, 'Shared stem must not be a build lane');
  assert.equal(worldToLane(30, 20), null, 'Neutral gap must not resolve to a lane');
});

test('Explicit warp destinations are legal but do not assert a walking-only support mechanic', () => {
  for (let id = 0; id < 8; id++) {
    const warp = spawnWarpWorld(id), local = worldToLane(warp.x, warp.y, id);
    samePoint(local, { x: 3, y: .5 });
    assert.ok(isWalkable(warp.x, warp.y, Math.floor(id / 4), .18));
  }
  for (const team of [0, 1]) {
    const king = kingWorld(team), support = supportWorld(team);
    samePoint(king, kingPositions[team]);
    near(support.x, king.x); near(support.y, king.y - 5);
    assert.ok(isWalkable(king.x, king.y, team, .18));
    assert.ok(isWalkable(support.x, support.y, team, .18));
    assert.ok(isSegmentWalkable(support, king, team, .18));
  }
});

test('Eight equal-length routes join the transverse corridor, central stem and king front', () => {
  for (let id = 0; id < 8; id++) {
    const team = Math.floor(id / 4), points = routePoints(id), king = kingWorld(team);
    assert.equal(points, routes[id]);
    samePoint(points[0], laneToWorld(id, 3, 12));
    near(points[1].y, 16);
    samePoint(points[2], { x: king.x, y: 16 });
    near(points.at(-1).x, king.x); near(king.y - points.at(-1).y, 1.5);
    near(pathLength(points), 30); near(routeLength(id), 30);
    for (let i = 1; i < points.length; i++)
      assert.ok(isSegmentWalkable(points[i - 1], points[i], team, .18));
    samePoint(pointAlongRoute(id, 0), points[0]);
    samePoint(pointAlongRoute(id, 30), points.at(-1));
    assert.equal(pointAlongRoute(id, 30).done, true);
    assert.equal(advanceAlongRoute(id, 29.5, 9).distance, 30);
    checkPath(navigationPath(spawnWorld(id), king, team, .18), spawnWorld(id), king, team);
  }
});

test('Solid lane dividers and the neutral team gap block movement, including long steps', () => {
  for (const team of [0, 1]) {
    const dx = team * 34;
    for (const y of [8, 24]) {
      const from = { x: dx + 5, y }, to = { x: dx + 21, y };
      assert.equal(isSegmentWalkable(from, to, team), false);
      const stopped = constrainPoint(from, to, team, .18);
      assert.ok(stopped.x <= dx + 7.821 && stopped.x >= dx + 7.7);
      near(stopped.y, y);
      assert.ok(isWalkable(stopped.x, stopped.y, team, .18));
      assert.ok(isSegmentWalkable(from, stopped, team, .18));
      checkPath(navigationPath(from, to, team, .18), from, to, team);
    }
  }
  assert.equal(isSegmentWalkable({ x: 13, y: 34 }, { x: 47, y: 34 }, 0), false);
  assert.deepEqual(navigationPath({ x: 5, y: 8 }, { x: 47, y: 37.5 }, 0), []);
  const illegal = { x: 30, y: 8 };
  samePoint(constrainPoint(illegal, { x: 5, y: 8 }, 0), illegal);
  assert.equal(isWalkable(NaN, 8, 0), false);
});

test('Explicit out-of-bounds repair returns a legal point without changing legal points', () => {
  for (const team of [0, 1]) {
    const valid = spawnWorld(team * 4);
    samePoint(closestWalkable(valid, team, .18), valid);
    const repaired = closestWalkable({ x: 30, y: -20 }, team, .18);
    assert.ok(repaired && isWalkable(repaired.x, repaired.y, team, .18));
  }
});

test('300 deterministic navigation cases preserve endpoints and stay in the walkable union', () => {
  let seed = 9;
  const random = () => { seed = seed * 16807 % 2147483647; return seed / 2147483647; };
  for (const team of [0, 1]) {
    const regions = MAP.regions.filter(region => region.team === team);
    const choose = () => {
      const region = regions[Math.floor(random() * regions.length)];
      return { x: region.minX + .3 + random() * (region.maxX - region.minX - .6),
        y: region.minY + .3 + random() * (region.maxY - region.minY - .6) };
    };
    for (let index = 0; index < 150; index++) {
      const from = choose(), to = choose();
      checkPath(navigationPath(from, to, team, .18), from, to, team); samples++;
    }
  }
});

test('Minimap normalized coordinates resolve all eight lanes and both king areas', () => {
  const b = MAP.bounds;
  const minimap = world => ({ x: .035 + .93 * (world.x - b.minX) / (b.maxX - b.minX),
    y: .035 + .93 * (world.y - b.minY) / (b.maxY - b.minY) });
  for (let id = 0; id < 8; id++) {
    const world = laneToWorld(id, 3, 6), normalized = minimap(world);
    assert.ok(normalized.x > 0 && normalized.x < 1 && normalized.y > 0 && normalized.y < 1);
    assert.equal(Battlefield.prototype.minimapHit(normalized.x, normalized.y), id);
    const roundtrip = worldToLane(b.minX + (normalized.x - .035) / .93 * (b.maxX - b.minX),
      b.minY + (normalized.y - .035) / .93 * (b.maxY - b.minY));
    assert.equal(roundtrip.laneId, id); samePoint(roundtrip, { x: 3, y: 6 });
  }
  for (const team of [0, 1]) {
    const normalized = minimap(kingWorld(team));
    assert.equal(Battlefield.prototype.minimapHit(normalized.x, normalized.y), 8 + team);
  }
});

test('Orthographic battlefield project/unproject preserves logical map positions', () => {
  const viewport = Object.create(Battlefield.prototype);
  Object.assign(viewport, { width: 960, height: 640, camera: { x: 30, y: 20, scale: 23 } });
  for (const world of [kingWorld(0), kingWorld(1), ...lanes.map(l => spawnWorld(l.id)),
    { x: MAP.bounds.minX, y: MAP.bounds.minY }, { x: MAP.bounds.maxX, y: MAP.bounds.maxY }]) {
    const screen = viewport.project(world.x, world.y);
    samePoint(viewport.unproject(screen.x, screen.y), world);
  }
});

assert.equal(samples, 340);
console.log(`Layout checks passed: ${groups} groups, ${samples} coordinate/navigation samples.`);
