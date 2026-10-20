import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Game} from '../dist/engine.js';
import {RULES} from '../dist/data.js';

const jass=(await readFile(new URL('../reference/v14-source/raw_extracted/war3map.j',import.meta.url))).toString('latin1');

test('permanent A1PD king armor survives a data-revision migration',()=>{
  // TreasureBoxMonsterAction explicitly makes the king's A1PD permanent.
  assert.match(jass,/call UnitAddAbility\(Be,\$41315044\)\s+call UnitMakeAbilityPermanent\(Be,true,\$41315044\)/);
  const game=new Game({mode:'sandbox',seed:42}),p=game.state.players[0];
  p.treasures=[{id:'review-king-armor',level:3,kingArmor:2,canLumber:true,sourceWave:14}];
  assert.equal(game.command('treasure',{treasureId:'review-king-armor',reward:'kingArmor'}).ok,true);
  const saved=game.snapshot(),expectedArmor=game.state.kings[0].armor;
  assert.equal(expectedArmor,RULES.kingArmor+2);
  saved.state.dataRevision='v14.1A5-review-previous-revision';
  const restored=Game.fromSnapshot(saved),king=restored.state.kings[0];
  assert.equal(king.treasureArmor,2);
  assert.equal(king.armor,expectedArmor,'migrating base stats must retain the independent permanent armor reward');
});
