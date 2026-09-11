# Vibe Lab

전공·직무·배경지식·학습 성향에서 출발하는 바이브 코딩 학습 서비스의 **로컬 1인용 MVP**입니다. TypeScript / React / Express / PostgreSQL로 구성했습니다. 개발 저장소: https://github.com/heurogenesis/Vibe_Lab. 로컬 작업 폴더: `C:\Users\monke\Vibe_Lab`.

## 구현한 흐름

1. **학습자 진단:** 전공·직무, 경험 수준, 익숙한 기술, 학습 스타일, 관심 분야, 목표, 회당 학습 시간을 입력합니다.
2. **맞춤 과제:** 업무 자동화 / 데이터 활용 / 교육·학습 분야에서 단계별 목표, 코딩 프롬프트, 원리 설명, 실험, 완료 조건을 생성합니다.
3. **실습과 대화:** 자신의 편집기 또는 Codespaces에서 코딩하며 가이드와 소통합니다. 원리 우선 성향은 이론을 프롬프트보다 먼저 보여줍니다.
4. **이해도 확인:** 서버에서 퀴즈를 채점하고 해설을 제공합니다. 다음 과제는 최근 점수와 진도에 따라 복습 또는 확장을 적용합니다.
5. **GitHub 탐색:** 공개 저장소 검색, 라이선스·README·루트 파일 구조 조회, 원본 저장소·Codespaces·템플릿 생성 페이지 연결을 제공합니다.
6. **제출·회고:** 공개 저장소 URL과 회고를 저장하고 최근 커밋, README, 해당 커밋의 Actions 결과를 조회합니다. **코드 실행·자동 채점·저장소 소유권 인증은 하지 않습니다.**
7. **학습 기록:** 프로필, 과제 생성 시점의 프로필 스냅샷, 진도, 퀴즈 결과, 대화, 제출 자료를 저장합니다. 과제를 Markdown으로 내보낼 수 있습니다.

## 빠른 실행

Node.js 22.12 이상(검증 환경: 24)을 사용합니다. 아래 명령은 이 README가 있는 `Vibe_Lab` 저장소 루트에서 실행합니다.

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

- 브라우저: http://127.0.0.1:5173
- API: http://127.0.0.1:3001/api/health
- `.env`가 없어도 체험 모드로 실행됩니다. 기존 `.env`가 있다면 복사하지 말고 필요한 항목만 추가하세요.
- 기본 모드에서는 `.data/learning.json`에 저장하므로 새로고침·서버 재시작 후에도 기록이 유지됩니다. 이 파일은 Git에서 제외됩니다.
- 5173 포트가 사용 중이면 기존 해당 개발 서버를 확인하세요. 이 프로젝트는 다른 포트로 자동 이동하지 않습니다.

## PostgreSQL 연결

Docker가 설치된 경우:

```powershell
docker compose up -d
```

`.env`에 다음 값을 설정합니다. 직접 설치한 PostgreSQL이나 제공받은 DB가 있다면 해당 연결 문자열로 바꾸세요.

```dotenv
DATABASE_URL=postgresql://vibelab:vibelab_local@127.0.0.1:5432/vibelab
```

```powershell
npm run db:migrate
npm run dev
```

DB 마이그레이션은 기존 학습 데이터를 보존합니다. 연결 실패 시 파일 모드로 몰래 전환하지 않고 시작을 중단합니다. 운영 DB의 TLS 인증은 제공자의 CA/연결 설정을 사용하며 인증서 검증을 무조건 끄지 않습니다.

**체험 파일과 PostgreSQL은 별도 저장소입니다.** 연결 전환 시 파일의 기존 기록을 자동 복사하지 않습니다. 현재 PostgreSQL은 한 워크스페이스의 생성 콘텐츠와 학습 기록을 JSONB에 보관하고, 행 잠금과 트랜잭션으로 동시 갱신을 직렬화합니다. 다중 사용자 운영 시에는 사용자·과제·제출·이벤트별 테이블과 소유권 조건을 분리하는 후속 마이그레이션이 필요합니다.

## AI 연결

```dotenv
OPENAI_API_KEY=사용자가_로컬에_설정
OPENAI_MODEL=사용_권한이_있는_Responses와_Structured_Outputs_지원_모델_ID
```

두 값을 모두 설정하고 서버를 재시작하면 OpenAI Responses API를 통해 과제 생성과 대화가 작동합니다. 모델은 임의로 고정하지 않았습니다. `store:false`, 제한된 대화 이력, 응답 스키마 검증, 요청 시간 제한과 빈도 제한을 적용했습니다. 애플리케이션의 `store:false`가 제공자의 모든 보관 정책을 없애는 것은 아닙니다.

- **미연결:** 준비된 규칙과 자료로 3개 분야의 과제를 생성하고 단계별 가이드를 제공합니다. 임의의 자유 질문을 추론하는 AI가 아닙니다.
- **연결:** 전공·직무·목표·스타일·기존 성과를 AI에 전달해 과제를 생성합니다. 질문 시 프로필, 현재 실습 단계, 최근 10개 대화 메시지를 전달합니다.
- AI 오류가 발생하면 오류를 표시합니다. AI 응답처럼 보이는 가짜 대체 답변은 제공하지 않습니다.
- 코드 실행, 셸 실행, GitHub 쓰기 도구는 AI에 제공하지 않습니다. API 키를 프론트엔드의 `VITE_*` 변수에 넣지 마세요.
- 서버에서 대화는 전체 워크스페이스 기준 최근 500개 메시지를 보관하고 과제는 최대 100개까지 생성합니다.

