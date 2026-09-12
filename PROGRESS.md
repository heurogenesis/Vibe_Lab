# Vibe LAB_Web 서비스 구현하기 (로컬 MVP → AWS 평가 배포)

> **AI Collaboration Rule**
> 본 문서는 GPT(기획/설계/문서화)와 Claude Code(코드 구현/리팩토링)의 작업 맥락을 동기화하기 위한 **단일 진실 출처(Single Source of Truth)**입니다.
> 진행 상태와 사용자 결정은 이 문서로 공유하되, 실제 동작은 해당 커밋의 코드와 검증 결과를 근거로 판단합니다. 구현 예정·구현됨·검증 완료를 구분해서 기록합니다.

**최종 갱신:** 2026-09-12 (KST)

**협업 문서:** 규칙은 `AGENTS.md`, 예정 작업·기간·리소스는 `ROADMAP.md`, Claude Code 진입 안내는 `CLAUDE.md`에서 관리합니다.

**현재 상태:** 로컬 MVP 구현 중 / Claude 인수인계를 위한 세이브 포인트. AWS 배포와 실사용 LLM 연결은 수행하지 않았습니다.

---

## 1. 프로젝트 개요 & 환경설정

- **프로젝트 목표:** 다양한 전공의 이공계 대학생과 엔지니어 직장인이 배경·직무·코딩 경험에 맞는 실습으로 코드를 작성하고, 실행 결과와 원리를 함께 학습하는 웹서비스를 만듭니다. 초기 우선순위는 **실무 엔지니어의 데이터 처리**입니다.
- **교육·포트폴리오 목표:** 사용자가 제시한 2026년 9월 15일 LG Display 사내 Vibe Coding 교육 일정에 맞춰 TypeScript·서버·DB 지식을 활용한 MVP를 제작합니다. 이후 일본 SoftBank Hackathon과 한국 「모두의 창업 2기」 제출을 계획하고 있습니다. 각 행사의 공식 일정·지원 자격·제출 형식은 아직 확인하지 않았습니다.
- **개발/배포 원칙:** MVP 구축·검증은 로컬에서, 평가 단계에서만 AWS EC2와 RDS PostgreSQL을 사용합니다.
- **Tech Stack:** TypeScript, React 19, Express 5, PostgreSQL (`pg`), Vite 7, Node.js, Zod, Vitest. Python/FastAPI 프로젝트가 아닙니다. Node 요구사항은 `package.json`의 `engines`를 따릅니다(현재 22.12 이상, 확인된 로컬 버전 24.21.0).
- **원격 저장소:** https://github.com/heurogenesis/Vibe_Lab.git
- **로컬 저장소:** `C:\Users\monke\Vibe_Lab`
- **기본 브랜치:** `main` (`origin/main` 추적)
- **현재 작업 브랜치:** `feature/mvp-savepoint-20260912`
- **이번 작업의 기준 커밋:** `a83aef8` — `chore: move Vibe Lab to standalone repository` (2026-09-12 확인: 실제 HEAD는 5b9bece로 한 커밋 앞서 있음. origin과는 동기화됨 - 5절 결정 기록 참고.)
- **작업 시작 위치:** `package.json`이 있는 저장소 루트. 이전 `C:\Users\monke\KNDA`에서 개발을 이어가지 않습니다.

### 로컬 실행

```powershell
cd C:\Users\monke\Vibe_Lab
npm.cmd ci       # 처음 받았거나 package-lock.json이 변경된 경우
npm.cmd run dev
```

- Chrome: http://127.0.0.1:5173/
- API 상태: http://127.0.0.1:3001/api/health
- 프런트엔드와 Express를 함께 실행합니다. Vite가 `/api`와 `/practice-sandbox.html`을 API 서버로 전달합니다.
- `DATABASE_URL` 미설정 시 `.data/learning.json`에 저장합니다. PostgreSQL 검증 시 `.env.example`, `compose.yaml`, `npm.cmd run db:migrate`를 확인합니다.
- API 서버는 현재 `127.0.0.1`에 바인딩된 **단일 사용자 로컬 앱**입니다. 이 상태를 그대로 인터넷 공개 서비스로 간주하지 않습니다.
- 검증 명령: `npm.cmd test`, `npm.cmd run build`.

### Git 및 Fork

1. Fork에서 `C:\Users\monke\Vibe_Lab`을 엽니다.
2. `feature/mvp-savepoint-20260912`와 Local Changes를 확인합니다.
3. 후속 작업은 `feature/*` 브랜치에서 수행합니다. 검토 후 Fork에서 `main`으로 병합합니다.
4. Commit은 로컬 기록, Push는 원격 업로드입니다. 다른 PC에서는 원격에 올라온 브랜치인지 먼저 확인합니다.
5. GitHub Actions의 빌드·PostgreSQL 테스트 **실행 결과**를 확인한 뒤 CI 통과로 기록합니다.

`.env`, `.data`, `node_modules`, `dist`, `dist-server`는 커밋 대상에서 제외됩니다. 저장소 분리 이력과 백업 위치는 `docs/GIT_WORKFLOW.md`를 참고합니다. 이전 `First-Sec` 백업 브랜치는 새 원격에 올리지 않습니다.

---

## 2. AI 역할 분담 및 접근 권한

| 구분 | 담당 AI | 주요 역할 | 권한 / 규칙 |
| :--- | :--- | :--- | :--- |
| 기획 & 설계 | GPT (Codex) | 구조 설계, API·데이터 계약, 알고리즘 검토, 코드 리뷰, 진행 문서 관리 | **제품 코드 읽기 전용**. 사용자가 요청한 문서 작성·수정은 수행합니다. |
| 구현 & 수정 | Claude Code | 로컬 코드 생성·수정, 리팩토링, 버그 수정, 테스트 | 사용자가 허용한 로컬 파일·명령·Git 권한을 사용합니다. 협업 전달 경로는 GitHub와 Fork입니다. |
| 승인 & 평가 | 사용자 | 우선순위, 설정 변경 승인, 병합·배포·평가 결정 | API 키와 AWS 계정을 관리합니다. |

**적용 시점:** 이 역할 분담은 본 인수인계부터 적용합니다. 아래에 기록된 기존 코드와 이번 세이브 포인트의 구현은 **GPT/Codex가 수행**했습니다. Claude가 구현했다고 소급하여 기록하지 않습니다.

**인수인계 절차:** Claude는 먼저 이 문서 → Git 상태 → 3절의 미완료 항목을 확인합니다. 한 작업이 끝나면 변경 파일, 실제 검증 명령·결과, 남은 항목을 이 문서에 갱신합니다. 두 AI가 같은 파일을 동시에 수정하지 않도록 담당 작업을 명시합니다.

---

## 3. 작업 진행 현황 (Task Checklist)

### 🟢 완료된 작업 (Done)

