# 다중 사용자(사용자별 아이디) 설계

- 작성: 2026-09-12 / Claude Code
- 결정자: 사용자(Lee). 이 문서의 "결정" 항목은 2026-09-12 대화에서 승인된 내용입니다.
- 관련 문서: `AGENTS.md`(협업 규칙), `ROADMAP.md`, `PROGRESS.md`, `docs/PERSONALIZATION_PLAN.md`

## 0. 목표와 비목표

**목표**
- 한 대의 로컬 환경에서 여러 학습자가 각자의 프로필·과제·진도·대화 기록을 분리해서 사용한다.
- 나중에 remote(다중 기기·실제 인증) 환경으로 확장할 때 **저장 구조를 다시 갈아엎지 않아도 되게** 한다.

**비목표 (이번 단계에서 하지 않는 것)**
- 실제 인증(비밀번호·세션·토큰). 아래 1절의 결정 참고.
- 사용자 간 공유·협업 기능.
- 조직/권한(역할) 모델.

## 1. 결정 사항

| # | 결정 | 내용 |
|---|---|---|
| D1 | 인증 수준 | **핸들만.** 비밀번호 없음. 아이디(핸들)를 만들고 전환하는 방식으로 워크스페이스만 분리한다. |
| D2 | 기존 데이터 | **백업 후 새로 시작.** 기존 v1 `.data/learning.json`은 자동으로 `.data/learning.backup-<타임스탬프>.json`으로 옮기고, 빈 v2 저장소로 시작한다. |

### D1에 대한 정직한 보안 표기 (중요)

핸들 방식은 **인증이 아니라 워크스페이스 분리**입니다. API에 도달할 수 있는 누구나 다른 사용자의 핸들을 지정할 수 있습니다.
지금 이것이 안전한 이유는 오직 다음 두 가지 때문입니다.

1. 서버가 `127.0.0.1`에만 바인딩됩니다(`server/index.ts`).
2. `/api` 미들웨어가 localhost 이외의 host를 403으로 거부합니다(`server/app.ts`).

따라서 **이 상태를 그대로 외부에 노출하면 안 됩니다.** remote 전환 전 필수 체크리스트는 5절에 있습니다.

## 2. 핵심 설계 원칙: 단일 아이덴티티 심(seam)

신원을 확인하는 코드는 **한 군데**만 둡니다. 나머지 코드는 `userId: string`만 받고, 그것이 어디서 왔는지 절대 모릅니다.

```
요청
  -> resolveUserId(req)          [server/identity.ts]   << remote 전환 시 여기만 교체
  -> userStore.forUser(userId)   [server/store.ts]      << 한 사용자의 워크스페이스로 스코프된 Store
  -> 기존 라우트 핸들러          [server/app.ts]        << 로직 그대로, 데이터만 사용자별
```

이 구조가 중요한 이유: 기존 `Store` 인터페이스(`read()` / `update()`)는 이미 "학습 상태 하나"를 다루도록 잘 분리돼 있습니다.
사용자별로 스코프된 `Store`를 돌려주면 **라우트 핸들러 내부 로직을 거의 수정하지 않아도** 다중 사용자가 됩니다.

| 단계 | 로컬(지금) | remote(나중) |
|---|---|---|
| 신원 확보 | `X-Vibe-User` 헤더를 사용자 목록과 대조 | 세션 쿠키 / OAuth subject |
| 신뢰 근거 | localhost 바인딩 + host 검사 | HttpOnly·Secure·SameSite 쿠키 + CSRF 토큰 |
| 교체 범위 | — | `resolveUserId()` 내부 + 미들웨어. 저장 구조·라우트 무변경 |

## 3. 저장 구조

### v1 (현재)

```json
{ "profile": {...}, "assignments": [...], "messages": [...], "practiceHistory": [...] }
```

### v2 (신규)