## GitHub 활용

별도 플러그인 없이 서버에서 GitHub REST API를 직접 호출합니다. 공개 자료를 읽기 때문에 기본 기능에는 토큰이 필수가 아닙니다. 제한에 자주 걸리면 `.env`에 `GITHUB_TOKEN`을 설정합니다. 서버 토큰으로 접근 가능하더라도 현재 화면은 공개 저장소만 허용합니다.

| 기능 | 사용 API |
| --- | --- |
| 과제 참고 저장소 탐색 | `GET /search/repositories` |
| 저장소 기본 정보·템플릿 여부 | `GET /repos/{owner}/{repo}` |
| 학습 자료 | `GET /repos/{owner}/{repo}/readme` |
| 코드 구조 | `GET /repos/{owner}/{repo}/contents` |
| 제출 근거 | `GET /repos/{owner}/{repo}/commits` |
| 자동 검사 기록 | `GET /repos/{owner}/{repo}/actions/runs` |

요청은 서버에서만 이루어집니다. 12초 제한, 최대 100항목의 5분 캐시, 권한·한도·연결 실패 안내를 적용했습니다. 검색/README 내용은 신뢰할 수 없는 외부 자료로 취급하며 HTML로 실행하지 않습니다. 자동 검사 결과는 최근 기본 브랜치 커밋과 SHA가 일치하는 실행 1건이며 전체 검사의 통과를 보장하지 않습니다.

참고 프로젝트는 Microsoft Web Dev for Beginners, TypeScript, node-postgres입니다. 코드를 복사·재배포하기 전에 각 저장소 라이선스를 확인해야 합니다. Codespaces는 GitHub 계정과 사용 한도에 따라 비용이 발생할 수 있으며, 이 앱은 생성 페이지 링크까지만 제공합니다. 저장소 생성·포크·Issue·PR 작성·공개 배포는 실행하지 않습니다.

## 개발과 검증

```powershell
npm run typecheck
npm test
npm run build
npm start
```

빌드 후 `npm start`는 Express가 API와 React 정적 파일을 함께 제공합니다. 접속 주소는 http://127.0.0.1:3001 입니다.

- 일반 테스트: API 학습 흐름, 오류·출처 검증, 진도 동시 갱신, 학습 결과 기반 난이도, GitHub 응답 계약, URL 제한, PostgreSQL JSONB 저장 계약(pg-mem).
- 실제 PostgreSQL 테스트: **폐기 가능한 별도 테스트 DB**를 만든 후 `TEST_DATABASE_URL`을 설정하고 `npm test`를 실행합니다. 테스트는 테스트 워크스페이스를 변경합니다. 운영용 `DATABASE_URL`을 테스트에 복사하지 마세요.
- `.github/workflows/ci.yml`은 저장소 루트에 배치되어 main 브랜치 push와 PR에서 PostgreSQL 서비스와 함께 빌드·테스트를 실행합니다.
- 현재 환경에서 실제 PostgreSQL·AI 키가 없으면 해당 외부 서비스의 실연결 검증은 별도입니다. pg-mem은 실제 PostgreSQL의 잠금/롤백 검증을 대신하지 않습니다.

## 구조

```text
src/           React 화면, 학습 흐름, API 클라이언트
server/        Express API, 과제 생성, AI/GitHub 클라이언트, 저장소
shared/        양쪽에서 사용하는 TypeScript 타입과 Zod 스키마
db/            PostgreSQL 마이그레이션
tests/         기능 및 API 통합 테스트
docs/          API 명세, 후속 요구사항
.github/       PostgreSQL 포함 CI
```

이 버전은 인증이 없는 **로컬 1인 워크스페이스**이며 Express는 `127.0.0.1`에만 바인딩됩니다. 공개 운영 전에는 로그인, 사용자별 데이터 격리, 권한, 세션, 동의·삭제 정책, AI 사용량 제한을 구현해야 합니다. 실제 키는 채팅이나 GitHub에 올리지 말고 로컬 환경변수 또는 배포 환경의 비밀 설정으로 전달하세요.

## 공식 근거

- [GitHub REST 요청 한도](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)
- [GitHub REST 권장 사용법](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api)
- [GitHub 저장소 콘텐츠](https://docs.github.com/en/rest/repos/contents)
- [GitHub Actions 실행 조회](https://docs.github.com/en/rest/actions/workflow-runs)
- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [React 상태](https://react.dev/learn/state-a-components-memory)
- [PostgreSQL 튜토리얼](https://www.postgresql.org/docs/current/tutorial.html)

다음 범위를 결정하기 위한 질문은 [추가 요구사항](docs/REQUIREMENTS.md), 개발 API는 [API 명세](docs/API.md)를 참고하세요.


Fork에서 작업 이력을 남기는 방법은 [Git 작업 안내](docs/GIT_WORKFLOW.md)를 참고하세요.
