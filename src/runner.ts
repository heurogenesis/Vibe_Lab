import type { DataRow, Exercise } from '../shared/catalog';
import { z } from 'zod';
export type TestResult = { name: string; passed: boolean; actual: string; expected: string; hint: string };
export type RunResult = { tests: TestResult[]; logs: string[]; preview?: string; error?: string };
export type RunHandle = { result: Promise<RunResult>; cancel: () => void };
const resultSchema = z.object({
  tests: z.array(z.object({ name: z.string().max(120), passed: z.boolean(), actual: z.string().max(1200), expected: z.string().max(1200), hint: z.string().max(500) })).max(20),
  logs: z.array(z.string().max(1210)).max(30), preview: z.string().max(1250).optional(), error: z.string().max(2000).optional(),
});

// This program executes only in a disposable Worker in the sandbox frame.
export const workerProgram = `
const show = value => {
 try { return (JSON.stringify(value, (_key,v) => typeof v==='number' && !Number.isFinite(v) ? String(v) : typeof v==='bigint' ? String(v) : v) ?? String(value)).slice(0,1200); }
 catch { return '[표시할 수 없는 값]'; }
};
const equal = (a,b) => {
 if(typeof a==='number' && typeof b==='number') return Number.isFinite(a) && Math.abs(a-b)<=1e-7*Math.max(1,Math.abs(b));
 if(a===b) return true;
 if(a===null || b===null || typeof a!=='object' || typeof b!=='object' || Array.isArray(a)!==Array.isArray(b)) return false;
 const ak=Object.keys(a),bk=Object.keys(b);
 return ak.length===bk.length && bk.every(k=>Object.prototype.hasOwnProperty.call(a,k) && equal(a[k],b[k]));
};
onmessage=async({data})=>{
 const logs=[];
 const console=Object.fromEntries(['log','info','warn','error'].map(level=>[level,(...values)=>{if(logs.length<30)logs.push(level+': '+values.map(show).join(' ').slice(0,1200));}]));
 const tests=[];
 try {
  const solve=new Function('console',data.code+'\\n;return typeof solve === "function" ? solve : undefined;')(console);
  if(typeof solve!=='function')throw new Error('solve 함수를 정의해 주세요.');
  const inputFor=value=>data.theme==='async' ? value.map(item=>()=>new Promise((resolve,reject)=>setTimeout(()=>item.error?reject(new Error('테스트용 수집 실패')):resolve(item.rows),item.delay||0))) : value;
  for(const test of data.tests){
   try{const actual=await solve(inputFor(structuredClone(test.input)));tests.push({name:test.name,passed:equal(actual,test.expected),actual:show(actual),expected:show(test.expected),hint:test.hint});}
   catch(e){tests.push({name:test.name,passed:false,actual:String(e?.message||e).slice(0,1200),expected:show(test.expected),hint:test.hint});}
  }
  let preview;
  try{preview=show(await solve(inputFor(data.theme==='async'?[{rows:data.rows}]:data.rows)));}
  catch(e){preview='샘플 실행 오류: '+String(e?.message||e).slice(0,1200);}
  postMessage({tests,logs,preview});
 }catch(e){postMessage({tests,logs,error:String(e?.message||e).slice(0,1200)});}
};`;

export async function compileCode(source: string): Promise<string> {
  if (source.length > 20000) throw new Error('코드는 20,000자 이하로 작성해 주세요.');
  const ts = await import('typescript');
  const file = ts.createSourceFile('practice.ts', source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  let imported = false;
  const inspect = (node: import('typescript').Node) => {
    if (ts.isImportDeclaration(node) || ts.isImportEqualsDeclaration(node) || ts.isExportDeclaration(node) || (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword)) imported = true;
    ts.forEachChild(node, inspect);
  };
  inspect(file);
  if (imported) throw new Error('이번 실습은 외부 패키지 import 없이 solve 함수를 작성합니다.');
  const compiled = ts.transpileModule(source, { reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } });
  const errors = compiled.diagnostics?.filter(d => d.category === ts.DiagnosticCategory.Error) || [];
  if (errors.length) throw new Error(errors.map(d => ts.flattenDiagnosticMessageText(d.messageText,'\n')).join('\n').slice(0,2000));
  return compiled.outputText;
}

export function startRun(exercise: Exercise, code: string, rows: DataRow[], host: HTMLElement): RunHandle {
  const frame = document.createElement('iframe');
  frame.setAttribute('sandbox','allow-scripts');
  frame.title = '격리된 코드 실행'; frame.hidden = true;
  const runId = crypto.randomUUID();
  let finish: (result: RunResult) => void = () => undefined;
  const result = new Promise<RunResult>(resolve => { finish = resolve; });
  let done = false; let timer: ReturnType<typeof setTimeout>;
  const cleanup = (value: RunResult) => {
    if (done) return; done = true; clearTimeout(timer);
    window.removeEventListener('message', message); frame.remove(); finish(value);
  };
  const message = (event: MessageEvent) => {
    if (event.source !== frame.contentWindow || event.origin !== 'null' || event.data?.runId !== runId) return;
    if (event.data.type === 'ready') {
      frame.contentWindow?.postMessage({runId,type:'run',program:workerProgram,payload:{code,theme:exercise.theme,tests:exercise.tests,rows}},'*');
    } else if (event.data.type === 'result') {
      const parsed = resultSchema.safeParse(event.data.result);
      if (!parsed.success || parsed.data.tests.length > exercise.tests.length || parsed.data.tests.some((test,i)=>test.name!==exercise.tests[i].name)) return cleanup({tests:[],logs:[],error:'실행 결과 형식이 올바르지 않습니다.'});
      cleanup(parsed.data);
    }
  };
  window.addEventListener('message', message);
  frame.src = `/practice-sandbox.html#${runId}`;
  timer = setTimeout(() => cleanup({tests:[],logs:[],error:'실행 제한 시간(5초)을 초과했습니다. 무한 반복이나 끝나지 않는 Promise를 확인해 주세요.'}), 5000);
  host.append(frame);
  return {result,cancel:() => cleanup({tests:[],logs:[],error:'실행을 중지했습니다.'})};
}
