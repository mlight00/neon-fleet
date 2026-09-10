import {createRun,stepRun,drainEvents,STEP} from './package/rush3/combat.js';
import {buildStage} from './package/rush3/stages.js';
import {createInput} from './package/rush3/input.js';
import {writeFileSync} from 'node:fs';
const output={keyboard:[],routes:[],nearest:{},wallChoices:[]};
{
 const r=createRun({id:99,length:1000,startUnits:1,startWeapon:'rifle',supplies:[{id:'edge',x:269,z:105,r:30,kind:'soldier',durability:10,payload:{n:1}}]});
 r.units[0].fireT=99;
 r.enemies.push({id:1,kind:'grunt',x:240,z:108,px:240,pz:108,vz:60,hp:2,r:14,dead:false});
 r.bullets.push({x:240,z:90,pz:90,vz:700,w:4,dmg:1,gateHit:1,kind:'rifle',dead:false});
 stepRun(r);
 output.nearest={supplyContactZ:105-Math.sqrt(30**2-29**2),enemyContactZ:108-16,supplyHp:r.supplies[0].durability,enemyHp:r.enemies[0]?.hp,events:drainEvents(r).filter(e=>['supplyHit','enemyHit'].includes(e.type))};
}
for(const mouse of [false,true]){
 const run=createRun(buildStage(1)),input=createInput();
 if(mouse) input.onPointerMove(240,'mouse',1);
 input.onKey('ArrowRight',true);
 for(let i=0;i<120;i++){stepRun(run,input.snapshot());drainEvents(run);}
 output.keyboard.push({mouseFirst:mouse,x:run.x,tx:run.tx});
}
function aim(r){
 let z=Infinity,x=null;
 for(const s of r.supplies){
  if(s.missed)continue;
  for(const p of s.pads)if(!p.taken&&p.z>r.z&&p.z<z){z=p.z;x=p.x;}
  if((s.opened&&s.kind!=='chain')||s.locked)continue;
  if(s.z>r.z&&s.z<z){z=s.z;x=s.x;}
 }
 for(const g of r.gateRows){
  if(g.passed||g.z<=r.z||g.z>=z)continue;
  const c=g.cells.reduce((a,b)=>a.value>=b.value?a:b);
  z=g.z;x=c.value<0&&g.bypass?(c.x0===80?320:160):(c.x0+c.x1)/2;
 }
 return x;
}
for(const id of [1,2,3])for(const policy of ['center','center-1','center+1','left','right','sway','aim']){
 const r=createRun(buildStage(id)),gates=[],supply=[],loss=[];let bossStart=null;
 for(let k=0;k<14400&&!r.over;k++){
  const x=policy==='center'?240:policy==='center-1'?239:policy==='center+1'?241:policy==='left'?160:policy==='right'?320:policy==='sway'?(Math.floor(r.time/3)%2?160:320):aim(r);
  stepRun(r,{pointerX:x});
  for(const e of drainEvents(r)){
   if(e.type==='elite')bossStart=r.time;
   if(e.type==='gatePass')gates.push({...e,time:r.time});
   if(e.type==='supplyOpen'){supply.push(e.id);if(id===2&&policy==='aim')output.wallChoices.push({id:e.id,z:r.z,x:r.x,wallSide:{...r.wallSide}});}
   if(e.type==='unitLost')loss.push(r.time);
  }
 }
 output.routes.push({stage:id,policy,won:r.won,over:r.over,time:r.time,peak:r.peak,survivors:r.units.length,weapon:r.weapon,lossByShot:r.lossByShot,lossByTouch:r.lossByTouch,lossByGate:r.lossByGate,missed:r.missedSupplies,bossSeconds:bossStart===null?null:r.time-bossStart,gates,supply});
}
writeFileSync(new URL('./probe-results.json',import.meta.url),JSON.stringify(output,null,2));
console.log(JSON.stringify(output,null,2));
