/* Presentation-only range and hand-class calculations. No solver mutations. */
function createStrategyView(C){
 'use strict';
 const madeOrder=['Straight flush','Four of a kind','Full house','Flush','Straight','Set','Trips','Two pair','Overpair','Top pair','Second pair','Lower pair','Underpair','Board pair','Ace high','King high','Other high card'];
 const drawOrder=['Flush draw','Two+ rank straight draw','Gutshot','No direct draw'];
 function classify(board,id){
  const hole=C.ALL_COMBOS[id],cards=[...board,...hole],count=new Uint8Array(15),bc=new Uint8Array(15),suits=new Uint8Array(4),sm=new Int32Array(4);let mask=0,bm=0;
  for(const c of board){const r=C.rank(c);bc[r]++;bm|=1<<r;}
  for(const c of cards){const r=C.rank(c),s=c&3;count[r]++;suits[s]++;sm[s]|=1<<r;mask|=1<<r;}
  const ranks=Array.from({length:13},(_,i)=>14-i),pairs=ranks.filter(r=>count[r]>=2),trips=ranks.filter(r=>count[r]>=3),br=ranks.filter(r=>bc[r]>0),hr=hole.map(C.rank);
  const flush=suits.some(n=>n>=5),straight=C.straightHigh(mask);let made;
  if(sm.some((m,s)=>suits[s]>=5&&C.straightHigh(m)))made='Straight flush';
  else if(count.some(n=>n===4))made='Four of a kind';
  else if(trips.length&&pairs.some(r=>r!==trips[0]))made='Full house';
  else if(flush)made='Flush';
  else if(straight)made='Straight';
  else if(trips.length)made=hr[0]===hr[1]&&hr[0]===trips[0]&&bc[trips[0]]===1?'Set':'Trips';
  else if(pairs.length>=2)made='Two pair';
  else if(pairs.length){const r=pairs[0];
   if(!hr.includes(r))made='Board pair';
   else if(hr[0]===hr[1])made=r>br[0]?'Overpair':'Underpair';
   else made=r===br[0]?'Top pair':r===br[1]?'Second pair':'Lower pair';
  }else made=hr.includes(14)?'Ace high':hr.includes(13)?'King high':'Other high card';
  const draws=[];
  if(board.length<5){
   if(!flush&&suits.some((n,s)=>n===4&&hole.some(c=>(c&3)===s)))draws.push('Flush draw');
   if(!straight){const outs=ranks.filter(r=>!(mask&(1<<r))&&C.straightHigh(mask|(1<<r))>C.straightHigh(bm|(1<<r)));if(outs.length>=2)draws.push('Two+ rank straight draw');else if(outs.length===1)draws.push('Gutshot');}
   if(!draws.length)draws.push('No direct draw');
  }
  return {made,draws};
 }
 // Private realization weight: starting weight times own action probabilities.
 // Report h[1] is a normalized joint posterior, NOT a remaining combo weight.
 function remainingWeights(game,report,rootWeights,targetId,parents){
  const target=game.nodes[targetId],p=target.p,w=Float64Array.from(rootWeights[p]),path=[];
  for(let id=targetId;parents[id];id=parents[id][0])path.push([parents[id][0],id]);
  for(const [id,child] of path){const n=game.nodes[id];if(n.chance||n.p!==p)continue;
   const k=n.actions.findIndex(a=>a.child===child),rec=report.nodes[id];if(k<0||!rec)throw Error('Missing strategy on selected path.');
   const f=new Map(rec.hands.map(h=>[h[0],h[3][k]]));for(let i=0;i<w.length;i++)w[i]*=f.get(i)??0;
  }
  const board=[...new Set([...game.board,target.turn,target.river].filter(c=>Number.isInteger(c)&&c>=0&&c<52))],blocked=new Set(board);
  for(let i=0;i<w.length;i++)if(C.ALL_COMBOS[i].some(c=>blocked.has(c)))w[i]=0;
  return w;
 }
 function aggregate(ids,weights,probabilities,n){const amounts=new Float64Array(n);let mass=0;
  for(const id of ids){const w=weights[id]||0,f=probabilities(id);if(w<=0||!f)continue;mass+=w;for(let k=0;k<n;k++)amounts[k]+=w*f[k];}
  return {mass,amounts,frequencies:Array.from(amounts,v=>mass?v/mass:0)};
 }
 function classes(board,weights,probabilities,n){const groups=new Map(),blocked=new Set(board);let total=0;
  for(let id=0;id<1326;id++){if(!(weights[id]>0)||C.ALL_COMBOS[id].some(c=>blocked.has(c))||!probabilities(id))continue;total+=weights[id];const c=classify(board,id);for(const label of [c.made,...c.draws]){if(!groups.has(label))groups.set(label,[]);groups.get(label).push(id);}}
  return {total,made:madeOrder.filter(k=>groups.has(k)).map(k=>({label:k,...aggregate(groups.get(k),weights,probabilities,n)})),draws:drawOrder.filter(k=>groups.has(k)).map(k=>({label:k,...aggregate(groups.get(k),weights,probabilities,n)}))};
 }
 // Suit selection uses an OR: at least one hole card has a selected suit.
 // Both-card mode additionally permits isolating suited or suit-pair combos.
 function suitMatches(id,suits,both=false){
  if(!suits.length)return true;
  const [a,b]=C.ALL_COMBOS[id],first=suits.includes(C.SUITS[a&3]),second=suits.includes(C.SUITS[b&3]);
  return both?first&&second:first||second;
 }
 function classMatches(board,id,label){if(!label)return true;const c=classify(board,id);return c.made===label||c.draws.includes(label);}
 function filterWeights(board,weights,filter){const w=new Float64Array(1326),blocked=new Set(board);
  for(let id=0;id<1326;id++)if(weights[id]>0&&!C.ALL_COMBOS[id].some(c=>blocked.has(c))&&suitMatches(id,filter.suits,filter.both)&&classMatches(board,id,filter.handClass))w[id]=weights[id];
  return w;
 }
 // Source EV is the action-probability-weighted EV of each combo, then
 // averaged using its imported range weight. Do not invent EV for missing data.
 function sourceEV(ids,weights,hand){let mass=0,value=0;
  for(const id of ids){const w=weights[id];if(!(w>0))continue;const h=hand(id);
   if(!h?.ev||h.ev.length!==h.f.length||!h.ev.every(Number.isFinite))return null;
   const total=h.f.reduce((a,b)=>a+b,0);if(!(total>0))return null;
   mass+=w;value+=w*h.f.reduce((a,f,k)=>a+f*h.ev[k],0)/total;
  }return mass>0?value/mass:null;
 }
 return {classify,remainingWeights,aggregate,classes,suitMatches,classMatches,filterWeights,sourceEV};
}
