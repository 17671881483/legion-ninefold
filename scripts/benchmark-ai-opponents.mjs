import {pathToFileURL} from 'node:url';
// Hold the blue team's strategy fixed; change only the red AI. Player zero
// receives identical baseline build assistance in both runs. No stat grants.
// Usage: node scripts/benchmark-ai-opponents.mjs candidate-root baseline-root
const root=process.argv[2]??process.cwd(),baseline=process.argv[3]??root;
const {Game}=await import(pathToFileURL(root+'/dist/engine.js'));
const old=await import(pathToFileURL(baseline+'/dist/ai-controller.js'));
const current=await import(pathToFileURL(root+'/dist/ai-controller.js'));
for(const seed of [42,173,615]){
 const g=new Game({seed});
 g._aiBuild=(p,opening=false)=>(p.team===0?old:current).buildAIArmy(g,p,opening);
 g._aiAct=p=>(p.team===0?old:current).actAI(g,p);
 g._aiBuild(g.state.players[0],true);
 let ticks=0;while(g.state.phase!=='ended'&&g.state.wave<=8&&ticks<16000){if(g.state.phase==='build')g._aiBuild(g.state.players[0]);g.tick(.2);ticks++;}
 const ps=g.state.players.slice(4);
 console.log(JSON.stringify({seed,wave:g.state.wave,phase:g.state.phase,seconds:Math.round(g.state.time),winner:g.state.winner,kings:g.state.kings.map(k=>Math.round(k.hp)),leaks:ps.reduce((sum,p)=>sum+p.stats.leaks,0),kills:ps.reduce((sum,p)=>sum+p.stats.kills,0),military:ps.reduce((sum,p)=>sum+g._military(p),0),sent:ps.reduce((sum,p)=>sum+p.stats.sent,0)}));
}
