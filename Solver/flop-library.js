/* Import FlopViewer combo weights and conditional action probabilities. */
function createFlopLibrary(C, order) {
 'use strict';
 const names={'2Bet_BU_BB':'BTN vs BB · single-raised','2Bet_UTG_BB':'UTG vs BB · single-raised','3Bet_SB_BU':'SB vs BTN · 3-bet'};
 const combo=hand=>{if(!/^[2-9TJQKA][shdc][2-9TJQKA][shdc]$/.test(hand))throw Error('Invalid combo '+hand);const id=C.comboId(C.cardId(hand.slice(0,2)),C.cardId(hand.slice(2)));if(id<0)throw Error('Repeated card in '+hand);return id;};
 const ids=order.map(combo);if(ids.length!==1326||new Set(ids).size!==1326)throw Error('Invalid source combo order.');
 const legal=(id,board)=>!C.ALL_COMBOS[id].some(c=>board.includes(c));
 function parse(text){
  const rows=text.trim().replace(/^\uFEFF/,'').split(/\r?\n/).map(s=>s.split('\t')),head=rows.shift();
  const col=(r,k)=>r[head.indexOf(k)]||'';
  const chips=(r,k)=>{const raw=col(r,k).trim();if(!raw)return null;const v=Number(raw);if(!Number.isSafeInteger(v)||v<1)throw Error('Invalid '+k+' for '+col(r,'Board')+'; expected positive whole chips.');return v;};
  if(!head.includes('Configuration')||!head.includes('Board'))throw Error('Expected FlopViewer TSV columns.');
  return rows.filter(r=>r.some(Boolean)).map(r=>{
   const configuration=col(r,'Configuration'),boardText=col(r,'Board'),board=boardText.match(/.{2}/g)?.map(C.cardId);
   if(boardText.length!==6||!board||board.some(c=>c<0)||new Set(board).size!==3)throw Error('Invalid flop '+boardText);
   const nodes={};
   for(let n=1;head.includes('NodeName'+n);n++){
    const name=col(r,'NodeName'+n);if(!name)continue;
    if(nodes[name])throw Error('Duplicate node '+name);
    const colors=col(r,'RangeColors'+n).split(',');if(!colors.every(s=>/^#[0-9a-f]{6}$/i.test(s)))throw Error('Invalid action colors at '+name);
    const source=col(r,'PreflopRange'+n).trim().split(/\s+/).map(Number);
    if(source.length!==1326||source.some(w=>!Number.isFinite(w)||w<0||w>1))throw Error('Invalid weights at '+name);
    const weights=new Float64Array(1326),hands=new Map();ids.forEach((id,i)=>{weights[id]=legal(id,board)?source[i]:0;});
    for(const entry of col(r,'Freqs'+n).split('*').filter(Boolean)){
     const [hand,...values]=entry.split(','),id=combo(hand),count=colors.length;
     const f=values.slice(0,count).map(Number),ev=values.slice(count,count*2).map(Number);
     if(f.length!==count||f.some(v=>!Number.isFinite(v)||v<0||v>100.0001)||Math.abs(f.reduce((a,b)=>a+b,0)-100)>0.01||hands.has(id))throw Error('Invalid strategy at '+name+' / '+hand);
     hands.set(id,{f:f.map(x=>Math.min(1,x/100)),ev:ev.length===count&&ev.every(Number.isFinite)?ev:null});
    }
    for(let i=0;i<1326;i++)if(weights[i]>0&&!hands.has(i))throw Error('Missing strategy for a weighted combo at '+name);
    nodes[name]={name,colors,weights,hands};
   }
   if(!Object.keys(nodes).length)throw Error('No nodes at '+boardText);
   return {configuration,boardText,board,nodes,flopPot:chips(r,'OriginalFlopPot'),flopStack:chips(r,'FlopEffectiveStack')};
  });
 }
 function actions(node){const n=node.name;
  if(n==='CB75+CB33')return ['Bet 75%','Bet 33%','Check'];
  if(/^CB\d+$/.test(n))return ['Bet '+n.slice(2)+'%','Check'];
  if(/^vs(?:CB|STAB)\d+$/.test(n)&&node.colors.length===4)return ['Larger raise','Smaller raise','Call','Fold'];
  if(n==='vsCheck'&&node.colors.length===4)return ['Larger stab (size unknown)','Bet 50%','Bet 33%','Check'];
  return node.colors.map((_,i)=>'Action '+(i+1));
 }
 function after(node,action){const w=new Float64Array(1326);for(const [id,h] of node.hands)w[id]=node.weights[id]*h.f[action];return w;}
 function lines(spot){
  const n=spot.nodes,out=[],srp=spot.configuration==='2Bet_BU_BB'||spot.configuration==='2Bet_UTG_BB',three=spot.configuration==='3Bet_SB_BU';
  if(!srp&&!three)return out;
  const positions=three?['SB','BTN']:['BB',spot.configuration==='2Bet_BU_BB'?'BTN':'UTG'];
  const first=srp?(n.CB75||n.CB33):n['CB75+CB33'];if(!first)return out;
  const add=(id,label,pct,oop,ip,note='')=>out.push({id,label,pct,positions,weights:[oop,ip],note});
  for(const size of [75,33]){
   const response=n['vsCB'+size],index=actions(first).indexOf('Bet '+size+'%');if(!response||index<0||actions(response)[2]!=='Call')continue;
   const bet=after(first,index),call=after(response,2);
   add('cb'+size,(srp?'BB checks → '+positions[1]: 'SB')+' bets '+size+'% → '+(srp?'BB':'BTN')+' calls',size,srp?call:bet,srp?bet:call,srp?'Assumes BB has a forced check; no BB lead/check node is exported.':'');
  }
  const check=after(first,actions(first).indexOf('Check'));
  if(srp){const response=n.vsCB75||n.vsCB33;if(response)add('xx','BB checks → '+positions[1]+' checks',0,response.weights,check,'Assumes BB has a forced check; uses BB’s range from the response node.');}
  else if(n.vsCheck&&actions(n.vsCheck)[3]==='Check'){
   add('xx','SB checks → BTN checks',0,check,after(n.vsCheck,3));
   for(const size of [50,33]){const response=n['vsSTAB'+size],index=actions(n.vsCheck).indexOf('Bet '+size+'%');if(!response||index<0||actions(response)[2]!=='Call')continue;
    const diff=response.weights.reduce((a,w,i)=>a+Math.abs(w-check[i]),0);
    add('stab'+size,'SB checks → BTN bets '+size+'% → SB calls',size,after(response,2),after(n.vsCheck,index),'Uses the exported, already check-filtered SB response range (no double filtering).'+(diff>1e-4?' Source check weights differ from the earlier check strategy by '+diff.toFixed(3)+' weighted combos; exported response weights retained.':''));
   }
  }
  return out;
 }
 function continuation(spot,line,turn,pot,stack,bet){
  if(!Number.isInteger(turn)||turn<0||turn>=52||spot.board.includes(turn))throw Error('Choose an unused turn card.');
  if(!Number.isSafeInteger(pot)||pot<1||!Number.isSafeInteger(stack)||stack<1)throw Error('Enter the original flop pot and effective stack in whole chips.');
  if(!Number.isSafeInteger(bet)||bet<0||(line.pct===0?bet!==0:bet===0))throw Error('Enter a valid whole-chip flop bet.');
  if(bet>=stack)throw Error('This line is all-in or exceeds the stack; no turn betting remains.');
  const board=[...spot.board,turn],weights=line.weights.map(w=>Float64Array.from(w,(v,i)=>legal(i,board)?v:0));
  if(weights.some(w=>!w.some(x=>x>0)))throw Error('No remaining range for one player on this turn.');
  // The source line identifies whether IP was the last flop aggressor.
  // A BB call versus BTN c-bet, or SB call versus BTN stab, permits a turn donk.
  const turnEntryMode=line.id.startsWith('stab')||(/^cb/.test(line.id)&&spot.configuration.startsWith('2Bet_'))
    ?'ip-aggressor':'normal';
  return {turnEntryMode,board,weights,pot:pot+2*bet,stack:stack-bet,source:{configuration:spot.configuration,flop:spot.boardText,line:line.label,turn:C.cardText(turn),flopPot:pot,flopStack:stack,flopBet:bet,positions:line.positions,note:line.note}};
 }
 // Reconstruct private realization weights along a solved public path. Never
 // use report.hands[][1] (posterior marginal including opponent blockers).
 function fromSolved(game,report,rootWeights,targetId,parents){
  const path=[];for(let id=targetId;id!==null;id=parents[id]?.[0]??null)path.push(id);path.reverse();
  const target=game.nodes[targetId];if(!target||target.terminal||target.chance||target.p!==0||target.toCall!==0)throw Error('Select the first decision of a new street.');
  const last=game.nodes[path[path.length-2]];if(!last?.chance)throw Error('Select a dealt turn or river card in the game tree.');
  if(!report||!report.iteration)throw Error('Solve this line first.');
  const w=rootWeights.map(x=>Float64Array.from(x));let board=game.board.slice();
  let lastFlopAggressor=null,lastTurnAggressor=null;
  for(let i=0;i<path.length-1;i++){
   const node=game.nodes[path[i]],child=path[i+1];
   if(node.chance){const o=node.runouts.find(x=>x.child===child);board.push(o.card??o.river);continue;}
   const k=node.actions.findIndex(a=>a.child===child),rec=report.nodes[node.id];if(k<0||!rec)throw Error('Missing strategy on selected path.');
   if(node.street==='flop'&&['bet','raise'].includes(node.actions[k].type))lastFlopAggressor=node.p;
   if(node.street==='turn'&&['bet','raise'].includes(node.actions[k].type))lastTurnAggressor=node.p;
   const f=new Map(rec.hands.map(h=>[h[0],h[3][k]]));w[node.p]=Float64Array.from(w[node.p],(v,id)=>v*(f.get(id)??0));
  }
  for(let p=0;p<2;p++)w[p]=Float64Array.from(w[p],(v,id)=>legal(id,board)?v:0);
  const stack=game.stack-target.c[0];if(stack<=0||target.c[0]!==target.c[1])throw Error('No new-street betting remains.');
  return {board,weights:w,pot:target.pot,stack,
    turnEntryMode:board.length===4&&lastFlopAggressor===1?'ip-aggressor':'normal',
    riverEntryMode:board.length===5&&lastTurnAggressor===1?'ip-aggressor':'normal',
    source:{line:target.history.join(' → '),note:'New solve from the selected solved line, with fixed incoming ranges.'}};
 }
 return {parse,actions,after,lines,continuation,fromSolved,names};
}
