// Opt-in, bounded diagnostics. Elapsed frame time is never the capped simulation timestep.
export function createFrameMetrics(limit = 1800) {
 let samples=[], running=false, cursor=0;
 const percentile=(values,p)=>{const s=values.slice().sort((a,b)=>a-b);return s.length?s[Math.min(s.length-1,Math.floor((s.length-1)*p))]:null;};
 return {
  get running(){return running;},
  start(){samples=[];cursor=0;running=true;},
  stop(){running=false;return this.report();},
  record(sample){if(!running)return;if(samples.length<limit)samples.push({...sample});else{samples[cursor]={...sample};cursor=(cursor+1)%limit;}},
  report(){const values=key=>samples.map(s=>s[key]).filter(Number.isFinite);const frames=values('frameMs');return {
   sampleCount:samples.length,capacity:limit,frameMs:{p50:percentile(frames,.5),p95:percentile(frames,.95),p99:percentile(frames,.99),max:frames.length?Math.max(...frames):null},
   uiMsP95:percentile(values('uiMs'),.95),renderMsP95:percentile(values('renderMs'),.95),
   maxDrawCalls:Math.max(0,...values('drawCalls')),maxTriangles:Math.max(0,...values('triangles')),
   heapBytesMax:values('heapBytes').length?Math.max(...values('heapBytes')):null,
   stallsOver100ms:frames.filter(x=>x>100).length,
  };}
 };
}
