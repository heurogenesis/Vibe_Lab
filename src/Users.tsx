import { useState } from 'react';
import { ArrowRight, Plus } from 'lucide-react';
import { userHandleSchema, type User } from '../shared/schema';
export default function Users({ users, onSelect, onCreate, busy }: { users: User[]; onSelect: (user: User) => void; onCreate: (input: { handle: string; displayName: string }) => Promise<void>; busy: boolean }) {
  const [handle, setHandle] = useState(''); const [displayName, setDisplayName] = useState(''); const [error, setError] = useState('');
  const [creating, setCreating] = useState(users.length === 0);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError('');
    const parsed = userHandleSchema.safeParse(handle);
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    if (!displayName.trim()) { setError('표시할 이름을 입력해 주세요.'); return; }
    try { await onCreate({ handle: parsed.data, displayName: displayName.trim() }); setHandle(''); setDisplayName(''); }
    catch (e) { setError((e as Error).message); }
  }
  return <><div className="eyebrow">WHO IS LEARNING</div><h1 className="small-heading">누구의 학습 공간을 열까요?</h1>
  <p className="lead">학습자마다 프로필과 과제, 진도가 따로 저장돼요.</p>
  <div className="panel">
    {users.length > 0 && <div className="choice-list">{users.map(user => <button key={user.id} className="choice" disabled={busy} onClick={() => onSelect(user)}>
      <span className="avatar">{user.displayName.slice(0, 1)}</span>
      <span><strong>{user.displayName}</strong><small> @{user.handle}</small></span>
      <ArrowRight size={16}/>
    </button>)}</div>}
    {creating ? <form onSubmit={submit}>
      <label>아이디<input required maxLength={24} value={handle} onChange={e => setHandle(e.target.value)} placeholder="영문·숫자 (예: sora)" autoComplete="off"/></label>
      <label>표시할 이름<input required maxLength={40} value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="예: 소라" autoComplete="off"/></label>
      {error && <p role="alert" className="inline-error">{error}</p>}
      <div className="form-actions">
        {users.length > 0 && <button type="button" className="secondary" onClick={() => { setCreating(false); setError(''); }}>취소</button>}
        <button className="primary" disabled={busy}>{busy ? '만드는 중…' : '학습자 만들기'} <ArrowRight size={16}/></button>
      </div>
    </form> : <button className="text-button" onClick={() => setCreating(true)}><Plus size={15}/> 새 학습자 만들기</button>}
    <p className="small-note">한 대의 컴퓨터에서 학습 공간을 나누기 위한 기능이에요. 비밀번호로 보호되는 로그인이 아니므로, 외부에 공개하려면 실제 인증이 필요합니다(docs/MULTI_USER_DESIGN.md).</p>
  </div></>;
}
