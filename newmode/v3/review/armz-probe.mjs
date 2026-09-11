// armZ 셔터 계산용 읽기 전용 측정(게임 코드 수정 없음).
// 단일 게이트 행에 탄이 명중한 순간의 전방거리 d = row.z - run.z 를 모아 armZ 별 유효탄 수를 센다.
import {createRun,stepRun,drainEvents} from '../../../rush3/combat.js';
import {writeFileSync} from 'node:fs';

const ROWZ=4000;
function measure(n,weapon,x=240){
 const stage={id:99,version:1,title:'t',startUnits:n,startWeapon:weapon,length:9000,eliteZ:null,
  gateRows:[{id:'g1',z:ROWZ,h:24,cells:[{x0:80,x1:400,value:-100000,maxValue:100000}],passed:false,bypass:false}],
  supplies:[],walls:[],spawns:[],elite:null};
 const r=createRun(stage);
 const ds=[];
 while(!r.over&&r.z<ROWZ+50){
  stepRun(r,{pointerX:x});
  const d=ROWZ-r.z;
  for(const e of drainEvents(r)) if(e.type==='gateHit'||e.type==='gateFlip') ds.push(d);
 }
 return ds;
}
const out={};
for(const weapon of ['rifle','auto','heavy']){
 for(const n of [1,2,3,5,10,20]){
  const ds=measure(n,weapon);
  const row={n,weapon,total:ds.length,maxD:ds.length?Math.max(...ds):0};
  for(const arm of [300,340,380]) row['arm'+arm]=ds.filter(d=>d<=arm).length;
  out[weapon+'-'+n]=row;
 }
}
writeFileSync(new URL('./armz-probe-results.json',import.meta.url),JSON.stringify(out,null,2));
console.log('weapon|n|현재(전체)|최대사거리d|arm300|arm340|arm380|1인당arm340');
for(const k of Object.keys(out)){const r=out[k];console.log([r.weapon,r.n,r.total,r.maxD.toFixed(1),r.arm300,r.arm340,r.arm380,(r.arm340/r.n).toFixed(2)].join('|'));}