- [x] **[구현]** TypeScript/React/Express 앱과 프로필·과제·진도·퀴즈·튜터·GitHub 탐색 화면 구성 — GPT/Codex.
- [x] **[구현]** PostgreSQL JSONB 저장 어댑터와 로컬 파일 저장 어댑터, SQL 마이그레이션 구성 — GPT/Codex.
- [x] **[구현]** GitHub 공개 저장소 검색, README·파일·커밋·Actions 확인, 제출 회고 기록 — GPT/Codex. 저장소 코드를 자동 실행·채점하는 기능은 아닙니다.
- [x] **[구현]** OpenAI SDK 기반 선택적 과제 생성·텍스트 튜터 연결 코드 — GPT/Codex. 실제 제공받은 키와의 연결은 미검증입니다.
- [x] **[저장소]** `vibe-lab` 하위 폴더 이력을 독립 저장소 루트로 이전하고 기존 기준 커밋을 `origin/main`에 반영 — GPT/Codex.
- [x] **[진단]** 같은 관심 분야에서는 전공·직무가 달라도 학습 목표가 같던 문제 재현 — GPT/Codex.
- [x] **[구현]** 선택적 `personaId`, `disciplineId`, `interests`와 전공별 추천 구조 추가 — GPT/Codex. 기존 프로필을 읽고 알 수 없는 분야에는 공통 실습을 안내합니다.
- [x] **[구현]** 9개 이공계 분야 + 공통 분야 + 프로젝트 운영 분야에 4개 공통 템플릿을 적용한 **44개 실습 변형** 추가 — GPT/Codex. 44개의 서로 다른 전문 알고리즘을 개발했다는 의미는 아닙니다.
- [x] **[구현]** 단계별 실습 및 자료실에 TypeScript 코드 셀·콘솔·테스트·준비된 힌트·코드 다운로드 추가 — GPT/Codex.
- [x] **[구현]** GitHub의 버전 고정 공개 데이터 조회, 브라우저 캐시, 크기·행·필드 검증 추가 — GPT/Codex. 실제 원본은 현재 Palmer Penguins 1종이며 생명·바이오 실습에서 선택합니다.
- [x] **[구현]** 코드와 원자료를 전송하지 않는 테스트 요약 저장 API 추가 — GPT/Codex. 최근 100건, 과제별 마지막 결과를 보관합니다.
- [x] **[검증]** 자동 테스트 **65개 통과 / 실제 PostgreSQL 통합 테스트 1개 건너뜀** — 2026-09-12 로컬 실행. 44개 실습의 참조 구현과 공개 테스트도 포함합니다.
- [x] **[브라우저 검증]** 전자공학 평균 실습: 빈칸 예제는 2/5 통과, 올바르게 완성한 함수는 5/5 통과, `console.log`와 실제 결과 표시 확인 — GPT/Codex.

- [x] **[검증]** 최종 TypeScript 검사·Vite 프런트 빌드·서버 빌드 통과 — 2026-09-12. TypeScript 동적 청크 크기와 외부 의존성 주석 경고는 남아 있습니다.
- [x] **[브라우저 검증 · P0-01]** 실제 브라우저(센서 측정 로그: 유효 데이터 평균 실습)에서 확인 — Claude Code, 2026-09-12. 정상 구현 5/5 통과. 문법 오류(괄호 누락)는 컴파일 단계에서 에러 메시지로 표시. 런타임 오류(널 참조)는 예외 메시지로 표시. 무한 루프(while(true))는 정확히 5초 후 타임아웃 메시지로 중단되고 그 사이 메인 페이지 반응성은 유지됨(Worker/iframe 격리 확인). 실행 중 수동 중지 클릭 시 즉시 취소. 실행 중 실습 화면을 이탈하면 컴포넌트 언마운트로 iframe이 자동 정리되고(잔여 iframe 0개, 콘솔 에러 없음) 재진입 시 이전 결과가 남지 않음을 확인. 코드 수정 시 이전 결과가 즉시 무효화되는 것도 함께 확인. 코드 변경 없음(기존 구현이 요구사항을 충족).

### 🟡 진행 중인 작업 (In Progress)
- [ ] **[검증]** GitHub 데이터의 브라우저 직접 조회, 장애 표시, 합성 데이터 전환, 캐시 확인 — Claude 후속. 원본 HTTP 조회와 단위 테스트만 완료했습니다.
- [ ] **[검증]** 네트워크 차단, 앱 저장소 접근 제한, 프로덕션 CSP 환경에서 코드 셀 동작 확인 — Claude 후속. 현재 헤더 계약 테스트와 기본 브라우저 실행만 확인했습니다.
- [ ] **[검증]** 기존 이공계 프로필이 관심 분야를 ‘업무 자동화’로 저장했어도 새 실습으로 연결되는 경로의 화면 확인 — Claude 후속. 해당 분기는 코드·자동 테스트에 반영했습니다.
- [ ] **[검증]** 코드 셀과 자료실의 전체 화면/작은 화면 시각 검수, 실행 기록 저장 후 목록 갱신 확인 — Claude 후속.

### 🔴 대기 중인 작업 (To-Do)

- [ ] **P0 · Claude:** 실제 PostgreSQL로 마이그레이션·프로필·과제·실행 요약 저장을 검증합니다. 완료 조건: `TEST_DATABASE_URL`을 설정한 별도 테스트 DB에서 통합 테스트 통과. 사용자 학습 DB를 테스트 대상으로 사용하지 않습니다.
- [ ] **P0 · GPT/사용자:** 9월 15일 시연 범위와 평가 기준 확정. 전자/기계/화학 등 다른 프로필에 대한 추천 차이와 코드 수정→실행→설명을 시연합니다.
- [ ] **P0 · Claude:** 브라우저 검증 결과로 발견된 문제를 한 작업당 1~2개 파일씩 수정하고 회귀 테스트를 남깁니다.
- [ ] **P1 · GPT/사용자:** 선결제 API 키의 실제 공급자, 모델, 엔드포인트, 호출 한도 확인. 실제 키는 대화나 문서에 기록하지 않습니다.
- [ ] **P1 · Claude:** 확인된 API 계약에 맞춘 LLM 설명·피드백 연결. 코드/테스트 결과를 근거로 설명하도록 구현하고 호출량·오류를 표시합니다.
- [ ] **P1 · GPT/Claude:** 전공별 실무 데이터 출처 확장. 라이선스·버전·출처·데이터 의미를 확인한 뒤 등록합니다.
- [ ] **배포 전 · GPT:** 사용자 인증·학습 기록 분리·배포용 허용 출처·RDS TLS·비밀 관리 설계. 인증 방식은 아직 결정하지 않았습니다.
- [ ] **배포 전 · Claude:** 승인된 설계에 따라 EC2/RDS 연결, HTTPS, 자동 배포·롤백, 로그·알람·백업 복구 및 리소스 정리 절차 구현.
- [ ] **제출 전 · 사용자/GPT:** Hackathon/창업 프로그램의 실제 공고와 제출 요건 확인, 데모 영상·아키텍처·검증 결과·비용 판단을 포트폴리오로 정리.

**현재 범위 밖:** 결제, OAuth/JWT 구현, Python/Colab 커널, npm/OS 셸 터미널, 임의 GitHub 저장소 코드 자동 실행, 서비스 공개 운영. 도입 여부는 별도 결정합니다.

