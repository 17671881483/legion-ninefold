import {pathToFileURL} from 'node:url';
// Usage: node scripts/benchmark-ai.mjs [checkout-root].
// Player zero receives the same test-only build assistance in both revisions.
const root=process.argv[2]??process.cwd(),{Game}=await import(pathToFileURL(root+'/dist/engine.js'));
const results=[];
for(const seed of [42,173,615]){
 const g=new Game({seed});g._aiBuild(g.state.players[0],true);
 let ticks=0;
 while(g.state.phase!=='ended'&&g.state.wave<=3&&ticks<6000){if(g.state.phase==='build')g._aiBuild(g.state.players[0]);g.tick(.2);ticks++;}
 const ps=g.state.players.slice(4);
 results.push({seed,wave:g.state.wave,phase:g.state.phase,seconds:Math.round(g.state.time),enemyKing:Math.round(g.state.kings[1].hp),leaks:ps.reduce((s,p)=>s+p.stats.leaks,0),kills:ps.reduce((s,p)=>s+p.stats.kills,0),military:ps.reduce((s,p)=>s+g._military(p),0),workers:ps.reduce((s,p)=>s+p.workers,0),lumber:ps.reduce((s,p)=>s+p.lumberLevel,0),sent:ps.reduce((s,p)=>s+p.stats.sent,0)});
 console.log(JSON.stringify(results.at(-1)));
}
