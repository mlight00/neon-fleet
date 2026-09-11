import { createRun, stepRun, drainEvents } from 'file:///E:/workspace/claude/neon-fleet/worktrees/v3-lastwar/rush3/combat.js';
function stage(o){return {id:99,version:2,title:'t',startUnits:o.n,startWeapon:o.weapon??'rifle',length:o.length??12000,eliteZ:null,elite:null,spawns:[],gateRows:[],supplies:o.supplies??[],walls:o.walls??[]};}
function pre(r){for(const s of r.supplies) if(s.coverZ!=null) s.locked = r.z < s.coverZ;}
function dash(defs,walls,coverZ,stopZ,n,weapon,T,lx,rx){
  const st=stage({n,weapon,supplies:defs.map(d=>({...d,payload:{...d.payload}})),walls,length:stopZ+400});
  const r=createRun(st); for(const s of r.supplies) s.coverZ=coverZ;
  while(!r.over&&r.z<stopZ){const px=r.z<T?lx:rx; pre(r); stepRun(r,{pointerX:px}); drainEvents(r);}
  return {L:r.supplies[0].opened,R:r.supplies[1].opened,side:JSON.stringify(r.wallSide)};
}
const WALLX={x0:228,x1:252};
const s2defs=[{id:'c1',z:2300,x:120,kind:'soldier',durability:6,maxDurability:6,payload:{n:3}},{id:'c2',z:2300,x:326,kind:'weapon',durability:12,maxDurability:12,payload:{weapon:'auto'}}];
const s2wall=[{id:'w1',z0:1800,z1:3000,...WALLX}];
console.log('--- S2 fine sweep (reachable n=5) ---');
for(const n of [4,5,6,7]){let hits=[];for(let T=1450;T<=1740;T+=10){const o=dash(s2defs,s2wall,1740,2360,n,'rifle',T,120,330); if(o.L&&o.R) hits.push(T);} console.log('n='+n+' both at T='+JSON.stringify(hits));}
const p1defs=[{id:'L',z:2800,x:150,kind:'chain',durability:10,maxDurability:10,payload:{pads0:5,maxPads:15}},{id:'R',z:2800,x:330,kind:'soldier',durability:10,maxDurability:10,payload:{n:5}}];
const wA=[{id:'wA',z0:2400,z1:2900,...WALLX}];
console.log('--- S3 p1 fine sweep (reachable n=10) ---');
for(const n of [8,9,10,11,12]){let hits=[];for(let T=2100;T<=2340;T+=10){const o=dash(p1defs,wA,2340,2860,n,'rifle',T,150,330); if(o.L&&o.R) hits.push(T);} console.log('n='+n+' both at T='+JSON.stringify(hits));}
const p2defs=[{id:'L',z:3400,x:150,kind:'weapon',durability:12,maxDurability:12,payload:{weapon:'auto'}},{id:'R',z:3400,x:330,kind:'weapon',durability:24,maxDurability:24,payload:{weapon:'heavy'}}];
const wB=[{id:'wB',z0:3150,z1:3550,...WALLX}];
console.log('--- S3 p2 fine sweep ---');
for(const n of [15,20,25,30]){let hits=[];for(let T=2900;T<=3090;T+=10){const o=dash(p2defs,wB,3090,3460,n,'rifle',T,150,330); if(o.L&&o.R) hits.push(T);} console.log('n='+n+' both at T='+JSON.stringify(hits));}