---

## 4. 제약 사항 & 코드 규칙 (Guardrails)

공통 규칙의 원본은 `AGENTS.md`입니다. 작업 전 반드시 읽습니다. 주요 제약은 제품 코드 역할 분리, `feature/*`에서 작업 후 검토·병합, 한 구현 작업당 1~2개 파일, 핵심 설정 변경 사전 승인, 비밀의 서버 측 관리입니다. 사용자의 최신 명시적 지시가 우선합니다.

---

## 5. 의사결정 및 작업 기록 (Decision Log)

| 날짜 | 결정 및 근거 | 상태 |
| :--- | :--- | :--- |
| 2026-09-12 | 전자공학 한 분야에서 다양한 이공계 대학생·엔지니어로 확장. 분야와 페르소나 ID는 추가 가능한 문자열로 관리. | 구현 반영 |
| 2026-09-12 | 첫 학습 초점은 실무 엔지니어 데이터 처리. LLM보다 실행·테스트 피드백을 먼저 검증. | 사용자 확정 |
| 2026-09-12 | 원자료는 GitHub/외부 읽기 API 활용을 우선 검토하고 서버에는 출처·학습 기록 중심으로 저장. | GitHub 1종 구현, 외부 DB 미연결 |
| 2026-09-12 | Colab과 유사한 코드 셀을 제공하되 초기 실행 범위는 브라우저 TypeScript 함수. | 기본 실행 확인 |
| 2026-09-12 | MVP 개발은 로컬, AWS EC2/RDS는 평가 배포 시 사용. | AWS 미생성 |
| 2026-09-12 | 제공받는 키는 선결제 API 사용 계정의 키. LG Display 자체 API라는 가정 철회. OpenAI 호환으로 안내받았으나 실제 공급자와 지원 API 계약은 확인 필요. | 실제 키 미연결 |
| 2026-09-12 | AWS 비용은 정밀 견적 대신 개략 예산으로 관리. | 7절 참고 |
| 2026-09-12 | 협업 전달 경로를 GitHub와 Fork로 확정. 공통 규칙·진행 상태·예정 작업을 분리하고 Claude Code 진입 문서를 추가. | 문서 반영 |
| 2026-09-12 | 사용자 요청으로 구현을 멈추고 세이브 포인트 및 GPT/Claude 인수인계 작성. 이후 제품 코드 구현 담당은 Claude. | 본 문서부터 적용 |
| 2026-09-12 | Claude Code가 ROADMAP P0-01(실행·중단·오류 브라우저 검증)을 수행. 작업 시작 시 HEAD가 문서 상단 기준 커밋(a83aef8)보다 한 커밋 앞선 5b9bece임을 확인 - origin과는 동기화 상태. 추정으로 완료 처리하지 않고 1절에 차이만 기록. | P0-01 완료, 코드 변경 없음 |

---

## 6. 검증 결과 & 알려진 한계

| 항목 | 확인된 결과 | 후속 확인 |
| :--- | :--- | :--- |
| `npm.cmd test` | 65 passed / 1 skipped (2026-09-12) | 실제 PostgreSQL 통합 테스트 |
| `npm.cmd run build` | 통과, 종료 코드 0 (2026-09-12) | 최초 코드 실행 시 TypeScript 동적 번들 크기 관찰 |
| 브라우저 코드 실행 | 센서 평균 실습 실패→수정→5/5 통과, 콘솔 출력 확인. 문법/런타임 오류 정상 표시, 5초 타임아웃·수동 중지·화면 이탈 시 취소 확인 (2026-09-12) | 비동기 수집·네트워크 경계(P0-02)·외부 데이터(P0-03) |
| 외부 데이터 | 고정 커밋 원본 JSON HTTP 200, 파서·크기 제한·캐시 테스트 통과 | 브라우저 CORS/실제 조회·장애 복구 |
| GitHub Actions | 워크플로 파일 존재 | 이번 변경의 원격 CI 실행 결과 미확인 |
| LLM / AWS | 연결·배포하지 않음 | 실제 공급자 확인 / 평가 단계 배포 |

- 실행기는 TypeScript 문법을 JavaScript로 변환하며 전체 타입 검사는 하지 않습니다. 테스트가 통과해도 모든 입력의 정확성을 보장하지 않습니다.
- 편집 코드는 화면을 떠나면 유지되지 않습니다. 현재는 코드 다운로드로 보관합니다. 자동 임시 저장은 후속 개선 후보입니다.
- 실행 기록 저장 직후 자료실 목록이 즉시 갱신되는지 확인해야 합니다. 현재 화면 상태 전달 경로의 후속 점검 대상입니다.
- 데이터셋 원본은 서버/DB에 저장하지 않지만 프로필·과제·대화는 기존 저장 방식대로 보관합니다. 전체 시스템이 무저장 구조는 아닙니다.
- 사용자별 인증과 데이터 분리가 없습니다. PostgreSQL도 현재 `learning_workspaces`의 `local` 워크스페이스 JSONB 구조입니다.
- 브라우저 기본 실행이 확인되었어도 고의적 메모리 고갈까지 안전하다고 보장하지 않습니다. 다중 사용자 터미널에는 별도 격리 설계가 필요합니다.
- 인앱 브라우저에서 Vite WebSocket 연결 실패 로그가 관찰되어 일부 변경은 새로고침 후 확인했습니다. 일반 Chrome에서도 발생하는지 먼저 재현한 뒤 HMR 설정 변경 여부를 판단합니다.

---

## 7. 비용·데이터·배포 참고

**개략 AWS 예산:** 로컬 개발 중 0원 / 평가 2~3일 약 1만~2만 원 / 1주 약 2만~3만 원 / 1개월 약 7만~10만 원.

서울 리전에서 소형 Linux EC2 1대, Single-AZ RDS PostgreSQL 1대, 각각 기본 저장공간과 공인 IPv4 1개, 소량 트래픽을 가정했습니다. 환율은 달러당 1,500원 가정이며 LLM 토큰·도메인·별도 ALB/NAT·Multi-AZ는 별도입니다. 평가 종료 후 리소스를 삭제하는 조건이며 디스크·스냅샷을 남기면 비용이 지속됩니다. 상세 가정과 공식 출처는 `docs/MVP_ENGINEERING.md`에 있습니다.

포트폴리오에는 서비스 화면뿐 아니라 자동 배포·롤백, DB 접근 제한, 로그·알람, 백업 복구, 비용 추정과 평가 종료 후 정리 증거를 포함합니다. 서비스 수를 늘리기보다 선택 이유와 검증 결과를 남깁니다.

---

## 8. Claude Code가 처음 이어서 할 일