```json
{
  "version": 2,
  "users": [
    { "id": "u_3f2a...", "handle": "lee", "displayName": "Lee", "createdAt": "2026-09-12T..." }
  ],
  "workspaces": {
    "u_3f2a...": { "profile": {...}, "assignments": [...], "messages": [...], "practiceHistory": [...] }
  }
}
```

- `users`는 디렉터리(명부), `workspaces`는 사용자 id로 키가 잡힌 기존 `LearningState` 그대로입니다.
- 즉 **기존 상태 타입은 하나도 바뀌지 않고**, 그 위에 한 겹만 얹습니다. remote에서도 이 모양을 그대로 씁니다.
- 마이그레이션: 파일에 `version`이 없으면 v1으로 간주하고 D2에 따라 백업 후 빈 v2로 시작합니다(1회성, 멱등).

### PostgreSQL 경로

기존 `learning_workspaces` 테이블은 이미 `id` 기준 행 단위입니다(현재 `'local'` 하드코딩).
v2에서는 **그 `id`가 곧 userId**가 되므로 테이블 구조 변경 없이 다중 사용자가 됩니다. 명부용 테이블만 추가합니다.

```sql
CREATE TABLE IF NOT EXISTS learning_users (
  id           text PRIMARY KEY,
  handle       text UNIQUE NOT NULL,
  display_name text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT NOW()
);
```

`DATABASE_URL`이 설정되지 않은 현재 로컬 MVP에서는 이 경로가 동작하지 않으므로, 마이그레이션 반영은 별도 단계(S5)로 둡니다.

## 4. 작업 단계 (AGENTS.md의 "구현 1건당 1~2파일" 규칙 준수)

| 단계 | 파일 | 내용 | 상태 |
|---|---|---|---|
| S1 | `shared/schema.ts`, `server/store.ts` | User 타입·핸들 검증 스키마, v2 저장 구조, 사용자 명부 CRUD, `forUser()` 스코프 Store, v1 백업 마이그레이션 | 진행 |
| S2 | `server/identity.ts`(신규), `server/app.ts` | `resolveUserId()` 심, 요청별 스코프 주입, `GET/POST /api/users` | 대기 |
| S3 | `src/api.ts`, `src/App.tsx` | 선택된 사용자 헤더 전송(localStorage), 사용자 생성·전환 UI | 대기 |
| S4 | — | 타입 검사·빌드·브라우저 검증, `PROGRESS.md` 기록 | 대기 |
| S5 | `server/migrate.ts` | `learning_users` 테이블 추가(Postgres 경로 활성화 시) | 보류 |

P0-05(프로필 변경이 기존 과제에 반영되지 않는 UX 문제)의 조치는 S3에서 함께 반영하는 것을 권장합니다.

## 5. remote 전환 전 필수 체크리스트

이 목록을 끝내기 전에는 절대 외부에 노출하지 않습니다.

1. `resolveUserId()`를 실제 세션/OAuth 검증으로 교체. 헤더 기반 경로는 완전히 제거(비활성화가 아니라 삭제).
2. 모든 레코드 접근에 소유권 검사 추가. 지금은 스코프된 Store가 그 역할을 하지만, 조인/공유가 생기면 명시적 검사가 필요합니다.
3. `server/app.ts`의 localhost host 검사를 제거가 아니라 **대체**(인증 미들웨어로).
4. 쿠키: HttpOnly, Secure, SameSite=Lax 이상. 현재의 `X-Vibe-Lab` 헤더는 localhost 한정의 약한 CSRF 방어이므로 실제 CSRF 토큰으로 교체.
5. 레이트 리밋을 IP 기준에서 **사용자 기준**으로 변경(현재 `express-rate-limit` 설정).
6. 핸들에 개인정보를 넣지 않도록 UI에서 안내. 프로필의 `goal`·`major` 등은 AI 제공자에게 전달될 수 있음(이미 화면에 고지 중).

## 6. 열린 질문

- 사용자 삭제·이름 변경 UI를 MVP에 넣을지 (현재 계획: 생성·전환만).
- 포트폴리오 시연 시 데모 사용자 2~3명을 seed로 넣을지.
