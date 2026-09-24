// Proposal arithmetic only: not a combat simulation or measured coin income.
import { writeFileSync } from 'node:fs';
const proposedIncome = [112,78,144,132,170,176,200,242,354,440,546,500,788,980,773,671,968,1027,1234,1268,2046,2200,3066,2916];
const cost=2*[40,100,200,350,550].reduce((a,b)=>a+b,0)+150+400+800;
const upper=proposedIncome.reduce((a,b)=>a+b,0);
const result={kind:'proposal arithmetic; no gameplay simulation',cost,proposedUpperIncome:upper,targetIncome:cost/2,upperOverCost:upper/cost,upperOverTarget:upper/(cost/2),firstPower:{damage:1.3,hp4ShotsBefore:4,hp4ShotsAfter:Math.ceil(4/1.3),directSquadGainAt30:((29+1.3)/30-1)},maxHeroDirectEquivalent:2.5*Math.pow(.87,-5)*4,middleCost:2*(40+100+200)+150,stageUpperIncome:proposedIncome};
if(cost!==3830 || upper!==21031) throw new Error('Arithmetic mismatch');
writeFileSync(new URL('calculation-results.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