1. **상태 확인:** 저장소 루트에서 `git status --short --branch`, `git log -3 --oneline`을 실행합니다. 이 문서가 포함된 세이브 포인트 브랜치인지 확인합니다. 원격에 아직 없는 로컬 커밋일 수 있습니다.
2. **실행 확인:** 실행 중인 개발 서버가 있으면 재사용합니다. 없으면 `npm.cmd run dev`로 시작합니다. `/api/health`로 저장 모드와 AI 연결 상태를 확인합니다.
3. **첫 검증:** 기존 프로필을 변경하지 않고 새 맞춤 과제 또는 자료실에서 센서 평균 실습을 엽니다. 기본 빈칸 상태의 실패와 정상 구현의 통과를 확인합니다.
4. **다음 작업 선택:** `ROADMAP.md`의 P0-01부터 의존 순서로 하나를 선택합니다. 우선 브라우저 중지·타임아웃·외부 데이터 조회를 확인하고 실제 문제가 있을 때만 1~2개 파일을 수정합니다.
5. **마감 기록:** 변경 파일, 검증 결과, 미해결 항목을 갱신하고 다음 작업자가 시작할 위치를 남깁니다.

### 필요한 경우 읽을 파일

| 작업 | 코드/문서 |
| :--- | :--- |
| 전공·페르소나·추천 변경 | `shared/schema.ts`, `shared/catalog.ts`, `server/practice-curriculum.ts` |
| 실행·콘솔·중단·CSP 검증 | `src/CodeLab.tsx`, `src/runner.ts`, `server/sandbox.ts`, `server/app.ts` |
| 자료실과 화면 연결 | `src/PracticeLibrary.tsx`, `src/Profile.tsx`, `src/Workspace.tsx`, `src/App.tsx` |
| 외부 데이터 출처 추가 | `shared/data-sources.ts`, `src/data-loader.ts`, `docs/MVP_ENGINEERING.md` |
| 저장·API·통합 검증 | `server/store.ts`, `server/app.ts`, `db/001_initial.sql`, `tests/practice.test.ts`, `tests/postgres.integration.test.ts` |
| LLM 연결 검토 | `server/ai.ts`, `server/index.ts`, `.env.example`, `tests/ai.test.ts` |
| 기존 API·실행·Git 설명 | `README.md`, `docs/API.md`, `docs/GIT_WORKFLOW.md` |

기존 `docs/API.md`에는 이번 실행 요약 API가 아직 정리되지 않았습니다. 이번 변경의 계약은 `server/app.ts`와 `docs/MVP_ENGINEERING.md`를 먼저 확인하고, 후속 문서 작업에서 기존 API 문서를 갱신합니다.

### 다음 업데이트 기록 양식

```text
날짜 / 담당 AI:
작업 목적:
브랜치 / 커밋:
변경 파일 (1~2개):
검증 명령과 실제 결과:
남은 문제 / 다음 작업:
사용자 승인 또는 결정이 필요한 사항:
```

### 2026-09-12 업데이트 기록

```text
날짜 / 담당 AI: 2026-09-12 / Claude Code
작업 목적: ROADMAP.md P0-01(실행·중단·오류 검증)을 실제 브라우저에서 확인
브랜치 / 커밋: feature/mvp-savepoint-20260912 @ 5b9bece (origin과 동기화 확인, 코드 수정 없어 새 커밋 없음)
변경 파일 (1~2개): 없음 (검증만 수행, 기존 구현이 요구사항 충족)
검증 명령과 실제 결과:
  - git status --short --branch: 클린, ## feature/mvp-savepoint-20260912...origin/feature/mvp-savepoint-20260912
  - /api/health: 200 {"storage":"demo-file","ai":false,"githubAuthenticated":false,"localOnly":true} (기존 dev 서버 재사용, 새로 기동하지 않음)
  - 브라우저(데이터 실습 자료실 -> 센서 측정 로그: 유효 데이터 평균, 5개 테스트)에서 확인:
    1) 빈칸 기본 코드 실행 -> 2/5 통과 (기존 문서 기록과 일치)
    2) 올바른 구현으로 교체 실행 -> 5/5 통과, 미리보기 1.6499999999999997
    3) 코드 수정 시 이전 결과 즉시 무효화(콘솔 패널이 안내 문구로 리셋)
    4) 문법 오류(괄호 누락) 실행 -> 컴파일 단계에서 "')' expected." 에러 표시, 0/5, UI 정상 복귀
    5) 런타임 오류(널 참조) 실행 -> "Cannot read properties of null (reading 'boom')" 에러 표시, UI 정상 복귀
    6) 무한 루프(while(true){}) 실행 -> 정확히 5초 후 "실행 제한 시간(5초)을 초과했습니다..." 메시지, 대기 중 메인 페이지 반응성 유지(Worker/iframe 격리 확인), UI 복귀
    7) 무한 루프 실행 중 중지 클릭 -> 즉시 "실행을 중지했습니다." 메시지, 5초 대기 없이 취소
    8) 무한 루프 실행 중 실습 화면 이탈(자료실로 이동) -> 컴포넌트 언마운트로 iframe 자동 제거 확인(잔여 iframe 0개, 콘솔 에러 없음), 같은 실습 재진입 시 이전 결과 미노출
  - 콘솔 로그: Vite HMR 연결 정상(connecting/connected), React DevTools 안내만 존재, 에러 없음. 문서 6절의 "인앱 브라우저 WebSocket 연결 실패" 증상은 이번 확인(Claude 내장 브라우저)에서는 재현되지 않음 - 환경 차이일 수 있어 단정하지 않음.
남은 문제 / 다음 작업: P0-01 요구 시나리오는 기존 구현으로 충족되어 코드 수정 없음. 다음은 ROADMAP.md의 P0-02(실행 경계: 네트워크/앱 저장소 접근 제한, 프로덕션 CSP) 또는 P0-03(외부 데이터 흐름 검증)을 이어서 진행 권장.
사용자 승인 또는 결정이 필요한 사항:
  1) 문서 상단 "이번 작업의 기준 커밋"을 실제 HEAD(5b9bece)로 갱신할지 여부 - 이번에는 차이만 기록하고 임의로 덮어쓰지 않음.
  2) 로컬 GitHub MCP 연동(연결된 "github" 서버)이 heurogenesis/Vibe_Lab에 접근 권한이 없어(비공개 저장소이거나 다른 계정 토큰으로 추정) 원격 저장소를 API로 직접 조회하지 못함 - git status/branch -vv로 로컬 클론이 origin과 diff 없이 동기화됨을 확인했으므로 이번 검증 결과에는 영향 없음. 필요 시 토큰 재설정 검토.
```

### 2026-09-12 (2차) P0-05 조사 중단 기록 (안전 정지)

