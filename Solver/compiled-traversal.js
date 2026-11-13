/* v8 compiled Float64 game-tree traversal and exact best responses. */
function createCompiledTraversal(game, base64, limitBytes) {
  'use strict';
  limitBytes=Number(limitBytes)||0;
  if(typeof WebAssembly==='undefined'||typeof atob!=='function'||!game.stateStorage)return null;
  let raw=atob(base64),binary=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++)binary[i]=raw.charCodeAt(i);
  let simdEnabled=WebAssembly.validate(binary);
  if(!simdEnabled){
    if(typeof WASM_TRAVERSAL_BYTES_SCALAR!=='string')return null;
    raw=atob(WASM_TRAVERSAL_BYTES_SCALAR);binary=new Uint8Array(raw.length);
    for(let i=0;i<raw.length;i++)binary[i]=raw.charCodeAt(i);
    if(!WebAssembly.validate(binary))return null;
  }
  const stateSize=game.stateStorage.length;
  // Avoid a large fixed mobile allocation: cover state plus a bounded arena
  // for live reach/CFV vectors. Fall back to JS when the arena is exhausted.
  const n0=game.players[0].ids.length,n1=game.players[1].ids.length,maxN=Math.max(n0,n1);
  const memo=new Map();
  function maxDepth(id,p){
    const key=id*2+p;if(memo.has(key))return memo.get(key);
    const node=game.nodes[id];if(node.terminal)return 0;
    const children=node.chance?(node.isoGroups?node.isoGroups.map(g=>g.representative.child):node.runouts.map(r=>r.child)):
      node.actions.map(a=>a.child);
    const own=node.chance?3*maxN*8:node.actions.length===1?0:
      node.p===p?(node.actions.length+2)*maxN*8:3*maxN*8;
    let rest=0;for(const child of children)rest=Math.max(rest,maxDepth(child,p));
    const result=own+rest;memo.set(key,result);return result;
  }
  const scratchBudget=Math.max(2*1024*1024,maxDepth(game.root,0)+maxDepth(game.root,1)+1024*1024);
  let layouts=0,runouts=0;
  for(const pair of game.riverPayoffLayouts.values())for(const l of pair)
    for(const key of ['mineOrder','oppOrder','groupStart','weakEnd','tieEnd'])layouts+=l[key].byteLength+16;
  for(const node of game.nodes)if(node.chance)runouts+=node.runouts.length;
  const staticBudget=1048576+game.nodes.length*160+runouts*64+layouts+maxN*24;
  const bytes=131072+stateSize*8+staticBudget+scratchBudget;
  const pages=Math.ceil(bytes/65536);
  // The worker's memory budget also applies to compiled scratch capacity.
  // Refuse optional compilation instead of exceeding a mobile allocation limit.
  const actualBytes=pages*65536;
  if(limitBytes>0&&game.memory+actualBytes-stateSize*8>limitBytes)return null;
  const memory=new WebAssembly.Memory({initial:pages,maximum:pages});
  const module=new WebAssembly.Module(binary);
  const instance=new WebAssembly.Instance(module,{env:{memory,host_log:Math.log,host_exp:Math.exp}});
  const storage=new Float64Array(memory.buffer,131072,stateSize);
  storage.set(game.stateStorage);
  function migrate(arr){return new Float64Array(memory.buffer,131072+arr.byteOffset,arr.length);}
  for(const node of game.nodes)if(!node.terminal&&!node.chance&&!node.isoAlias){
    node.regret=migrate(node.regret);node.averageSum=migrate(node.averageSum);
    node.current=migrate(node.current);
    if(node.qreLog){node.qreLog=migrate(node.qreLog);node.qreEntropy=migrate(node.qreEntropy);}
    if(node.previousDelta)node.previousDelta=migrate(node.previousDelta);
  }
  game.stateStorage=storage;
  game.memory+=actualBytes-stateSize*8;
  const start=131072+stateSize*8;
  let used=start;
  function allocate(bytes,align){
    used=Math.ceil(used/align)*align;
    if(used+bytes>memory.buffer.byteLength)return null;
    const addr=used;used+=bytes;return addr;
  }
  const decisions=game.nodes.filter(n=>!n.terminal&&!n.chance&&!n.isoAlias);
  const metaAddr=allocate(decisions.length*6*4,4);
  if(metaAddr===null)return null;
  const meta=new Int32Array(memory.buffer,metaAddr,decisions.length*6);
  for(let i=0;i<decisions.length;i++){
    const node=decisions[i],o=i*6;
    meta[o]=node.p;meta[o+1]=game.players[node.p].ids.length;
    meta[o+2]=node.actions.length;meta[o+3]=node.regret.byteOffset;
    meta[o+4]=node.current.byteOffset;meta[o+5]=node.id;
  }
  let maxActions=1;
  for(const node of decisions)if(node.actions.length>maxActions)maxActions=node.actions.length;
  const actionPtr=allocate(maxActions*4,4);
  if(actionPtr===null)return null;
  const actionOffsets=new Int32Array(memory.buffer,actionPtr,maxActions);
  function allocVector(n){
    const addr=allocate(n*8,8);
    return addr===null?new Float64Array(n):new Float64Array(memory.buffer,addr,n);
  }
  const exports=instance.exports;
  let full=null,variantNodePtr=0;
  if(typeof exports.full_traverse==='function')try{
    const cache=new WeakMap();
    function copyTyped(array){
      if(!array)return 0;if(cache.has(array))return cache.get(array);
      const offset=allocate(array.byteLength,Math.min(array.BYTES_PER_ELEMENT,8));
      if(offset===null)throw Error('No WASM space for tree metadata');
      new Uint8Array(memory.buffer,offset,array.byteLength).set(new Uint8Array(array.buffer,array.byteOffset,array.byteLength));
      cache.set(array,offset);return offset;
    }
    function ints(array){return copyTyped(Int32Array.from(array));}
    function double(value){return copyTyped(Float64Array.of(value));}
    const playerMeta=[];
    for(const p of game.players)playerMeta.push(p.ids.length,copyTyped(p.card0),copyTyped(p.card1),copyTyped(p.opponentIndex));
    const playerPtr=ints(playerMeta);
    const layoutCache=new WeakMap();
    function layoutPtr(layout){
      if(!layout)return 0;if(layoutCache.has(layout))return layoutCache.get(layout);
      const o=ints([copyTyped(layout.mineOrder),copyTyped(layout.oppOrder),copyTyped(layout.groupStart),
        copyTyped(layout.weakEnd),copyTyped(layout.tieEnd),layout.weakEnd.length]);
      layoutCache.set(layout,o);return o;
    }
    const maps=new WeakMap();
    function mapPtr(m){if(!m)return 0;if(!maps.has(m))maps.set(m,copyTyped(m));return maps.get(m);}
    const rows=[];
    for(const node of game.nodes){
      const kind=node.terminal?0:node.chance?2:1;
      let childPtr=0,ng=0,groupPtr=0;
      if(kind===1)childPtr=ints(node.actions.map(a=>a.child));
      if(kind===2){
        const groups=node.isoGroups||node.runouts.map(o=>({representative:o,members:[{outcome:o,maps:null}]}));
        const values=[];
        for(const group of groups){
          const members=[];
          for(const m of group.members)members.push(mapPtr(m.maps?.[0]),mapPtr(m.maps?.[1]));
          const rep=group.representative;
          values.push(rep.child,rep.card??rep.river,ints(members),group.members.length,double(rep.weight??1/44));
        }
        ng=groups.length;groupPtr=ints(values);
      }
      const payoffs=node.riverPayoff;
      rows.push(kind,node.p??-1,node.actions?.length??0,childPtr,ng,groupPtr,
        node.current?.byteOffset??0,node.regret?.byteOffset??0,node.averageSum?.byteOffset??0,
        node.qreEntropy?.byteOffset??0,node.qreLog?.byteOffset??0,
        copyTyped(node.valid?.[0]),copyTyped(node.valid?.[1]),
        layoutPtr(payoffs?.[0]),layoutPtr(payoffs?.[1]),
        node.terminal&&node.type==='fold'?node.winner:-1,
        node.c?.[0]??0,node.c?.[1]??0,node.turn??-1,node.river??-1,
        node.previousDelta?.byteOffset??0);
    }
    const nodePtr=ints(rows),reachPtrs=[],outPtrs=[],ownPtrs=[];
    variantNodePtr=nodePtr;
    for(let p=0;p<2;p++){
      reachPtrs[p]=allocate(game.players[1-p].ids.length*8,8);
      outPtrs[p]=allocate(game.players[p].ids.length*8,8);
      ownPtrs[p]=allocate(game.players[p].ids.length*8,8);
      if(reachPtrs[p]===null||outPtrs[p]===null||ownPtrs[p]===null)throw Error('No WASM traversal space');
    }
    // Parent paths are structural metadata only; no second numerical game.
    // Follow full uncompressed runouts when computing the reach of a selected
    // canonical decision, even if solving used exact suit-isomorphic orbits.
    const parents=new Array(game.nodes.length);
    for(const node of game.nodes)if(!node.terminal){
      const edges=node.chance?node.runouts:node.actions;
      for(let k=0;k<edges.length;k++)parents[edges[k].child]=[node.id,k];
    }
    const handIndices=game.players.map(p=>new Map(Array.from(p.ids,(id,i)=>[id,i])));
    function averageChancePolicy(node,hand,k){
      const a=node.actions.length,off=hand*a;
      let sum=0;for(let j=0;j<a;j++)sum+=node.averageSum[off+j];
      return sum>0?node.averageSum[off+k]/sum:node.current[off+k];
    }
    const workspaceStart=Math.ceil(used/8)*8;
    if(memory.buffer.byteLength-workspaceStart<scratchBudget-512*1024)throw Error('WASM workspace too small');
    full={run(id,target,reach,weight){
      if(typeof exports.set_zero_reach_pruning==='function')exports.set_zero_reach_pruning(game.zeroReachPruning?1:0);
      new Float64Array(memory.buffer,reachPtrs[target],reach.length).set(reach);
      if(!exports.full_traverse(nodePtr,playerPtr,id,target,game.equilibrium==='qre'?1:0,
          game.qreTemperature,game.pot,weight,reachPtrs[target],outPtrs[target],
          weight?ownPtrs[target]:0,workspaceStart,memory.buffer.byteLength,
          (['dcfr','dcfr-scheduled','dcfr-adaptive','dcfr-predictive'].includes(game.gtoAlgorithm))? (game.gtoAlgorithm==='dcfr-predictive'?3:1):game.gtoAlgorithm==='optimistic'?2:0,
          game._positiveDiscount||1,game._negativeDiscount||1))
        throw Error('WASM traversal scratch overflow');
      return Float64Array.from(new Float64Array(memory.buffer,outPtrs[target],game.players[target].ids.length));
    },
    exactBest(target,regularizedBest){
      if(typeof exports.set_zero_reach_pruning==='function')exports.set_zero_reach_pruning(game.zeroReachPruning?1:0);
      const reach=game.players[1-target].priors;
      new Float64Array(memory.buffer,reachPtrs[target],reach.length).set(reach);
      if(!exports.exact_best_response(nodePtr,playerPtr,game.root,target,regularizedBest?1:0,
          game.qreTargetTemperature||0,game.pot,reachPtrs[target],outPtrs[target],
          workspaceStart,memory.buffer.byteLength))throw Error('WASM best-response scratch overflow');
      const v=new Float64Array(memory.buffer,outPtrs[target],game.players[target].ids.length);
      let total=0,priors=game.players[target].priors;
      for(let i=0;i<v.length;i++)total+=priors[i]*v[i];
      return total/game.jointZ;
    },
    profileVector(target,id,reach){
      if(typeof exports.set_zero_reach_pruning==='function')exports.set_zero_reach_pruning(game.zeroReachPruning?1:0);
      if(typeof exports.profile_evaluate!=='function')throw Error('Native profile evaluator unavailable');
      new Float64Array(memory.buffer,reachPtrs[target],reach.length).set(reach);
      if(!exports.profile_evaluate(nodePtr,playerPtr,id,target,game.pot,
          reachPtrs[target],outPtrs[target],workspaceStart,memory.buffer.byteLength))
        throw Error('WASM profile EV scratch overflow');
      return Float64Array.from(new Float64Array(memory.buffer,outPtrs[target],game.players[target].ids.length));
    },
    profileEV(target){
      const v=this.profileVector(target,game.root,game.players[1-target].priors);
      const priors=game.players[target].priors;let value=0;
      for(let i=0;i<v.length;i++)value+=priors[i]*v[i];
      return value/game.jointZ;
    },
    nodeDetail(id){
      const node=game.nodes[id];
      if(!node||node.terminal||node.chance)return null;
      const target=node.p,mine=game.players[target],opp=game.players[1-target];
      if(node.isoAlias){
        const source=this.nodeDetail(node.isoAlias.source);
        const map=node.isoAlias.map,idx=handIndices[target];
        return {...source,id,player:target,hands:source.hands.map(h=>{
          const i=idx.get(h[0]);return [mine.ids[map[i]],h[1],h[2],h[3].slice(),h[4].slice()];
        })};
      }
      const path=[];let cursor=id;
      while(cursor!==game.root){
        const item=parents[cursor];if(!item)throw Error('Selected node has no root path');
        path.push(item);cursor=item[0];
      }
      let oppReach=Float64Array.from(opp.priors),ownReach=new Float64Array(mine.ids.length).fill(1);
      for(let t=path.length-1;t>=0;t--){
        const [parentId,k]=path[t],parent=game.nodes[parentId];
        if(parent.chance){
          const outcome=parent.runouts[k],card=outcome.card??outcome.river;
          const weight=outcome.weight??(1/44),allowedOpp=opp.cardAllowed[card],allowedOwn=mine.cardAllowed[card];
          for(let i=0;i<oppReach.length;i++)oppReach[i]=allowedOpp[i]?oppReach[i]*weight:0;
          for(let i=0;i<ownReach.length;i++)if(!allowedOwn[i])ownReach[i]=0;
        }else if(parent.p===target){
          for(let i=0;i<ownReach.length;i++)ownReach[i]*=averageChancePolicy(parent,i,k);
        }else{
          for(let i=0;i<oppReach.length;i++)oppReach[i]*=averageChancePolicy(parent,i,k);
        }
      }
      const a=node.actions.length;
      const acts=node.actions.map(edge=>this.profileVector(target,edge.child,oppReach));
      // Keep the exact blocker-mass implementation and numerical cutoff used
      // by full JavaScript reports; the expensive continuation EVs above are
      // evaluated wholly inside the compiled native tree engine.
      const mass=game.coreCompatibilityMass(target,oppReach,node);
      let numerator=0,denom=0;const agg=new Float64Array(a),hands=[];
      const cutoff=game.equilibrium==='qre'?1e-200:1e-14;
      const offset=game.pot/2+node.c[target];
      const shifted=v=>Math.abs(v+offset)<1e-9?0:v+offset;
      for(let i=0;i<mine.ids.length;i++){
        let value=0;const probabilities=[],actionEV=[];
        for(let k=0;k<a;k++){
          const p=averageChancePolicy(node,i,k);
          probabilities.push(p);value+=p*acts[k][i];
        }
        const m=mass[i],weight=mine.priors[i]*ownReach[i]*m;
        numerator+=mine.priors[i]*ownReach[i]*value;denom+=weight;
        for(let k=0;k<a;k++){
          agg[k]+=weight*probabilities[k];
          actionEV.push(m>cutoff?(node.actions[k].type==='fold'?0:shifted(acts[k][i]/m)):null);
        }
        hands.push([mine.ids[i],weight,m>cutoff?shifted(value/m):null,probabilities,actionEV]);
      }
      for(const h of hands)h[1]=denom>cutoff?h[1]/denom:0;
      return {id,player:target,rangeEV:denom>cutoff?shifted(numerator/denom):null,
        reachMass:denom/game.jointZ,actions:denom>cutoff?Array.from(agg,v=>v/denom):Array(a).fill(0),hands};
    }};
  }catch(_){full=null;}
  return {
    memory,mode:full?'wasm-full-tree-f64':'wasm-f64',simd:simdEnabled&&typeof exports.kernel_features==='function'&&exports.kernel_features()===1,fullTraversal:!!full,
    traverse:full?(id,target,reach,weight)=>full.run(id,target,reach,weight):null,
    profileEV:full&&typeof exports.profile_evaluate==='function'?(target)=>full.profileEV(target):null,
    nodeDetail:full&&typeof exports.profile_evaluate==='function'?(id)=>full.nodeDetail(id):null,
    exactBest:full&&typeof exports.exact_best_response==='function'?(target,regularized)=>full.exactBest(target,regularized):null,
    scratchBytes:memory.buffer.byteLength-start,
    allocateVector:allocVector,
    updatePolicy(player,qre){
      const variant=(['dcfr','dcfr-scheduled','dcfr-adaptive','dcfr-predictive'].includes(game.gtoAlgorithm))? (game.gtoAlgorithm==='dcfr-predictive'?3:1):game.gtoAlgorithm==='optimistic'?2:0;
      const tieFloor=qre?0:16*Number.EPSILON*Math.max(1,game.pot+game.stack);
      if(!qre&&variant&&full)exports.policy_variant(variantNodePtr,metaAddr,decisions.length,player,variant,tieFloor);
      else if(!qre&&variant){
        for(const n of decisions)if(n.p===player){
          const a=n.actions.length,r=n.regret,s=n.current,prev=n.previousDelta;
          for(let i=0;i<s.length;i+=a){
            let sum=0;
            for(let k=0;k<a;k++){const x=r[i+k]+(prev?prev[i+k]:0);if(x>0)sum+=x;}
            for(let k=0;k<a;k++){const x=r[i+k]+(prev?prev[i+k]:0);s[i+k]=sum>tieFloor?(x>0?x:0)/sum:1/a;}
          }
        }
      }else exports.policy_batch(metaAddr,decisions.length,player,qre?1e-6:0,tieFloor);
      // v9: eliminate JS entropy/log-cache loops after QRE policy updates.
      // true means the cache is fully refreshed; if unavailable, use JS.
      if(qre&&full&&typeof exports.qre_refresh==='function'){
        exports.qre_refresh(variantNodePtr,metaAddr,decisions.length,player);
        return true;
      }
      return false;
    },
    regret(node,actionVals,output,mass,temperature){
      if(game.gtoAlgorithm!=='cfrplus')return false; // Reference JS fallback for experimental algorithms.
      if(output.buffer!==memory.buffer||actionVals.some(v=>v.buffer!==memory.buffer)||
         (mass&&mass.buffer!==memory.buffer))return false;
      for(let k=0;k<actionVals.length;k++)actionOffsets[k]=actionVals[k].byteOffset;
      if(mass){exports.regret_qre(game.players[node.p].ids.length,actionVals.length,
        node.regret.byteOffset,node.current.byteOffset,output.byteOffset,actionPtr,mass.byteOffset,
        node.qreEntropy.byteOffset,node.qreLog.byteOffset,temperature,1e-6);}
      else exports.regret_gto(game.players[node.p].ids.length,actionVals.length,
        node.regret.byteOffset,node.current.byteOffset,output.byteOffset,actionPtr);
      return true;
    }
  };
}
