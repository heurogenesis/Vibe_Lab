# 계정·인증 설계 (다중 사용자)

- 작성: 2026-09-12 / Claude Code
- 결정자: 사용자(Lee). "결정" 항목은 2026-09-12 대화에서 승인된 내용입니다.
- 관련 문서: `AGENTS.md`(협업 규칙), `ROADMAP.md`, `PROGRESS.md`, `docs/PERSONALIZATION_PLAN.md`

## 0. 목표와 비목표

**목표**
- 학습자마다 아이디와 비밀번호로 로그인해 각자의 프로필·과제·진도·대화 기록을 분리한다.
- 나중에 remote(다중 기기, 외부 공개) 환경으로 확장할 때 **저장 구조와 라우트를 다시 갈아엎지 않아도 되게** 한다.

**비목표 (이번 단계에서 하지 않는 것)**
- 이메일 인증, 비밀번호 재설정, 2단계 인증.
- 사용자 간 공유·협업, 조직·권한(역할) 모델.
- 계정 삭제·아이디 변경 UI.

## 1. 결정 사항

| # | 결정 | 내용 |
|---|---|---|
| D1 | 인증 방식 | **아이디 + 비밀번호 로그인.** 초기 결정(핸들만)에서 2026-09-12 대화로 변경됨. 오픈소스(Passport·express-session·bcryptjs)를 활용한다. |
| D2 | 기존 데이터 | **백업 후 새로 시작.** 저장 버전이 올라가면 이전 파일을 `.data/learning.backup-<타임스탬프>.json`으로 옮기고 빈 저장소로 시작한다. |
| D3 | 아이디 규칙 | **영문과 숫자를 모두 포함한 7~24자.** 대소문자는 구분하지 않고 소문자로 정규화해 저장한다. |
| D4 | 닉네임 | 가입 과정에서 입력받고, 화면 표시와 학습 프로필의 이름으로 사용한다. 프로필 화면은 더 이상 이름을 따로 묻지 않는다. |

## 2. 사용한 오픈소스

| 패키지 | 역할 | 선택 이유 |
|---|---|---|
| `passport`, `passport-local` | 인증 전략과 세션 직렬화 | 사실상 표준이고, 나중에 GitHub OAuth를 `passport-github2` **전략 추가만으로** 붙일 수 있음 |
| `express-session` | 세션 쿠키 발급·검증 | 쿠키 기반 세션이 JWT보다 폐기(로그아웃)와 만료 관리가 확실함 |
| `bcryptjs` | 비밀번호 해시 | 네이티브 빌드(node-gyp)가 필요 없어 Windows에서 설치 실패 위험이 없음. 작업 계수 10 |

## 3. 핵심 설계: 단일 아이덴티티 심(seam)

신원을 확인하는 코드는 **한 군데**만 둡니다. 나머지 코드는 `userId`만 받고, 그것이 어디서 왔는지 절대 모릅니다.

```
요청
  -> 세션 쿠키 (vibe.sid, HttpOnly)      [server/auth.ts]
  -> Passport가 req.user 복원
  -> resolveUser(req)                    [server/identity.ts]  << 신원 판단은 여기 한 줄
  -> userStore.forUser(userId)           [server/store.ts]     << 한 사람 워크스페이스로 스코프된 Store
  -> 기존 라우트 핸들러                  [server/app.ts]       << 로직 그대로, 데이터만 사용자별
```

- 기존 `Store` 인터페이스(`read()` / `update()`)는 그대로 두고, 사용자별로 스코프된 `Store`를 돌려줍니다. 그래서 **과제·퀴즈·진도·튜터 라우트의 로직은 한 줄도 바뀌지 않았습니다.**
- GitHub OAuth를 붙일 때 바꿀 곳: `server/auth.ts`에 전략 하나 추가. `identity.ts`, `store.ts`, `app.ts`의 라우트는 건드리지 않습니다.
- `Passport` 인스턴스는 **앱마다 새로 만듭니다.** 기본 내보내기는 프로세스 전역 싱글턴이라 `deserializeUser` 핸들러가 누적되어, 한 프로세스에서 앱을 두 개 띄우면(테스트가 그렇습니다) 서로의 저장소로 세션을 복원하려다 실패합니다.