```text
날짜 / 담당 AI: 2026-09-12 / Claude Code
작업 목적: ROADMAP P0-05(프로필 변경 시 워크스페이스가 안 바뀌는 증상) 원인 조사
브랜치 / 커밋: feature/mvp-savepoint-20260912 (이 기록 시점 코드 변경 없음, 조사만 진행)
변경 파일 (1~2개): 없음
진행 상황: 사용자가 외출 예정 + PC 종료 가능성을 알려와 안전하게 조사를 중단함. 코드 수정 없이 읽기만 했으므로 잃은 작업 없음. 다음 시작 지점을 아래에 남김.
  - usesPractice(profile) (shared/catalog.ts)은 domain==='data'이거나 personaId가 있거나 resolveDiscipline(profile).id !== 'general'이면 결정론적 44개 실습 카탈로그로 라우팅하고 생성형 AI 경로(generateRules 대신 AI)는 건너뜀.
  - resolveDiscipline()에서 major 키워드가 하나도 안 맞으면 disciplines[disciplines.length-1]로 폴백하는데, 배열을 직접 열어보니 'general'이 실제로 마지막 원소라서 이 폴백은 general로 정상 귀결됨 - 처음 세웠던 가설(마지막 원소가 general이 아니라 엉뚱한 분야로 빠진다)은 코드 근거가 약함. 기각까지는 아니고 "현재는 근거 부족"으로만 기록.
  - 브라우저에서 관찰된 기본 화면의 추천 사유가 "전자공학"으로 나온 건, 화면에 보이던 프로필이 shared/schema.ts의 defaultProfile(major='경영학', 미확정 다수)이 아니라 .data/learning.json에 이미 저장돼 있는 이전 세션(GPT/Codex)의 실제 프로필일 가능성이 큼 - 그 저장값에 disciplineId/personaId가 이미 명시돼 있을 수 있음. 다음 조사자는 .data/learning.json의 실제 저장값부터 확인할 것.
남은 문제 / 다음 작업: 프로필 화면에서 전공·페르소나를 실제로 바꿔가며(예: 화학·화학공학, 다른 personaId) 브라우저에서 추천이 실제로 달라지는지 확인하는 실증 테스트가 아직 수행되지 않음 - 다음 세션에서 이어서 진행.
사용자 승인 또는 결정이 필요한 사항: 없음. 다음 세션 시작 시 이 기록부터 이어가면 됨.
```

### 2026-09-12 (3차) P0-05 원인 확정 (코드 결함 아님 · UX 문제)

```text
날짜 / 담당 AI: 2026-09-12 / Claude Code
작업 목적: ROADMAP P0-05 (프로필을 바꿔도 실습 워크스페이스가 안 바뀌는 증상) 원인 확정
브랜치 / 커밋: feature/mvp-savepoint-20260912
변경 파일: 없음 (조사와 기록만 수행)
확인한 근거:
  - .data/learning.json의 최상위 profile: major=화학공학, role=공정설계, disciplineId=chemical, personaId=student, interests=[quality]
  - 반면 assignments[0](2026-09-12 04:22 생성)과 assignments[1](2026-09-11 생성)에 박제된 profile은 둘 다 major=전자공학, role=PM이고 disciplineId/personaId/interests 키가 아예 없음
  - server/app.ts: PUT /api/profile은 state.profile만 갱신하고 기존 과제는 손대지 않음. 과제는 POST /api/assignments에서만 ai.generate(state.profile, state.assignments)로 생성되고, createAssignment가 그 시점의 프로필을 과제 안에 복사해 고정함(Assignment.profile)
  - src/App.tsx saveProfile(): PUT 후 토스트("새 맞춤 과제를 생성하면 변경된 배경이 반영됩니다")만 띄우고 home으로 이동, 자동 재생성 없음
  - src/App.tsx: const active = state.assignments.find(a=>a.id===activeId) || state.assignments[0] -> 워크스페이스는 항상 기존(가장 최근) 과제를 표시
  - src/Home.tsx: const active = state.assignments[0]. 기본 CTA는 "이어서 실습하기"(기존 과제 열기)이고, 새로 만드는 "새 맞춤 과제"는 목록 제목 옆 작은 text-button이라 발견성이 낮음
결론: shared/catalog.ts의 usesPractice()/resolveDiscipline() 결함이 아님. 이전 세션의 폴백 가설은 기각. 과제는 설계상 "생성 시점 프로필로 고정되는 이력 데이터"이며, 프로필 변경이 기존 과제에 소급 적용되지 않는 것이 실제 원인. 사용자에게는 "프로필을 바꿨는데 워크스페이스가 그대로"로 보이는 UX·발견성 문제.
권장 조치(택1): (a) 현재 프로필과 최근 과제의 profile이 다르면 홈에 배너 + "새 과제 생성" 버튼을 눈에 띄게 노출 (src/Home.tsx 1파일), (b) 프로필 저장 직후 새 과제 생성 여부를 묻기, (c) 현행 유지 + 안내 문구만 강화
남은 문제 / 다음 작업: 사용자 요청으로 다중 사용자(사용자별 아이디) 설계가 우선 진행됨. P0-05 UX 조치는 그 작업과 함께 반영 권장.
```

### 2026-09-12 (4차) 다중 사용자(사용자별 아이디) 구현

```text
날짜 / 담당 AI: 2026-09-12 / Claude Code
작업 목적: 사용자별 아이디 생성·전환 기능 구현 (로컬 우선, 추후 remote 확장 고려한 설계)
브랜치: feature/mvp-savepoint-20260912
사용자 결정(대화에서 승인): (D1) 인증은 핸들만, 비밀번호 없음 / (D2) 기존 .data/learning.json은 백업 후 새로 시작
설계 문서: docs/MULTI_USER_DESIGN.md (신규)
변경 파일:
  [S1 저장 구조] shared/schema.ts, server/store.ts
  [S2 신원 심·라우트] server/identity.ts(신규), server/app.ts (+ server/index.ts 생성자 1줄)
  [S3 클라이언트] src/api.ts, src/Users.tsx(신규), src/App.tsx
  [동반 수정] tests/learning.test.ts, tests/practice.test.ts, tests/postgres.integration.test.ts, db/001_initial.sql
  ※ AGENTS.md의 "1건당 1~2파일" 규칙에 맞춰 S1/S2/S3로 나눠 진행했고, index.ts(1줄)와 테스트·DB는 각 단계의 필수 동반 수정입니다.
핵심 설계:
  - resolveUser(req)가 신원을 판단하는 유일한 지점(server/identity.ts). 로컬은 X-Vibe-User 헤더를 사용자 명부와 대조하고, remote 전환 시 이 함수 내부만 세션/OAuth로 교체하면 됨.
  - UserStore.forUser(userId)가 기존 Store 인터페이스 그대로의 "한 사람 워크스페이스" 뷰를 반환 -> 라우트 핸들러 로직은 사실상 무변경.
  - 저장 구조 v2: {version:2, users:[...], workspaces:{userId: 기존 LearningState}}. 기존 상태 타입은 변경 없음.
  - 헤더 방식은 인증이 아니라 워크스페이스 분리임을 코드 주석·설계 문서·UI 문구에 명시. localhost 바인딩과 host 검사가 유일한 신뢰 근거.
검증 명령과 실제 결과:
  - npm run typecheck: 통과
  - npm test: 66 passed | 1 skipped(TEST_DATABASE_URL 필요). 첫 실행에서 electronics:clean이 5초 타임아웃으로 1회 실패했으나 재실행 시 310ms로 통과 - 콜드 스타트(transform 10.5s) 영향으로 판단하며 이번 변경과 무관.
  - npm run build: 통과 (기존 typescript 청크 크기 경고만 유지)
  - 신규 테스트: tests/learning.test.ts의 'multi-user workspaces' 스위트 - 사용자 생성, 중복 핸들 409, 잘못된 핸들 400, 미선택 401, 알 수 없는 사용자 401, 두 사용자 워크스페이스 격리
  - 기존 데이터 마이그레이션: 서버 재기동 시 v1 파일(29,285 bytes)이 .data/learning.backup-2026-09-12T13-00-26-878Z.json으로 이동되고 빈 v2로 시작함을 실제 확인
  - 브라우저(내장 브라우저, http://127.0.0.1:5173): 학습자 선택 화면 -> sora(소라) 생성 -> 프로필 저장·과제 생성 -> 새로고침 후에도 유지(localStorage) -> '전환' -> jin(진우) 생성 시 빈 워크스페이스(과제 0개, 소라 과제 미노출) -> 다시 소라로 전환 시 과제·프로필 그대로. 콘솔 에러 없음.
  - API 직접 확인: 헤더 없음 401, 알 수 없는 사용자 401
부수 확인(P0-05 실증): 프로필을 화학공학·공정설계로 저장한 뒤 새 과제를 생성하니 '화학·화학공학 · 반응 조건 실험: 유효 데이터 평균'으로 생성됨. "프로필 변경은 새 과제 생성 시 반영된다"는 3차 기록의 결론이 실제 동작으로 확인됨.
남은 문제 / 다음 작업:
  1) P0-05 UX 조치 미적용: 현재 프로필과 최근 과제의 profile이 다를 때 홈에 안내 배너 + '새 과제 생성' 버튼을 눈에 띄게 노출 (src/Home.tsx 1파일) 권장.
  2) /api/github/* 도 학습자 선택 이후에만 접근 가능해짐(fail-closed 의도). 미선택 상태에서도 GitHub 탐색이 필요하면 가드 앞으로 이동 필요.
  3) PostgreSQL 경로는 코드와 db/001_initial.sql(learning_users 테이블)까지 준비했으나 DATABASE_URL 미설정이라 실제 DB 검증은 못 함. 사용 시 npm run db:migrate 필요.
  4) 사용자 삭제·이름 변경 UI 없음(생성·전환만).
사용자 승인 또는 결정이 필요한 사항: 없음(D1·D2로 결정 완료). remote 공개 전에는 docs/MULTI_USER_DESIGN.md 5절 체크리스트를 반드시 완료해야 함.
```

