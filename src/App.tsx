import { useCallback, useEffect, useState } from 'react';
import { ArrowUpRight, BookOpen, Code2, Compass, Github, Terminal, UserRound, X, LoaderCircle, RefreshCw } from 'lucide-react';
import type { Health, Profile as LearnerProfile, PublicAssignment, PublicState } from '../shared/schema';
import { api } from './api';
import Home from './Home';
import Profile from './Profile';
import Workspace from './Workspace';
import Repositories from './Repositories';
type Page = 'home' | 'profile' | 'workspace' | 'github';
export default function App() {
  const [page,setPage] = useState<Page>('home');
  const [state,setState] = useState<PublicState | null>(null);
  const [health,setHealth] = useState<Health | null>(null);
  const [activeId,setActiveId] = useState('');
  const [busy,setBusy] = useState(false); const [loading,setLoading] = useState(true); const [error,setError] = useState(''); const [notice,setNotice] = useState('');
  const load = useCallback(async () => { setLoading(true); setError(''); try { const [s,h] = await Promise.all([api<PublicState>('/state'), api<Health>('/health')]); setState(s); setHealth(h); } catch(e) { setError((e as Error).message); } finally { setLoading(false); } },[]);
  useEffect(()=> { void load(); },[load]);
  useEffect(()=> { if (!notice) return; const timer = setTimeout(()=>setNotice(''),5000); return ()=>clearTimeout(timer); },[notice]);
  const navigate = (next: Page) => { setPage(next); setError(''); window.scrollTo({top:0}); };
  const open = (id: string) => { setActiveId(id); navigate('workspace'); };
  async function saveProfile(profile: LearnerProfile) { setBusy(true); setError(''); try { const saved = await api<LearnerProfile>('/profile',{method:'PUT',body:JSON.stringify(profile)}); setState(s=>s ? {...s,profile:saved} : s); setNotice('프로필을 저장했어요. 맞춤 과제를 생성해 보세요.'); navigate('home'); } catch(e) { setError((e as Error).message); } finally { setBusy(false); } }
  async function generate() { setBusy(true); setError(''); try { const a = await api<PublicAssignment>('/assignments',{method:'POST',body:'{}'}); setState(s=>s ? {...s,assignments:[a,...s.assignments]} : s); open(a.id); setNotice('나의 경험에 맞춘 실습 과제가 준비됐어요.'); } catch(e) { setError((e as Error).message); } finally { setBusy(false); } }
  const active = state?.assignments.find(a=>a.id===activeId) || state?.assignments[0];
  const pageLabels: Record<Page,string> = {home:'나의 학습실',profile:'학습자 프로필',workspace:'실습 워크스페이스',github:'GitHub 탐색'};
  return <div className="app-shell"><aside className="sidebar"><a className="brand" href="#" onClick={e=>{e.preventDefault();navigate('home');}} aria-label="Vibe Lab 홈"><span className="brand-icon"><Code2 size={24}/></span>vibe<span>lab</span><span className="beta">BETA</span></a><div className="workspace-label">MY LEARNING SPACE</div><nav>{([{id:'home',icon:Compass},{id:'profile',icon:UserRound},{id:'workspace',icon:BookOpen},{id:'github',icon:Github}] as const).map(item=><button className={`nav-item ${page===item.id?'active':''}`} aria-current={page===item.id?'page':undefined} key={item.id} onClick={()=>navigate(item.id)}><item.icon size={20}/>{pageLabels[item.id]}</button>)}</nav><div className="sidebar-note"><Terminal size={22}/><p>만드는 경험을 넘어,<br/><strong>이해하는 즐거움으로.</strong></p><span>TypeScript · React · Express</span><small className="mode-label">{health?.storage === 'postgresql' ? 'PostgreSQL 저장' : '로컬 파일 체험 모드'}<br/>{health?.ai ? 'AI 튜터 연결됨' : '규칙 기반 학습 가이드'}</small></div><div className="account"><span className="avatar">{state?.profile?.name.slice(0,1) || '나'}</span><div><strong>{state?.profile?.name || '나의 워크스페이스'}</strong><small>1인 로컬 학습 공간</small></div></div></aside><main className="main"><header className="topbar"><span>워크스페이스 <span className="slash">/</span> {pageLabels[page]}</span><span className="top-chip"><Code2 size={14}/> LEARN BY BUILDING</span></header><div className="page">
  {error && <div className="error-banner" role="alert"><span>{error}</span><button aria-label="오류 닫기" onClick={()=>setError('')}><X size={18}/></button></div>}
  {loading ? <div className="empty-state" role="status"><LoaderCircle className="spin"/><h2>학습 공간을 불러오고 있어요.</h2></div> : !state ? <div className="empty-state"><h2>학습 공간에 연결하지 못했어요.</h2><button className="primary" onClick={()=>void load()}><RefreshCw size={16}/> 다시 연결</button></div> : <>
  {page==='home' && <Home state={state} onProfile={()=>navigate('profile')} onGenerate={()=>void generate()} onOpen={open} busy={busy}/>}
  {page==='profile' && <Profile initial={state.profile} onSave={saveProfile} busy={busy}/>}
  {page==='workspace' && (active ? <Workspace key={active.id} assignment={active} messages={state.messages.filter(m=>m.assignmentId===active.id)} aiEnabled={!!health?.ai} onError={setError} onNotice={setNotice} onUpdate={updated=>setState(s=>s ? {...s,assignments:s.assignments.map(a=>a.id===updated.id?updated:a)}:s)} onMessages={messages=>setState(s=>s?{...s,messages:[...s.messages,...messages]}:s)}/> : <div className="empty-state"><BookOpen size={36}/><h2>나만의 첫 실습을 준비해 볼까요?</h2><p>프로필을 저장하고 맞춤 과제를 생성하면 여기에서 이어갈 수 있어요.</p><button className="primary" disabled={busy} onClick={state.profile ? ()=>void generate() : ()=>navigate('profile')}>{state.profile ? '맞춤 과제 생성' : '프로필 만들기'}</button></div>)}
  {page==='github' && <Repositories onError={setError} authenticated={!!health?.githubAuthenticated}/>}
  </>}
  <footer>호기심을 출발점으로, 이해를 도착점으로.<a href="https://github.com/microsoft/Web-Dev-For-Beginners" target="_blank" rel="noreferrer">오픈소스로 배우기 <ArrowUpRight size={14}/></a></footer></div></main>{notice && <div className="toast" role="status">{notice}<button aria-label="알림 닫기" onClick={()=>setNotice('')}><X size={16}/></button></div>}</div>;
}
