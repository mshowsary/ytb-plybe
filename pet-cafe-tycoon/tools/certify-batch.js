import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function runChecks(checks, execute = spawnSync, onResult = () => {}) {
  return checks.map(check => {
    const start=Date.now();
    const result=execute(check.command[0],check.command.slice(1),{
      encoding:'utf8',timeout:check.timeoutMs,maxBuffer:16*1024*1024,
    });
    const record = {name:check.name,command:check.command,status:result.status === 0 && !result.error ? 'passed':'failed',
      durationMs:Date.now()-start,exitCode:result.status,signal:result.signal || null,
      output:(result.stdout || '')+(result.stderr || '')+(result.error ? '\n'+String(result.error):'')};
    onResult(record); return record;
  });
}
if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const suites=JSON.parse(fs.readFileSync(new URL('./certification-suites.json',import.meta.url),'utf8'));
  const suite=process.argv[2];
  if(!Object.hasOwn(suites,suite))throw new Error(`Unknown suite: ${suite}`);
  const dir=path.resolve('reports-production',suite);fs.mkdirSync(dir,{recursive:true});
  let i=0;
  const results=runChecks(suites[suite],spawnSync,result=>{
    fs.writeFileSync(path.join(dir,`${++i}.log`),result.output);
    console.log(`${result.status.toUpperCase()}: ${result.name}`);
    if(result.status==='failed')console.error(result.output.slice(-3000));
  });
  const commit=process.env.GITHUB_SHA || spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).stdout?.trim();
  fs.writeFileSync(path.join(dir,'results.json'),JSON.stringify({suite,commit,results:results.map(({output,...r})=>r)},null,2));
  if(results.some(r=>r.status!=='passed'))process.exitCode=1;
}