### 2026-09-12 (5차) P0-05 UX 조치 (프로필 변경 안내 배너)

```text
날짜 / 담당 AI: 2026-09-12 / Claude Code
작업 목적: 3차에서 확정한 P0-05 원인(과제는 생성 시점 프로필로 고정)에 대한 UX 조치
브랜치: feature/mvp-savepoint-20260912
변경 파일 (1개): src/Home.tsx (+4줄)
구현: 가장 최근 과제에 박제된 profile과 현재 프로필을 major/role/domain/disciplineId/personaId/level/style/goal 기준으로 비교해
      다르면 홈 상단에 안내 배너와 '새 맞춤 과제를 만들어 주세요' 버튼을 노출. 과제를 소급 수정하지 않는 기존 설계는 그대로 두고,
      화면이 낡은 데이터에 멈춘 것처럼 보이던 문제만 해소.
검증 명령과 실제 결과:
  - npm run typecheck / npm test / npm run build: 모두 통과 (66 passed | 1 skipped, 기존 청크 경고만 유지)
  - 브라우저: 소라의 프로필을 화학공학·공정설계 -> 전자공학·회로설계로 변경 후 홈 진입
    -> 배너 노출 "프로필을 바꾼 뒤 아직 새 과제를 만들지 않았어요. 아래 과제는 예전 프로필(화학공학 · 공정설계) 기준으로 만들어진 거예요."
    -> 배너의 버튼 클릭 시 '전기·전자 · 센서 측정 로그: 유효 데이터 평균' 과제가 생성되고 워크스페이스로 이동, 배너 사라짐
    -> 프로필 변경이 실제로 실습 내용(분야·단위·테스트)에 반영되는 것을 확인
남은 문제 / 다음 작업:
  - ROADMAP P0-05의 나머지 범위(전자·기계·화학 3개 분야의 목표·단위·테스트 차이 매트릭스 확인, 기존 프로필 호환, 알 수 없는 전공 안내)는 아직 미검증.
    이번에는 화학공학 -> 전자공학 전환 1건만 실제로 확인했습니다.
사용자 승인 또는 결정이 필요한 사항: 없음
```

### 2026-09-12 (6차) 회원가입·로그인 도입 (아이디 + 비밀번호)

