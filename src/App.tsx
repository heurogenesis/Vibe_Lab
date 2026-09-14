import { useCallback, useEffect, useState } from 'react';
import { ArrowUpRight, BookOpen, Code2, Compass, Github, UserRound, X, LoaderCircle, RefreshCw } from 'lucide-react';
import type { Health, Profile as LearnerProfile, PublicAssignment, PublicState, User } from '../shared/schema';
import { api } from './api';
import Auth from './Auth';
import Home from './Home';
import Profile from './Profile';
import Workspace from './Workspace';
import Repositories from './Repositories';
import PracticeLibrary from './PracticeLibrary';
type Page = 'home' | 'profile' | 'workspace' | 'github' | 'library';
// The sections a menu can drop the learner straight into. Each page reads the ones addressed to it and
// ignores the rest, so adding an entry here does not require touching the others.
type Section = string;
const MENU: { id: Page; icon: typeof Compass; items: { section: Section; label: string; hint: string }[] }[] = [
  { id: 'home', icon: Compass, items: [
    { section: 'assignments', label: '나의 프로젝트', hint: '지금까지 만든 과제' },
    { section: 'generate', label: '새 맞춤 과제', hint: '내 배경으로 새로 생성' } ] },
  { id: 'profile', icon: UserRound, items: [
    { section: '0', label: '나의 배경', hint: '전공 · 직무' },
    { section: '1', label: '경험과 학습 스타일', hint: '수준 · 학습 언어' },
    { section: '2', label: '이번에 이루고 싶은 것', hint: '목표 · 학습 시간' } ] },
  { id: 'workspace', icon: BookOpen, items: [
    { section: 'practice', label: '단계별 실습', hint: '코드 작성과 실행' },
    { section: 'quiz', label: '이해도 확인', hint: '원리를 내 말로' },
    { section: 'submit', label: 'GitHub 제출 · 회고', hint: '결과물 남기기' } ] },
  { id: 'library', icon: Code2, items: [
    { section: 'all', label: '전체 실습', hint: '분야 · 테마로 찾기' } ] },
  { id: 'github', icon: Github, items: [
    { section: 'search', label: '저장소 검색', hint: '공개 저장소 살펴보기' } ] },
];
export default function App() {
  const [page,setPage] = useState<Page>('home');
  const [section,setSection] = useState<Section>('');
  const [openMenu,setOpenMenu] = useState<Page | null>(null);
  const [authMode,setAuthMode] = useState<'login'|'signup'>('login');
  const [state,setState] = useState<PublicState | null>(null);
  const [health,setHealth] = useState<Health | null>(null);
  const [activeId,setActiveId] = useState('');
  const [learner,setLearner] = useState<User | null>(null);
  const [busy,setBusy] = useState(false); const [loading,setLoading] = useState(true); const [error,setError] = useState(''); const [notice,setNotice] = useState('');
  // The session decides who this is. A 401 from /auth/session simply means "show the sign-in screen".
  const load = useCallback(async () => { setLoading(true); setError(''); try {
    setHealth(await api<Health>('/health'));
    let current: User | null = null;
    try { current = await api<User>('/auth/session'); } catch { current = null; }
    setLearner(current);
    setState(current ? await api<PublicState>('/state') : null);
  } catch(e) { setError((e as Error).message); } finally { setLoading(false); } },[]);
  async function authenticated(user: User) { setLearner(user); setActiveId(''); setPage('home'); await load(); }
  async function logout() {
    setBusy(true);
    try { await api('/auth/logout',{method:'POST'}); setLearner(null); setState(null); setActiveId(''); setPage('home'); setError(''); }
    catch(e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  useEffect(()=> { void load(); },[load]);
  useEffect(()=> { if (!notice) return; const timer = setTimeout(()=>setNotice(''),5000); return ()=>clearTimeout(timer); },[notice]);
  const navigate = (next: Page, target: Section = '') => { setPage(next); setSection(target); setOpenMenu(null); setError(''); window.scrollTo({top:0}); };
  const open = (id: string) => { setActiveId(id); navigate('workspace'); };
  async function saveProfile(profile: LearnerProfile) { setBusy(true); setError(''); try { const saved = await api<LearnerProfile>('/profile',{method:'PUT',body:JSON.stringify({...profile,name:learner?.displayName || profile.name})}); setState(s=>s ? {...s,profile:saved} : s); setNotice('프로필을 저장했어요. 새 맞춤 과제를 생성하면 변경된 배경이 반영됩니다.'); navigate('home'); } catch(e) { setError((e as Error).message); } finally { setBusy(false); } }
  async function generate() { setBusy(true); setError(''); try { const a = await api<PublicAssignment>('/assignments',{method:'POST',body:'{}'}); setState(s=>s ? {...s,assignments:[a,...s.assignments]} : s); open(a.id); setNotice('나의 경험에 맞춘 실습 과제가 준비됐어요.'); } catch(e) { setError((e as Error).message); } finally { setBusy(false); } }
  const active = state?.assignments.find(a=>a.id===activeId) || state?.assignments[0];
  const pageLabels: Record<Page,string> = {home:'나의 학습실',profile:'학습자 프로필',workspace:'실습 워크스페이스',github:'GitHub 탐색',library:'데이터 실습 자료실'};
  return <div className="app-shell">
  {/* One bar: brand, the category menu, and who you are. Each category opens its sections underneath on
      hover, and on focus or click too - a hover-only menu is unreachable by keyboard and by touch. */}
  <header className="masthead" onMouseLeave={()=>setOpenMenu(null)}>
    <div className="masthead-inner">
      <a className="brand" href="#" onClick={e=>{e.preventDefault();navigate('home');}} aria-label="Vibe Lab 홈"><span className="brand-icon"><Code2 size={24}/></span>vibe<span>lab</span><span className="beta">BETA</span></a>
      <nav className="top-nav" aria-label="주요 메뉴">{MENU.map(item=>
        <div key={item.id} className={`top-nav-item ${openMenu===item.id?'open':''}`} onMouseEnter={()=>setOpenMenu(item.id)}>
          <button className={`nav-item ${page===item.id?'active':''}`} aria-current={page===item.id?'page':undefined} aria-expanded={openMenu===item.id} aria-haspopup="true"
            onFocus={()=>setOpenMenu(item.id)} onClick={()=>openMenu===item.id&&page===item.id?setOpenMenu(null):navigate(item.id)}><item.icon size={17}/>{pageLabels[item.id]}</button>
          <div className="dropdown" role="menu">{item.items.map(sub=>
            <button key={sub.section} role="menuitem" disabled={sub.section==='generate'&&(busy||!state?.profile)}
              onClick={()=>{ if(sub.section==='generate'){ setOpenMenu(null); void generate(); return; } navigate(item.id,sub.section); }}
              onBlur={e=>{ if(!e.currentTarget.closest('.top-nav-item')?.contains(e.relatedTarget as Node)) setOpenMenu(null); }}>
              <strong>{sub.label}</strong><small>{sub.hint}</small></button>)}
          </div>
        </div>)}
      </nav>
      <div className="masthead-account">
        {learner
          ? <><span className="greeting"><strong>{learner.displayName}</strong>님 반갑습니다!</span><span className="divider">|</span><button className="link-button" disabled={busy} onClick={()=>void logout()}>로그아웃</button></>
          : <><button className={`link-button ${page!=='home'||authMode!=='login'?'':'current'}`} onClick={()=>{setAuthMode('login');navigate('home');}}>로그인</button><span className="divider">|</span><button className="link-button" onClick={()=>{setAuthMode('signup');navigate('home');}}>회원가입</button></>}
      </div>
    </div>
  </header>
  <main className="main"><header className="topbar"><span>워크스페이스 <span className="slash">/</span> {pageLabels[page]}</span><span className="top-chip">{health?.storage === 'postgresql' ? 'PostgreSQL 저장' : '로컬 파일 체험 모드'} <span className="divider">·</span> {health?.ai ? 'AI 튜터 연결됨' : '규칙 기반 학습 가이드'}</span></header><div className="page">
  {error && <div className="error-banner" role="alert"><span>{error}</span><button aria-label="오류 닫기" onClick={()=>setError('')}><X size={18}/></button></div>}
  {loading ? <div className="empty-state" role="status"><LoaderCircle className="spin"/><h2>학습 공간을 불러오고 있어요.</h2></div> : !learner ? <Auth key={authMode} initialMode={authMode} onAuthenticated={user=>void authenticated(user)}/> : !state ? <div className="empty-state"><h2>학습 공간에 연결하지 못했어요.</h2><button className="primary" onClick={()=>void load()}><RefreshCw size={16}/> 다시 연결</button></div> : <>
  {page==='home' && <Home state={state} onProfile={()=>navigate('profile')} onGenerate={()=>void generate()} onOpen={open} busy={busy}/>}
  {page==='profile' && <Profile key={section} initialStep={Number(section) || 0} initial={state.profile} onSave={saveProfile} busy={busy}/>}
  {page==='workspace' && (active ? <Workspace key={`${active.id}:${section}`} initialTab={section} assignment={active} messages={state.messages.filter(m=>m.assignmentId===active.id)} aiEnabled={!!health?.ai} onError={setError} onNotice={setNotice} onUpdate={updated=>setState(s=>s ? {...s,assignments:s.assignments.map(a=>a.id===updated.id?updated:a)}:s)} onMessages={messages=>setState(s=>s?{...s,messages:[...s.messages,...messages]}:s)}/> : <div className="empty-state"><BookOpen size={36}/><h2>나만의 첫 실습을 준비해 볼까요?</h2><p>프로필을 저장하고 맞춤 과제를 생성하면 여기에서 이어갈 수 있어요.</p><button className="primary" disabled={busy} onClick={state.profile ? ()=>void generate() : ()=>navigate('profile')}>{state.profile ? '맞춤 과제 생성' : '프로필 만들기'}</button></div>)}
  {page==='library' && <PracticeLibrary profile={state.profile} history={state.practiceHistory || []}/>}
  {page==='github' && <Repositories onError={setError} authenticated={!!health?.githubAuthenticated}/>}
  </>}
  <footer><span>호기심을 출발점으로, 이해를 도착점으로.</span><a href="https://github.com/microsoft/Web-Dev-For-Beginners" target="_blank" rel="noreferrer">오픈소스로 배우기 <ArrowUpRight size={14}/></a><span className="copyright">© {new Date().getFullYear()} LeeTaewoo</span></footer></div></main>{notice && <div className="toast" role="status">{notice}<button aria-label="알림 닫기" onClick={()=>setNotice('')}><X size={16}/></button></div>}</div>;
}
