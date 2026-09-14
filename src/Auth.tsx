import { useState } from 'react';
import { ArrowRight, Check, X } from 'lucide-react';
import { signupSchema, userHandleSchema, type User } from '../shared/schema';
import { api } from './api';
type Mode = 'login' | 'signup';
export default function Auth({ onAuthenticated, initialMode = 'login' }: { onAuthenticated: (user: User) => void; initialMode?: Mode }) {
  // The header links pick which side of this screen opens; the tabs still switch freely once here.
  const [mode, setMode] = useState<Mode>(initialMode);
  const [handle, setHandle] = useState(''); const [password, setPassword] = useState(''); const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  // The id has to be confirmed available before signing up, and editing it clears the confirmation so a stale
  // "available" can never be submitted. The server checks again anyway, as the last word on uniqueness.
  const [checked, setChecked] = useState<{ handle: string; available: boolean; reason: string } | null>(null);
  const confirmed = !!checked && checked.handle === handle.trim() && checked.available;
  function changeMode(next: Mode) { setMode(next); setError(''); setChecked(null); setPassword(''); }
  function changeHandle(value: string) { setHandle(value); setError(''); if (checked && checked.handle !== value.trim()) setChecked(null); }
  async function checkHandle() {
    const parsed = userHandleSchema.safeParse(handle);
    if (!parsed.success) { setChecked({ handle: handle.trim(), available: false, reason: parsed.error.issues[0].message }); return; }
    setBusy(true); setError('');
    try { setChecked({ handle: handle.trim(), ...await api<{ available: boolean; reason: string }>(`/auth/available?handle=${encodeURIComponent(parsed.data)}`) }); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError('');
    if (mode === 'signup') {
      const parsed = signupSchema.safeParse({ handle: handle.trim(), password, displayName: displayName.trim() });
      if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
      if (!confirmed) { setError('아이디 중복확인을 해주세요.'); return; }
    } else if (!handle.trim() || !password) { setError('아이디와 비밀번호를 입력해 주세요.'); return; }
    setBusy(true);
    try {
      const body = mode === 'signup' ? { handle: handle.trim(), password, displayName: displayName.trim() } : { handle: handle.trim(), password };
      onAuthenticated(await api<User>(mode === 'signup' ? '/auth/signup' : '/auth/login', { method: 'POST', body: JSON.stringify(body) }));
    } catch (e) { setError((e as Error).message); setBusy(false); }
  }
  return <><div className="eyebrow">{mode === 'login' ? 'WELCOME BACK' : 'CREATE YOUR SPACE'}</div><h1 className="small-heading">{mode === 'login' ? '다시 만나서 반가워요.' : '학습 공간을 만들어요.'}</h1>
  <p className="lead">아이디마다 프로필과 과제, 진도가 따로 저장돼요.</p>
  <div className="panel">
    <div className="tabs" aria-label="로그인 또는 회원가입">
      {([{ id: 'login', label: '로그인' }, { id: 'signup', label: '회원가입' }] as const).map(tab =>
        <button key={tab.id} type="button" aria-pressed={mode === tab.id} className={mode === tab.id ? 'active' : ''} onClick={() => changeMode(tab.id)}>{tab.label}</button>)}
    </div>
    <form onSubmit={submit}>
      <label>아이디<input required maxLength={24} value={handle} onChange={e => changeHandle(e.target.value)} placeholder="영문과 숫자를 섞어 7자 이상" autoComplete="username"/></label>
      {mode === 'signup' && <>
        <div className="form-actions">
          <button type="button" className="secondary" disabled={busy || !handle.trim()} onClick={() => void checkHandle()}>중복확인</button>
          {checked && <span className={checked.available ? 'availability ok' : 'availability taken'} role="status">{checked.available ? <Check size={15}/> : <X size={15}/>} {checked.reason}</span>}
        </div>
        <p className="small-note">아이디는 영문과 숫자를 모두 포함한 7~24자예요. 한 번 만들면 바꿀 수 없어요.</p>
      </>}
      <label>비밀번호<input required type="password" maxLength={128} value={password} onChange={e => setPassword(e.target.value)} placeholder={mode === 'signup' ? '8자 이상' : ''} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}/></label>
      {mode === 'signup' && <label>닉네임<input required maxLength={40} value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="화면에 표시할 이름 (예: 소라)" autoComplete="nickname"/></label>}
      {error && <p role="alert" className="inline-error">{error}</p>}
      <div className="form-actions">
        <button className="primary" disabled={busy || (mode === 'signup' && !confirmed)}>{busy ? '확인하는 중…' : mode === 'login' ? '로그인' : '가입하고 시작하기'} <ArrowRight size={16}/></button>
      </div>
    </form>
    <p className="small-note">비밀번호는 bcrypt 해시로만 저장되고 원문은 어디에도 남지 않아요. 지금은 이 컴퓨터에서만 접속할 수 있는 로컬 서버예요.</p>
  </div></>;
}