```text
날짜 / 담당 AI: 2026-09-12 / Claude Code
작업 목적: 사용자 요청으로 인증 방식을 핸들 전용에서 아이디+비밀번호 로그인으로 격상
브랜치: feature/mvp-savepoint-20260912
사용자 결정(대화에서 승인): 아이디는 영문+숫자 7자 이상 / 중복확인 절차 / 비밀번호 로그인 / 닉네임은 가입 시 입력 / 오픈소스 최대한 활용
설계 문서: docs/MULTI_USER_DESIGN.md (전면 개정)
추가한 의존성 (package.json 변경 - 사용자가 오픈소스 활용을 명시적으로 요청):
  passport, passport-local, express-session, bcryptjs (+ @types 3종). npm audit 취약점 0건.
변경 파일:
  [S1] shared/schema.ts, server/store.ts   - 계정 스키마, v3 저장 구조, passwordHash 보관과 노출 차단
  [S2] server/auth.ts(신규), server/identity.ts - Passport 로컬 전략, 세션, 가입·로그인·로그아웃·중복확인
  [S3] server/app.ts, server/index.ts      - 세션·Passport 마운트, 학습 라우트를 인증 가드 뒤로
  [S4] src/Auth.tsx(신규), src/api.ts      - 로그인·회원가입 화면, 중복확인 버튼, 쿠키 기반 요청
  [S5] src/App.tsx, src/Profile.tsx, src/styles.css - 세션 부트스트랩, 로그아웃, 프로필의 이름 입력 제거
  [S6] tests/learning.test.ts, tests/practice.test.ts, tests/postgres.integration.test.ts, db/001_initial.sql
  [삭제] src/Users.tsx (Auth.tsx로 대체)
핵심 설계:
  - 신원 판단은 server/identity.ts의 resolveUser(req) 한 곳. 세션 쿠키 -> Passport -> req.user만 본다.
    GitHub OAuth 확장 시 server/auth.ts에 전략만 추가하면 되고 store/라우트는 무변경.
  - UserStore.forUser(userId)가 기존 Store 뷰를 반환하므로 과제·퀴즈·진도·튜터 라우트 로직은 한 줄도 안 바뀜.
  - 중복 아이디 3중 방어: (1) 화면 - 중복확인 전 가입 버튼 비활성, 아이디 수정 시 확인 결과 초기화
    (2) 서버 - signup에서 재검사해 409 (3) 저장소 - 파일은 검사·삽입을 한 큐 작업으로, PG는 UNIQUE 제약.
  - passwordHash는 StoredUser에만 존재하고 저장소를 나가는 값은 전부 toPublic()을 거침.
  - 로그인 실패 메시지는 아이디/비밀번호를 구분하지 않고, 계정이 없을 때도 더미 해시와 비교해 응답 시간을 균일화.
중요한 함정(기록용): Passport 기본 내보내기는 프로세스 전역 싱글턴이라 deserializeUser 핸들러가 앱마다 누적됨.
  테스트에서 두 번째 앱부터 첫 앱의 저장소로 세션을 복원하려다 전부 401이 났고, 앱마다 new passport.Passport()를
  쓰도록 바꿔 해결. 로컬 단일 서버에서는 드러나지 않는 버그라 테스트가 없었다면 remote 다중 인스턴스에서 터졌을 것.
검증 명령과 실제 결과:
  - npm run typecheck: 통과
  - npm test: 66 passed | 1 skipped(TEST_DATABASE_URL 필요). 신규 'accounts and sessions' 스위트가
    아이디 규칙(7자 미만/영문만/숫자만 각각 400), 짧은 비밀번호 400, 중복확인 응답, 대소문자 무시 중복 409,
    미로그인 401, 잘못된 비밀번호 401, 워크스페이스 격리, 로그아웃 후 401과 재로그인 복구를 확인.
  - npm run build: 통과 (기존 typescript 청크 크기 경고만 유지, 1m16s)
  - 브라우저(내장 브라우저, http://127.0.0.1:5173) 실제 확인:
    1) 아이디 'sora' -> 중복확인 -> "아이디는 7자 이상이어야 해요.", 가입 버튼 비활성
    2) 'soralearner' -> "아이디에 숫자를 포함해 주세요."
    3) 'sora1234' -> "사용할 수 있는 아이디예요." -> 가입 버튼 활성. 아이디를 수정하면 확인 결과가 즉시 사라짐
    4) 가입(닉네임 소라) -> 자동 로그인, 사이드바에 '소라 @sora1234 로그아웃'
    5) document.cookie가 빈 문자열 -> 세션 쿠키가 HttpOnly로 스크립트에 노출되지 않음을 확인
    6) 새로고침 후에도 로그인 유지, /api/auth/session 200
    7) 중복확인 'SORA1234' -> 사용 중으로 판정(대소문자 무시). 중복확인을 건너뛴 직접 가입 호출은 409
    8) 잘못된 비밀번호 로그인 -> 401 "아이디 또는 비밀번호가 올바르지 않습니다."
    9) 로그아웃 -> 401, 로그인 화면 복귀 -> 재로그인 -> 워크스페이스 복원
    10) 프로필 화면에 '어떻게 불러드릴까요?' 입력란이 사라졌고, 저장된 profile.name이 가입 닉네임 '소라'로 채워짐
  - 데이터 마이그레이션: v2 파일이 .data/learning.backup-2026-09-12T13-28-33-230Z.json으로 이동 후 빈 v3로 시작
남은 문제 / 다음 작업 (docs/MULTI_USER_DESIGN.md 6절):
  1) 세션 저장소가 메모리라 서버 재시작 시 전원 로그아웃. Postgres 사용 시 connect-pg-simple 등으로 교체 필요.
  2) SESSION_SECRET 미설정(.env 변경은 승인 대상이라 손대지 않음). 미설정 시 재시작마다 임의 값 생성 + 경고 로그.
  3) HTTPS 전환 시 cookie.secure=true 필수. 실제 CSRF 토큰도 필요.
  4) 비밀번호 재설정·계정 삭제 경로 없음. 비밀번호를 잊으면 새 계정을 만들어야 함.
  5) PostgreSQL 경로는 코드·마이그레이션까지 준비했으나 실제 DB 검증은 미완.
사용자 승인 또는 결정이 필요한 사항:
  - 위 2)의 SESSION_SECRET을 .env에 추가할지 여부 (추가하면 재시작해도 로그인이 유지됨).
  - 비밀번호 재설정을 22일 포트폴리오 범위에 넣을지 여부.
```

### 2026-09-12 (7차) 프로필 자유 입력 정규화 계층 도입

```text
날짜 / 담당 AI: 2026-09-12 / Claude Code
작업 목적: 자유 입력(NLP) 항목 재검토, 프로필 카테고리 조합으로 정규화하여 사용자 수와 무관하게 유한한 콘텐츠 조합 확보
브랜치: feature/mvp-savepoint-20260912
설계 문서: docs/DATA_ARCHITECTURE.md 11절 (신규 추가)
변경 파일:
  shared/taxonomy.ts(신규) - 직무 9종·목표 의도 5종 분류기
  shared/catalog.ts - preferredThemes/recommendation이 정규식 대신 분류 결과를 사용, profileSignature() 추가
  shared/schema.ts - roleId 추가
  server/practice-curriculum.ts - 직무의 subject/metric/decision으로 본문 생성, 커리큘럼 본문에서 개인 goal 문장 제거
  src/Profile.tsx - 페르소나를 select로, 직무 분류 select 추가(자동 분류 결과를 화면에 표시)
  tests/taxonomy.test.ts(신규) - 14개 테스트
  tests/practice.test.ts - personaId 타입 정리
재검토 결과 (자유 입력 항목):
  - major: 유지. 분야 10종으로 분류하고 사용자가 select로 덮어쓸 수 있음
  - role: 문제였음. 이전에는 문장에 끼워 넣는 텍스트로만 쓰여 같은 전공이면 직무가 달라도 실습이 동일했음 -> 9종 분류 도입
  - goal: 유지하되 5종 의도로 분류. 문장 자체는 개인 텍스트라 공유 본문에 넣지 않음
  - personaId: 자유 입력이던 것을 화면에서 select로 제한. 단 스키마는 열린 문자열 유지(아래 참고)
중요한 되돌림(기록용): personaId를 zod enum으로 좁혔다가 기존 테스트
  'supports old STEM profiles and new persona IDs without a schema migration'에 걸려 되돌림.
  catalog.ts 첫 줄의 "IDs are content identifiers, not database enums" 원칙이 의도된 설계였음.
  결론: 저장은 열린 문자열, 해석은 닫힌 카테고리. 모르는 id는 거부하지 않고 알려진 카테고리로 폴백.
분류 규칙: 키워드 일치 수 우선, 동점이면 텍스트에서 먼저 나온 키워드 우선(한국어 직무명은 앞이 도메인,
  뒤가 일반 활동 - 공정설계는 공정, 회로설계는 설계). 직무명으로 판정되지 않을 때만 목표 문장 참고.
  부차 신호는 유지: '연구개발 및 PM'은 연구로 분류하되 프로젝트 집계 실습을 추가로 붙임.
검증 명령과 실제 결과:
  - npm run typecheck: 통과
  - npm test: 80 passed | 1 skipped (이전 66개 + 신규 14개). 기존 테스트 전부 유지
  - 브라우저 실측(로그인 상태, 같은 전공 화학공학에서 직무만 변경):
      공정 엔지니어 -> 첫 실습 '기준 충족 비율', 설명 '공정 계측 로그... 공정 조건을 조정할지',
                      체크 '이 계산이 수율과 변동 폭과 어떻게 연결되는지'
      품질 엔지니어 -> 설명 '검사 측정값... 합격으로 판정할지', 체크 '규격 충족 비율'
      연구개발     -> 첫 실습 '그룹별 비교', 설명 '실험 관측값... 실험 조건을 바꿀지', 체크 '재현성과 분산'
    실습 순서·설명·체크리스트가 모두 직무에 따라 달라지는 것을 확인
조합 공간: contentKey = discipline(10) x role(9) x theme(4) = 360. 사용자 수와 무관하게 고정.
  level/style/goalIntent는 표현만 바꾸므로 키에서 제외(포함 시 45배로 증가).
남은 문제 / 다음 작업:
  1) 퀴즈 3문항은 아직 고정. 직무·분야별 변형은 미적용.
  2) generateRules(비실습 경로)는 domain 3종 프로젝트 템플릿 그대로. 직무 반영은 practice 경로에만 적용됨.
  3) 생성 본문을 실제로 공유 캐시에 저장하는 단계(L2)는 미구현. 지금은 사용자별로 복사 저장(9KB)이 유지됨.
  4) 세션이 메모리라 dev 서버 재시작 시 로그아웃되는 문제를 이번 검증 중에도 겪음. SESSION_SECRET과 영속 세션 저장소 필요.
사용자 승인 또는 결정이 필요한 사항: 직무 9종 분류가 대상 사용자층에 맞는지 검토 요청(추가·변경 희망 직무가 있는지).
```