## 4. 저장 구조

### v3 (현재)

```json
{
  "version": 3,
  "users": [
    { "id": "uuid", "handle": "sora1234", "displayName": "소라",
      "passwordHash": "$2b$10$...", "createdAt": "2026-09-12T..." }
  ],
  "workspaces": {
    "uuid": { "profile": {...}, "assignments": [...], "messages": [...], "practiceHistory": [...] }
  }
}
```

- `users`는 계정 명부, `workspaces`는 사용자 id로 키가 잡힌 기존 `LearningState` 그대로입니다. **기존 상태 타입은 바뀌지 않았습니다.**
- `passwordHash`는 `StoredUser`에만 있고, 서버 밖으로 나가는 `User`에는 없습니다. 저장소에서 나가는 모든 값은 `toPublic()`을 거칩니다.
- 파일 버전이 `STORE_VERSION`과 다르면 D2에 따라 백업 후 빈 저장소로 시작합니다(1회성, 멱등).

### PostgreSQL 경로

`learning_workspaces.id`가 곧 userId이므로 테이블 구조 변경 없이 다중 사용자가 됩니다. 계정 명부만 추가했습니다.

```sql
CREATE TABLE IF NOT EXISTS learning_users (
  id TEXT PRIMARY KEY,
  handle TEXT UNIQUE NOT NULL,      -- 중복 방지의 최종 근거
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

`DATABASE_URL` 미설정 상태라 실제 DB에서는 아직 검증하지 못했습니다. 사용 시 `npm run db:migrate`가 필요합니다.

## 5. 중복 아이디를 막는 3중 방어

1. **화면**: 중복확인 버튼으로 확인하기 전에는 가입 버튼이 비활성. 아이디를 수정하면 확인 결과가 즉시 초기화되어, 확인 후 아이디를 바꿔치기할 수 없습니다.
2. **서버**: `POST /api/auth/signup`이 다시 검사합니다. 중복확인을 건너뛰고 직접 호출해도 409로 거부됩니다.
3. **저장소**: 파일 저장소는 유일성 검사와 삽입을 **하나의 큐 작업**으로 처리하고, PostgreSQL은 `handle`의 UNIQUE 제약이 막습니다. 동시에 같은 아이디로 가입 요청이 와도 하나만 성공합니다.

중복확인 API는 아이디의 사용 여부를 알려주므로 계정 존재 여부가 노출됩니다. 이는 모든 회원가입 폼이 갖는 성질이고, 가입 요청 자체가 주는 정보와 같습니다. 다만 **로그인 실패 메시지는 아이디와 비밀번호 중 무엇이 틀렸는지 구분하지 않으며**, 계정이 없을 때도 더미 해시와 비교해 응답 시간을 일정하게 유지합니다.

## 6. 지금의 보안 수준 (정직한 표기)

**되어 있는 것**
- 비밀번호는 bcrypt(계수 10) 해시로만 저장. 원문은 메모리 밖으로 나가지 않고 로그에도 남지 않음.
- 세션 쿠키는 `HttpOnly`(자바스크립트에서 읽을 수 없음), `SameSite=Lax`, 7일 만료. 로그아웃 시 세션 파기 + 쿠키 삭제.
- 로그인·가입은 1분당 10회로 제한(무차별 대입 방어). 응답 시간 균일화로 계정 존재 추측 방지.
- 모든 학습 데이터 라우트는 세션이 없으면 401(fail-closed). 서버는 `127.0.0.1`에만 바인딩되고 `/api`는 localhost 외 host를 거부.

**이후 처리된 것 (2026-09-14)**
1. ~~`cookie.secure = true` + HTTPS~~ → `PUBLIC_ORIGIN`이 설정되면 `secure`로 전환됩니다. 함께 `trust proxy`를 loopback으로 두었는데, 이것이 없으면 프록시가 넘긴 평문 HTTP를 Express가 insecure로 보고 `express-session`이 `Set-Cookie`를 통째로 생략합니다(문서화된 동작). 실제로 이 때문에 터널 뒤에서 로그인이 조용히 실패했습니다.
2. ~~세션 저장소가 메모리~~ → `connect-pg-simple`로 교체. 세션 테이블(`learning_sessions`)은 `db/001_initial.sql`에 선언되어 있고 `createTableIfMissing: false`입니다. DDL 권한 없는 배포에서 조용히 메모리로 떨어지지 않고 크게 실패합니다. 파일 저장소(로컬 체험)만 메모리 세션을 씁니다.
3. ~~`SESSION_SECRET` 환경변수~~ → `.env.example`에 문서화. 미설정 시 경고는 그대로 남습니다.
4. ~~실제 CSRF 토큰~~ → `server/csrf.ts`. 세션에 보관하는 synchronizer 토큰이며, 변경 요청은 `X-CSRF-Token`이 세션의 값과 일치해야 합니다(timing-safe 비교). `GET /api/auth/csrf`가 발급하고, 안전 메서드(GET/HEAD/OPTIONS)는 면제됩니다. 검증 미들웨어는 세션 직후·인증 라우트 **앞**에 마운트되어 로그인 위조도 막습니다. `req.login`이 세션을 재생성할 때 토큰 값만 넘겨받아(세션 id는 정상적으로 회전) 로그인마다 요청이 한 번 거부되는 일이 없게 했습니다. `X-Vibe-Lab` 헤더는 값싼 1차 필터로만 남습니다.
6. ~~레이트 리밋을 사용자 기준으로~~ → AI 라우트(`expensive`)는 `req.user.id` 기준입니다. 교실·사무실처럼 IP를 공유하는 곳에서 한 학습자가 남의 몫까지 소진하지 못하게 합니다. `/api` 전체 리미터는 세션보다 먼저 실행되고 사용량이 아니라 물량을 막는 것이므로 IP 기준을 유지합니다.

**아직 안 되어 있는 것 (remote 공개 전 필수)**
5. `/api`의 localhost host 검사는 여전히 host 기반입니다. `PUBLIC_ORIGIN`으로 정확히 한 개의 오리진을 더 허용하도록 확장했을 뿐, 인증 미들웨어 + 적절한 CORS로의 **대체**는 하지 않았습니다.
7. 비밀번호 재설정 경로가 없으므로, 공개 전에는 이메일 인증 또는 복구 수단이 필요합니다.

## 7. 작업 단계

| 단계 | 파일 | 내용 | 상태 |
|---|---|---|---|
| S1 | `shared/schema.ts`, `server/store.ts` | 계정 스키마(아이디·비밀번호·닉네임), v3 저장 구조, 해시 보관, 유일성 보장 | 완료 |
| S2 | `server/auth.ts`(신규), `server/identity.ts` | Passport 로컬 전략, 세션, 가입·로그인·로그아웃·중복확인 라우트 | 완료 |
| S3 | `server/app.ts`, `server/index.ts` | 세션·Passport 마운트, 가드 뒤로 학습 라우트 배치 | 완료 |
| S4 | `src/Auth.tsx`(신규), `src/api.ts` | 로그인·회원가입 화면, 중복확인 버튼, 쿠키 기반 요청 | 완료 |
| S5 | `src/App.tsx`, `src/Profile.tsx` | 세션 부트스트랩, 로그아웃, 프로필의 이름 입력 제거(닉네임 사용) | 완료 |
| S6 | `tests/*`, `db/001_initial.sql` | 세션 기반 테스트 전환, 계정 규칙·격리 테스트, 계정 테이블 | 완료 |
| S7 | — | 실제 DB(PostgreSQL) 경로 검증, 비밀번호 재설정, 계정 삭제 | 보류 |

## 8. 열린 질문

- 포트폴리오 시연용 데모 계정을 seed로 넣을지.
- 비밀번호 재설정을 MVP 범위에 넣을지(현재는 없음 — 비밀번호를 잊으면 새 계정을 만들어야 합니다).
