import {createRun,stepRun,drainEvents} from './package/rush3/combat.js';
import {buildStage,lotteryPick,LOTTERY_DEFAULT_SEED} from './package/rush3/stages.js';
import {pickX,POLICIES} from './package/tests/lib/rush3-policies.mjs';
import {lotteryLine} from './package/rush3/main.js';
import {writeFileSync} from 'node:fs';
function play(id,difficulty,policy,seed,extra){
 const r=createRun(buildStage(id,{difficulty,lotterySeed:seed}));
 const evs=[];let bt=null;
 for(let n=0;n<14400&&!r.over;n++){
  let x=pickX(policy,r);
  if(extra==='lottery'&&r.z>=5400&&r.z<7250)x=330;
  if(r.boss){
   bt??=r.time;
   if(extra==='bossCenter')x=240;
   if(extra==='bossFollow')x=r.boss.x;
   if(extra==='bossSweep')x=240+90*Math.sin((r.time-bt)*2);
  }
  stepRun(r,{pointerX:x});
  for(const e of drainEvents(r))if(['supplyOpen','gatePass','padTake','weaponSame'].includes(e.type))evs.push({...e,at:r.z,time:r.time,units:r.units.length});
 }
 const lot=r.lottery;
 const chosen=lot&&r.wallSideLog[lot.wallId]==='R';
 const relevant=lot?evs.filter(e=>e.id===lot.supplyId||e.id===lot.rowId):[];
 return {id,difficulty,policy,extra:extra??null,seed:lot?.seed??null,pick:lot?.pick??null,won:r.won,over:r.over,peak:r.peak,survivors:r.units.length,weapon:r.weapon,time:r.time,bossHP:r.boss?.hp??null,bossSeconds:bt===null?null:r.time-bt,opened:evs.filter(e=>e.type==='supplyOpen').map(e=>e.id),chosen,lotteryEvents:relevant,lotteryText:lotteryLine(r,{weaponSame:relevant.some(e=>e.type==='weaponSame')}),shotLoss:r.lossByShot,touchLoss:r.lossByTouch,gateLoss:r.lossByGate};
}
const seeds={};for(let s=0;Object.keys(seeds).length<5&&s<1000;s++){const p=lotteryPick(s).entry.id;seeds[p]??=s;}
const out={seeds,defaultSeed:LOTTERY_DEFAULT_SEED,matrix:[],boss:[],lottery:[]};
for(const d of ['normal','hard','brutal'])for(const id of [1,2,3])for(const p of POLICIES)out.matrix.push(play(id,d,p));
for(const d of ['hard','brutal'])for(const id of [1,2,3])for(const extra of ['bossCenter','bossFollow','bossSweep'])out.boss.push(play(id,d,'plan',undefined,extra));
for(const d of ['normal','hard','brutal'])for(const [pick,seed]of Object.entries(seeds))for(const p of ['right','plan'])out.lottery.push(play(3,d,p,seed,'lottery'));
writeFileSync(new URL('./review-probe-results.json',import.meta.url),JSON.stringify(out,null,2));
console.log(JSON.stringify({seeds,matrix:out.matrix.length,boss:out.boss,lottery:out.lottery.map(({difficulty,policy,pick,won,survivors,peak,weapon,lotteryEvents,lotteryText})=>({difficulty,policy,pick,won,survivors,peak,weapon,actual:lotteryEvents.filter(e=>e.type==='gatePass').map(e=>e.applied),pads:lotteryEvents.filter(e=>e.type==='padTake').length,lotteryText}))},null,2));