### 2026-09-12 (8차) 분야·직무 확장 + 학습 언어·바이브 코딩 축 추가

```text
날짜 / 담당 AI: 2026-09-12 / Claude Code
작업 목적: 직무·전공 분야 확대, 학습 언어(Python 등) 추가, 바이브 코딩 학습 목적에 맞는 프로필 항목 설계
브랜치: feature/mvp-savepoint-20260912
설계 문서: docs/DATA_ARCHITECTURE.md 12절 (신규 추가)
변경 파일:
  shared/catalog.ts - 전공 분야 7종 추가(10 -> 17), '자동차' 키워드를 mechanical에서 automotive로 이동
  shared/taxonomy.ts - 직무 5종 추가(9 -> 14), 언어 3종·산출물 5종·AI 경험 3종·AI 도구 6종 신규
  shared/schema.ts - languageId, outputTargetId, promptSkillId, aiTools 추가 (모두 열린 문자열)
  server/practice-curriculum.ts - 언어·산출물·AI 경험을 본문에 반영
  src/Profile.tsx - 언어/AI 경험/AI 도구(2단계), 산출물(3단계) 입력 추가
  tests/taxonomy.test.ts - 바이브 코딩 축 테스트 5개, 확장 검증 3개 추가
  tests/ai.test.ts, tests/learning.test.ts - 라우팅 전제를 명시하도록 수정(아래 참고)
확장 결과: 전공 17종, 직무 14종, 실행 가능한 실습 44 -> 72개, 테스트 80 -> 116개
  실습은 분야 메타데이터 x 테마 템플릿으로 자동 생성되므로 분야 1줄 추가 = 채점 가능한 실습 4개 추가.
  72개 실습의 정답 코드가 전부 테스트로 검증됨.
학습 언어 - 정직한 한계 표기:
  브라우저 샌드박스는 TS를 JS로 컴파일해 Worker에서 실행하므로 Python은 실행할 수 없음(Pyodide 필요, 약 10MB, MVP 범위 밖).
  languages 표에 executable 플래그를 두고, Python 선택 시 과제 설명에
  "프롬프트와 예제를 Python으로 드립니다. 브라우저에서 채점되는 실습은 아직 TypeScript입니다"를 그대로 노출.
  실행되지 않는 코드를 실행되는 것처럼 보여주지 않음. 나중에 Pyodide를 붙이면 executable을 true로 바꾸는 것이 유일한 변경.
바이브 코딩 축(신규): promptSkillId(AI 사용 경험 3단계 - 프롬프트를 통째로 줄지/조각내는 법을 연습할지/생성 코드를
  의심하는 데 집중할지), aiTools(도구 6종, 프롬프트 문구에만 사용), outputTargetId(산출물 5종, 마지막 단계 마무리 과제가 달라짐)
조합 공간: contentKey = 분야(17) x 직무(14) x 주제(4) x 언어(3) = 2,856. 약 26MB로 6절 결론(100MB 미만) 유지.
  언어는 키에 포함(다른 자료), 산출물·AI경험·수준·스타일은 제외(같은 본문의 다른 표현).
확장하다 발견한 문제(중요): '경영학'을 새 분야로 인식시키자 defaultProfile의 라우팅이 바뀌어 테스트 5개가 깨짐.
  usesPractice()가 "전공이 general이 아니면 실습 경로"로 판단하므로, 분야를 추가하는 것만으로 해당 전공 학습자 전체가
  AI 경로에서 실습 경로로 조용히 이동함. 지금은 AI 키가 없어 실질 영향이 없지만, PZ 트랙을 켜기 전에 이 게이트를
  "프로필이 채워졌는가"에서 "실행 채점이 필요한가"로 바꿔야 함. 테스트는 의도한 경로를 명시하도록 수정
  (major: '융합 전공'으로 프로젝트/AI 경로를 고정).
검증 명령과 실제 결과:
  - npm run typecheck: 통과
  - npm test: 116 passed | 1 skipped
  - 브라우저 실측(로그인 상태, 전공 반도체공학 / 직무 공정 엔지니어 고정, 나머지만 변경):
      Python + 대시보드 + AI초보 -> 프롬프트 "...Python 기준으로 설명해 줘",
        설명에 "브라우저에서 채점되는 실습은 아직 TypeScript입니다", 마지막 실험에 "대시보드를 떠올리며 원자료까지 되짚어갈 경로"
      TypeScript + 스크립트 + 숙련 -> "실행과 채점은 TypeScript로 진행합니다",
        마지막 실험에 "입력 파일을 바꿔도 같은 결과가 나오는지 확인", 코칭은 "생성된 코드의 경계 조건을 먼저 의심"
      과제 제목은 '반도체·디스플레이 · 웨이퍼 계측 로그: 기준 충족 비율' - 신규 분야가 정상 동작
  - 프로필 화면 3단계에 신규 입력(언어/AI 경험/AI 도구/산출물)이 모두 정상 노출되는 것을 확인
남은 문제 / 다음 작업:
  1) Python 실행은 Pyodide 도입 전까지 불가. 도입 시 약 10MB 최초 로드와 실행 격리 재검토 필요.
  2) 퀴즈 3문항은 여전히 고정(분야·직무별 변형 미적용).
  3) generateRules(비실습 경로)는 domain 3종 템플릿 그대로.
  4) usesPractice() 게이트 의미 변경은 PZ 트랙 착수 시 필수.
사용자 승인 또는 결정이 필요한 사항:
  - 추가한 분야 7종·직무 5종이 목표 사용자층에 맞는지 검토 요청.
  - Python 실행(Pyodide)을 22일 포트폴리오 범위에 넣을지 여부.
```
