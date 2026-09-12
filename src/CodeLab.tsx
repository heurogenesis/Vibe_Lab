import { useEffect, useRef, useState } from 'react';
import { Play, Square, RotateCcw, Download, CheckCircle2 } from 'lucide-react';
import type { Exercise } from '../shared/catalog';
import type { PracticeAttempt } from '../shared/schema';
import { dataSources } from '../shared/data-sources';
import { api, downloadText } from './api';
import { loadDataset } from './data-loader';
import { compileCode, startRun, type RunHandle, type RunResult } from './runner';
import { startSqlRun } from './sql-runner';

export default function CodeLab({ exercise, assignmentId, onSaved }: { exercise: Exercise; assignmentId?: string; onSaved?: (attempt: PracticeAttempt) => void }) {
  const isSql = exercise.language === 'sql';
  const [code,setCode] = useState(exercise.starter);
  const [rows,setRows] = useState(exercise.sample);
  const [sourceId,setSourceId] = useState(`sample:${exercise.disciplineId}`);
  const [result,setResult] = useState<RunResult | null>(null);
  const [busy,setBusy] = useState(false); const [loading,setLoading] = useState(false);
  const [saving,setSaving] = useState(false); const [saved,setSaved] = useState('');
  const [error,setError] = useState(''); const [hint,setHint] = useState(0);
  const host = useRef<HTMLDivElement>(null); const active = useRef<RunHandle | null>(null);
  const generation = useRef(0); const dataGeneration = useRef(0);
  useEffect(() => () => { generation.current++; dataGeneration.current++; active.current?.cancel(); },[]);
  function invalidate() { generation.current++; active.current?.cancel(); active.current = null; setBusy(false); setResult(null); setSaved(''); setError(''); }
  function edit(value: string) { invalidate(); setCode(value); }
  async function run() {
    invalidate(); const current = generation.current; setBusy(true);
    try {
      if (exercise.language === 'sql') {
        active.current = startSqlRun(exercise, code, rows);
      } else {
        const compiled = await compileCode(code);
        if (current !== generation.current || !host.current) return;
        active.current = startRun(exercise, compiled, rows, host.current);
      }
      const value = await active.current.result;
      if (current === generation.current) setResult(value);
    } catch (e) { if (current === generation.current) setResult({tests:[],logs:[],error:(e as Error).message}); }
    finally { if (current === generation.current) {setBusy(false);active.current=null;} }
  }
  async function external(id: string) {
    const current = ++dataGeneration.current; setLoading(true); setError('');
    try { const data = await loadDataset(id); if (current !== dataGeneration.current) return; invalidate(); setRows(data); setSourceId(id); }
    catch (e) { if (current === dataGeneration.current) setError((e as Error).message); }
    finally { if (current === dataGeneration.current) setLoading(false); }
  }
  async function save() {
    if (!result) return;
    const current=generation.current; setSaving(true);setError('');
    try {
      const passed=result.tests.filter(t=>t.passed).length;
      const record=await api<PracticeAttempt>('/practice/results',{method:'POST',body:JSON.stringify({exerciseId:exercise.id,version:exercise.version,passed,total:exercise.tests.length,status:result.error?'error':passed===exercise.tests.length?'passed':'failed',dataSourceId:sourceId,...(assignmentId?{assignmentId}:{})})});
      if(current===generation.current){setSaved('테스트 요약과 출처를 저장했어요. 코드·원자료는 서버에 전송하지 않았어요.');onSaved?.(record);}
    }catch(e){if(current===generation.current)setError((e as Error).message);}
    finally{setSaving(false);}
  }
  const source=dataSources.find(s=>s.id===sourceId);
  return <section className="code-lab" aria-label="코드 실행 실습">
    <div className="section-title"><h3>코드 빈칸을 채우고 실행해 보세요</h3><span className="tag">{isSql ? 'SQL · SQLite 실행 테스트' : 'TypeScript · 실행 테스트'}</span></div>
    <p>{exercise.contract}</p>
    <details className="data-preview"><summary>입력 데이터 · {rows.length}행 · {source?.title || '학습용 합성 샘플'}</summary>
      <p className="small-note">{source ? `${source.attribution} · ${source.license} · 버전 ${source.version.slice(0,7)}` : '브라우저에서 만든 소량의 합성 데이터입니다. 실제 산업 기준이나 실측값이 아닙니다.'}</p>
      {source && <a href={source.homepage} target="_blank" rel="noreferrer">원본과 이용 조건</a>}
      <pre>{JSON.stringify(rows.slice(0,8),null,2)}{rows.length>8?'\n… 첫 8행만 표시':''}</pre>
    </details>
    {exercise.sourceIds.length>0 && <div className="lab-actions"><button className="secondary" disabled={busy||loading||saving} onClick={()=>{invalidate();setRows(exercise.sample);setSourceId(`sample:${exercise.disciplineId}`);}}>합성 샘플 사용</button>{exercise.sourceIds.map(id=><button className="secondary" key={id} disabled={busy||loading||saving} onClick={()=>void external(id)}>{loading?'공개 데이터 조회 중…':`${dataSources.find(s=>s.id===id)?.title} 가져오기`}</button>)}</div>}
    <label className="code-label">{isSql ? 'SQL 질의문' : 'TypeScript 코드'}<textarea className="code-editor" aria-label={isSql ? 'SQL 실습 질의문' : 'TypeScript 실습 코드'} spellCheck={false} maxLength={20000} value={code} disabled={saving} onChange={e=>edit(e.target.value)}/></label>
    <div className="lab-actions"><button className="primary" disabled={busy||loading||saving} onClick={()=>void run()}><Play size={16}/>{busy?'실행 중…':'실행 · 테스트'}</button>{busy&&<button className="secondary" onClick={()=>{active.current?.cancel();if(!active.current)invalidate();}}><Square size={15}/> 중지</button>}<button className="secondary" disabled={saving} onClick={()=>edit(exercise.starter)}><RotateCcw size={15}/> 예제 복원</button><button className="text-button" onClick={()=>downloadText(`${exercise.id.replace(':','-')}.ts`,code)}><Download size={15}/> 코드 내려받기</button></div>
    <p className="small-note">{isSql ? '브라우저 안의 SQLite(WebAssembly)에서 실행합니다. 데이터는 메모리에만 올라가고 실행이 끝나면 사라집니다.' : '문법 변환 후 브라우저에서 실행합니다. 전체 TypeScript 타입 검사는 제공하지 않습니다.'} 테스트는 고정된 검증 데이터, 샘플 출력은 위에서 선택한 데이터를 사용합니다.</p>
    {error&&<p className="inline-error" role="alert">{error}</p>}
    <div className="console-panel" aria-live="polite"><strong>실행 콘솔</strong>{result?<><pre>{result.error || `샘플 실행 결과\n${result.preview ?? ''}`}{result.logs.length?`\n\n${result.logs.join('\n')}`:''}</pre><p>{result.tests.filter(t=>t.passed).length} / {exercise.tests.length} 테스트 통과</p></>:<p>코드를 실행하면 출력과 테스트 결과가 여기에 표시됩니다.</p>}</div>
    {result&&<div className="test-results">{result.tests.map((test,i)=><details key={i} open={!test.passed} className={test.passed?'test-pass':'test-fail'}><summary>{test.passed?'통과':'확인 필요'} · {test.name}</summary><p>기대: <code>{test.expected}</code></p><p>실제: <code>{test.actual}</code></p>{!test.passed&&<p>{test.hint}</p>}</details>)}<p className="small-note">테스트와 준비된 힌트에 기반한 피드백입니다. LLM 평가가 아니며 모든 입력의 정확성을 보증하지 않습니다.</p><button className="secondary" disabled={saving||busy} onClick={()=>void save()}><CheckCircle2 size={16}/>{saving?'저장 중…':'학습 기록 저장'}</button></div>}
    {saved&&<p role="status" className="small-note">{saved}</p>}
    <div className="lab-hints"><button className="text-button" disabled={hint>=exercise.hints.length} onClick={()=>setHint(n=>n+1)}>힌트 보기 ({hint}/{exercise.hints.length})</button>{exercise.hints.slice(0,hint).map(text=><p key={text}>{text}</p>)}</div>
    <div ref={host}/>
  </section>;
}
