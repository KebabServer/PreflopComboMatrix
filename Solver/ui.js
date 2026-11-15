/* RiverLab interface and local-file-compatible Blob Worker host. */
(function () {
'use strict';
const C=createSolverCore(), S=createStrategyView(C), $=id=>document.getElementById(id);
const checkpointCodec=createCheckpointFormat();
const R='AKQJT98765432', suitNames={s:'spades',h:'hearts',d:'diamonds',c:'clubs'};
// Action palette: passive actions remain green/blue; bet and raise sizes share a size bucket palette.
const colors={check:'#58bb6e',call:'#30935b',fold:'#3d79ae'};
const sizePalette={small:'#ea9a22',medium:'#d93a36',large:'#7d45c5',huge:'#4c5460'};
const newFilter=()=>({suits:[],both:false,handClass:null});
const view={filter:newFilter(),
 mode:'turn',board:['As','8h','3d','2c'].map(C.cardId),slot:0,
 weights:[new Float64Array(1326),new Float64Array(1326)],rangeP:0,rangeCat:'AKs',viewCat:'AKs',
 game:null,report:null,node:0,parents:[],worker:null,fallback:null,
 active:false,stopRequested:false,generation:0,limit:2000,origin:'',solverStatus:'ready',source:null,solveTargetPercent:null,
 fullReportReady:false,fullReportPromise:null,fullReportResolve:null,fullReportReject:null,detailPending:new Set(),fixedActionWarmup:null,fixedPrunePlanned:null,solveRun:null,solveLog:'',benchmark:null
};
function escapeHtml(x){return String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function cardHtml(id){const s=C.cardText(id),suit=s[1];return `<span class="mini-card s-${suit}" title="${s[0]} of ${suitNames[suit]}" aria-label="${s[0]} of ${suitNames[suit]}">${s[0]}</span>`;}
function fmt(v,dec=2){return v===null||v===undefined||!Number.isFinite(v)?'—':Number(v).toLocaleString('en-US',{maximumFractionDigits:dec,minimumFractionDigits:dec});}
function evText(v,dec=2){return v===null||v===undefined||!Number.isFinite(v)?'—':Math.abs(v)<1e-9?fmt(0,dec):(v>0?'+':'')+fmt(v,dec);}
function pct(v,dec=0){return v===null||v===undefined?'—':fmt(100*v,dec)+'%';}
// Human-readable, frozen completion log. All numbers come from the finished
// solver report and the settings snapshot captured at Solve click, never the
// editable controls after completion. Elapsed time for this session is kept
// distinct from checkpoint-carried cumulative solver time.
function solveCompletionText({kind,report,config:cfg,game,mode,run,targetPercent,origin,finishedMs}){
 const numeric=(v,d=2)=>Number.isFinite(v)?Number(v).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
 const integer=v=>Number.isFinite(v)?Number(v).toLocaleString('en-US'):'—';
 const duration=ms=>Number.isFinite(ms)?numeric(ms/1000,3)+' s':'—';
 const boolean=v=>v?'on':'off';
 const sizes=v=>Array.isArray(v)&&v.length?v.map(x=>numeric(x,0)+'%').join(', '):'none';
 const stamp=ms=>Number.isFinite(ms)?new Date(ms).toLocaleString():'—';
 const row=(label,value)=>label.padEnd(27)+' '+value;
 const result=[];
 const out=(label,value)=>result.push(row(label,value));
 const breakSection=label=>{result.push('');result.push('['+label+']');};
 const labels={converged:'TARGET TOLERANCE MET',limited:'ITERATION LIMIT REACHED',stopped:'STOPPED BY USER'};
 const algorithms={cfrplus:'CFR+',dcfr:'DCFR','dcfr-scheduled':'Scheduled DCFR','dcfr-scheduled-cubic':'Scheduled DCFR + Cubic','dcfr-cubic':'DCFR (cubic averaging)',
  'dcfr-adaptive':'Adaptive DCFR','dcfr-predictive':'Predictive DCFR',optimistic:'Optimistic CFR+',lcfr:'Linear CFR',
  'dcfr-2-0.5-2':'DCFR alpha=2 beta=0.5 gamma=2'};
 const first=run?.startedIteration??0;
 const now=finishedMs??Date.now();
 const wall=Math.max(0,now-(run?.startedMs??now));
 const worked=Math.max(0,report.iteration-first);
 const pot=Number(cfg.pot);
 const targetChips=Number.isFinite(targetPercent)?pot*targetPercent/100:null;
 const e=report.exploitability;
 result.push('TurnRiverLab | Completed solver run');
 result.push('================================');
 out('Status',labels[kind]||String(kind).toUpperCase());
 out('Started (local time)',stamp(run?.startedMs));
 out('Finished (local time)',stamp(now));
 out('Execution',origin==='worker'?'Web Worker':origin==='fallback'?'Main-thread fallback':'Browser solver');
 breakSection('Algorithm and runtime');
 out('Equilibrium',cfg.equilibrium==='qre'?'Entropy-regularized QRE':'Nash / GTO');
 out('Algorithm',cfg.equilibrium==='qre'?'QRE (entropy-regularized)':(algorithms[cfg.gtoAlgorithm]||cfg.gtoAlgorithm||'—'));
 if(cfg.gtoAlgorithm==='dcfr-scheduled-cubic'&&cfg.equilibrium==='gto')out('Hybrid tuning',
  'alpha start '+numeric(cfg.scheduledAlphaStart,2)+', gain '+numeric(cfg.scheduledAlphaGain,2)+
  ', ramp '+integer(cfg.scheduledRampLength)+', averaging t^'+numeric(cfg.scheduledAveragingPower,2));
 out('Adaptive convergence checks',boolean(cfg.useAdaptiveConvergence));
 if(cfg.equilibrium==='qre')out('QRE temperature',numeric(cfg.qreTemperaturePercent,3)+'% of pot');
 out('Iterations completed',integer(report.iteration)+' / '+integer(run?.limit));
 out('Iterations this run',integer(worked)+(first?' (resumed from '+integer(first)+')':''));
 out('Wall time this run',duration(wall));
 out('Throughput this run',wall>0?numeric(worked*1000/wall,2)+' iter/s':'—');
 out('Cumulative solver time',duration(report.elapsedMs)+(first?' (including checkpoint history)':''));
 out('Target exploitability',Number.isFinite(targetChips)?numeric(targetPercent,4)+'% of pot = '+numeric(targetChips,4)+' chips/player':'not set');
 out('Nash exploitability',numeric(e,4)+' chips/player'+(Number.isFinite(e)&&pot>0?' ('+numeric(e/pot*100,4)+'% of pot)':''));
 out('NashConv',numeric(report.nashConv,4)+' chips');
 if(cfg.equilibrium==='qre')out('Regularized QRE gap',numeric(report.qreResidual,4)+' chips/player');
 out('Tree PWL',Number.isFinite(report.tpwl)?numeric(100*report.tpwl,4)+'%':'—');
 out('OOP EV',numeric(report.value0,4)+' chips');
 out('Pot accounting error',numeric(report.zeroSumError,8)+' chips');
 out('Solver memory',Number.isFinite(report.memoryBytes)?numeric(report.memoryBytes/1048576,2)+' MiB':'—');
 breakSection('Game and betting tree');
 out('Starting street',mode.charAt(0).toUpperCase()+mode.slice(1));
 out('Board',cfg.board.map(id=>createSolverCoreCardText(id)).join(' '));
 out('Pot / effective stack',integer(cfg.pot)+' / '+integer(cfg.stack)+' chips');
 out('Tree nodes',integer(game?.nodes?.length));
 if(mode==='flop')out('Runouts',game?.sampledChance?'sampled (approximate full game), '+integer(cfg.flopTurnSamples)+' turns x '+integer(cfg.flopRiverSamples)+' rivers':'all legal turn and river cards');
 out('Maximum raises per street',integer(cfg.maxRaises));
 out('All-in actions',boolean(cfg.allIn));
 out('River OOP / IP bets',sizes(cfg.sizes0)+' / '+sizes(cfg.sizes1));
 if(mode==='turn'||mode==='flop')out('Turn OOP / IP bets',sizes(cfg.turnSizes0)+' / '+sizes(cfg.turnSizes1));
 if(mode==='flop')out('Flop OOP / IP bets',sizes(cfg.flopSizes0)+' / '+sizes(cfg.flopSizes1));
 out('OOP donk sizes',mode==='river'?sizes(cfg.riverDonkSizes0):mode==='turn'? 'turn '+sizes(cfg.turnDonkSizes0)+'; river '+sizes(cfg.riverDonkSizes0):'flop '+sizes(cfg.flopDonkSizes0)+'; turn '+sizes(cfg.turnDonkSizes0)+'; river '+sizes(cfg.riverDonkSizes0));
 out('River OOP / IP raises',sizes(cfg.raiseSizes0)+' / '+sizes(cfg.raiseSizes1));
 if(mode==='turn'||mode==='flop')out('Turn OOP / IP raises',sizes(cfg.turnRaiseSizes0)+' / '+sizes(cfg.turnRaiseSizes1));
 if(mode==='flop')out('Flop OOP / IP raises',sizes(cfg.flopRaiseSizes0)+' / '+sizes(cfg.flopRaiseSizes1));
 if(mode==='river')out('Prior turn context',cfg.riverEntryMode==='ip-aggressor'?'IP last aggressor':'normal / no IP last aggression');
 if(mode==='turn')out('Prior flop context',cfg.turnEntryMode==='ip-aggressor'?'IP last aggressor':'normal / no IP last aggression');
 if(mode==='flop')out('Preflop aggressor',cfg.flopEntryMode==='ip-aggressor'?'IP':'OOP / no IP aggression');
 breakSection('Solver optimizations');
 const orbit=game?.suitIsomorphism,privateHand=game?.riverPrivateSymmetry,pruning=report.actionPruning;
 out('Exact suit isomorphism',!cfg.useSuitIsomorphism?'off':orbit?.enabled?'active ('+orbit.street+', '+integer(orbit.representatives)+' / '+integer(orbit.runouts)+' representatives)':'requested, not eligible'+(orbit?.reason?' ('+orbit.reason+')':''));
 out('River private-hand symmetry',!cfg.useRiverHandSymmetry?'off':privateHand?.enabled?'active ('+(privateHand.representatives||[]).map(integer).join(' / ')+' rows OOP/IP)':'requested, not eligible'+(privateHand?.reason?' ('+privateHand.reason+')':''));
 out('Range-wide action culling',cfg.useActionFrequencyPruning?'on, '+numeric(cfg.actionPruneThresholdPercent,1)+'% threshold':'off');
 if(cfg.useActionFrequencyPruning){
  out('Culling warm-up',integer(cfg.actionPruneWarmupIterations)+' iterations ('+numeric(cfg.actionPruneWarmupPercent,0)+'% configured)');
  out('Full reevaluation', 'every '+integer(cfg.actionPruneRecheckIterations)+' iterations');
  out('Bet/raise sizes culled',integer(pruning?.prunedActions??0)+' (at completion)');
  result.push('  Note: this is approximate GTO; full-tree exploitability includes culled actions.');
 }
 out('Zero-reach optimization',boolean(cfg.useZeroReachPruning));
 out('Bounded negative-regret',boolean(cfg.useRegretPruning));
 out('Phase profiling',boolean(cfg.profileEnabled));
 if(report.performance){
  breakSection('Phase timing (profiled)');
  out('P0 / P1 traversal',duration(report.performance.traversal0Ms)+' / '+duration(report.performance.traversal1Ms));
  out('Policy updates',report.performance.fusedPolicy?'fused into traversal timings':duration((report.performance.policy0Ms||0)+(report.performance.policy1Ms||0)));
  out('Exact checks',duration(report.performance.checkMs));
  out('Convergence checks',integer(report.performance.checks));
 }
 if(kind==='stopped')result.push('', 'This was an interim strategy; the solve was stopped manually.');
 else if(kind==='limited')result.push('', 'Iteration limit reached; convergence is not guaranteed.');
 return result.join('\n');
}
// Card-ID-to-text wrapper keeps log generation independent of current UI state.
function createSolverCoreCardText(id){return C.cardText(id);}
function showSolveCompletion(kind,report){
 const run=view.solveRun;if(!report||!run||!view.activeConfig)return;
 const text=solveCompletionText({kind,report,config:view.activeConfig,game:view.game,
  mode:view.mode,run,targetPercent:view.solveTargetPercent,origin:view.origin,finishedMs:Date.now()});
 view.solveLog=text;
 $('solve-console-output').textContent=text;
 $('solve-console').hidden=false;
 $('solve-console').open=true;
 $('solve-console-copy').disabled=false;
 if(typeof console!=='undefined'&&typeof console.info==='function')console.info(text);
}
function clearSolveCompletion(){
 view.solveRun=null;view.solveLog='';
 $('solve-console').hidden=true;$('solve-console').open=false;
 $('solve-console-output').textContent='';$('solve-console-copy').disabled=true;
}

// Browser-driven, strictly sequential benchmark. Every run starts with new
// numerical state and an immutable snapshot of the same game and ranges.
// The last run matches the user's selected algorithm, so the final strategy
// displayed in the existing tree remains consistent with the visible controls.
function benchmarkCandidates(){
 const gto=Array.from($('gto-algorithm').options).map(o=>({id:o.value,label:o.textContent.trim(),equilibrium:'gto'}));
 const runs=[...gto,{id:'qre',label:'QRE (entropy-regularized)',equilibrium:'qre'}];
 const current=$('solver-method').value==='qre'?'qre':$('gto-algorithm').value;
 const last=runs.findIndex(r=>r.id===current);
 if(last>=0)runs.push(runs.splice(last,1)[0]);
 return runs;
}
function benchmarkSettingsLock(locked){
 const b=view.benchmark;if(!b)return;
 if(locked){
  b.locked=Array.from(document.querySelectorAll('#configuration input, #configuration select, #configuration button, #ranges input, #ranges select, #ranges button, #solve-view input, #solve-view select, #reset, #solve, #save-local, #save-checkpoint, #export'));
  b.locked=b.locked.map(el=>[el,el.disabled]);
  for(const [el] of b.locked)el.disabled=true;
  $('benchmark-all').disabled=true;$('stop').textContent='Cancel benchmark';
 }else{
  for(const [el,wasDisabled] of b.locked||[])el.disabled=wasDisabled;
  b.locked=null;$('benchmark-all').disabled=false;$('stop').textContent='Stop';
  $('solve').disabled=!!view.active;
  $('stop').disabled=!view.active;
  $('save-local').disabled=!view.report;
  $('export').disabled=!view.report;
  $('save-checkpoint').disabled=!(view.report||view.active);
 }
}
function clearBenchmark(){
 if(view.benchmark?.running)return;
 view.benchmark=null;
 $('benchmark-console').hidden=true;$('benchmark-console').open=false;
 $('benchmark-rows').replaceChildren();$('benchmark-output').textContent='';
 $('benchmark-copy').disabled=true;$('benchmark-csv').disabled=true;
 $('benchmark-all').disabled=false;
}
function benchmarkText(b){
 const rows=['TurnRiverLab | Sequential algorithm benchmark','=========================================',
  'Board: '+b.baseConfig.board.map(C.cardText).join(' ')+' | Street: '+b.mode,
  'Game: pot '+b.baseConfig.pot+', stack '+b.baseConfig.stack+' | Identical ranges and bet sizing for all runs',
  'Limit: '+b.iterations+' iterations per algorithm | Nash exploitability target: '+b.targetPercent+'% pot',
  'Run order: '+b.queue.map(q=>q.label).join(' > '),
  'Optimization settings: culling '+(b.baseConfig.useActionFrequencyPruning?'on':'off')+', isomorphism '+(b.baseConfig.useSuitIsomorphism?'on':'off')+', river-hand symmetry '+(b.baseConfig.useRiverHandSymmetry?'on':'off'),
  'Wall time includes Worker startup and convergence checks. Run sequentially on the same device.',
  'QRE uses an entropy-regularized objective and must not be ranked as an equivalent GTO algorithm.',
  '',
  ['Algorithm'.padEnd(30),'Result'.padEnd(13),'Iter'.padStart(9),'Seconds'.padStart(11),'Iter/s'.padStart(11),'Exploit %'.padStart(12),'QRE gap'.padStart(12)].join('  ')];
 for(const x of b.results)rows.push([
  x.label.slice(0,30).padEnd(30),x.kind.padEnd(13),String(x.iterations).padStart(9),
  (Number.isFinite(x.wallMs)?(x.wallMs/1000).toFixed(3):'—').padStart(11),
  (Number.isFinite(x.throughput)?x.throughput.toFixed(2):'—').padStart(11),
  (Number.isFinite(x.exploitPercent)?x.exploitPercent.toFixed(4):'—').padStart(12),
  (Number.isFinite(x.qreGap)?x.qreGap.toFixed(4):'—').padStart(12)].join('  '));
 rows.push('', 'Benchmark: '+(b.running?'in progress':b.cancelled?'cancelled':'complete')+' ('+b.results.length+'/'+b.queue.length+' runs)');
 for(const x of b.results){
  rows.push('','================================================================',x.label+' | '+x.kind.toUpperCase(), '================================================================');
  rows.push(x.log||x.error||'(No solver report available.)');
 }
 return rows.join('\n');
}
function renderBenchmark(){
 const b=view.benchmark;if(!b)return;
 $('benchmark-console').hidden=false;$('benchmark-console').open=true;
 $('benchmark-status').textContent=(b.running?'RUNNING ':b.cancelled?'CANCELLED ':'COMPLETE ')+b.results.length+' / '+b.queue.length;
 $('benchmark-context').textContent='Same '+b.mode+' board, ranges, betting tree and '+b.iterations+' iteration cap, with a '+b.targetPercent+'% pot Nash exploitability target. Runs are sequential and start from zero. QRE optimizes a different objective; compare its timing separately. Wall time includes Worker startup, checks, and reporting.';
 $('benchmark-progress').textContent=b.running?
  (b.index<b.queue.length?'Running '+(b.index+1)+'/'+b.queue.length+': '+b.queue[b.index].label+' · press Cancel benchmark to stop':'Finalizing all '+b.queue.length+' results…'):
  (b.cancelled?'Cancelled':'Finished')+' · '+b.results.length+' of '+b.queue.length+' runs · '+fmt((b.finishedMs-b.startedMs)/1000,2)+' s total elapsed';
 const body=$('benchmark-rows');body.replaceChildren();
 for(const r of b.results){
  const tr=document.createElement('tr');tr.dataset.kind=r.kind;tr.dataset.qre=String(r.equilibrium==='qre');
  const cells=[r.label,r.kind==='converged'?'Target met':r.kind==='limited'?'Iteration cap':r.kind==='stopped'?'Stopped':'Error',
   fmt(r.iterations,0),Number.isFinite(r.wallMs)?fmt(r.wallMs/1000,3)+' s':'—',
   Number.isFinite(r.throughput)?fmt(r.throughput,2):'—',Number.isFinite(r.exploitPercent)?fmt(r.exploitPercent,4)+'%':'—',
   Number.isFinite(r.qreGap)?fmt(r.qreGap,4):'—'];
  for(const value of cells){const cell=document.createElement('td');cell.textContent=value;tr.appendChild(cell);}
  body.appendChild(tr);
 }
 $('benchmark-output').textContent=benchmarkText(b);
 $('benchmark-copy').disabled=!b.results.length;
 $('benchmark-csv').disabled=!b.results.length;
}
function benchmarkRecord(kind,report,error=''){
 const b=view.benchmark;if(!b?.running)return;
 const task=b.queue[b.index],run=view.solveRun,now=Date.now();
 const wallMs=run?Math.max(0,now-run.startedMs):NaN;
 const iterations=report?.iteration??0,work=Math.max(0,iterations-(run?.startedIteration||0));
 b.results.push({id:task.id,label:task.label,equilibrium:task.equilibrium,kind,iterations,
  wallMs,throughput:wallMs>0?1000*work/wallMs:NaN,
  exploitPercent:Number.isFinite(report?.exploitability)?report.exploitability*100/b.baseConfig.pot:NaN,
  qreGap:task.equilibrium==='qre'?report?.qreResidual:NaN,
  log:kind==='error'?'':view.solveLog,error});
 b.index++;
 $('solve').disabled=true;$('stop').disabled=false;
 $('save-local').disabled=true;$('save-checkpoint').disabled=true;$('export').disabled=true;
 renderBenchmark();
 if(b.cancelled||b.index>=b.queue.length){completeBenchmark();return;}
 setTimeout(benchmarkNext,0); // yield to the UI between algorithms
}
function benchmarkRunComplete(kind,report){benchmarkRecord(kind,report);}
function benchmarkRunFailed(message){
 if(!view.benchmark?.running)return;
 benchmarkRecord('error',null,message);
}
function solverFailed(message){
 cancel();
 if(view.worker){view.worker.terminate();view.worker=null;}
 setStatus('ERROR','error');notify(message,'error');
 benchmarkRunFailed(message);
}
function completeBenchmark(){
 const b=view.benchmark;if(!b?.running)return;
 b.running=false;b.finishedMs=Date.now();
 benchmarkSettingsLock(false);
 renderBenchmark();
 if(b.cancelled)notify('Algorithm benchmark cancelled; completed rows and logs were preserved.','warn');
 else notify('Algorithm benchmark finished: '+b.results.length+' sequential runs. Compare wall time, iterations, and exploitability above.');
 if(typeof console!=='undefined'&&typeof console.info==='function')console.info(benchmarkText(b));
}
function benchmarkNext(){
 const b=view.benchmark;
 if(!b?.running||b.cancelled||view.active)return;
 if(b.index>=b.queue.length){completeBenchmark();return;}
 const task=b.queue[b.index];
 // QRE never uses the optional GTO-only action culling optimization.
 const cfg={...b.baseConfig,equilibrium:task.equilibrium,gtoAlgorithm:task.equilibrium==='qre'?'cfrplus':task.id,
  useActionFrequencyPruning:task.equilibrium==='gto'&&b.baseConfig.useActionFrequencyPruning,
  weights0:Float64Array.from(b.baseConfig.weights0),weights1:Float64Array.from(b.baseConfig.weights1)};
 renderBenchmark();
 const attempted=b.index;
 if(!startSolver(null,cfg,{iterations:b.iterations,targetPercent:b.targetPercent})&&b.running&&b.index===attempted)
  benchmarkRunFailed('Could not start this algorithm with the configured game.');
}
function startBenchmark(){
 if(view.active||view.benchmark?.running){notify('Finish or stop the current solver run before benchmarking.','warn');return;}
 let cfg;try{cfg=config();}catch(e){notify(e.message,'error');return;}
 const iterations=Number($('iterations').value),targetPercent=$('tolerance').value.trim()===''?NaN:Number($('tolerance').value);
 try{exploitabilityTargetChips(cfg.pot,targetPercent);}catch(e){notify(e.message,'error');return;}
 if(!Number.isSafeInteger(iterations)||iterations<1||iterations>10000000){notify('Enter a valid iteration cap before benchmarking.','error');return;}
 if(cfg.memoryLimitBytes<2*1048576||cfg.memoryLimitBytes>4096*1048576){notify('Enter a memory budget between 2 and 4,096 MiB.','error');return;}
 // The checkbox can be disabled while QRE is selected; preserve the intended GTO setting.
 cfg.useActionFrequencyPruning=$('action-frequency-pruning').checked;
 const runs=benchmarkCandidates();
 view.benchmark={running:true,cancelled:false,startedMs:Date.now(),finishedMs:0,
  baseConfig:{...cfg,weights0:Float64Array.from(cfg.weights0),weights1:Float64Array.from(cfg.weights1)},
  mode:view.mode,iterations,targetPercent,queue:runs,index:0,results:[],locked:null};
 benchmarkSettingsLock(true);
 renderBenchmark();
 setSolverTab('solve');
 setTimeout(benchmarkNext,0);
}
async function copyBenchmark(){
 const b=view.benchmark;if(!b?.results.length)return;
 const content=benchmarkText(b);
 try{
  if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(content);
  else{const area=document.createElement('textarea');area.value=content;area.style.position='fixed';area.style.opacity='0';document.body.appendChild(area);area.select();const done=document.execCommand('copy');area.remove();if(!done)throw Error('Clipboard unavailable');}
  notify('Algorithm benchmark comparison and logs copied.');
 }catch(e){notify('Clipboard unavailable. Select the benchmark text and copy it manually.','warn');}
}
function exportBenchmarkCSV(){
 const b=view.benchmark;if(!b?.results.length)return;
 const quote=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
 const lines=[['Algorithm','Equilibrium','Status','Iterations','Wall seconds','Iterations per second','Nash exploitability % pot','QRE gap (chips/player)'].map(quote).join(',')];
 for(const x of b.results)lines.push([x.label,x.equilibrium,x.kind,x.iterations,
  Number.isFinite(x.wallMs)?(x.wallMs/1000).toFixed(3):'',Number.isFinite(x.throughput)?x.throughput.toFixed(2):'',
  Number.isFinite(x.exploitPercent)?x.exploitPercent.toFixed(6):'',Number.isFinite(x.qreGap)?x.qreGap.toFixed(6):''].map(quote).join(','));
 const url=URL.createObjectURL(new Blob([lines.join('\r\n')+'\r\n'],{type:'text/csv;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download='TurnRiverLab-algorithm-benchmark.csv';document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),30000);
}

function categoryAt(i,j){return i===j?R[i]+R[j]:i<j?R[i]+R[j]+'s':R[j]+R[i]+'o';}
function idsForCat(cat){return C.CATEGORY_IDS[cat]||[];}
function boardSet(node=null){const s=new Set(view.board);if(node){if(node.turn!==null&&node.turn!==undefined)s.add(node.turn);if(node.river!==null&&node.river!==undefined)s.add(node.river);}return s;}
function isBlocked(id,set){const [a,b]=C.ALL_COMBOS[id];return set.has(a)||set.has(b);}
function notify(text,type='ok'){$('notice').hidden=false;$('notice-text').textContent=text;$('notice').className='notice'+(type==='ok'?'':' '+type);}
function profile(name,p){
 const value=new Float64Array(1326),fallbackMap={};
 const oop={AA:1,KK:1,QQ:1,JJ:1,TT:1,99:1,88:.9,77:.8,66:.6,55:.45,44:.45,33:.9,22:.8,
  AKs:1,AQs:1,AJs:1,ATs:1,A9s:1,A8s:1,A7s:.55,A6s:.45,A5s:.65,A4s:.4,KQs:1,KJs:.9,KTs:.7,
  QJs:.85,QTs:.65,JTs:.8,T9s:.75,'98s':.85,'87s':.45,'76s':.4,'65s':.25,
  AKo:1,AQo:.85,AJo:.7,ATo:.45,KQo:.8,KJo:.4,QJo:.25};
 const ip={AA:1,KK:1,QQ:1,JJ:1,TT:1,99:1,88:1,77:1,66:.9,55:.85,44:.8,33:1,22:1,
  AKs:1,AQs:1,AJs:1,ATs:1,A9s:1,A8s:1,A7s:1,A6s:.9,A5s:1,A4s:.85,A3s:.9,A2s:.8,
  KQs:1,KJs:1,KTs:1,K9s:.8,QJs:1,QTs:1,Q9s:.65,JTs:1,J9s:.65,T9s:1,T8s:.65,
  '98s':1,'97s':.6,'87s':1,'86s':.45,'76s':.85,'65s':.65,'54s':.5,
  AKo:1,AQo:1,AJo:.95,ATo:.85,A9o:.65,A8o:.5,KQo:1,KJo:.8,KTo:.6,QJo:.65,QTo:.4,JTo:.55};
 const tight={AA:1,KK:1,QQ:1,JJ:1,TT:1,99:1,88:.7,AKs:1,AQs:1,AJs:1,KQs:1,AKo:1,AQo:.65};
 const src=name==='tight'?tight:name==='example'?(p?ip:oop):fallbackMap;
 for(let id=0;id<1326;id++) {
  const [a,b]=C.ALL_COMBOS[id];
  value[id]=name==='wide'?1:name==='clear'?0:(src[C.comboCategory(a,b)]||0);
 }
 return value;
}
function renderBoard(){
 $('street-chip').textContent=view.mode==='flop'?'FLOP + TURN + RIVER':view.mode==='turn'?'TURN + RIVER':'RIVER';
 $('board-label').textContent=view.mode==='turn'?'Board · select a slot, then a card':'Board · select a slot, then a card';
 $('turn-size-row').hidden=view.mode==='river';
 $('turn-entry-row').hidden=view.mode!=='turn';
 $('flop-entry-row').hidden=view.mode!=='flop';
 $('river-entry-row').hidden=view.mode!=='river';
 $('flop-size-row').hidden=view.mode!=='flop';
 $('flop-runout-row').hidden=view.mode!=='flop';
 $('flop-runout-note').hidden=view.mode!=='flop';
 $('flop-mode-note').hidden=view.mode!=='flop';
 if(view.mode==='flop')$('flop-mode-note').textContent=(Number($('flop-turn-samples').value)===49&&Number($('flop-river-samples').value)===48)?'All future cards are enumerated. Full-game flop solving can use substantial memory and time.':'Future cards are sampled by default: flop results are approximate. Set 49 turn cards and 48 river cards in Betting settings for full enumeration.';
 $('board-cards').innerHTML=view.board.map((id,i)=>{const s=C.cardText(id);return `<button class="board-slot s-${s[1]} ${i===view.slot?'active':''}" data-slot="${i}" aria-label="Board card ${i+1}: ${s[0]} of ${suitNames[s[1]]}" title="${s[0]} of ${suitNames[s[1]]} · select slot ${i+1}">${s[0]}</button>`;}).join('')+(view.mode==='river'?'':Array.from({length:5-view.board.length},(_,i)=>'<span class="board-slot future-card" title="Unknown '+(view.mode==='flop'&&i===0?'turn':'river')+' card">?</span>').join(''));
 const chosen=boardSet();let html='';
 for(const s of 'shdc')for(const r of 'AKQJT98765432'){
  const id=C.cardId(r+s),used=chosen.has(id);
  html+=`<button class="deck-card ${used?'used':''} s-${s}" data-card="${id}" aria-label="${r} of ${suitNames[s]}" title="${r} of ${suitNames[s]}${used?' · on board':''}">${r}</button>`;
 }
 $('deck').innerHTML=html;
}
function rangeSummary(){
 const set=boardSet();let count=0,effective=0;
 for(let id=0;id<1326;id++)if(!isBlocked(id,set)&&view.weights[view.rangeP][id]>0){count++;effective+=view.weights[view.rangeP][id];}
 $('range-count').textContent=count+' COMBOS';
 $('range-count').title=fmt(effective,1)+' weighted combinations';
}
function renderRangeMatrix(){
 const set=boardSet(),weights=view.weights[view.rangeP];let html='';
 for(let i=0;i<13;i++)for(let j=0;j<13;j++){
  const cat=categoryAt(i,j),ids=idsForCat(cat),valid=ids.filter(id=>!isBlocked(id,set));
  const mean=valid.length?valid.reduce((s,id)=>s+weights[id],0)/valid.length:0;
  const kind=i===j?'pair':i<j?'suited':'off';
  const strength=Math.max(0,Math.min(100,mean*100));
  html+=`<button class="range-cell ${kind} ${strength<0.001?'empty':strength>99.999?'full':''} ${valid.length===0?'blocked':''} ${cat===view.rangeCat?'selected':''}" data-cat="${cat}" style="--fill-start:${Math.max(0,strength-4).toFixed(2)}%;--fill-end:${Math.min(100,strength+4).toFixed(2)}%" title="${cat}: ${fmt(mean*100,0)}%; ${valid.length}/${ids.length} unblocked" aria-label="${cat}, ${fmt(mean*100,0)}%">`+
   `<span>${cat}</span></button>`;
 }
 $('range-matrix').innerHTML=html;rangeSummary();
}
function renderRangeDetails(){
 const cat=view.rangeCat,ids=idsForCat(cat),set=boardSet(),valid=ids.filter(id=>!isBlocked(id,set)),w=view.weights[view.rangeP];
 const mean=valid.length?valid.reduce((s,id)=>s+w[id],0)/valid.length:0;
 $('range-cat').textContent=cat;$('range-cat-count').textContent=`${valid.length} / ${ids.length} combos`;
 $('range-freq').value=Math.round(mean*100);$('range-freq').disabled=valid.length===0;
 $('range-freq-label').textContent=fmt(mean*100,0)+'%';
 $('range-combos').innerHTML=ids.map(id=>{
  const blocked=isBlocked(id,set),[a,b]=C.ALL_COMBOS[id],weight=w[id];
  return `<div class="combo-edit ${blocked?'blocked':''}"><label>${cardHtml(a)}${cardHtml(b)}</label><input type="range" min="0" max="100" step="1" data-combo="${id}" value="${Math.round(weight*100)}" ${blocked?'disabled':''} aria-label="Frequency for ${C.cardText(a)}${C.cardText(b)}"><span>${blocked?'X':Math.round(weight*100)+'%'}</span></div>`;
 }).join('');
}
function renderRangeTab(){for(const b of $('range-tabs').querySelectorAll('button'))b.classList.toggle('active',Number(b.dataset.player)===view.rangeP);renderRangeMatrix();renderRangeDetails();}
function config(){
 const parse=(v)=>{const pieces=v.split(/[;,\s]+/).map(x=>x.trim()).filter(Boolean).map(Number);if(pieces.some(x=>!Number.isFinite(x)||x<=0||x>1000))throw Error('Bet/raise percentages must be positive numbers up to 1,000%.');return pieces;};
 function positive(id,min=1){const x=Number($(id).value);if(!Number.isInteger(x)||x<min)throw Error(id+' must be a whole number ≥ '+min+'.');return x;}
 return {board:view.board.slice(),pot:positive('pot'),stack:positive('stack'),sizes0:parse($('sizes0').value),sizes1:parse($('sizes1').value),
  turnSizes0:parse($('turn-sizes0').value),turnSizes1:parse($('turn-sizes1').value),
  turnDonkSizes0:parse($('turn-donk-sizes0').value),turnEntryMode:$('turn-entry-mode').value,
  flopDonkSizes0:parse($('flop-donk-sizes0').value),flopEntryMode:$('flop-entry-mode').value,
  riverDonkSizes0:parse($('river-donk-sizes0').value),riverEntryMode:$('river-entry-mode').value,
  flopSizes0:parse($('flop-sizes0').value),flopSizes1:parse($('flop-sizes1').value),
  raiseSizes0:parse($('raise-sizes0').value),raiseSizes1:parse($('raise-sizes1').value),
  turnRaiseSizes0:parse($('turn-raise-sizes0').value),turnRaiseSizes1:parse($('turn-raise-sizes1').value),
  flopRaiseSizes0:parse($('flop-raise-sizes0').value),flopRaiseSizes1:parse($('flop-raise-sizes1').value),
  flopTurnSamples:positive('flop-turn-samples'),flopRiverSamples:positive('flop-river-samples'),
  maxRaises:parseInt($('raises').value,10),allIn:$('allin').checked,maxNodes:positive('max-nodes',20),
  equilibrium:$('solver-method').value,gtoAlgorithm:$('gto-algorithm').value,qreTemperaturePercent:Number($('qre-temperature').value),
  scheduledAlphaStart:Number($('scheduled-alpha-start').value),scheduledAlphaGain:Number($('scheduled-alpha-gain').value),
  scheduledRampLength:Number($('scheduled-ramp-length').value),scheduledAveragingPower:Number($('scheduled-averaging-power').value),
  useAdaptiveConvergence:$('adaptive-convergence').checked,
  memoryLimitBytes:Number($('memory-limit').value)*1048576,
  useSuitIsomorphism:$('suit-isomorphism').checked,useRiverHandSymmetry:$('river-hand-symmetry').checked,
  useActionFrequencyPruning:$('action-frequency-pruning').checked&&$('solver-method').value==='gto',
  actionPruneThresholdPercent:Number($('action-prune-threshold').value),
  actionPruneWarmupPercent:Number($('action-prune-warmup').value),
  actionPruneWarmupIterations:view.fixedActionWarmup??Math.max(1,Math.ceil(Number($('iterations').value)*Number($('action-prune-warmup').value)/100)),
  actionPruneRecheckIterations:Number($('action-prune-recheck').value),
  actionPrunePlannedIterations:view.fixedPrunePlanned??Math.max(1,Number($('iterations').value)),
  useZeroReachPruning:$('zero-reach-pruning').checked,useRegretPruning:$('regret-pruning').checked,profileEnabled:$('enable-profile').checked,
  weights0:view.weights[0],weights1:view.weights[1]};
}
function setExperimentalAlgorithmVisibility(show){
 $('show-experimental-algorithms').checked=!!show;
 const group=$('gto-experimental-options');
 group.hidden=!show;
 group.style.display=show?'':'none';
}
function ensureAlgorithmVisible(algorithm){
 if(Array.from($('gto-experimental-options').querySelectorAll('option')).some(option=>option.value===algorithm))
  setExperimentalAlgorithmVisibility(true);
}
function updateSolverMethod(){
 const isQre=$('solver-method').value==='qre';
 $('gto-experiment-controls').hidden=isQre;
 $('action-frequency-pruning').disabled=isQre;
 $('frequency-prune-controls').title=isQre?'Frequency pruning is only available for GTO; disabled for QRE.':'';
 $('qre-temp-field').hidden=!isQre;
 $('qre-mode-note').hidden=!isQre;
 $('gto-algorithm-field').hidden=isQre;
 $('gto-algorithm-note').hidden=isQre;
 $('hybrid-parameters').hidden=isQre||$('gto-algorithm').value!=='dcfr-scheduled-cubic';
 $('tolerance-title').textContent='Target exploitability';
 $('tolerance-unit').textContent='% of pot';
 $('stat-qre-gap').hidden=!isQre;
 $('stat-main-label').textContent='Nash exploitability (chips/player)';
 $('chart').setAttribute('aria-label','Exploitability versus iterations');
}
function makeLocalGame(solveConfig=null){
 try{
  view.game=C.makeGame(solveConfig||config(),{preview:true});view.parents=new Array(view.game.nodes.length).fill(null);
  for(const node of view.game.nodes)if(!node.terminal){
   if(node.chance){for(const outcome of node.runouts)view.parents[outcome.child]=[node.id,outcome.label];}
   else for(const a of node.actions)view.parents[a.child]=[node.id,a.label];
  }
  $('tree-node-count').textContent=view.game.nodes.length+' NODES';
  const orbit=view.game.suitIsomorphism;
  const hand=view.game.riverPrivateSymmetry;
  $('tree-node-count').title=orbit?.enabled?
   `Exact ${orbit.street} suit symmetry: ${orbit.representatives}/${orbit.runouts} opening chance representatives; ${orbit.aliasedDecisions} aliased decisions; complete original tree retained.`:
   hand?.enabled?`Exact river private-hand symmetry: ${hand.representatives.join(' / ')} strategy rows retained per player (${hand.savedRows} rows saved per decision pair).`:
   `No exact symmetry enabled for this game (${orbit?.reason||'not applicable'}${hand?.reason?', '+hand.reason:''}).`;
  if(view.mode==='flop')$('street-chip').textContent=view.game.sampledChance?'FLOP · SAMPLED':'FLOP · FULL';
  if(view.mode==='flop')$('stat-exploit').title=view.game.sampledChance?'Exploitability is calculated for the sampled chance tree, not the complete flop game.':'';
  $('stat-memory').textContent='≈'+fmt(view.game.memory/1048576,2)+' MiB (estimated)';
  return true;
 }catch(e){view.game=null;view.parents=[];$('tree-node-count').textContent='INVALID GAME';notify(e.message,'warn');return false;}
}
function cancel(){
 if($('save-checkpoint'))$('save-checkpoint').disabled=true;
 if(view.fullReportReject)view.fullReportReject(Error('Solve was replaced.'));
 view.fullReportPromise=null;view.fullReportResolve=null;view.fullReportReject=null;view.detailPending.clear();
 view.generation++;
 if(view.worker){
  try{view.worker.postMessage({type:'reset'});}catch(_){view.worker.terminate();view.worker=null;}
 }
 if(view.fallback){clearTimeout(view.fallback.timer);view.fallback=null;}
 view.active=false;view.stopRequested=false;
 $('solve').disabled=false;$('stop').disabled=true;
}
function setStatus(text,kind='ready'){
 view.solverStatus=kind;
 $('solver-status').textContent=text;
 $('solver-status').className='status-tag '+(kind==='running'?'running':kind==='complete'?'complete':'');
}
function clearOutput(){
 clearSolveCompletion();view.activeConfig=null;
 view.report=null;view.node=0;view.filter=newFilter();view.solveTargetPercent=null;view.fullReportReady=false;view.detailPending.clear();
 $('stat-iterations').textContent='0';$('stat-speed').textContent='—';$('stat-time').textContent='—';
 $('stat-exploit').textContent='—';$('stat-exploit').title=view.game?.sampledChance?'Exploitability is computed for the sampled chance tree, not the complete flop game.':'';$('stat-qre-gap').textContent='Regularized QRE gap: —';$('stat-tpwl').textContent='Tree PWL: —';$('stat-nash').textContent='NashConv: —';$('stat-ev').textContent='OOP EV: —';$('stat-zero').textContent='Pot accounting error: —';
 $('progress-bar').style.width='0%';$('progress-percent').textContent='0%';$('progress-text').textContent='Waiting for solver';
 $('export').disabled=true;$('save-local').disabled=true;
 drawChart([]);
}
function invalidate(reason='Configuration edited. Solve to recalculate strategies.'){
 if(view.benchmark?.running){view.benchmark.cancelled=true;completeBenchmark();}
 clearBenchmark();cancel();clearOutput();const valid=makeLocalGame();renderExplorer();renderTree();setStatus(valid?'READY':'INVALID',valid?'ready':'error');if(valid)notify(reason,'ok');
}
function actionSizePercent(action){
 if(!action||!(action.type==='bet'||action.type==='raise'))return null;
 const m=String(action.label||'').match(/(\d+(?:\.\d+)?)%/);
 return m?Number(m[1]):(action.label||'').startsWith('All-in')?999:null;
}
function actionColor(action,index,actions){
 if(action.type==='fold'||action.type==='check'||action.type==='call')return colors[action.type];
 const pct=actionSizePercent(action);
 if(pct!==null){
  if(pct>300)return sizePalette.huge;
  const buckets=[33,75,150,300], shades=[sizePalette.small,sizePalette.medium,sizePalette.large,sizePalette.huge];
  let best=0, bestDiff=Infinity;
  for(let i=0;i<buckets.length;i++){
   const diff=Math.abs(pct-buckets[i]);
   if(diff<bestDiff){bestDiff=diff;best=i;}
  }
  return shades[best];
 }
 const matching=actions?actions.filter(a=>a.type===action.type):[action];
 const rank=actions?matching.findIndex(a=>a===action):index;
 return [sizePalette.small,sizePalette.medium,sizePalette.large,sizePalette.huge][Math.min(Math.max(rank,0),3)];
}
// Always draw the largest bet/raise on the left, then smaller bets, then
// passive actions and folds. Keep solver array indices untouched.
function actionOrder(actions){
 const priority=a=>(a.type==='bet'||a.type==='raise')?0:(a.type==='check'||a.type==='call')?1:2;
 return actions.map((_,i)=>i).sort((i,j)=>{
  const a=actions[i],b=actions[j],difference=priority(a)-priority(b);
  return difference || (priority(a)===0 ? b.total-a.total : i-j);
 });
}
function actionGradient(values,order,palette){let current=0,stops=[];
 for(const i of order){const next=Math.min(100,current+Math.max(0,values[i]||0)*100);if(next>current)stops.push(`${palette[i]} ${current.toFixed(4)}% ${next.toFixed(4)}%`);current=next;}
 if(current<100||!stops.length)stops.push(`#26364a ${current.toFixed(4)}% 100%`);
 return `linear-gradient(90deg,${stops.join(',')})`;
}
function gradient(values,actions){return actionGradient(values,actionOrder(actions),actions.map((a,i)=>actionColor(a,i,actions)));}
function filtersActive(f){return !!(f.handClass||f.suits.length);}
function renderFilters(prefix,f){const el=$(prefix+'strategy-filters');
 for(const b of el.querySelectorAll('[data-suit]')){const on=b.dataset.suit==='all'?!f.suits.length:f.suits.includes(b.dataset.suit);b.setAttribute('aria-pressed',String(on));}
 $(prefix+'suit-both').checked=f.both;$(prefix+'suit-both').disabled=!f.suits.length;
 $(prefix+'clear-filters').hidden=!filtersActive(f);
}
function wireFilters(prefix,state,render){const el=$(prefix+'strategy-filters'),sidebar=$(prefix+'hand-classes');
 el.addEventListener('click',e=>{const b=e.target.closest('[data-suit]');if(!b)return;const suit=b.dataset.suit,f=state.filter;
  if(suit==='all')f.suits=[];else f.suits=f.suits.includes(suit)?f.suits.filter(x=>x!==suit):[...f.suits,suit];if(!f.suits.length)f.both=false;render();});
 $(prefix+'suit-both').onchange=e=>{state.filter.both=e.target.checked;render();};
 $(prefix+'clear-filters').onclick=()=>{state.filter=newFilter();render();};
 sidebar.addEventListener('click',e=>{const b=e.target.closest('[data-hand-class]');if(!b)return;const f=state.filter,label=b.dataset.handClass;f.handClass=f.handClass===label?null:label;render();});
}
function renderHandClasses(el,board,weights,probabilities,labels,palette,order,selected,culled=null){
 const summary=S.classes(board,weights,probabilities,labels.length),scroll=el.scrollTop,focused=el.contains(document.activeElement)?document.activeElement.dataset.handClass:null;
 let html=`<h3 class="hand-class-heading">Hand classes</h3><p class="hand-class-subtitle">${fmt(summary.total,2)} weighted combos · click a class to highlight</p>`;
 if(!summary.total)html+='<p class="muted">No remaining combos.</p>';
 else{const group=(name,rows)=>`<div class="hand-class-section">${name}</div>`+rows.map(row=>{
  const available=order.filter(k=>!culled?.[k]);
  const detail=available.map(k=>`${escapeHtml(labels[k])} ${pct(row.frequencies[k],1)}`).join(' · '),on=selected===row.label;
  return `<button type="button" class="hand-class-row" data-hand-class="${escapeHtml(row.label)}" aria-pressed="${on}"><span class="hand-class-label"><strong>${escapeHtml(row.label)}</strong><span>${fmt(row.mass,2)}c · ${pct(row.mass/summary.total,1)}</span></span><span class="hand-class-bar" style="background:${actionGradient(row.frequencies,available,palette)}"></span><span class="hand-class-freq">${detail}</span></button>`;
 }).join('');html+=group('Made hands',summary.made);if(summary.draws.length)html+=group('Draws (may overlap)',summary.draws);}
 el.innerHTML=html;el.scrollTop=scroll;if(focused)[...el.querySelectorAll('[data-hand-class]')].find(b=>b.dataset.handClass===focused)?.focus({preventScroll:true});
}
function setSolverTab(name,focus=false){
 const solving=name==='solve';
 $('solve-view').hidden=!solving;$('tree').hidden=solving;
 for(const [id,on] of [['tab-solve',solving],['tab-tree',!solving]]){
  const tab=$(id);tab.classList.toggle('active',on);tab.setAttribute('aria-selected',String(on));tab.tabIndex=on?0:-1;
 }
 if(focus)$(solving?'tab-solve':'tab-tree').focus();
 if(solving)drawChart(view.report?.history||[]);
}
function getSelected(){if(!view.game)return null;return view.game.nodes[view.node]||view.game.nodes[0];}
function renderExplorer(){
 const node=getSelected(),record=node&&!node.terminal&&view.report?view.report.nodes[node.id]:null;
 $('node-actor').textContent=node?(node.terminal?'TERMINAL':node.chance?(node.street==='deal-turn'?'DEAL TURN':'DEAL RIVER'):node.p===0?'OOP TO ACT':'IP TO ACT'):'NO GAME';
 $('node-path').textContent=node?node.history.join(' → '):'Configure valid ranges';
 $('node-subtitle').textContent=node?(node.terminal?'This betting sequence has ended.':node.chance?(node.street==='deal-turn'?'The next turn has 45 legal cards per private-hand pair.':'The next river has 44 legal cards per private-hand pair.')+(view.game.sampledChance?' Displayed runouts are sampled.':''):`Pot: ${node.pot} chips · To call: ${node.toCall} · ${node.actions.length-(culledAtNode(node.id)?.filter(Boolean).length||0)} active actions${culledAtNode(node.id)?.some(x=>x)?' ('+node.actions.length+' legal)':''}`):'Game unavailable';
 $('node-ev').textContent=record?evText(record.rangeEV):'—';
 const hasDecision=!!(record&&node&&!node.terminal&&!node.chance);
 $('strategy-view-controls').hidden=!hasDecision;$('strategy-filters').hidden=!hasDecision;$('hand-classes').hidden=!hasDecision;
 if(!hasDecision)$('hand-classes').innerHTML='';
 $('legend').innerHTML=node&&!node.terminal&&!node.chance?actionOrder(node.actions).filter(i=>!culledAtNode(node.id)?.[i]).map(i=>{
  const a=node.actions[i],v=record?record.actions[i]:null;
  return `<span class="legend-item"><i class="legend-color" style="background:${actionColor(a,i,node.actions)}"></i>${escapeHtml(a.label)} <strong>${v!==null?pct(v,1):'—'}</strong></span>`;
 }).join(''):'<span class="muted">No decision at this node</span>';
 if(!view.report){
  $('strategy').classList.add('is-empty');
  $('strategy-matrix').innerHTML='<div class="empty-results">Run a solve to see hand strategies and EVs.</div>';
  $('combo-details').innerHTML='';
  return;
 }
 $('strategy').classList.remove('is-empty');
 if(!record&&node&&!node.terminal&&!node.chance){
  $('strategy-matrix').innerHTML='<div class="empty-results">'+(view.active?'Solving · strategy details available at completion.':'Calculating exact hand EVs for this decision…')+'</div>';
  $('combo-details').innerHTML='';return;
 }
 if(hasDecision&&getPath(node.id).some(id=>{
   const p=view.game.nodes[id];return id!==node.id&&!p.terminal&&!p.chance&&p.p===node.p&&!view.report.nodes[id];
 })){
  $('strategy-matrix').innerHTML='<div class="empty-results">Loading preceding decision strategies…</div>';
  $('combo-details').innerHTML='';return;
 }
 const handById=new Map(record?record.hands.map(h=>[h[0],h]):[]);
 if(node?.chance){$('strategy-matrix').innerHTML='<div class="chance-explainer">'+(node.street==='deal-turn'?'Turn':'River')+' chance node: choose a runout in the game tree above.</div>';$('combo-details').innerHTML='<p class="muted">The chance node contains no player decision.</p>';return;}
 const blockers=boardSet(node), weights=node&&!node.terminal?view.weights[node.p]:null;
 const remaining=hasDecision?S.remainingWeights(view.game,view.report,view.weights,node.id,view.parents):null;
 const remainingMode=$('frequency-view').value==='remaining',f=view.filter,active=filtersActive(f),board=[...blockers];
 renderFilters('',f);
 const suitWeights=remaining?S.filterWeights(board,remaining,{...f,handClass:null}):null,filtered=remaining?S.filterWeights(board,remaining,f):null;
 $('frequency-note').textContent=remainingMode?'Weighted combos / board-legal combos; gray = missing weight. Cells show EV.':'Conditional action mix of reached hands.';
 if(hasDecision)renderHandClasses($('hand-classes'),board,suitWeights,id=>handById.get(id)?.[3],node.actions.map(a=>a.label),node.actions.map((a,i)=>actionColor(a,i,node.actions)),actionOrder(node.actions),f.handClass,culledAtNode(node.id));
 let html='';
 for(let i=0;i<13;i++)for(let j=0;j<13;j++){
  const cat=categoryAt(i,j),ids=idsForCat(cat);
  let mass=0,ev=0,fracs=node&&!node.terminal?new Float64Array(node.actions.length):[];
  for(const id of ids){const h=handById.get(id);if(!h||h[1]<=0||(active&&!(filtered?.[id]>0)))continue;mass+=h[1];ev+=h[1]*h[2];for(let a=0;a<fracs.length;a++)fracs[a]+=h[1]*h[3][a];}
  const available=ids.some(id=>!isBlocked(id,blockers)&&(!weights||weights[id]>0));
  if(mass>1e-16){for(let a=0;a<fracs.length;a++)fracs[a]/=mass;ev/=mass;}
  const legal=ids.filter(id=>!isBlocked(id,blockers)),raw=remaining?S.aggregate(legal,filtered,id=>handById.get(id)?.[3],node.actions.length):null;
  const shown=remainingMode&&raw?raw.mass:mass,values=remainingMode&&raw?Array.from(raw.amounts,v=>legal.length?v/legal.length:0):fracs;
  const count=raw?`${fmt(raw.mass,2)} / ${legal.length} weighted combos${active?" · filtered":""}`:'',tip=`${cat} · ${mass>0?'EV '+evText(ev):available?'Not reached':'Blocked / not in range'}${count?' · '+count:''}`;
  html+=`<button class="strategy-cell ${shown>1e-16?'':'unreached'} ${cat===view.viewCat?'selected':''} ${active?(raw?.mass>0?'filter-match':'filter-dim'):''}" data-vcat="${cat}" aria-label="${tip}" title="${tip}">`;
  if(shown>1e-16)html+=`<span class="cell-shading" style="background:${gradient(values,node.actions)}"></span>`;
  html+=`<span class="cell-name">${cat}</span><span class="cell-ev">${mass>1e-16?evText(ev,1):'—'}</span></button>`;
 }
 $('strategy-matrix').innerHTML=html;
 renderComboDetails(node,record,handById,remaining,active?filtered:null);
}
function renderComboDetails(node,record,handById,remaining,filtered){
 const cat=view.viewCat,ids=idsForCat(cat).filter(id=>!filtered||filtered[id]>0),set=boardSet(node);
 $('combo-cat').textContent=cat;$('combo-count').textContent=remaining?fmt(ids.reduce((sum,id)=>sum+remaining[id],0),2)+' weighted combos':ids.length+' combos';
 if(!node||node.terminal){$('combo-details').innerHTML='<p class="muted">Choose a decision in the betting-tree explorer to inspect mixed strategies.</p>';return;}
 if(!ids.length){$('combo-details').innerHTML='<p class="muted">No matching combos in this hand.</p>';return;}
 let html='<table class="combo-table"><thead><tr><th>COMBO</th><th>WEIGHT</th><th>REACH</th><th>MIX / ACTION EV</th><th>EV</th></tr></thead><tbody>';
 for(const id of ids){
  const [a,b]=C.ALL_COMBOS[id], blocked=isBlocked(id,set),h=handById.get(id);
  html+=`<tr class="${blocked?'blocked-row':''}"><td>${cardHtml(a)} ${cardHtml(b)}</td><td>${remaining?pct(remaining[id],1):'—'}</td><td>${h?pct(h[1],1):'—'}</td><td>`;
  if(h&&record){const order=actionOrder(node.actions).filter(k=>!culledAtNode(node.id)?.[k]);
   html+=`<div class="combo-value-bar">${order.map(k=>`<span style="width:${(h[3][k]*100).toFixed(2)}%;background:${actionColor(node.actions[k],k,node.actions)}" title="${escapeHtml(node.actions[k].label)}: ${pct(h[3][k],1)}, EV ${evText(h[4][k])}"></span>`).join('')}</div>`;
   html+=`<div class="combo-action-ev">${order.map(k=>`${escapeHtml(node.actions[k].label)} ${pct(h[3][k],0)} (EV ${evText(h[4][k],1)})`).join(' · ')}</div>`;
  }else html+='<span class="muted">'+(blocked?'Board blocked':'Not in reached range')+'</span>';
  html+=`</td><td>${h?evText(h[2]):'—'}</td></tr>`;
 }
 html+='</tbody></table>';
 $('combo-details').innerHTML=html;
}
function getPath(id){const path=[];let cur=id;while(cur!==null&&cur!==undefined){path.push(cur);cur=view.parents[cur]?.[0]??null;}return path.reverse();}
// A completed solver remains in its worker to provide selected-node values
// without transferring tens of thousands of unused hand records to the UI.
function requestNodeDetail(id){
 if(!view.report||view.active||view.fullReportReady||view.report.nodes[id]||view.detailPending.has(id))return;
 const node=view.game?.nodes[id];if(!node||node.chance||node.terminal)return;
 view.detailPending.add(id);
 if(view.worker)view.worker.postMessage({type:'detail',id});
 else if(view.fallback?.solver){
  const generation=view.generation;
  setTimeout(()=>{if(generation!==view.generation)return;
   try{acceptNodeDetail(id,view.fallback.solver.nodeReport(id));}
   catch(err){view.detailPending.delete(id);notify('Could not calculate selected-node EV: '+err.message,'warn');}},0);
 }
}
function requestSelectedDetails(){
 if(!view.report||view.active)return;
 for(const id of getPath(view.node))requestNodeDetail(id);
}
function acceptNodeDetail(id,record){
 view.detailPending.delete(id);
 if(!view.report||!record)return;
 view.report.nodes[id]=record;
 if(getPath(view.node).includes(id)){renderExplorer();renderTree();}
 requestSelectedDetails();
}
async function ensureFullReport(){
 if(!view.report||view.active)throw Error('Finish or stop solving before exporting a complete result.');
 if(view.fullReportReady)return view.report;
 if(view.fullReportPromise)return view.fullReportPromise;
 view.fullReportPromise=new Promise((resolve,reject)=>{
  view.fullReportResolve=resolve;view.fullReportReject=reject;
 });
 if(view.worker)view.worker.postMessage({type:'full-report'});
 else if(view.fallback?.solver){
  const generation=view.generation;
  setTimeout(()=>{if(generation!==view.generation)return;
   try{acceptFullReport(view.fallback.solver.report());}
   catch(err){rejectFullReport(err);}},0);
 }else rejectFullReport(Error('The completed numerical state is unavailable. Solve again to export full details.'));
 return view.fullReportPromise;
}
function acceptFullReport(report){
 const done=view.fullReportResolve;
 view.fullReportReady=true;view.fullReportPromise=null;view.fullReportResolve=null;view.fullReportReject=null;view.detailPending.clear();
 updateReport(report,'finished');
 if(done)done(report);
}
function rejectFullReport(error){
 const reject=view.fullReportReject;
 view.fullReportPromise=null;view.fullReportResolve=null;view.fullReportReject=null;
 if(reject)reject(error);
}
// The worker owns the mutable betting tree, so its report carries the
// authoritative culling masks. Match aliases to the canonical decision node.
function culledAtNode(nodeId){
 const n=view.game?.nodes[nodeId];if(!n)return null;
 const id=n.isoAlias?.source??nodeId;
 const rows=view.report?.actionPruning?.culledNodes;
 return rows?.find(row=>row[0]===id)?.[1]||null;
}
function renderTree(){
 refreshContinue();
 const n=getSelected();if(!n){$('tree-breadcrumb').innerHTML='';$('tree-summary').innerHTML='';$('tree-actions').innerHTML='<p class="muted">Configure valid ranges first.</p>';return;}
 const path=getPath(n.id);
 $('tree-breadcrumb').innerHTML=path.map((id,i)=>{
  const parent=i===0?null:path[i-1],label=parent===null?(view.mode==='flop'?'Flop':view.mode==='turn'?'Turn':'River'):view.parents[id][1];
  return `${i?'<span class="crumb-sep">›</span>':''}<button class="crumb ${id===n.id?'current':''}" data-node="${id}">${escapeHtml(label)}</button>`;
 }).join('');
 const record=view.report&&!n.terminal?view.report.nodes[n.id]:null;
 const stats=[['ACTING PLAYER',n.terminal?'—':n.chance?'Chance':n.p===0?'OOP':'IP'],['STREET',n.street|| (n.river!==null&&n.river!==undefined?'River':'—')],['CURRENT POT',n.pot+' chips'],['TO CALL',n.terminal||n.chance?'—':n.toCall+' chips'],['NODE REACH',record?pct(record.reachMass,2):'—'],['RANGE EV',record?evText(record.rangeEV):'—']];
 $('tree-summary').innerHTML=stats.map(([key,value])=>`<div class="tree-stat"><span>${key}</span><strong>${value}</strong></div>`).join('');
 if(n.chance){
  const dealTurn=n.street==='deal-turn';
  $('tree-actions').innerHTML='<p class="mini-note">Choose a '+(dealTurn?'turn':'river')+' card'+(view.game.sampledChance?' (sampled chance outcomes)':'')+':</p><div class="runout-grid">'+n.runouts.map(o=>{const s=C.cardText(o.card??o.river);return `<button class="runout-card s-${s[1]}" data-next="${o.child}" aria-label="${s[0]} of ${suitNames[s[1]]}" title="${s[0]} of ${suitNames[s[1]]}">${s[0]}</button>`;}).join('')+'</div>';return;
 }
 if(n.terminal){$('tree-actions').innerHTML=`<div class="terminal-note">${n.type==='fold'?`Hand ends by fold; ${n.winner===0?'OOP':'IP'} wins the pot.`:'Hand ends at showdown; exact seven-card rankings determine the result.'} The final pot is ${n.pot} chips.</div>`;return;}
 $('tree-actions').innerHTML=actionOrder(n.actions).filter(k=>!culledAtNode(n.id)?.[k]).map(k=>{
  const a=n.actions[k],f=record?record.actions[k]:null,clr=actionColor(a,k,n.actions),child=view.game.nodes[a.child];
  return `<button class="tree-action" style="--action-color:${clr}" data-next="${a.child}"><strong style="color:${clr}">${escapeHtml(a.label)} →</strong><span>${f===null?'Not solved':pct(f,1)+' of reaching range'} · ${child.terminal?'Terminal':'Decision'}</span>`+
   `<div class="action-progress"><span style="width:${f===null?0:f*100}%;background:${clr}"></span></div></button>`;
 }).join('');
}
function drawChart(history){
 const canvas=$('chart'),rect=canvas.getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1),width=Math.max(240,rect.width||600),height=160;
 canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
 const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);ctx.clearRect(0,0,width,height);
 const l=48,r=16,t=13,b=25,w=width-l-r,h=height-t-b,points=(history||[]).filter(x=>Number.isFinite(x[1]));
 const maxY=Math.max(.001,...points.map(x=>x[1]));
 ctx.font='10px system-ui';ctx.lineWidth=1;
 for(let k=0;k<=4;k++){const v=maxY*k/4,y=t+h-v/maxY*h;ctx.strokeStyle='#2a3c50';ctx.beginPath();ctx.moveTo(l,y);ctx.lineTo(width-r,y);ctx.stroke();ctx.fillStyle='#879db8';ctx.textAlign='right';ctx.fillText(v.toFixed(maxY<.1?3:1),l-9,y+3);}
 ctx.fillStyle='#8396b2';ctx.textAlign='center';
 if(points.length){const lastX=points[points.length-1][0],firstX=points[0][0],range=Math.max(1,lastX-firstX);
  ctx.strokeStyle='#68edc8';ctx.lineWidth=2;ctx.beginPath();
  points.forEach(([i,y],j)=>{const px=l+(i-firstX)/range*w,py=t+h-y/maxY*h;j?ctx.lineTo(px,py):ctx.moveTo(px,py);});ctx.stroke();
  ctx.fillText(String(firstX),l,height-7);ctx.fillText(String(lastX),width-r,height-7);
  ctx.fillStyle='#74e6c5';const last=points[points.length-1];ctx.beginPath();ctx.arc(l+(last[0]-firstX)/range*w,t+h-last[1]/maxY*h,3,0,2*Math.PI);ctx.fill();
 }else {ctx.fillStyle='#74869f';ctx.fillText('Exact best-response diagnostics appear while solving',l+w/2,t+h/2);}
}
// Exact best-response checks avoid the expensive hand-level EV report.
// Keep frequent iteration progress, periodic convergence checks, and slower
// full strategy/EV updates on separate schedules. No stopping approximation.
// Schedule a measured amount of work per event-loop turn instead of a fixed
// handful of iterations. Limit growth to avoid large cancellation delays.
function createAdaptiveBatchController(initial=4,targetMs=12){
 let batch=Math.max(1,Math.floor(initial)),cost=0;
 return {
  get batch(){return batch;},
  record(iterations,elapsedMs){
   if(iterations<=0||!Number.isFinite(elapsedMs))return;
   const measured=Math.max(.005,elapsedMs/iterations);
   cost=cost?0.75*cost+0.25*measured:measured;
   const desired=Math.max(1,Math.min(512,Math.floor(targetMs/cost)));
   batch=Math.max(1,Math.min(512,Math.max(Math.floor(batch/2),Math.min(batch*4,desired))));
  }
 };
}
function createReportScheduler(startMs){
 const target=arguments[1],optimized=!!arguments[2];
 let lastReportEnd=startMs,lastFullReportEnd=startMs,lastProgress=startMs,reportInterval=4000;
 let lastConvergenceEnd=startMs,lastConvergenceIteration=0,convergenceInterval=250,minGap=10;
 const adaptive=Number.isFinite(target)&&target>0;
 return {
  reportDue(now){return now-lastReportEnd>=reportInterval;},
  // v9: exact checks are cheap in compiled WASM. Check promptly after the
  // minimum 20 iterations rather than waiting up to 4 seconds on fast CPUs.
  // Afterwards throttle by observed check cost, with at least ten new steps.
  convergenceDue(now,iteration){
   if(iteration<20)return false;
   if(lastConvergenceIteration===0)return true;
   return iteration-lastConvergenceIteration>=minGap && now-lastConvergenceEnd>=convergenceInterval;
  },
  markConvergence(begin,end,iteration,exploitability){
   lastConvergenceEnd=end;lastConvergenceIteration=iteration;
   // Fast DCFR games can converge before the old 250ms cooldown expires.
   // Bound check overhead using its actual measured cost, not wall-clock
   // idling; every check remains a full-tree exact best response.
   convergenceInterval=optimized?Math.max(12,Math.min(2000,Math.ceil((end-begin)*8))):
     Math.max(250,Math.min(6000,Math.ceil((end-begin)*10)));
   if(adaptive&&Number.isFinite(exploitability)){
     const ratio=exploitability/target;
     minGap=ratio<=2?(optimized?5:10):ratio<=8?20:ratio<=32?40:80;
   }
  },
  fullReportDue(now){return now-lastFullReportEnd>=30000;},
  progressDue(now){return now-lastProgress>=300;},
  markProgress(now){lastProgress=now;},
  markReport(begin,end){
   lastReportEnd=end;lastProgress=end;
   reportInterval=Math.max(4000,Math.min(30000,Math.ceil((end-begin)*12)));
  },
  markFullReport(begin,end,iteration=0,exploitability){
   this.markReport(begin,end);lastFullReportEnd=end;
   if(iteration>0)this.markConvergence(begin,end,iteration,exploitability);
  }
 };
}
function updateProgress(progress,kind='running'){
 $('stat-iterations').textContent=progress.iteration.toLocaleString();
 $('stat-speed').textContent=fmt(progress.ips,1);
 $('stat-time').textContent=fmt(progress.elapsedMs/1000,1)+'s';
 const percent=Math.min(100,100*progress.iteration/view.limit);
 $('progress-bar').style.width=percent+'%';$('progress-percent').textContent=fmt(percent,1)+'%';
 $('progress-text').textContent=kind==='running'?'Solving · progress updates live':kind==='stopped'?'Stopped by user':kind==='converged'?'Target tolerance met':'Iteration limit reached';
}
function solverProgress(solver){
 const elapsedMs=Date.now()-solver.startTime;
 return {iteration:solver.iteration,elapsedMs,ips:elapsedMs>0?1000*solver.iteration/elapsedMs:0};
}
function updateReport(report,kind){
 view.report=report;
 if(report.reportLevel!=='summary')view.fullReportReady=true;
 updateProgress(report,kind);
 $('stat-memory').textContent=fmt(report.memoryBytes/1048576,2)+' MiB';
 if($('phase-profile')){const p=report.performance; $('phase-profile').hidden=!p;
  if(p)$('phase-profile').textContent='WASM phases — P0 traversal '+fmt(p.traversal0Ms,1)+' ms; P1 traversal '+fmt(p.traversal1Ms,1)+' ms; policy '+(p.fusedPolicy?'fused into traversal':fmt(p.policy0Ms+p.policy1Ms,1)+' ms')+'; exact checks '+fmt(p.checkMs,1)+' ms; checks '+p.checks+'.';}
 const isQre=report.equilibrium==='qre';
 $('stat-main-label').textContent='Nash exploitability (chips/player)';
 $('chart').setAttribute('aria-label','Exploitability versus iterations');
 $('stat-exploit').textContent=fmt(report.exploitability,4);
 $('stat-qre-gap').hidden=!isQre;
 $('stat-qre-gap').textContent='Regularized QRE gap: '+fmt(report.qreResidual,4)+' chips / player';
 $('stat-exploit').title=`Best-response exploitability last checked at iteration ${report.iteration.toLocaleString()}. It updates less often than the iteration counter.`;
 $('stat-nash').textContent='NashConv: '+fmt(report.nashConv,4)+' chips'+(report.actionPruning?.enabled?' · '+report.actionPruning.prunedActions+' culled bet/raise sizes':'');
 $('stat-tpwl').textContent='Tree PWL: '+(report.tpwl===null?'—':fmt(100*report.tpwl,4)+'%')+' · '+report.tpwlNodes+' assessed nodes';
 $('stat-ev').textContent='OOP EV: '+evText(report.value0)+' chips';
 $('stat-zero').textContent='Pot accounting error: '+fmt(report.zeroSumError,8);
 $('export').disabled=false;drawChart(report.history);
 renderExplorer();renderTree();
}
// Lightweight updates do not overwrite the latest full hand/strategy report.
function updateConvergence(check){
 updateProgress(check);
 $('stat-exploit').textContent=fmt(check.exploitability,4);
 $('stat-exploit').title=`Exact exploitability checked at iteration ${check.iteration.toLocaleString()}. Detailed hand EVs update less frequently.`;
 $('stat-nash').textContent='NashConv: '+fmt(check.nashConv,4)+' chips'+(check.actionPruning?.enabled?' · '+check.actionPruning.prunedActions+' culled bet/raise sizes':'');
 const isQre=check.equilibrium==='qre';
 $('stat-qre-gap').hidden=!isQre;
 if(isQre)$('stat-qre-gap').textContent='Regularized QRE gap: '+fmt(check.qreResidual,4)+' chips / player';
 drawChart(check.history);
}
function finished(kind,report){
 if(report)updateReport(report,kind);
 view.active=false;view.stopRequested=false;
 $('solve').disabled=false;$('stop').disabled=true;
 if(view.fallback){clearTimeout(view.fallback.timer);view.fallback.timer=null;}
 $('save-local').disabled=!view.report;$('save-checkpoint').disabled=!(view.report||view.active);refreshContinue();
 if(view.report&&!view.benchmark?.running){setSolverTab('tree');requestSelectedDetails();}
 setStatus(kind==='converged'?'TOLERANCE MET':kind==='stopped'?'STOPPED':'ITERATION LIMIT','complete');
 const isQre=report?.equilibrium==='qre',e=report?.exploitability;
 const metric='Nash exploitability '+fmt(e,4)+' chips per player ('+fmt(100*e/view.game.pot,4)+'% of starting pot)'+(isQre?'; regularized QRE gap '+fmt(report.qreResidual,4)+' chips per player':'');
 showSolveCompletion(kind,report);
 notify(kind==='converged'?`Configured target reached: ${metric}.`:
  kind==='stopped'?`Solve stopped after ${report?.iteration||0} iterations; ${metric}. Strategies are interim.`:
  `Iteration limit reached: ${metric}.${isQre?' Both gaps must meet the target; lower temperature if Nash exploitability remains high.':' Convergence is not guaranteed.'}`,kind==='converged'?'ok':'warn');
 if(view.benchmark?.running)benchmarkRunComplete(kind,report);
}
function solutionConverged(solver,report,tolerance){
 if(solver.iteration<20)return false;
 if(solver.game.equilibrium==='qre')return Number.isFinite(report.qreResidual)&&report.qreResidual<=tolerance&&report.exploitability<=tolerance;
 return report.exploitability<=tolerance;
}
function workerMain(){
 'use strict';
 const core=createSolverCore();let job=null,completed=null,runId=0;
 const hostPostMessage=postMessage;
 // Every reply carries its originating solve's ID. Ignore queued replies
 // from an older benchmark run after reusing the same Worker.
 function send(message,transfer){message.runId=runId;hostPostMessage(message,transfer);}
 self.onmessage=function(e){const m=e.data;
  if(m.type==='reset'){job=null;completed=null;return;}
  if(m.type==='stop'){if(job)job.stop=true;return;}
  if(m.type==='checkpoint'){const source=job?.solver||completed;if(source)try{const cp=source.saveCheckpoint();send({type:'checkpoint',checkpoint:cp},[cp.storage.buffer]);}catch(e){send({type:'checkpoint-error',message:e.message});}return;}
  if(m.type==='detail'||m.type==='full-report'){
   if(!completed)return;
   try{
    if(m.type==='detail')send({type:'detail',id:m.id,record:completed.nodeReport(m.id)});
    else send({type:'full-report',report:completed.report()});
   }catch(err){send({type:'detail-error',id:m.id,message:err.message||String(err)});}
   return;
  }
  if(m.type!=='start')return;
  job=null;completed=null;runId=m.runId??0;
  try {
   const game=core.makeGame(m.config);game.profileEnabled=!!m.config.profileEnabled;
   // Keep the numerical state exclusively in the worker; compilation optional.
   try{game.compiled=createCompiledTraversal(game,WASM_TRAVERSAL_BYTES,m.config.memoryLimitBytes);}catch(_){game.compiled=null;}
   const solver=m.checkpoint?core.CFRSolver.resume(game,m.checkpoint):new core.CFRSolver(game);
   job={solver,max:m.max,tolerance:m.tolerance,controller:createAdaptiveBatchController(m.batch),stop:false,
    schedule:createReportScheduler(Date.now(),m.config.useAdaptiveConvergence?m.tolerance:undefined,
     m.config.equilibrium==='gto'&&m.config.gtoAlgorithm==='dcfr')};
   setTimeout(()=>tick(job),0);
  }catch(err){send({type:'error',message:err.message||String(err)});}
 };
 function tick(j){
  if(!j||job!==j)return;
  try{
   if(!j.stop){
    const cap=Math.min(j.controller.batch,j.max-j.solver.iteration);
    const begin=typeof performance!=='undefined'?performance.now():Date.now();
    for(let i=0;i<cap;i++)j.solver.step();
    j.controller.record(cap,(typeof performance!=='undefined'?performance.now():Date.now())-begin);
   }
   const now=Date.now(),done=j.stop||j.solver.iteration>=j.max;
   // Summary is the default: avoid eagerly generating thousands of per-hand
   // records. Full detailed reports are produced only when explicitly asked.
   if(done||j.schedule.fullReportDue(now)){
    const start=Date.now(),report=j.solver.summary();if(j.solver.profileEnabled)report.performance=j.solver.getProfile();
    j.schedule.markFullReport(start,Date.now(),j.solver.iteration,report.exploitability);
    const converged=solutionConverged(j.solver,report,j.tolerance);
    if(done||converged){send({type:'finished',kind:j.stop?'stopped':converged?'converged':'limited',report});completed=j.solver;job=null;return;}
    send({type:'report',report});
   }else if(j.schedule.convergenceDue(now,j.solver.iteration)||j.schedule.reportDue(now)){
    const start=Date.now(),check=j.solver.checkConvergence();
    j.schedule.markReport(start,Date.now());
    j.schedule.markConvergence(start,Date.now(),j.solver.iteration,check.exploitability);
    if(solutionConverged(j.solver,check,j.tolerance)){
      const report=j.solver.summary();if(j.solver.profileEnabled)report.performance=j.solver.getProfile();
      send({type:'finished',kind:'converged',report});completed=j.solver;job=null;return;
    }
    send({type:'check',check});
   }else if(j.schedule.progressDue(now)){
    j.schedule.markProgress(now);
    send({type:'progress',progress:solverProgress(j.solver)});
   }
   setTimeout(()=>tick(j),0);
  }catch(err){send({type:'error',message:err.message||String(err)});job=null;}
 }
}
function runFallback(cfg,max,tolerance,batch,generation,checkpoint=null){
 let solver;
 try {
  const game=C.makeGame(cfg);game.profileEnabled=!!cfg.profileEnabled;
  try{game.compiled=createCompiledTraversal(game,WASM_TRAVERSAL_BYTES,cfg.memoryLimitBytes);}catch(_){game.compiled=null;}
  solver=checkpoint?C.CFRSolver.resume(game,checkpoint):new C.CFRSolver(game);
 }catch(err){
  // Worker-less/mobile fallback must recover from startup failures just as
  // the Web Worker does. Never leave Solve disabled and SOLVING displayed.
  if(generation===view.generation)solverFailed('Could not initialize solver: '+(err.message||String(err)));
  return;
 }
 const ctx={solver,stop:false,timer:null,controller:createAdaptiveBatchController(batch),
  schedule:createReportScheduler(Date.now(),cfg.useAdaptiveConvergence?tolerance:undefined,
   cfg.equilibrium==='gto'&&cfg.gtoAlgorithm==='dcfr')};view.fallback=ctx;
 function tick(){
  if(view.generation!==generation)return;
  try {
   if(!ctx.stop){
    const cap=Math.min(ctx.controller.batch,max-solver.iteration);
    const begin=typeof performance!=='undefined'?performance.now():Date.now();
    for(let i=0;i<cap;i++)solver.step();
    ctx.controller.record(cap,(typeof performance!=='undefined'?performance.now():Date.now())-begin);
   }
   const now=Date.now(),done=ctx.stop||solver.iteration>=max;
   if(done||ctx.schedule.fullReportDue(now)){
    const start=Date.now(),report=solver.summary();if(solver.profileEnabled)report.performance=solver.getProfile();
    ctx.schedule.markFullReport(start,Date.now(),solver.iteration,report.exploitability);
    const converged=solutionConverged(solver,report,tolerance);
    if(done||converged){finished(ctx.stop?'stopped':converged?'converged':'limited',report);return;}
    updateReport(report,'running');
   }else if(ctx.schedule.convergenceDue(now,solver.iteration)||ctx.schedule.reportDue(now)){
    const start=Date.now(),check=solver.checkConvergence();
    ctx.schedule.markReport(start,Date.now());
    ctx.schedule.markConvergence(start,Date.now(),solver.iteration,check.exploitability);
    if(solutionConverged(solver,check,tolerance)){
      finished('converged',solver.summary());return;
    }
    updateConvergence(check);
   }else if(ctx.schedule.progressDue(now)){
    ctx.schedule.markProgress(now);
    updateProgress(solverProgress(solver));
   }
   ctx.timer=setTimeout(tick,0);
  }catch(err){solverFailed(err.message||String(err));}
 }
 ctx.timer=setTimeout(tick,0);
}
function exploitabilityTargetChips(pot,percent){
 if(!Number.isFinite(pot)||pot<=0||!Number.isFinite(percent)||percent<0)throw Error('Enter a nonnegative target exploitability percentage and a positive starting pot.');
 const chips=pot*(percent/100);
 if(!Number.isFinite(chips))throw Error('Target exploitability is too large.');
 return chips;
}
function startSolver(checkpoint=null,benchmarkConfig=null,benchmarkLimits=null){
 if(view.active)return false;
 if(!benchmarkConfig&&view.benchmark&&!view.benchmark.running)clearBenchmark();
 if(!makeLocalGame(benchmarkConfig))return false;
 const max=benchmarkLimits?.iterations??Number($('iterations').value),percent=benchmarkLimits?.targetPercent??($('tolerance').value.trim()===''?NaN:Number($('tolerance').value)),budget=benchmarkConfig?benchmarkConfig.memoryLimitBytes/1048576:Number($('memory-limit').value);
 let tol;try{tol=exploitabilityTargetChips(view.game.pot,percent);}catch(e){notify(e.message,'error');return false;}
 if(!Number.isInteger(max)||max<1||max>10000000){notify('Max iterations must be a whole number from 1 to 10,000,000.','error');return false;}
 if(!Number.isFinite(budget)||budget<2||budget>4096){notify('Set a memory budget between 2 and 4,096 MiB.','error');return false;}
 if(view.game.memory/1048576>budget){notify(`The preview estimates ${fmt(view.game.memory/1048576,2)} MiB; the worker will check the exact ${budget} MiB limit before solving.`,'warn');}
 cancel();clearOutput();view.active=true;view.limit=max;view.solveTargetPercent=percent;
 $('solve').disabled=true;$('stop').disabled=false; $('save-checkpoint').disabled=false;setStatus('SOLVING','running');notify(view.game.equilibrium==='qre'?'Solving entropy-regularized QRE at '+fmt(view.game.qreTemperaturePercent,3)+'% of pot temperature. Both Nash exploitability and regularized gap must meet the target.':view.mode==='flop'?(view.game.sampledChance?'Solving the flop, turn and river with sampled runouts (approximate full-game results).':'Solving all flop, turn and river chance outcomes with exact runout enumeration.'):view.mode==='turn'?'GTO is solving turn and every legal river runout, with blocker-aware chance probabilities.':'GTO is solving the selected river board.');
 renderTree();renderExplorer();
 const cfg=benchmarkConfig||config(),generation=view.generation;view.activeConfig=cfg;
 view.solveRun={startedMs:Date.now(),startedIteration:checkpoint?.iteration??0,limit:max};
 const hands=Math.max(view.game.players[0].ids.length,view.game.players[1].ids.length);
 const batch=Math.max(1,Math.min(view.mode==='river'?15:5,Math.floor((view.mode==='river'?900:350)/hands)));
 const launchFallback=(message)=>{if(view.generation!==generation||!view.active)return;view.origin='fallback'; if(view.worker){view.worker.terminate();view.worker=null;}notify(message,'warn');runFallback(cfg,max,tol,batch,generation,checkpoint);};
 if(typeof Worker!=='undefined'&&typeof Blob!=='undefined'&&typeof URL.createObjectURL==='function'){
  try{
   if(!view.worker){
   const script=`const createSolverCore=${createSolverCore.toString()};\nconst createCompiledTraversal=${createCompiledTraversal.toString()};\nconst WASM_TRAVERSAL_BYTES=${JSON.stringify(WASM_TRAVERSAL_BYTES)};\nconst WASM_TRAVERSAL_BYTES_SCALAR=${JSON.stringify(WASM_TRAVERSAL_BYTES_SCALAR)};\nconst WASM_TRAVERSAL_BYTES_CLASSIC=${JSON.stringify(WASM_TRAVERSAL_BYTES_CLASSIC)};\nconst WASM_TRAVERSAL_BYTES_CLASSIC_SCALAR=${JSON.stringify(WASM_TRAVERSAL_BYTES_CLASSIC_SCALAR)};\nconst createAdaptiveBatchController=${createAdaptiveBatchController.toString()};\nconst createReportScheduler=${createReportScheduler.toString()};\nconst solverProgress=${solverProgress.toString()};\nconst solutionConverged=${solutionConverged.toString()};\n(${workerMain.toString()})();`;
   const blobUrl=URL.createObjectURL(new Blob([script],{type:'text/javascript'}));
   const worker=new Worker(blobUrl);setTimeout(()=>URL.revokeObjectURL(blobUrl),2000);view.worker=worker;
   }
   const worker=view.worker;
   worker.onmessage=e=>{
    if(view.generation!==generation)return;
    const m=e.data;
    if(m.runId!==generation)return;
    if(m.type==='error'){solverFailed('Solver error: '+m.message);return;}
    if(m.type==='checkpoint')downloadCheckpoint(m.checkpoint);
    if(m.type==='checkpoint-error')notify('Checkpoint failed: '+m.message,'error');
    if(m.type==='progress')updateProgress(m.progress);
    if(m.type==='check')updateConvergence(m.check);
    if(m.type==='report')updateReport(m.report,'running');
    if(m.type==='detail')acceptNodeDetail(m.id,m.record);
    if(m.type==='full-report')acceptFullReport(m.report);
    if(m.type==='detail-error'){
     if(m.id!==undefined)view.detailPending.delete(m.id);
     if(m.id===undefined)rejectFullReport(Error(m.message));
     else notify('Selected-node report failed: '+m.message,'warn');
    }
    if(m.type==='finished')finished(m.kind,m.report);
   };
   worker.onerror=e=>{if(view.generation===generation){e.preventDefault();launchFallback('Web Worker unavailable on this browser/file setup; solving in cooperative, yielding batches.');}};
   worker.postMessage({type:'start',runId:generation,config:cfg,max,tolerance:tol,batch,checkpoint});
   view.origin='worker';return true;
  }catch(err){launchFallback('Could not create a local Web Worker; solving in non-blocking main-thread batches.');return true;}
 }
 launchFallback('Web Workers are unsupported; using cooperative non-blocking batches.');
 return true;
}
function stopSolver(){
 if(!view.active&&view.benchmark?.running){view.benchmark.cancelled=true;completeBenchmark();return;}
 if(!view.active||view.stopRequested)return;
 if(view.benchmark?.running)view.benchmark.cancelled=true;
 view.stopRequested=true;
 $('stop').disabled=true;$('progress-text').textContent='Stopping after current batch…';
 if(view.worker)view.worker.postMessage({type:'stop'});
 if(view.fallback)view.fallback.stop=true;
}
function solutionData(){
 if(!view.report)return null;
 const cfg=view.activeConfig||config();
 const data={title:'TurnRiverLab · '+(cfg.equilibrium==='qre'?'Near-GTO QRE':cfg.gtoAlgorithm.toUpperCase())+' NLHE postflop solution',exported:new Date().toISOString(),
  definition:{utility:'Reported EV is incremental chips relative to folding at the current decision (fold EV = 0). Engine CFR payoffs remain centered at half the starting pot for zero-sum computation.',
   game:view.mode==='flop'?'Three-street flop, turn and river zero-sum game with '+(view.game.sampledChance?'sampled (approximate)':'fully enumerated')+' public chance nodes':view.mode==='turn'?'Two-street turn and river zero-sum game with fully enumerated river outcomes':'River-only zero-sum game with a fixed no-limit action abstraction',
   normalization:'Joint P(h0,h1) proportional to rangeWeight0(h0)*rangeWeight1(h1)*I(no shared cards)',
   exploitability:'Half the sum of two best-response values against average policies; exact for the configured (possibly sampled) tree only, in chips',
   equilibrium:cfg.equilibrium,
   qreModel:cfg.equilibrium==='qre'?'Entropy-regularized zero-sum extensive-form equilibrium: chip payoff plus temperature times own expected decision entropy minus opponent expected decision entropy. CFR+ gradient updates on a simplex with 1e-6 action floor; continuation values include future entropy. Independent model, not GTO Wizard proprietary implementation.':null,
   qreResidual:'Half the sum of entropy-regularized best-response values, in chips per player; separate from ordinary Nash exploitability. Both must meet the target for QRE convergence.',
   averaging:cfg.gtoAlgorithm==='dcfr-scheduled-cubic'?'Scheduled DCFR hybrid discount with t^'+cfg.scheduledAveragingPower+' averaging':cfg.equilibrium==='gto'&&cfg.gtoAlgorithm==='lcfr'?'Linear CFR with t/(t+1) signed regret discount and linear averaging t':cfg.gtoAlgorithm==='dcfr-cubic'?'DCFR signed regret discounts and cubic averaging t³':cfg.gtoAlgorithm==='dcfr-2-0.5-2'?'DCFR α=2 β=0.5 γ=2 signed regrets and quadratic averaging':cfg.gtoAlgorithm==='dcfr-predictive'?'Predictive DCFR signed regret discounts with one-step prediction and quadratic averaging t²':cfg.gtoAlgorithm==='dcfr-adaptive'?'Adaptive DCFR smooth discount schedule and quadratic averaging t²':cfg.gtoAlgorithm==='dcfr-scheduled'?'Scheduled DCFR positive-regret discounts and quadratic averaging t²':cfg.gtoAlgorithm==='dcfr'?'DCFR signed regret discounting and quadratic averaging t²':cfg.equilibrium==='gto'&&cfg.gtoAlgorithm==='optimistic'?'CFR+ with one-step optimistic regret prediction, linear averaging t':'Linear CFR+ weighting t with own realization reach (delay 0)',
   riverChance:'For a complete turn, 44 cards are legal for each disjoint private hand pair. For a flop, 45 turns then 44 rivers remain; sampled branches use inverse-probability weights.',
   sampledChance:view.game.sampledChance,flopTurnSamples:cfg.flopTurnSamples,flopRiverSamples:cfg.flopRiverSamples,exactSuitIsomorphism:cfg.useSuitIsomorphism,suitOrbitInfo:view.game.suitIsomorphism,riverPrivateSymmetry:{enabled:view.game.riverPrivateSymmetry?.enabled,groupSize:view.game.riverPrivateSymmetry?.groupSize,representatives:view.game.riverPrivateSymmetry?.representatives,savedRows:view.game.riverPrivateSymmetry?.savedRows,reason:view.game.riverPrivateSymmetry?.reason},
   actionPruning:view.report?.actionPruning??view.game.actionPruning},
  source:view.source,
  config:{mode:view.mode,equilibrium:cfg.equilibrium,gtoAlgorithm:cfg.gtoAlgorithm,
   scheduledAlphaStart:cfg.scheduledAlphaStart,scheduledAlphaGain:cfg.scheduledAlphaGain,
   scheduledRampLength:cfg.scheduledRampLength,scheduledAveragingPower:cfg.scheduledAveragingPower,
   useAdaptiveConvergence:cfg.useAdaptiveConvergence,
   algorithmRevision:cfg.gtoAlgorithm==='dcfr-2-0.5-2'?'dcfr-2-0.5-2-quadratic-v2':null,
   qreTemperaturePercent:cfg.qreTemperaturePercent,targetExploitabilityPercent:view.solveTargetPercent,
   board:cfg.board.map(C.cardText),pot:cfg.pot,stack:cfg.stack,oopBetSizesPercent:cfg.sizes0,
   ipBetSizesPercent:cfg.sizes1,oopTurnBetSizesPercent:cfg.turnSizes0,ipTurnBetSizesPercent:cfg.turnSizes1,
   oopTurnDonkBetSizesPercent:cfg.turnDonkSizes0,turnEntryMode:cfg.turnEntryMode,oopFlopDonkBetSizesPercent:cfg.flopDonkSizes0,flopEntryMode:cfg.flopEntryMode,oopRiverDonkBetSizesPercent:cfg.riverDonkSizes0,riverEntryMode:cfg.riverEntryMode,oopFlopBetSizesPercent:cfg.flopSizes0,ipFlopBetSizesPercent:cfg.flopSizes1,oopRaiseSizesPercent:cfg.raiseSizes0,ipRaiseSizesPercent:cfg.raiseSizes1,oopTurnRaiseSizesPercent:cfg.turnRaiseSizes0,ipTurnRaiseSizesPercent:cfg.turnRaiseSizes1,oopFlopRaiseSizesPercent:cfg.flopRaiseSizes0,ipFlopRaiseSizesPercent:cfg.flopRaiseSizes1,flopTurnSamples:cfg.flopTurnSamples,flopRiverSamples:cfg.flopRiverSamples,maxRaises:cfg.maxRaises,allIn:cfg.allIn,useSuitIsomorphism:cfg.useSuitIsomorphism,useRiverHandSymmetry:cfg.useRiverHandSymmetry,
   useActionFrequencyPruning:cfg.useActionFrequencyPruning,actionPruneThresholdPercent:cfg.actionPruneThresholdPercent,actionPruneWarmupPercent:cfg.actionPruneWarmupPercent,actionPruneWarmupIterations:cfg.actionPruneWarmupIterations,actionPruneRecheckIterations:cfg.actionPruneRecheckIterations,actionPrunePlannedIterations:cfg.actionPrunePlannedIterations,useRegretPruning:cfg.useRegretPruning,
   ranges:[cfg.weights0,cfg.weights1].map(w=>Array.from(w,(v,id)=>v>0?{hand:C.ALL_COMBOS[id].map(C.cardText),weight:v}:null).filter(Boolean))},
  results:view.report,tree:view.game.nodes.map(n=>n.terminal?{id:n.id,terminal:n.type,winner:n.winner,pot:n.pot,turn:n.turn,river:n.river,history:n.history}:
    n.chance?{id:n.id,chance:true,pot:n.pot,history:n.history,runouts:n.runouts}:
   {id:n.id,street:n.street,turn:n.turn,river:n.river,player:n.p,pot:n.pot,toCall:n.toCall,contributions:n.c,history:n.history,actions:n.actions})};
 return data;
}
async function exportJSON(){
 if(!view.report)return;
 try{notify('Preparing complete exact strategy report for export…');await ensureFullReport();}
 catch(err){notify('Cannot export solution: '+err.message,'error');return;}
 const data=solutionData();if(!data)return;
 const blob=new Blob([JSON.stringify(data)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='turnriverlab-solution.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
const L=createFlopLibrary(C,FLOP_LIBRARY_ORDER);
const lib={filter:newFilter(),spots:[],spot:null,lines:[],cat:'AKs'};
function appTab(name){const library=name==='library';$('library-view').hidden=!library;$('solver-workspace').hidden=library;$('tab-library').classList.toggle('active',library);$('tab-solver').classList.toggle('active',!library);$('tab-library').setAttribute('aria-pressed',library);$('tab-solver').setAttribute('aria-pressed',!library);}
function fillSelect(id,entries){const el=$(id);el.replaceChildren(...entries.map(([v,label])=>{const o=document.createElement('option');o.value=v;o.textContent=label;return o;}));}
function libInit(text){const spots=L.parse(text);if(!spots.length)throw Error('TSV has no flop spots.');lib.spots=spots;const configs=[...new Set(spots.map(s=>s.configuration))];fillSelect('lib-config',configs.map(c=>[c,L.names[c]||c]));$('lib-count').textContent=spots.length+' SPOTS';libConfig();}
function libConfig(){const cfg=$('lib-config').value;fillSelect('lib-flop',lib.spots.map((s,i)=>[s,i]).filter(([s])=>s.configuration===cfg).map(([s,i])=>[i,s.board.map(C.cardText).join(' ')]));libSpot();}
function libSpot(){lib.filter=newFilter();lib.spot=lib.spots[Number($('lib-flop').value)];$('lib-pot').value=lib.spot.flopPot??'';$('lib-stack').value=lib.spot.flopStack??'';lib.lines=L.lines(lib.spot);$('lib-board').innerHTML=lib.spot.board.map(c=>{const s=C.cardText(c);return `<span class="board-slot s-${s[1]}" title="${s}">${s[0]}</span>`;}).join('');fillSelect('lib-node',Object.keys(lib.spot.nodes).map(n=>[n,n]));fillSelect('lib-line',lib.lines.map(l=>[l.id,l.label]));if(!lib.lines.length)fillSelect('lib-line',[['','No supported continuation']]);const turn=$('lib-turn').value;fillSelect('lib-turn',Array.from({length:52},(_,i)=>i).filter(i=>!lib.spot.board.includes(i)).sort((a,b)=>(b>>2)-(a>>2)||(a&3)-(b&3)).map(c=>[c,C.cardText(c)]));if(turn!==''&&[...$('lib-turn').options].some(o=>o.value===turn))$('lib-turn').value=turn;libBet();libRender();}
function libLine(){return lib.lines.find(l=>l.id===$('lib-line').value);}
function libBet(){const line=libLine(),pot=Number($('lib-pot').value);$('lib-bet-field').hidden=!line||line.pct===0;$('lib-bet').value=line&&line.pct&&pot>0?Math.max(1,Math.round(pot*line.pct/100)):'';libPreview();}
function libInput(){const line=libLine();if(!line)throw Error('This flop has no supported continuation.');return L.continuation(lib.spot,line,Number($('lib-turn').value),Number($('lib-pot').value),Number($('lib-stack').value),line.pct?Number($('lib-bet').value):0);}
function libPreview(){const line=libLine();$('lib-line-note').textContent=line?.note||'';try{const next=libInput();const counts=next.weights.map(w=>w.reduce((s,v)=>s+v,0));$('lib-preview').innerHTML=`<strong>Turn pot ${fmt(next.pot,0)} · stack ${fmt(next.stack,0)}</strong><br>${escapeHtml(line.positions[0])} (OOP): ${fmt(counts[0],2)} weighted combos<br>${escapeHtml(line.positions[1])} (IP): ${fmt(counts[1],2)} weighted combos`; $('lib-continue').disabled=false;}catch(e){$('lib-preview').textContent=e.message;$('lib-continue').disabled=true;}}
function libRender(){const node=lib.spot.nodes[$('lib-node').value],labels=L.actions(node),mass=node.weights.reduce((s,w)=>s+w,0),totals=labels.map((_,k)=>L.after(node,k).reduce((s,w)=>s+w,0));const is3=lib.spot.configuration==='3Bet_SB_BU';$('lib-node-actor').textContent=node.name.startsWith('vsCB')?(is3?'BTN · IP':'BB · OOP'):node.name.startsWith('vsSTAB')?'SB · OOP':node.name==='vsCheck'?'BTN · IP':is3?'SB · OOP':lib.spot.configuration==='2Bet_BU_BB'?'BTN · IP':lib.spot.configuration==='2Bet_UTG_BB'?'UTG · IP':'SOURCE NODE';
 $('lib-legend').innerHTML=labels.map((l,k)=>`<span class="legend-item"><i class="legend-color" style="background:${node.colors[k]}"></i>${escapeHtml(l)} <strong>${pct(mass?totals[k]/mass:0,1)}</strong></span>`).join('');
 const remainingMode=$('lib-frequency-view').value==='remaining',board=lib.spot.board,prob=id=>node.hands.get(id)?.f,order=labels.map((_,i)=>i),f=lib.filter,active=filtersActive(f),suitWeights=S.filterWeights(board,node.weights,{...f,handClass:null}),filtered=S.filterWeights(board,node.weights,f);
 renderFilters('lib-',f);
 $('lib-frequency-note').textContent=remainingMode?'Weighted combos / board-legal combos; gray = missing weight. Cells show source EV.':'Conditional action mix of the saved range; cells show source EV.';
 renderHandClasses($('lib-hand-classes'),board,suitWeights,prob,labels,node.colors,order,f.handClass);
 let html='';const blockers=new Set(board);for(let i=0;i<13;i++)for(let j=0;j<13;j++){
  const cat=categoryAt(i,j),ids=idsForCat(cat).filter(id=>!isBlocked(id,blockers)),a=S.aggregate(ids,filtered,prob,labels.length),values=remainingMode?Array.from(a.amounts,v=>ids.length?v/ids.length:0):a.frequencies,ev=S.sourceEV(ids,filtered,id=>node.hands.get(id));
  html+=`<button class="strategy-cell ${cat===lib.cat?'selected':''} ${a.mass?'':'unreached'} ${active?(a.mass?'filter-match':'filter-dim'):''}" data-lib-cat="${cat}" title="${cat} · ${fmt(a.mass,2)} / ${ids.length} weighted combos · Source EV ${evText(ev)}"><span class="cell-shading" style="background:${actionGradient(values,order,node.colors)}"></span><span class="cell-name">${cat}</span><span class="cell-ev">${evText(ev,1)}</span></button>`;
 }
 $('lib-matrix').innerHTML=html;$('lib-combo-cat').textContent=lib.cat;
 const details=idsForCat(lib.cat).filter(id=>!active||filtered[id]>0);
 $('lib-combos').innerHTML=!details.length?'<p class="muted">No matching combos in this hand.</p>':'<table class="combo-table"><thead><tr><th>COMBO</th><th>WEIGHT</th><th>FREQUENCY / SOURCE EV</th></tr></thead><tbody>'+details.map(id=>{const h=node.hands.get(id),[a,b]=C.ALL_COMBOS[id],w=node.weights[id];return `<tr><td>${cardHtml(a)} ${cardHtml(b)}</td><td>${pct(w,2)}</td><td>${w>0&&h?`<div class="lib-combo-action-gradient" style="background:${actionGradient(h.f,order,node.colors)}" role="img" aria-label="${escapeHtml(labels.map((l,k)=>l+' '+pct(h.f[k],2)).join(', '))}"></div>`+labels.map((l,k)=>`${escapeHtml(l)} ${pct(h.f[k],2)}${h.ev?' (EV '+fmt(h.ev[k],2)+')':''}`).join(' · '):'Not in range'}</td></tr>`;}).join('')+'</tbody></table>';
}
function showSource(){const s=view.source;const pos=s?.positions||s?.parent?.positions;for(const b of $('range-tabs').querySelectorAll('button')){const i=Number(b.dataset.player);b.textContent=(i?'IP':'OOP')+(pos?' · '+pos[i]:'');}$('continuation-source').hidden=!s;$('continuation-source').textContent=s?`${s.configuration? (L.names[s.configuration]||s.configuration)+' · ':''}${s.line}${s.note?' · '+s.note:''}`:'';}
function loadContinuation(next){if(next.turnEntryMode&&next.board.length===4)$('turn-entry-mode').value=next.turnEntryMode;if(next.riverEntryMode&&next.board.length===5)$('river-entry-mode').value=next.riverEntryMode;view.source=next.source;view.mode=next.board.length===4?'turn':'river';view.board=next.board.slice();view.weights=next.weights;view.slot=view.board.length-1;$('street-mode').value=view.mode;$('pot').value=next.pot;$('stack').value=next.stack;showSource();appTab('solver');setSolverTab('solve');renderBoard();renderRangeTab();invalidate('Continuation loaded. Review future betting settings and solve.');window.scrollTo(0,0);}
function libWire(){ wireFilters('lib-',lib,libRender); $('tab-library').onclick=()=>appTab('library');$('tab-solver').onclick=()=>appTab('solver');$('lib-config').onchange=libConfig;$('lib-flop').onchange=libSpot;$('lib-line').onchange=libBet;$('lib-node').onchange=libRender;$('lib-frequency-view').onchange=libRender;$('lib-matrix').onclick=e=>{const b=e.target.closest('[data-lib-cat]');if(b){lib.cat=b.dataset.libCat;libRender();}};
 $('lib-pot').oninput=libBet;$('lib-stack').oninput=libPreview;$('lib-bet').oninput=libPreview;$('lib-turn').onchange=libPreview;
 $('lib-continue').onclick=()=>{try{loadContinuation(libInput());}catch(e){notify(e.message,'error');}};
 $('lib-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{libInit(await file.text());notify('Flop library imported.','ok');}catch(err){notify('Import failed: '+err.message,'error');}e.target.value='';};
 $('continue-street').onclick=()=>{try{if(view.active)throw Error('Stop or finish the solve first.');const next=L.fromSolved(view.game,view.report,view.weights,view.node,view.parents);next.source.parent=view.source||null;loadContinuation(next);}catch(e){notify(e.message,'error');}};
 libInit(FLOP_LIBRARY_DATA);
}
function refreshContinue(){
 const n=getSelected(),parent=n&&view.parents[n.id]?.[0];
 const eligible=!!(n&&!n.terminal&&!n.chance&&parent!==undefined&&view.game.nodes[parent]?.chance&&view.report?.iteration&&!view.active);
 $('continue-street').hidden=!eligible;
 if(eligible){
  const missing=getPath(n.id).some(id=>{const p=view.game.nodes[id];return id!==n.id&&!p.terminal&&!p.chance&&!view.report.nodes[id];});
  $('continue-street').disabled=missing;
  $('continue-street').title=missing?'Loading exact strategies on the selected path…':'';
 }
}

function restoreSolution(data){
 const d=data?.config,r=data?.results;
 if(!d||!r||!Array.isArray(d.board)||!Array.isArray(d.ranges)||d.ranges.length!==2||
    !Number.isSafeInteger(r.iteration)||r.iteration<1||r.iteration>10000000||
    !Number.isFinite(r.exploitability)||r.exploitability<0||
    !Array.isArray(r.history)||r.history.length>10000||
    r.history.some(row=>!Array.isArray(row)||row.length!==2||!Number.isFinite(row[0])||!Number.isFinite(row[1])))
    throw Error('Not a TurnRiverLab solution file.');
 const board=d.board.map(C.cardId),w=d.ranges.map(range=>{const a=new Float64Array(1326);for(const h of range){const [x,y]=h.hand.map(C.cardId);if(x<0||y<0||x===y||!Number.isFinite(h.weight)||h.weight<0||h.weight>1)throw Error('Invalid saved range.');a[C.comboId(x,y)]=h.weight;}return a;});
 const cfg={board,pot:d.pot,stack:d.stack,useSuitIsomorphism:d.useSuitIsomorphism!==false,useRiverHandSymmetry:!!d.useRiverHandSymmetry,
  useActionFrequencyPruning:!!d.useActionFrequencyPruning,actionPruneThresholdPercent:d.actionPruneThresholdPercent,actionPruneWarmupPercent:d.actionPruneWarmupPercent,actionPruneWarmupIterations:d.actionPruneWarmupIterations,actionPruneRecheckIterations:d.actionPruneRecheckIterations,actionPrunePlannedIterations:d.actionPrunePlannedIterations,useRegretPruning:!!d.useRegretPruning,sizes0:d.oopBetSizesPercent,sizes1:d.ipBetSizesPercent,turnSizes0:d.oopTurnBetSizesPercent,turnSizes1:d.ipTurnBetSizesPercent,
  turnDonkSizes0:d.oopTurnDonkBetSizesPercent,turnEntryMode:d.turnEntryMode,flopDonkSizes0:d.oopFlopDonkBetSizesPercent,flopEntryMode:d.flopEntryMode,riverDonkSizes0:d.oopRiverDonkBetSizesPercent,riverEntryMode:d.riverEntryMode,flopSizes0:d.oopFlopBetSizesPercent,flopSizes1:d.ipFlopBetSizesPercent,raiseSizes0:d.oopRaiseSizesPercent,raiseSizes1:d.ipRaiseSizesPercent,turnRaiseSizes0:d.oopTurnRaiseSizesPercent,turnRaiseSizes1:d.ipTurnRaiseSizesPercent,flopRaiseSizes0:d.oopFlopRaiseSizesPercent,flopRaiseSizes1:d.ipFlopRaiseSizesPercent,flopTurnSamples:d.flopTurnSamples,flopRiverSamples:d.flopRiverSamples,maxRaises:d.maxRaises,allIn:d.allIn,equilibrium:d.equilibrium||'gto',gtoAlgorithm:d.gtoAlgorithm||'cfrplus',qreTemperaturePercent:d.qreTemperaturePercent||0.05,
  scheduledAlphaStart:d.scheduledAlphaStart??1,scheduledAlphaGain:d.scheduledAlphaGain??0.5,
  scheduledRampLength:d.scheduledRampLength??16,scheduledAveragingPower:d.scheduledAveragingPower??3,
  useAdaptiveConvergence:!!d.useAdaptiveConvergence,weights0:w[0],weights1:w[1],maxNodes:100000,memoryLimitBytes:Number($('memory-limit').value)*1048576};
 const g=C.makeGame(cfg);if(!Array.isArray(r.nodes)||r.nodes.length!==g.nodes.length||!Array.isArray(data.tree)||data.tree.length!==g.nodes.length)throw Error('Saved report does not match the game tree.');
 for(const n of g.nodes){const rec=r.nodes[n.id],old=data.tree[n.id];if(!old||old.id!==n.id||old.pot!==n.pot||JSON.stringify(old.history)!==JSON.stringify(n.history))throw Error('Saved tree differs from this engine.');if(n.terminal||n.chance)continue;if(!rec||rec.player!==n.p||!Array.isArray(rec.actions)||rec.actions.length!==n.actions.length||
   rec.actions.some(v=>!Number.isFinite(v)||v<0||v>1+1e-9)||
   !Array.isArray(rec.hands)||rec.hands.length!==g.players[n.p].ids.length||
   rec.hands.some((h,i)=>!Array.isArray(h)||h.length!==5||h[0]!==g.players[n.p].ids[i]||
    !Number.isFinite(h[1])||h[1]<0||
    !(h[2]===null||Number.isFinite(h[2]))||
    !Array.isArray(h[3])||h[3].length!==n.actions.length||h[3].some(v=>!Number.isFinite(v)||v<0||v>1+1e-9)||
    !Array.isArray(h[4])||h[4].length!==n.actions.length||h[4].some(v=>v!==null&&!Number.isFinite(v))))
    throw Error('Saved strategy does not match the game tree.');}
 cancel();clearOutput();view.board=board;view.mode=board.length===3?'flop':board.length===4?'turn':'river';view.weights=w;view.slot=board.length-1;view.source=data.source||null;
 $('street-mode').value=view.mode;$('pot').value=cfg.pot;$('stack').value=cfg.stack;$('solver-method').value=cfg.equilibrium;$('gto-algorithm').value=cfg.gtoAlgorithm;ensureAlgorithmVisible(cfg.gtoAlgorithm);updateSolverMethod();$('qre-temperature').value=cfg.qreTemperaturePercent;
 for(const [id,val] of [['scheduled-alpha-start',cfg.scheduledAlphaStart??1],['scheduled-alpha-gain',cfg.scheduledAlphaGain??0.5],
  ['scheduled-ramp-length',cfg.scheduledRampLength??16],['scheduled-averaging-power',cfg.scheduledAveragingPower??3]])$(id).value=val;
 $('adaptive-convergence').checked=!!cfg.useAdaptiveConvergence;updateSolverMethod();
 view.solveTargetPercent=Number.isFinite(d.targetExploitabilityPercent)&&d.targetExploitabilityPercent>=0?d.targetExploitabilityPercent:null;
 $('tolerance').value=view.solveTargetPercent??0.35;
 for(const [id,val] of [['sizes0',cfg.sizes0],['sizes1',cfg.sizes1],['turn-sizes0',cfg.turnSizes0??cfg.sizes0],['turn-sizes1',cfg.turnSizes1??cfg.sizes1],
 ['turn-donk-sizes0',cfg.turnDonkSizes0??[]],['flop-donk-sizes0',cfg.flopDonkSizes0??[]],['river-donk-sizes0',cfg.riverDonkSizes0??[]],['flop-sizes0',cfg.flopSizes0??cfg.turnSizes0??cfg.sizes0],['flop-sizes1',cfg.flopSizes1??cfg.turnSizes1??cfg.sizes1],['raise-sizes0',cfg.raiseSizes0??cfg.sizes0],['raise-sizes1',cfg.raiseSizes1??cfg.sizes1],['turn-raise-sizes0',cfg.turnRaiseSizes0??cfg.turnSizes0??cfg.sizes0],['turn-raise-sizes1',cfg.turnRaiseSizes1??cfg.turnSizes1??cfg.sizes1],['flop-raise-sizes0',cfg.flopRaiseSizes0??cfg.flopSizes0??cfg.turnSizes0??cfg.sizes0],['flop-raise-sizes1',cfg.flopRaiseSizes1??cfg.flopSizes1??cfg.turnSizes1??cfg.sizes1]])$(id).value=(val||[]).join(', ');
 $('turn-entry-mode').value=cfg.turnEntryMode||'normal';$('flop-entry-mode').value=cfg.flopEntryMode||'normal';$('river-entry-mode').value=cfg.riverEntryMode||'normal';
 $('suit-isomorphism').checked=cfg.useSuitIsomorphism!==false;
 $('river-hand-symmetry').checked=!!cfg.useRiverHandSymmetry;
 $('action-frequency-pruning').checked=!!cfg.useActionFrequencyPruning;
 $('action-prune-threshold').value=cfg.actionPruneThresholdPercent??1;
 $('action-prune-warmup').value=cfg.actionPruneWarmupPercent??20;
 $('action-prune-recheck').value=cfg.actionPruneRecheckIterations??100;
 view.fixedActionWarmup=cfg.useActionFrequencyPruning?cfg.actionPruneWarmupIterations??null:null;
 view.fixedPrunePlanned=cfg.useActionFrequencyPruning?cfg.actionPrunePlannedIterations??null:null;
 $('regret-pruning').checked=!!cfg.useRegretPruning;$('zero-reach-pruning').checked=!!cfg.useZeroReachPruning;$('enable-profile').checked=!!cfg.profileEnabled; $('flop-turn-samples').value=cfg.flopTurnSamples||8;$('flop-river-samples').value=cfg.flopRiverSamples||6;$('raises').value=cfg.maxRaises;$('allin').checked=cfg.allIn;$('max-nodes').value=Math.max(18000,g.nodes.length);$('iterations').value=r.iteration;view.limit=r.iteration;
 view.fullReportReady=true;view.game=g;view.parents=new Array(g.nodes.length).fill(null);for(const n of g.nodes)if(!n.terminal){for(const a of n.chance?n.runouts:n.actions)view.parents[a.child]=[n.id,a.label];}
 $('tree-node-count').textContent=g.nodes.length+' NODES';appTab('solver');setSolverTab('tree');showSource();renderBoard();renderRangeTab();updateReport(r,'finished');$('save-local').disabled=false;setStatus('SAVED SOLUTION','complete');$('progress-text').textContent='Saved result loaded';notify(d.gtoAlgorithm==='dcfr-2-0.5-2'&&d.algorithmRevision!=='dcfr-2-0.5-2-quadratic-v2'?
 'Legacy DCFR 2/0.5/2 solution loaded: before v16.2 this method used linear averaging. Displayed results remain historical; re-solve for corrected quadratic averaging.':
 'Saved solution loaded. Browse strategy or continue from a new street.',
 d.gtoAlgorithm==='dcfr-2-0.5-2'&&d.algorithmRevision!=='dcfr-2-0.5-2-quadratic-v2'?'warn':'ok');
}
let savedDB=null;
function dbOpen(){if(!savedDB)savedDB=new Promise((resolve,reject)=>{const req=indexedDB.open('TurnRiverLab-solutions-v1',2);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains('solutions'))db.createObjectStore('solutions',{keyPath:'id'});const catalog=db.createObjectStore('catalog',{keyPath:'id'});const cursor=req.transaction.objectStore('solutions').openCursor();cursor.onsuccess=()=>{const c=cursor.result;if(c){catalog.put({id:c.value.id,label:c.value.label});c.continue();}};};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});return savedDB;}
async function dbRequest(mode,fn,store='solutions'){const db=await dbOpen();return new Promise((resolve,reject)=>{const tx=db.transaction([store],mode),req=fn(tx.objectStore(store));tx.oncomplete=()=>resolve(req.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Storage transaction aborted.'));});}
async function dbWrite(row,id){const db=await dbOpen();return new Promise((resolve,reject)=>{const tx=db.transaction(['solutions','catalog'],'readwrite');if(row){tx.objectStore('solutions').put(row);tx.objectStore('catalog').put({id:row.id,label:row.label});}else{tx.objectStore('solutions').delete(id);tx.objectStore('catalog').delete(id);}tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Storage transaction aborted.'));});}
async function refreshSaved(){try{const rows=await dbRequest('readonly',s=>s.getAll(),'catalog');fillSelect('saved-select',rows.sort((a,b)=>b.id.localeCompare(a.id)).map(r=>[r.id,r.label]));$('saved-row').hidden=!rows.length;}catch(e){$('saved-row').hidden=true;}}
function downloadCheckpoint(snapshot){
 try{
  const cfg=view.activeConfig||config();const buffer=checkpointCodec.encode(snapshot,cfg);
  const url=URL.createObjectURL(new Blob([buffer],{type:'application/octet-stream'}));
  const a=document.createElement('a');a.href=url;a.download='TurnRiverLab-'+cfg.board.map(C.cardText).join('-')+'-'+snapshot.iteration+'.trlc';
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
  notify('Checkpoint saved. This contains the complete numerical state, not just the displayed solution.');
 }catch(e){notify('Checkpoint download failed: '+e.message,'error');}
}
function applyCheckpointConfig(cfg){
 if(!Array.isArray(cfg.board)||![3,4,5].includes(cfg.board.length))throw Error('Checkpoint has an invalid board');
 cancel();view.board=cfg.board.slice();view.weights=[Float64Array.from(cfg.weights0),Float64Array.from(cfg.weights1)];
 view.mode=cfg.board.length===3?'flop':cfg.board.length===4?'turn':'river';view.slot=view.board.length-1;
 $('street-mode').value=view.mode;$('pot').value=cfg.pot;$('stack').value=cfg.stack;
 $('solver-method').value=cfg.equilibrium;$('gto-algorithm').value=cfg.gtoAlgorithm||'cfrplus';ensureAlgorithmVisible(cfg.gtoAlgorithm||'cfrplus');$('qre-temperature').value=cfg.qreTemperaturePercent||.05;
 for(const [id,val] of [['scheduled-alpha-start',cfg.scheduledAlphaStart??1],['scheduled-alpha-gain',cfg.scheduledAlphaGain??0.5],
  ['scheduled-ramp-length',cfg.scheduledRampLength??16],['scheduled-averaging-power',cfg.scheduledAveragingPower??3]])$(id).value=val;
 $('adaptive-convergence').checked=!!cfg.useAdaptiveConvergence;updateSolverMethod();
 const fields={'sizes0':cfg.sizes0,'sizes1':cfg.sizes1,'turn-sizes0':cfg.turnSizes0,'turn-sizes1':cfg.turnSizes1,
 'turn-donk-sizes0':cfg.turnDonkSizes0??[],
 'flop-donk-sizes0':cfg.flopDonkSizes0??[],
 'river-donk-sizes0':cfg.riverDonkSizes0??[],
 'flop-sizes0':cfg.flopSizes0,'flop-sizes1':cfg.flopSizes1,'raise-sizes0':cfg.raiseSizes0,'raise-sizes1':cfg.raiseSizes1,
 'turn-raise-sizes0':cfg.turnRaiseSizes0,'turn-raise-sizes1':cfg.turnRaiseSizes1,
 'flop-raise-sizes0':cfg.flopRaiseSizes0,'flop-raise-sizes1':cfg.flopRaiseSizes1};
 for(const [id,v] of Object.entries(fields))if(Array.isArray(v))$(id).value=v.join(', ');
 $('flop-turn-samples').value=cfg.flopTurnSamples||8;$('flop-river-samples').value=cfg.flopRiverSamples||6;
 $('raises').value=cfg.maxRaises;$('allin').checked=cfg.allIn;
 $('max-nodes').value=cfg.maxNodes;$('memory-limit').value=Math.min(4096,Math.max(2,Math.ceil(cfg.memoryLimitBytes/1048576)||128));
 $('turn-entry-mode').value=cfg.turnEntryMode||'normal';$('flop-entry-mode').value=cfg.flopEntryMode||'normal';$('river-entry-mode').value=cfg.riverEntryMode||'normal';
 $('suit-isomorphism').checked=cfg.useSuitIsomorphism!==false;
 $('river-hand-symmetry').checked=!!cfg.useRiverHandSymmetry;
 $('action-frequency-pruning').checked=!!cfg.useActionFrequencyPruning;
 $('action-prune-threshold').value=cfg.actionPruneThresholdPercent??1;
 $('action-prune-warmup').value=cfg.actionPruneWarmupPercent??20;
 $('action-prune-recheck').value=cfg.actionPruneRecheckIterations??100;
 view.fixedActionWarmup=cfg.useActionFrequencyPruning?cfg.actionPruneWarmupIterations??null:null;
 view.fixedPrunePlanned=cfg.useActionFrequencyPruning?cfg.actionPrunePlannedIterations??null:null;
 $('regret-pruning').checked=!!cfg.useRegretPruning;$('zero-reach-pruning').checked=!!cfg.useZeroReachPruning;$('enable-profile').checked=!!cfg.profileEnabled;
 updateSolverMethod();renderBoard();renderRangeTab();makeLocalGame();appTab('solver');setSolverTab('solve');
}
function checkpointWire(){
 $('save-checkpoint').onclick=()=>{
  if(view.worker)view.worker.postMessage({type:'checkpoint'});
  else if(view.fallback?.solver)downloadCheckpoint(view.fallback.solver.saveCheckpoint());
  else notify('No live numerical state to checkpoint. Start solving first.','warn');
 };
 $('open-checkpoint').onchange=async e=>{
  const file=e.target.files?.[0];e.target.value='';if(!file)return;
  try{
   const cp=checkpointCodec.decode(await file.arrayBuffer());
   if(cp.checkpoint.iteration>=10000000)throw Error('The checkpoint has reached the iteration limit');
   applyCheckpointConfig(cp.config);
   $('iterations').value=Math.max(Number($('iterations').value)||0,cp.checkpoint.iteration+100);
   startSolver(cp.checkpoint);
   notify('Resuming exact numerical checkpoint at iteration '+cp.checkpoint.iteration+'.');
  }catch(error){notify('Could not resume checkpoint: '+error.message,'error');}
 };
}
function storageWire(){refreshSaved();$('save-local').onclick=async()=>{try{notify('Preparing full strategy report for local save…');await ensureFullReport();const d=solutionData();if(!d||view.active)throw Error('Finish or stop the solve first.');const id=new Date().toISOString(),label=d.config.board.join(' ')+' · '+(d.source?.line||d.config.mode)+' · '+d.results.iteration+' iter';await dbWrite({id,label,data:d});await refreshSaved();notify('Solution saved in this browser. Export JSON for a portable backup.');}catch(e){notify('Local save unavailable: '+e.message+'. Use Export JSON instead.','warn');}};
 $('load-local').onclick=async()=>{try{const row=await dbRequest('readonly',s=>s.get($('saved-select').value));if(!row)throw Error('Saved solution not found.');restoreSolution(row.data);}catch(e){notify(e.message,'error');}};
 $('delete-local').onclick=async()=>{try{await dbWrite(null,$('saved-select').value);await refreshSaved();notify('Saved solution removed.');}catch(e){notify(e.message,'error');}};
 $('open-solution').onchange=async e=>{try{if(e.target.files[0])restoreSolution(JSON.parse(await e.target.files[0].text()));}catch(err){notify('Cannot open solution: '+err.message,'error');}e.target.value='';};
}

function wire(){
 checkpointWire();
 $('solver-tabs').addEventListener('click',e=>{const tab=e.target.closest('[role="tab"]');if(tab)setSolverTab(tab.id==='tab-solve'?'solve':'tree');});
 $('solver-tabs').addEventListener('keydown',e=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
  e.preventDefault();setSolverTab(e.key==='ArrowLeft'||e.key==='Home'?'solve':'tree',true);
 });
 $('diagnostics-toggle').addEventListener('toggle',()=>{if($('diagnostics-toggle').open)drawChart(view.report?.history||[]);});
 $('street-mode').addEventListener('change',e=>{
  view.source=null;showSource();view.mode=e.target.value;
  const length=view.mode==='flop'?3:view.mode==='turn'?4:5;
  view.board=view.board.slice(0,length);
  for(const id of ['9s','2c','7d','Ks','4h'].map(C.cardId))if(view.board.length<length&&!view.board.includes(id))view.board.push(id);
  while(view.board.length<length)view.board.push(Array.from({length:52},(_,i)=>i).find(i=>!view.board.includes(i)));
  view.slot=0;renderBoard();renderRangeTab();invalidate('Street mode changed. Choose board cards and solve.');
 });
 $('board-cards').addEventListener('click',e=>{const b=e.target.closest('[data-slot]');if(!b)return;view.slot=Number(b.dataset.slot);renderBoard();});
 $('deck').addEventListener('click',e=>{const b=e.target.closest('[data-card]');if(!b)return;const id=Number(b.dataset.card);
  if(view.board.includes(id)&&view.board[view.slot]!==id){notify(`${C.cardText(id)} is already on the board. Choose an unused card.`,'warn');return;}
  if(view.board[view.slot]===id){view.slot=(view.slot+1)%view.board.length;renderBoard();return;}
  view.source=null;showSource();view.board[view.slot]=id;view.slot=(view.slot+1)%view.board.length;renderBoard();renderRangeTab();invalidate('Board changed. Previous results cleared; blocker-aware ranges recalculated.');
 });
 $('range-tabs').addEventListener('click',e=>{const b=e.target.closest('[data-player]');if(!b)return;view.rangeP=Number(b.dataset.player);renderRangeTab();});
 $('range-matrix').addEventListener('click',e=>{const b=e.target.closest('[data-cat]');if(!b)return;view.rangeCat=b.dataset.cat;renderRangeMatrix();renderRangeDetails();});
 $('range-freq').addEventListener('input',e=>{view.source=null;showSource();const w=Number(e.target.value)/100,set=boardSet();for(const id of idsForCat(view.rangeCat))if(!isBlocked(id,set))view.weights[view.rangeP][id]=w;
  $('range-freq-label').textContent=Math.round(w*100)+'%';renderRangeMatrix();renderRangeDetails();invalidate('Range frequency edited. Previous results cleared.');});
 $('range-combos').addEventListener('input',e=>{const b=e.target.closest('[data-combo]');if(!b)return;view.source=null;showSource();view.weights[view.rangeP][Number(b.dataset.combo)]=Number(b.value)/100;
  const valueLabel=b.closest('.combo-edit').querySelector('span:last-child');if(valueLabel)valueLabel.textContent=b.value+'%';
  const valid=idsForCat(view.rangeCat).filter(id=>!isBlocked(id,boardSet()));
  const mean=valid.length?valid.reduce((sum,id)=>sum+view.weights[view.rangeP][id],0)/valid.length:0;
  $('range-freq').value=Math.round(mean*100);$('range-freq-label').textContent=fmt(mean*100,0)+'%';
  renderRangeMatrix();invalidate('Individual suit-combination weight edited. Previous results cleared.');});
 $('apply-preset').addEventListener('click',()=>{view.source=null;showSource();const chosen=$('preset').value;view.weights[view.rangeP]=profile(chosen,view.rangeP);renderRangeTab();invalidate(`${view.rangeP===0?'OOP':'IP'} ${chosen} range loaded.`);});
 $('solver-method').addEventListener('change',()=>{updateSolverMethod();invalidate('Solution method changed. Solve to calculate a new equilibrium.');});
 $('gto-algorithm').addEventListener('change',()=>{ensureAlgorithmVisible($('gto-algorithm').value);updateSolverMethod();invalidate('GTO algorithm changed. Solve to calculate a new strategy.');});
 $('show-experimental-algorithms').addEventListener('change',e=>{
   // Never silently replace an active experimental algorithm with CFR+.
   const selected=$('gto-algorithm').value;
   if(!e.target.checked&&Array.from($('gto-experimental-options').querySelectorAll('option')).some(o=>o.value===selected)){
     setExperimentalAlgorithmVisibility(true);
     notify('This solve uses an experimental algorithm. Choose a recommended method before hiding the others.','warn');
   }else setExperimentalAlgorithmVisibility(e.target.checked);
 });
 for(const id of ['qre-temperature','pot','stack','sizes0','sizes1','turn-sizes0','turn-sizes1','turn-donk-sizes0','turn-entry-mode','flop-donk-sizes0','flop-entry-mode','river-donk-sizes0','river-entry-mode','flop-sizes0','flop-sizes1','raise-sizes0','raise-sizes1','turn-raise-sizes0','turn-raise-sizes1','flop-raise-sizes0','flop-raise-sizes1','flop-turn-samples','flop-river-samples','raises','max-nodes','allin','memory-limit','suit-isomorphism','river-hand-symmetry','action-frequency-pruning','action-prune-threshold','action-prune-warmup','action-prune-recheck','scheduled-alpha-start','scheduled-alpha-gain','scheduled-ramp-length','scheduled-averaging-power','adaptive-convergence','zero-reach-pruning','enable-profile'])$(id).addEventListener('change',()=>{if(id==='pot'||id==='stack'){view.source=null;showSource();}if(id.startsWith('action-prune')){view.fixedActionWarmup=null;view.fixedPrunePlanned=null;}renderBoard();invalidate('Betting configuration changed. Solver and tree rebuilt.');});
 $('solve-console-copy').addEventListener('click',async()=>{
  const text=view.solveLog;if(!text)return;
  try{
   if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(text);
   else {
    const area=document.createElement('textarea');area.value=text;area.style.position='fixed';area.style.opacity='0';
    document.body.appendChild(area);area.select();const copied=document.execCommand('copy');area.remove();
    if(!copied)throw Error('Clipboard is unavailable');
   }
   notify('Completed-solve console copied to clipboard.');
  }catch(_){notify('Clipboard unavailable. Select the console text and copy it manually.','warn');}
 });
 $('solve').addEventListener('click',()=>startSolver());$('benchmark-all').addEventListener('click',startBenchmark);
 $('stop').addEventListener('click',stopSolver);
 $('benchmark-copy').addEventListener('click',()=>copyBenchmark());
 $('benchmark-csv').addEventListener('click',exportBenchmarkCSV);
 $('reset').addEventListener('click',()=>invalidate('Solver reset. Configuration and custom ranges were preserved.'));
 $('export').addEventListener('click',exportJSON);
 wireFilters('',view,renderExplorer);
 $('frequency-view').addEventListener('change',renderExplorer);
 $('strategy-matrix').addEventListener('click',e=>{const b=e.target.closest('[data-vcat]');if(!b)return;view.viewCat=b.dataset.vcat;renderExplorer();});
 $('tree-breadcrumb').addEventListener('click',e=>{const b=e.target.closest('[data-node]');if(!b)return;view.node=Number(b.dataset.node);renderExplorer();renderTree();requestSelectedDetails();});
 $('tree-actions').addEventListener('click',e=>{const b=e.target.closest('[data-next]');if(!b)return;view.node=Number(b.dataset.next);renderExplorer();renderTree();requestSelectedDetails();});
 window.addEventListener('resize',()=>drawChart(view.report?.history||[]));
}
function init(){
 view.weights[0]=profile('example',0);view.weights[1]=profile('example',1);
 wire();libWire();storageWire();updateSolverMethod();setSolverTab('solve');renderBoard();renderRangeTab();makeLocalGame();renderExplorer();renderTree();
}
init();
})();
