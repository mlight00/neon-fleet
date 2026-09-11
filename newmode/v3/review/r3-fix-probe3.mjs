// 구간별 예상 병력·대형 반폭 실측(현행 배치 기준선). 읽기 전용, 게임 코드 무수정.
import { createRun, stepRun, drainEvents } from '../../../rush3/combat.js';
import { buildStage } from '../../../rush3/stages.js';
import { formationHalfWidth } from '../../../rush3/squad.js';
import { writeFileSync } from 'node:fs';
const MARKS = { 1: [3800, 5300], 2: [3600, 7000], 3: [5200, 8000, 8800] };
function aim(r){let z=Infinity,x=null;
 for(const s of r.supplies){if(s.missed)continue;for(const p of s.pads)if(!p.taken&&p.z>r.z&&p.z<z){z=p.z;x=p.x;}
  if((s.opened&&s.kind!=='chain')||s.locked)continue; if(s.z>r.z&&s.z<z){z=s.z;x=s.x;}}
 for(const g of r.gateRows){if(g.passed||g.z<=r.z||g.z>=z)continue;const c=g.cells.reduce((a,b)=>a.value>=b.value?a:b);z=g.z;x=c.value<0&&g.bypass?(c.x0===80?320:160):(c.x0+c.x1)/2;}
 return x;}
const out={};
for(const id of [1,2,3]) for(const policy of ['center','left','right','aim']){
 const r=createRun(buildStage(id)); const rec={};
 for(let k=0;k<14400&&!r.over;k++){
  const px=policy==='center'?240:policy==='left'?160:policy==='right'?320:aim(r);
  const before=r.z; stepRun(r,{pointerX:px}); drainEvents(r);
  for(const m of MARKS[id]) if(before<m&&m<=r.z) rec['z'+m]={units:r.units.length,hw:formationHalfWidth(r.units.length)};
 }
 out['S'+id+' '+policy]=rec;
}
writeFileSync(new URL('./probe-results-r3fix3.json',import.meta.url),JSON.stringify(out,null,2));
for(const [k,v] of Object.entries(out)) console.log(k.padEnd(12), JSON.stringify(v));
