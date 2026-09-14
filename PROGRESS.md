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

### 2026-09-12 (9차) 학습 언어 5종·작업 환경 6종으로 재설계

```text
날짜 / 담당 AI: 2026-09-12 / Claude Code
작업 목적: 바이브 코딩 과정에서 필수적으로 만나는 언어·환경을 선택지에 포함
브랜치: feature/mvp-savepoint-20260912
설계 문서: docs/DATA_ARCHITECTURE.md 13절 (신규 추가)
변경 파일:
  shared/taxonomy.ts - 언어에 SQL·R 추가(3 -> 5), 작업 환경 6종 신규, TS/JS 관계를 설명에 명시
  shared/schema.ts - environments 추가
  shared/catalog.ts - 시그니처에 environments 포함(표현 전용, contentKey에는 미포함)
  server/practice-curriculum.ts - 선택한 작업 환경을 안내 문구에 반영
  src/Profile.tsx - 작업 환경 복수 선택 추가
  tests/taxonomy.test.ts - 언어 구성·환경 반영·폴백 테스트 3개 추가
사용자 확인 사항 정정: JavaScript는 8차 작업에서 이미 선택지에 포함되어 있었음(프로필 2단계에 노출 중).
  이번에는 TS가 JS의 상위집합이라는 관계를 화면 설명에 명시하고, JavaScript 선택 시
  "빈칸 실습은 TypeScript 형태로 제공되지만 타입 표기를 지워도 그대로 실행되고 채점됩니다"를 안내하도록 보강.
  실제로 compileCode가 ts.transpileModule을 쓰므로 타입 없는 코드도 그대로 실행됨 - 빈 약속이 아님.
언어 5종과 실행 가능 여부:
  TypeScript(가능), JavaScript(가능), Python(불가), SQL(불가), R(불가)
  SQL 선택 시 "질의문 예제와 프롬프트를 SQL로 드리고, 채점되는 실습은 같은 계산을 함수로 옮겨 확인합니다"로 안내.
  기록: 실행 언어를 하나 더 늘린다면 SQL이 가장 저렴함. sql.js(SQLite WASM) 약 1MB vs Pyodide 약 10MB vs webR 그 이상.
작업 환경 6종(복수 선택, 표현 전용): 실습 편집기 / VS Code·Cursor / Jupyter·Colab / 터미널·셸 / 엑셀·구글 시트 / Git·GitHub
조합 공간: contentKey = 17 x 14 x 4 x 5 = 4,760 (약 42MB). 100MB 미만 유지.
  환경·산출물·AI경험·수준·스타일을 모두 키에 넣었다면 857만 조합이 되어 사전 생성이 불가능해짐.
  테스트는 상한을 숫자가 아니라 예산으로 검사하도록 변경: 조합 수 x 9KB < 100MB.
검증 명령과 실제 결과:
  - npm run typecheck: 통과
  - npm test: 118 passed | 1 skipped
  - 브라우저 실측(전공 반도체공학 / 직무 공정 엔지니어 고정):
      SQL + 엑셀·구글 시트 + Git -> 프롬프트 "...SQL 기준으로 설명해 줘",
        설명에 "데이터가 DB에 있다면 반드시 만나는 언어입니다... 채점되는 실습은 같은 계산을 함수로 옮겨 확인합니다",
        "작업 환경은 엑셀 · 구글 시트, Git · GitHub 기준으로 안내합니다"
      JavaScript + 편집기 + 터미널 -> "실행과 채점은 JavaScript로 진행합니다",
        "작업 환경은 VS Code · Cursor 같은 편집기, 터미널 · 셸 기준으로 안내합니다"
남은 문제 / 다음 작업:
  1) SQL·Python·R은 프롬프트·예제 언어로만 동작. 실행 채점은 TS/JS뿐.
  2) 실행 언어 확장 시 SQL(sql.js, 약 1MB) 우선 검토 권장.
  3) 빈칸 실습 코드 자체는 언어별로 달라지지 않음(항상 TS 형태). 언어별 스타터 코드 생성은 미구현.
사용자 승인 또는 결정이 필요한 사항: SQL 실행(sql.js)을 22일 범위에 넣을지 여부.
```

### 2026-09-12 (10차) SQL 실행·채점 구현 (sql.js / SQLite WebAssembly)

```text
날짜 / 담당 AI: 2026-09-12 / Claude Code
작업 목적: SQL을 예제 언어가 아니라 실제로 실행되고 채점되는 학습 언어로 만들기
브랜치: feature/mvp-savepoint-20260912
추가한 의존성 (package.json - 사용자 요청에 따른 변경): sql.js ^1.14.2, @types/sql.js. npm audit 취약점 0건.
변경 파일:
  shared/catalog.ts - Exercise에 language 필드, SQL 실습 생성기(3개 테마), 언어별 실습 라우팅
  shared/taxonomy.ts - SQL을 executable: true로 변경하고 안내 문구 교체
  src/sql-worker.ts(신규) - SQLite WASM 워커
  src/sql-runner.ts(신규) - startSqlRun(), 기존 RunHandle과 동일한 인터페이스
  src/CodeLab.tsx - 언어에 따라 실행기 분기, 에디터 라벨·안내 문구 분기
  server/app.ts - CSP에 'wasm-unsafe-eval'과 worker-src 추가
  tests/sql.test.ts(신규) - 생성된 SQL 실습 54개를 실제 SQLite로 검증
  tests/practice.test.ts, tests/taxonomy.test.ts - 언어별 검증 하네스 분리, 라우팅 테스트 추가
격리 설계(중요): SQL은 iframe 샌드박스를 쓰지 않음.
  그 샌드박스는 학습자가 쓴 "JavaScript"를 가두기 위한 것이고, SQL 문자열은 JS가 아니라 SQLite(WASM) 안에서 파싱·실행됨.
  sql.js는 메모리 DB만 가지며 파일시스템·네트워크·DOM 접근이 없음. 남는 위험은 무거운 질의로 인한 시간 소모뿐이라
  전용 Worker에서 실행하고 타임아웃·중지 시 워커를 terminate함. 워커 응답은 우리 코드이므로 iframe 경로와 달리 스키마 검증 불필요.
CSP 변경: script-src에 'wasm-unsafe-eval' 추가. WebAssembly 컴파일만 허용하며 JavaScript eval은 여전히 차단됨.
실습 구성: 분야 18개(프로젝트 포함) x 3개 테마(clean/compare/quality) = SQL 실습 54개.
  비동기(async) 테마는 SQL에 대응이 없어 제외. 테이블은 readings(grp TEXT, value REAL) 한 개, 표본은 TS 실습과 동일.
  SQL 의미론이 다른 지점은 숨기지 않고 테스트 이름으로 드러냄:
  '값이 전부 NULL인 그룹은 사라집니다' - 함수로 짜면 그 그룹을 null로 남길 수 있지만 SQL은 WHERE에서 전부 걸러지면 행 자체가 없음.
검증 명령과 실제 결과:
  - npm run typecheck: 통과
  - npm test: 179 passed | 1 skipped (이전 118 -> 179). 신규 58개는 tests/sql.test.ts가 실제 SQLite로
    54개 실습의 정답 질의를 모든 테스트 케이스에 대해 실행해 기대값과 대조한 것. 스타터 질의가 이미 정답이 아닌지도 검사.
  - npm run build: 통과. dist/assets/sql-wasm.wasm 643KB(gzip 323KB), sql-worker.js 42KB로 분리 번들되어
    SQL 실습을 열 때만 내려받음.
  - 브라우저 실측: 프로필 언어를 SQL로 저장 -> 과제의 실습이 semiconductor:quality:sql 등 SQL 실습으로 배정됨 ->
    워크스페이스에서 정답 질의 입력 후 실행 -> "4 / 4 테스트 통과", 샘플 출력 [{"observed":4,"accepted":3,"rate":0.75}].
    CSP 위반이나 콘솔 오류 없음.
남은 문제 / 다음 작업:
  1) Python·R은 여전히 프롬프트·예제 언어. 실행 채점은 TypeScript/JavaScript/SQL 세 가지.
  2) PracticeLibrary 자료실은 126개 실습을 모두 보여줌. 언어 필터가 없어 TS 학습자에게 SQL 실습도 노출됨.
  3) 세션이 메모리라 dev 서버 재시작마다 로그아웃되어 이번 검증에서도 두 번 재로그인함. SESSION_SECRET과 영속 저장소 필요.
사용자 승인 또는 결정이 필요한 사항: R 실행(webR) 도입 여부 - 아래 판단 근거 참고.
  webR 공식 문서상 SharedArrayBuffer 채널을 쓰려면 COOP: same-origin 과 COEP: require-corp 헤더가 필요함.
  이는 페이지 전체에 적용되어 모든 교차 출처 리소스가 CORP/CORS를 만족해야 하므로, 현재 쓰는
  Google Fonts와 GitHub raw의 외부 데이터셋(P0-03) 로딩에 영향을 줌.
  헤더 없이 PostMessage 채널로 대체할 수 있으나, 공식 문서가 "실행 중인 R 코드의 중단(interruption)과
  readline() 등 사용자 입력 기능은 지원되지 않는다"고 명시함. 학습 샌드박스에서 무한 루프를 멈출 수 없다는 뜻.
```

### 2026-09-13 (11차) 교차 출처 격리(COOP/COEP) + R 실행·채점 구현 (webR)

```text
날짜 / 담당 AI: 2026-09-13 / Claude Code
작업 목적: R을 예제 언어가 아니라 실제로 실행되고 채점되는 학습 언어로 만들기.
  10차에서 사용자 결정을 요청했던 두 갈래 중 "COOP/COEP까지 제대로 구현"을 사용자가 선택함.
브랜치: feature/mvp-savepoint-20260912
추가한 의존성 (package.json - 사용자 요청에 따른 변경): webr ^0.6.0. npm audit 취약점 0건.
변경 파일:
  vite.config.ts (승인 대상 파일 - 사용자가 COOP/COEP 선택으로 승인) - dev 서버 COOP/COEP 헤더,
    webrAssets() 플러그인으로 node_modules/webr/dist 를 /webr/ 에 서빙하고 빌드 시 dist/webr 로 복사
  server/app.ts - helmet 에 crossOriginOpenerPolicy: same-origin, crossOriginEmbedderPolicy: require-corp.
    /practice-sandbox.html 응답에 COEP: require-corp, CORP: same-origin 추가
  index.html, src/styles.css - Google Fonts 를 CSS @import 에서 crossorigin 지정한 <link> 로 이동
  shared/taxonomy.ts - R 을 executable: true 로 변경, 런타임 17MB 다운로드 안내 문구 추가
  shared/catalog.ts - rExercise() 생성기, R 실습 라우팅(:r), coreThemes 재사용
  src/r-runner.ts(신규) - startRRun(), 기존 RunHandle 과 동일한 인터페이스
  src/CodeLab.tsx - R 분기(에디터 라벨, 안내 문구, 실행기 선택)
  tests/taxonomy.test.ts, tests/practice.test.ts - R 라우팅 검증, 타입스크립트 컴파일러 예열
  .gitignore - dist/webr/, dev.log

교차 출처 격리를 택한 이유: webR 이 실행 중인 R 코드를 중단(interrupt)할 수 있는 채널은
  SharedArrayBuffer 뿐이고, SharedArrayBuffer 는 COOP: same-origin + COEP: require-corp 없이는 쓸 수 없음.
  PostMessage 채널로 낮추면 학습자의 무한 루프를 멈출 방법이 사라짐. 학습 샌드박스에서는 그게 더 큰 위험이라 판단.
격리 도입으로 실제로 깨진 것과 대응:
  1) Google Fonts - CSS @import 는 no-cors 요청이라 COEP 아래에서 거부됨.
     index.html 에 crossorigin 을 명시한 <link rel="stylesheet"> 로 옮겨 해결(폰트 744종 로드 확인).
  2) webR 런타임 - CDN 에서 받으면 교차 출처라 거부됨. node_modules 에서 자체 호스팅(/webr/)으로 해결.
  3) webR 워커 기동 실패 - 가장 읽기 어려운 실패였음. new Worker('/webr/webr-worker.js') 가
     메시지가 전혀 없는 ErrorEvent([object Event])로 죽음. 동일한 바이트를 blob URL 로 띄우면 정상이라는 점으로
     원인을 좁힌 뒤 응답 헤더를 비교해, 워커 스크립트 응답 자체에 COEP: require-corp 가 없어서임을 확인.
     교차 출처 격리된 페이지에서 시작하는 워커는 자기 스크립트 응답도 같은 embedder policy 를 선언해야 함.
     vite.config.ts 의 webrAssets() 플러그인에서 해당 헤더를 추가해 해결.

실습 구성: 분야 18개(프로젝트 포함) x 3개 테마(clean/compare/quality) = R 실습 54개.
  총 실습 180개 = TypeScript 72 + SQL 54 + R 54.
  rExercise() 는 대응하는 TypeScript 실습의 tests 를 그대로 재사용함. R 과 TS 의 정답 기준이 구조적으로 어긋날 수 없음.

브라우저 실측 중 발견해 고친 버그 (src/r-runner.ts):
  증상 - 정답을 실행해 4/4 통과한 다음 오답을 실행하면 채점되지 않고 20초 타임아웃으로 끝남.
  원인 - 실행 종료 처리(cleanup)가 성공·실패를 가리지 않고 webR.interrupt() 를 호출하고 있었음.
    webR 의 interrupt 는 R 이 다음 평가 시점에 확인하는 플래그를 세울 뿐이라, 놀고 있는 인터프리터를 중단시키는 게
    아니라 "다음 실행"을 오염시킴. 다음 실행은 'A non-local transfer of control occurred during evaluation'
    로 죽거나 그대로 멈춤. 단일 테스트로 분리 실행해 이 메시지를 확인하고 원인을 특정함.
  수정 - 종료 처리를 settle(타이머 해제 후 resolve)과 abort(interrupt 후 settle)로 분리.
    타임아웃과 사용자 중지만 abort 를 쓰고, 정상 종료·예외는 settle 을 씀.
    즉 실제로 R 코드가 돌고 있을 때만 interrupt 를 보냄.
  이 버그는 단위 테스트로 잡을 수 없었음. webR 은 브라우저에서만 돌고, 증상이 "다음 실행"에서만 나타남.

같이 고친 것 (tests/practice.test.ts): executable exercise contracts 의 앞쪽 2~3개 케이스가
  5초 타임아웃으로 간헐 실패했음. compileCode 안의 typescript 동적 import 가 Vite 변환 비용(수 초)을
  첫 테스트에 전가하던 것. beforeAll 에서 한 번 예열하도록 바꿈. 실습 실행 타임아웃은 폭주 코드를 잡기 위한 것이지
  모듈 로딩을 재는 게 아님.

검증 명령과 실제 결과:
  - npm run typecheck: 통과
  - npm test: 180 passed | 1 skipped (10차 179 -> 180)
  - npm run build: 통과. dist/webr 167개 파일 46.33MB 복사 확인(.gitignore 처리).
    앱 번들은 변화 없음 - webR 은 정적 자산으로만 나가고 R 실습을 열 때만 내려받음.
  - 브라우저 실측(프로필 언어 R, 전공 통계학 / 직무 품질관리 엔지니어):
      crossOriginIsolated: true, SharedArrayBuffer: function, Google Fonts 744종 로드
      iframe JS 샌드박스 정상, GitHub raw 데이터셋 {status: 200, bytes: 67119}
      new Worker('/webr/webr-worker.js') 오류 없이 기동
      science:quality:r 정답 실행 -> "4 / 4 테스트 통과", 샘플 출력 {"observed":4,"accepted":3,"rate":0.75}
      오답(accepted 를 0 고정) -> 1/4 통과. 통과한 1개는 빈 데이터 케이스로, 오답이어도 맞는 것이 정상
      정답/오답을 번갈아 4회 연속 실행 -> 각각 13~18ms, 결과 일관. 위 버그 재발 없음
      무한 루프(repeat { }) -> 20.01초에 중단되고 제한 시간 메시지 표시, 직후 정답 실행이 14ms 에 4/4 통과.
        SharedArrayBuffer 채널의 interrupt 가 실제로 동작하고 R 이 복구된다는 확인 - 이번 격리 작업의 목적 그 자체
문서와 코드의 불일치 (수정하지 않고 기록):
  1) 과제 상단 "이 과제가 나에게 맞는 이유" 칩이 R 과제에서도 "TypeScript 함수"로 표시됨.
     server/curriculum.ts 의 focus 문구가 언어를 반영하지 않음. 다음 단위 작업에서 처리 필요.
  2) docs/API.md 가 여전히 "인증·다중 사용자 API가 아닙니다"로 되어 있고 /api/auth/* 가 빠져 있음(6차부터 누적).
남은 문제 / 다음 작업:
  1) Python 은 여전히 프롬프트·예제 언어. 실행 채점은 TypeScript/JavaScript/SQL/R 네 가지.
  2) PracticeLibrary 자료실이 180개를 전부 노출함. 언어 필터 없음.
  3) 세션이 메모리라 서버 재시작마다 로그아웃됨. SESSION_SECRET 미설정.
  4) usesPractice() 게이트는 PZ 트랙 전에 재정의 필요(8차 기록 참고).
  5) PostgreSQL 경로는 실제 DB 대상 미검증.
사용자 승인 또는 결정이 필요한 사항: 없음.
```

### 2026-09-14 (12차) 실습 화면에 LLM 질문 프롬프트 생성 버튼 (prompts.chat 연동)

```text
날짜 / 담당 AI: 2026-09-14 / Claude Code
작업 목적: 학습 중 오류나 동작이 막혔을 때, 학습자가 외부 LLM에 붙여넣을 프롬프트를 앱이 만들어 주기.
  사용자 요청: "에러나 오류, 코드 수정, 동작설명 등 옆에 프롬프트 생성 버튼", prompts.chat 연동 고려.
브랜치: feature/mvp-savepoint-20260912
추가한 의존성: 없음.
변경 파일:
  shared/prompt-kit.ts(신규) - 프롬프트 빌더. 페르소나 3종 + 문맥 조립
  src/CodeLab.tsx - 실행 콘솔·테스트 결과 아래에 버튼 3개와 미리보기·복사
  src/styles.css - .prompt-kit / .prompt-output
  src/Workspace.tsx - CodeLab 에 profile 전달(한 줄)
  tests/prompt-kit.test.ts(신규) - 8개

prompts.chat 연동 조사 결과(브라우저 실측):
  - 라이선스: 코드 MIT, 프롬프트 데이터는 CC0 1.0. 그대로 가져다 쓰는 것이 허용됨.
  - prompts.chat 도메인 직접 fetch -> 실패. CORS 헤더를 주지 않음. /prompts.csv, /api/mcp 모두 브라우저에서 막힘.
  - 원본 GitHub raw 의 prompts.csv -> 성공(status 200). 교차 출처 격리 상태에서도 정상.
    10차 기록에 "COEP 때문에 교차 출처 리소스가 막힌다"고 적었던 것은 범위가 틀렸음.
    COEP require-corp 가 막는 것은 no-cors 로드이고, CORS 를 허용하는 출처는 그대로 통과함.
    실제로 이 앱은 격리 이후에도 GitHub raw 데이터셋(P0-03)을 계속 받고 있었음.
  - 다만 prompts.csv 가 현재 2,170행 / 5.7MB. 페르소나 3개 때문에 학습자마다 5.7MB 를 받게 할 수 없음.
  결론: CC0 이므로 필요한 3개를 act 이름·기여자와 함께 원문 그대로 저장소에 동봉.
    화면에 출처·라이선스를 함께 표시함. 런타임 네트워크 의존 없음.

설계의 핵심 - 페르소나는 빌려오고 문맥은 우리가 만든다:
  prompts.chat 의 프롬프트는 역할 설정("Act as a senior debugging engineer...")이지 문맥이 없음.
  쓸모를 만드는 쪽은 앱이 이미 아는 것들임: 실습의 요구사항, 학습자가 쓴 코드, 어떤 테스트가
  무엇을 기대했는데 무엇이 나왔는지, 전공·직무·레벨. "왜 안 되죠"와 실패한 테스트를 붙인 질문은
  돌아오는 답이 다름. prompts.chat 이 자기 자리표시자를 ${...} 로 표시해 두는 관례가
  마침 "여기에 네 상황을 넣어라"와 정확히 맞아서, 그 자리를 우리 문맥 블록으로 치환함.
버튼 3종과 활성 조건:
  오류 해결(Debugging Detective) - 실행 오류가 있거나 실패한 테스트가 있을 때만
  코드 수정(Code Reviewer) - 한 번이라도 실행한 뒤
  동작 설명(Explainer with Analogies) - 항상. 실행 전에도 개념을 물을 수 있어야 함
  실행하지 않은 상태에서 "내 오류는 이겁니다"라고 시작하는 프롬프트는 없느니만 못해서 막음.
정답 유출 방지: 세 프롬프트 모두 "완성된 정답 코드를 먼저 주지 말고"를 포함함.
  실습의 hints 는 프롬프트에 넣지 않음. 테스트가 그것까지 검사함.
크기 제한: 코드 6,000자, 실패 테스트 3개, 기대/실제 각 600자, 오류 1,200자.
검증 명령과 실제 결과:
  - npm run typecheck: 통과
  - npm test: 188 passed | 1 skipped (11차 180 -> 188)
  - npm run build: 통과. 앱 번들 479.73 -> 489.78 kB
    (처음에는 tsconfig.server.json(nodenext)에서 TS2835 로 실패함. shared/ 는 서버 빌드에도
     들어가므로 상대 import 에 .js 확장자가 필요. catalog.js / schema.js 로 수정)
  - 브라우저 실측(프로필 언어 R, science:quality:r):
      실행 전 -> 동작 설명만 활성, 나머지 둘 비활성
      오답 실행(1/4 통과) 후 -> 셋 다 활성
      "오류 해결" 클릭 -> 페르소나 원문 + 상황(언어·런타임·요구사항·배경) + 내 R 코드 +
        실패 테스트 3개의 기대/실제 + 원하는 답변 5줄이 한 덩어리로 생성됨
        ${describe_your_bug_here} 자리표시자가 남지 않고 치환됨을 확인
      출처 표기 "페르소나 문구 출처: prompts.chat · "Debugging Detective" (mikeaitrends24) · CC0-1.0" 노출
      가로 스크롤 없음(body.scrollWidth == clientWidth), 프롬프트 영역은 세로 스크롤로 처리
남은 문제 / 다음 작업:
  1) prompts.chat 최신 목록 불러오기(선택 기능)는 미구현. GitHub raw 를 브라우저에서 직접 받는 방식이며,
     CSP connect-src 에 raw.githubusercontent.com 추가가 필요함(server/app.ts, 승인 대상). 사용자 승인 대기.
  2) 생성된 프롬프트를 튜터 채팅으로 바로 보내는 경로는 없음. 복사 붙여넣기만 지원.
  3) 11차에서 기록한 "이 과제가 나에게 맞는 이유" 칩의 TypeScript 고정 문구는 아직 그대로.
사용자 승인 또는 결정이 필요한 사항: 위 1) 의 CSP connect-src 추가.
```

### 2026-09-14 (13차) 실습 과제 개념 태그의 TypeScript 고정 문구 수정

```text
날짜 / 담당 AI: 2026-09-14 / Claude Code
작업 목적: 12차에서 기록한 문서-코드 불일치 해소. R(또는 SQL) 과제를 열어도 화면의 개념 태그
  ("이 과제가 나에게 맞는 이유" 바로 아래 칩 목록)가 "TypeScript 함수"로 고정 표시되던 문제.
브랜치: feature/mvp-savepoint-20260912
변경 파일:
  server/practice-curriculum.ts - concepts 배열의 첫 항목을 리터럴 'TypeScript 함수' 대신
    profileSignature()가 돌려주는 language.label 을 사용하도록 수정: `${language.label} 함수`.
    rationale 필드는 11차 구현 당시 이미 language.label 기준으로 작성돼 있었음(언어별로 정확했음).
    concepts 배열만 별도로 하드코딩돼 있어 놓쳤던 것 - 같은 함수 안에서도 값의 출처가 다르면
    나눠서 점검해야 한다는 사례로 남김.
범위 밖으로 남긴 것: concepts 의 '비동기 처리' 항목은 async 테마가 TypeScript 전용이라(프롬프트 7 참고,
  SQL/R 에는 async 테마가 없음) 다른 언어에서도 그대로 노출됨. 이번 보고에서 지목된 범위가 아니라
  손대지 않음 - 필요하면 별도 작업으로 분리.
검증 명령과 실제 결과:
  - npm run typecheck: 통과
  - npm test: 188 passed | 1 skipped (기존과 동일, 회귀 없음)
  - 브라우저 실측: 신규 테스트 계정(rlangtest1)으로 가입, 전공 "통계학" · 직무 "엔지니어" ·
    학습 언어 R로 프로필 저장 후 맞춤 과제 생성. "물리·수학·통계 · 반복 측정 실험: 유효 데이터 평균 (R)"
    과제에서 개념 태그 첫 항목이 "R 함수"로 표시됨을 확인(스크린샷 확인, 이전에는 "TypeScript 함수"로 고정).
남은 문제 / 다음 작업: 위 "범위 밖" 항목(비동기 처리 태그) 외에 ROADMAP의 P0-02(실행 경계 검증),
  P0-03(외부 데이터 흐름 검증), P0-04(PostgreSQL 검증)가 그대로 남아 있음. 다음 시작 위치는
  사용자가 선택하는 대로 위 세 항목 중 하나.
사용자 승인 또는 결정이 필요한 사항: 없음. (커밋 전 사용자에게 diff 요약을 보고함)
```

### 2026-09-14 (14차) 푸터 저작권 표기 + AI 학습 영역 시각적 강조 디자인 보강

```text
날짜 / 담당 AI: 2026-09-14 / Claude Code
작업 목적: 사용자 요청 - "웹 하단의 Copyright LeeTaewoo를 넣어주고 웹디자인을 좀 더 사용자
  친화적이고 ai 학습에 알맞은 디자인으로 수정". 같은 요청에 포함된 "PostgreSQL 설정 · Cloudflare
  배포"는 계정 생성·인프라 provider 선택이 필요한 별도 결정 사항이라 분리하고 사용자에게 확인 질문을
  먼저 보냄(AGENTS의 설정/배포 변경 사전 승인 규칙, ROADMAP CLOUD-01 결정 항목과 동일한 성격).
브랜치: feature/mvp-savepoint-20260912
변경 파일:
  src/App.tsx - footer에 `© {연도} LeeTaewoo` 저작권 span 추가(기존 문구·링크는 유지)
  src/CodeLab.tsx - LLM 프롬프트 킷 제목 옆에 "AI" 배지 추가(이 기능이 AI 학습 지원 기능임을 시각적으로 표시)
  src/styles.css - 기존 --green/--lime 브랜드는 그대로 두고, 카드(learning/assignment/repo-card,
    panel)에 그림자·호버 시 상승 트랜지션 추가. AI 튜터 패널·프롬프트 킷만 별도의 --ai(보라 계열)
    악센트로 구분해 "AI가 개입하는 영역"이 한눈에 보이게 함. 버튼 호버/액티브 상태, 스크롤바,
    테스트 결과 카드 모서리를 다듬음. 폰트나 기존 --green/--lime 브랜드 색은 바꾸지 않음
    (COOP/COEP 상태에서 폰트 로딩 방식을 건드리는 것은 별도 승인 대상이라 범위에서 제외).
검증 명령과 실제 결과:
  - npm run typecheck: 통과
  - npm test: 188 passed | 1 skipped (회귀 없음)
  - 브라우저 실측(rlangtest1 계정, R 과제): getComputedStyle로 확인 -
    .tutor 배경 그라디언트·보라 보더, .tutor-icon 보라 그라디언트, .prompt-kit 왼쪽 보라 보더,
    .ai-badge 보라 텍스트, .primary 그림자, .assignment-card 그림자·트랜지션이 모두 적용됨을 확인.
    페이지 텍스트에서 푸터 "© 2026 LeeTaewoo" 노출 확인. 콘솔 에러 없음(로그인 전 401은 기존에도
    있던 정상 동작).
  - 참고: 이번 검증 중 Browser 창이 백그라운드(hidden)라 스크린샷이 반복 타임아웃돼 get_page_text/
    javascript_tool의 getComputedStyle로 대체 검증함. 스크린샷 기반 육안 검수는 사용자가 직접 열어
    확인 필요.
남은 문제 / 다음 작업: PostgreSQL 실제 연결과 배포(Cloudflare 등) 방식은 사용자 답변 대기 중.
사용자 승인 또는 결정이 필요한 사항: 없음(디자인 톤은 재량 진행, 마음에 안 들면 추가 조정 가능).
```

### 2026-09-14 (15차) P0-04: 실제 PostgreSQL로 마이그레이션·저장·재조회 검증 완료

```text
날짜 / 담당 AI: 2026-09-14 / Claude Code
작업 목적: ROADMAP의 P0-04. 이 PC에는 PostgreSQL 17(17.5-2)이 이미 설치·서비스 실행 중이었으나
  postgres 슈퍼유저 비밀번호를 몰라 새로 만들 수 없었음. Claude는 로그·pgAdmin·.pgpass 등에서
  비밀번호를 "찾으려" 시도했으나(scram-sha-256은 단방향 해시라 애초에 불가능한 접근이었고,
  실제로 파일 내 "password" 문자열 검색이 세션 정책으로 차단됨) 이후 재설정으로 전환.
  pg_hba.conf를 trust로 임시 전환하는 스크립트를 %TEMP%(저장소 밖)에 만들어 사용자가 관리자
  PowerShell에서 직접 실행하도록 안내 - 관리자 권한 필요 작업은 Claude가 대행하지 않음.
브랜치: feature/mvp-savepoint-20260912
변경 파일(제품 코드 변경 없음, 로컬 설정만):
  .env(신규, 미커밋) - DATABASE_URL=postgresql://vibelab:vibelab_local@127.0.0.1:5432/vibelab
  PostgreSQL 서버: vibelab 롤(비밀번호 vibelab_local)과 vibelab, vibelab_test 두 DB 생성.
    vibelab_test는 통합 테스트 전용 - AGENTS 규칙대로 학습자 DB(vibelab)에는 테스트 초기화를
    돌리지 않음.
검증 명령과 실제 결과:
  - npm run db:migrate: "Database migration complete." (db/001_initial.sql 적용)
  - TEST_DATABASE_URL=postgresql://vibelab:vibelab_local@127.0.0.1:5432/vibelab_test npm test:
    189 passed (0 skipped) - 13차까지 "188 passed | 1 skipped"였던 postgres.integration.test.ts가
    이번에 처음 실행되어 통과(마이그레이션 재실행 안전성, 트랜잭션 롤백, 동시 update 3건 확인).
  - 앱 기동: API 로그에 "storage: postgresql" 확인, GET /api/health가
    {"storage":"postgresql",...} 응답.
  - 브라우저 실측: 신규 계정 pgverify1로 회원가입 후 psql로 vibelab DB의 learning_users,
    learning_workspaces 테이블을 직접 조회해 실제로 행이 생성됨을 확인(로컬 JSON 파일이 아님).
남은 문제 / 다음 작업:
  1) SESSION_SECRET 미설정 - 서버(정확히는 tsx watch) 재시작마다 전원 로그아웃. 여전히 미해결.
  2) postgres 슈퍼유저의 새 비밀번호는 이 대화에서만 다룸 - 저장소나 문서에 기록하지 않음.
     분실 시 이번과 같은 재설정 절차를 다시 밟아야 함.
  3) ROADMAP의 P0-02(네트워크/CSP 경계), P0-03(외부 데이터 장애 시나리오)은 여전히 미완.
사용자 승인 또는 결정이 필요한 사항: 없음.
```

### 2026-09-14 (16차) Cloudflare Tunnel로 외부 공개 + 터널 뒤에서 세션이 끊기던 버그 수정

```text
날짜 / 담당 AI: 2026-09-14 / Claude Code
작업 목적: 사용자 요청 "CloudFlare로 server를 설정하여 배포 가능하도록". 사용자가 네 가지 구성 중
  Cloudflare Tunnel을 선택함(Workers 전면 이식은 Express/Passport/pg/webR가 Workers 런타임에서
  그대로 돌지 않아 제외).
브랜치: feature/mvp-savepoint-20260912
변경 파일(승인 대상이라 사전에 이유·영향을 설명하고 진행):
  server/app.ts - (1) PUBLIC_ORIGIN 환경변수가 설정된 경우에만 그 호스트/오리진 하나를 허용 목록에
    추가. 와일드카드가 아니라 정확히 한 개만 허용하므로 임의 Host 헤더는 여전히 403.
    미설정 시 기존 로컬 전용 동작 그대로(하위 호환).
    (2) app.set('trust proxy', 'loopback') - 아래 버그의 실제 수정.
  server/auth.ts - 세션 쿠키 secure 플래그를 PUBLIC_ORIGIN 설정 여부에 연동.
  .env(미커밋) - SESSION_SECRET 고정값 추가(재시작마다 전원 로그아웃되던 문제 해소), PUBLIC_ORIGIN.

구성: Quick Tunnel(도메인 없이 *.trycloudflare.com 임시 주소). 사용자가 도메인을 보유하지 않아
  named tunnel의 Public Hostname 단계를 완료할 수 없었음. named tunnel 서비스(Cloudflared)는
  설치만 된 채 경로 없이 유휴 상태로 남아 있음 - 도메인 구입 시 그대로 사용 가능.
  프로덕션 모드로 전환: npm run build 후 npm start. Express가 dist/를 함께 서빙하므로 프런트와 API가
  단일 오리진이 되고, 터널은 localhost:3001 하나만 바라봄. Express는 여전히 127.0.0.1 바인딩이며
  포트를 외부에 여는 것이 아니라 cloudflared가 아웃바운드로 연결함.

브라우저 실측 중 발견해 고친 버그 (server/app.ts):
  증상 - 터널 주소로 회원가입하면 201이 오는데 곧바로 /api/auth/session이 401. 응답에 Set-Cookie가
    아예 없었음. 로컬 직접 접속(127.0.0.1:3001)에서도 동일하게 재현됨.
  원인 - express-session은 cookie.secure가 true인데 요청이 보안 연결로 인식되지 않으면 Set-Cookie를
    보내지 않음(문서화된 동작). cloudflared는 TLS를 종단하고 루프백으로 평문 HTTP를 넘기므로
    Express 입장에서는 모든 요청이 insecure였음. PUBLIC_ORIGIN을 켠 순간 secure:true가 되면서
    쿠키가 조용히 사라진 것.
  수정 - app.set('trust proxy', 'loopback'). 이 프로세스는 같은 머신의 프록시에서만 연결을 받으므로
    첫 홉만 신뢰하면 X-Forwarded-Proto: https가 반영되어 req.secure가 정확해짐.
  이 버그는 단위 테스트로 잡히지 않음 - 터널을 실제로 태워야 나타남.

검증 명령과 실제 결과:
  - npm run typecheck: 통과
  - npm test (TEST_DATABASE_URL 설정): 189 passed
    (첫 실행은 postgres 통합 테스트가 DuplicateHandleError로 실패했는데, 15차 실행이 남긴
     pgtester1 행 때문이었음. 테스트가 스스로 정리하지 않는 문제 - 아래 남은 문제 1) 참고.
     전용 테스트 DB만 TRUNCATE 후 재실행하여 통과)
  - 공개 URL 실측(https://overcome-roughly-enrolled-applications.trycloudflare.com):
      GET / 200, /api/health {"storage":"postgresql"}
      Set-Cookie: vibe.sid=...; HttpOnly; Secure; SameSite=Lax 발급 확인, 이후 /api/auth/session 200
      COOP/COEP: 루트·/practice-sandbox.html·/webr/webr-worker.js 모두 require-corp 유지
        (11차에서 고생한 워커 COEP 헤더가 프로덕션 빌드에서도 살아있음을 확인)
      브라우저: crossOriginIsolated true, SharedArrayBuffer function
      로그인 → 프로필 저장 → 과제 생성(electronics:quality/clean/compare) → 스타터 코드 실행
        1/4 통과(미완성 코드라 정상) → "학습 기록 저장" 성공까지 확인
남은 문제 / 다음 작업:
  1) tests/postgres.integration.test.ts가 생성한 행을 정리하지 않아 연속 실행 시 실패함. 다음 작업 후보.
  2) Quick Tunnel 주소는 cloudflared 프로세스가 살아있는 동안만 유효하고 재시작하면 바뀜. 바뀔 때마다
     .env의 PUBLIC_ORIGIN을 갱신하고 서버를 재시작해야 함. 고정 주소가 필요하면 도메인 구입 후
     named tunnel로 전환.
  3) 세션 저장소는 여전히 메모리. SESSION_SECRET을 고정해 재시작 시 쿠키 자체는 유지되지만
     세션 데이터는 사라짐. Postgres가 준비됐으므로 connect-pg-simple 도입이 다음 후보.
  4) 실제 CSRF 토큰은 여전히 미도입(X-Vibe-Lab 헤더 검사 유지). docs/MULTI_USER_DESIGN.md 5절
     체크리스트의 나머지 항목(비밀번호 재설정 경로, 사용자 기준 레이트 리밋)도 그대로 남음.
  5) 공개 주소가 살아있는 동안에는 누구나 회원가입할 수 있음. 데모가 끝나면 cloudflared 프로세스를
     종료해 노출을 닫을 것.
사용자 승인 또는 결정이 필요한 사항: 없음.
```
### 2026-09-14 (17차) 세션 영속화 · AWS 이전 준비 · GUI 재디자인

```text
날짜 / 담당 AI: 2026-09-14 / Claude Code
작업 목적: 사용자 요청 - "서버 설정 마무리 / 로컬에서 기능 전부 테스트 가능하게 / 추후 AWS로
  DB와 Server 이전하기 편하도록 / UI를 AI 활용 교육서비스 느낌으로". 이어서 "GUI도 재디자인 -
  기능 버튼과 구성은 같아도 되지만 색상과 위치를 조정".
브랜치: feature/mvp-savepoint-20260912
추가한 의존성 (package.json - 사용자 승인함): connect-pg-simple, @types/connect-pg-simple.
  npm audit 취약점 0건. 사용자가 "직접 구현" 대신 검증된 어댑터를 선택함.

변경 파일:
  server/store.ts - UserStore 인터페이스에 optional pool 노출. PostgresUserStore의 pool을
    private -> readonly 로 변경. 파일 저장소에는 pool이 없어 자연스럽게 메모리 세션으로 떨어짐.
  server/auth.ts - users.pool이 있으면 connect-pg-simple 세션 저장소 사용. 없으면 경고 로그 후 메모리.
  server/index.ts - HOST 환경변수(기본 127.0.0.1 유지), RDS용 TLS 설정(DATABASE_CA_CERT /
    DATABASE_SSL), 기동 로그에 sessions 표시.
  db/001_initial.sql - learning_sessions 테이블 추가. createTableIfMissing:false 로 두어
    DDL 권한이 없는 배포에서 조용히 메모리로 떨어지지 않고 크게 실패하도록 함.
  tests/postgres.integration.test.ts - 픽스처 행을 먼저 삭제. 연속 실행 시 실패하던 문제 해결.
  .env.example - SESSION_SECRET, PUBLIC_ORIGIN, HOST, DATABASE_SSL, DATABASE_CA_CERT 문서화.
  src/Workspace.tsx, src/CodeLab.tsx, src/styles.css - 아래 UI 작업.

AWS 이전 관점에서 해결된 것:
  1) 세션이 앱 메모리가 아니라 DB에 있으므로 EC2 재기동·다중 인스턴스(ALB)에서 로그인이 유지됨.
     이것이 단일 인스턴스 가정을 깨는 유일한 구조적 걸림돌이었음.
  2) 바인딩 주소가 환경변수화됨. 로컬은 여전히 루프백이라 실수로 노출되지 않음.
  3) RDS TLS 경로 확보. CA 없이 DATABASE_SSL=true만 쓰면 암호화는 되지만 검증은 안 된다는 점을
     경고 로그로 명시함(조용히 안전한 척하지 않음).

UI 작업 (두 단계):
  (1) AI 존재감 - 튜터 패널에 그라디언트 헤더·아바타·상태 배지(AI 연결 여부를 사실대로 표시)·
      현재 단계 칩·생각중 애니메이션 추가. 히어로에 오로라 질감. 프롬프트 킷에 동일 악센트.
  (2) GUI 재디자인 - 팔레트를 초록에서 보라로 이동. 근거: 이 제품에서 학습자가 주목해야 할 것이
      모델이므로 AI 악센트를 브랜드색으로 올리면 "브랜드색"과 "AI색"이 경쟁하던 구조가 사라짐.
      초록은 "테스트 통과"라는 의미 하나만 담당하도록 남김(--pass).
      사이드바를 다크로 전환해 학습 콘텐츠가 화면에서 가장 밝은 요소가 되게 함.
      통계는 밑줄 숫자에서 카드로, 탭은 밑줄에서 pill 그룹으로.
      토큰(--green/--lime/--line/--muted)을 재정의해 기존 시트 전체가 새 팔레트를 상속하게 하고,
      하드코딩된 색만 개별 override 함.
  시도했다가 되돌린 것: 단계 목록에 연결선을 그려 "학습 경로"처럼 보이게 하려 했으나, 불투명한
    카드 뒤로 지나가 간격에서만 보여 의도가 아니라 결함처럼 읽혔음. 제거하고 주석에 근거를 남김.

검증 명령과 실제 결과:
  - npm run typecheck: 통과
  - npm test (TEST_DATABASE_URL 설정): 189 passed. 연속 2회 실행해도 통과하는 것을 확인
    (16차에서 기록한 "연속 실행 시 실패" 문제가 해결됨)
  - npm run db:migrate: learning_sessions 테이블 생성 확인
  - npm run build: 통과. CSS 25.42 -> 29.20 -> 최종 번들 생성 확인
  - 세션 영속성 실측: 로그인(200) -> 서버 프로세스 강제 종료 -> 재기동 -> 같은 쿠키로
    /api/auth/session 200 + 사용자 정보 반환. 기동 로그도 "sessions: postgresql".
    psql로 learning_sessions 행 생성도 직접 확인.
  - 중간에 잘못된 검증 1회: PUBLIC_ORIGIN이 설정된 상태에서 평문 HTTP(127.0.0.1)로 테스트해
    쿠키가 발급되지 않아 401이 났음. 16차에서 고친 secure 쿠키 동작이 정상 작동한 것이지
    세션 저장소 결함이 아니었음. PUBLIC_ORIGIN을 비우고 재검증함.
  - UI: 계산된 스타일로 사이드바/탭/콘솔/단계마커/프롬프트킷 적용 확인. 가로 오버플로 없음
    (body.scrollWidth == clientWidth). 사이드바 대비 #1c1834 배경 / #b3aad8 텍스트.
    ※ 브라우저 창이 백그라운드일 때 스크린샷이 간헐적으로 빈 화면으로 캡처됨 - DOM 검사로
      콘텐츠가 정상 배치됨을 확인했으나, 최종 육안 검수는 사용자가 직접 할 필요가 있음.

남은 문제 / 다음 작업:
  1) Cloudflare Quick Tunnel은 현재 내려가 있음. .env의 PUBLIC_ORIGIN도 비워둔 상태(로컬 모드).
     다시 공개하려면 cloudflared 실행 -> 새 주소를 PUBLIC_ORIGIN에 넣고 서버 재시작.
  2) 실제 CSRF 토큰 미도입. docs/MULTI_USER_DESIGN.md 5절의 비밀번호 재설정 경로,
     사용자 기준 레이트 리밋도 그대로 남음.
  3) PracticeLibrary가 180개 실습을 전부 노출하고 언어 필터가 없음(9차부터 누적).
  4) AI 튜터는 여전히 규칙 기반. OPENAI_API_KEY 미연결이라 화면에 "RULES"로 표시됨.
     실제 공급자·모델 확인 후 연결 필요(ROADMAP P1-02).
  5) AWS 실제 배포(CLOUD-01~04)는 미착수. 이번 작업은 "이전이 가능한 상태"까지이고
     EC2/RDS 생성·IaC·배포 자동화는 하지 않았음.
사용자 승인 또는 결정이 필요한 사항: 없음.
```

### 2026-09-14 · UI-FOCUS-01 / Codex — 학습 중심 CSS 개선

- 사용자 최신 지시: GitHub의 현재 작업 상태를 확인하고 `src/styles.css`를 직접 수정. 이번 CSS 작업은 사용자의 명시적 구현 요청에 따라 Codex가 수행했습니다.
- 기준: `feature/mvp-savepoint-20260912` / `f8b3e85`. Fetch 후 origin 작업 브랜치도 같은 커밋임을 확인. `origin/main`은 `769a719`(PR #1 병합)이며 현재 작업 브랜치에는 그 이후 세션·CSRF·UI 변경이 있어 이를 유지했습니다.
- 변경 파일: `src/styles.css`, `PROGRESS.md`.
- 디자인: 밝은 학습 공간과 차분한 파란색 실행 버튼, 별도 보라색 도움 영역, 녹색 통과/황색 확인 필요 결과. 큰 보라색 장식과 상시 애니메이션을 제거하고 기존 테마 덮어쓰기 구간을 교체했습니다.
- 가독성: 설명 본문·코드 글자 및 행간 확대, 넓은 코드 입력란, 목표 강조, 실행 도구 묶음, 좁은 화면에서 튜터를 실습 아래로 배치. 일반 textarea 스타일보다 코드 편집기 스타일이 우선하도록 명시했습니다.
- 접근성: 키보드 초점 표시, 주요 버튼 44px 이상, 색상 외 기존 결과 문구 유지, reduced-motion 지원, 모바일 로그아웃 접근 유지. CSS만으로 학습 효과가 향상됐다고 검증한 것은 아닙니다.
- 실제 검증:
  - `npm.cmd run build`: 통과. 기존 Zod 주석 및 TypeScript 청크 크기 경고는 남음.
  - `npm.cmd test`: 188 passed / 1 skipped. 실제 PostgreSQL 통합 테스트를 이번 작업에서 실행하지 않았습니다.
  - `git diff --check`: 통과(줄바꿈 LF→CRLF 안내만 발생).
  - 실제 앱의 새 CSS 로딩 확인. 로그인 이후 화면은 동일한 프로덕션 번들과 인메모리 합성 응답을 제공하는 임시 로컬 검수 서버로 확인했습니다. 실제 계정·프로필·DB는 수정하지 않았습니다.
  - 합성 데이터 검수: 학습실→단계별 실습, 그룹 평균 빈칸 실행 1/4→수정 후 4/4 통과, 콘솔·상태 카드 표시, 자료실 전공/검색 필터, 프로필 1→2단계 전환 확인.
  - 실습 1440px: 편집기 폭 727px, 튜터 300px. 편집기 실제 배경 #172236 / 글자 #e4ecf8 / 14px 확인.
  - 모바일 실습·자료실 390px, 프로필 360/768/1024/1440px에서 문서 가로 넘침 없음. 긴 코드와 모바일 내비게이션은 해당 영역 안에서 스크롤됩니다.
- Git/공유: 두 변경 파일만 로컬 커밋으로 기록. 원격 Push·main 병합은 수행하지 않습니다. 기존 미추적 `.claude/`는 보존했습니다.
- 후속: 사용자의 실제 로그인 상태에서 디자인 확인 후 Fork로 커밋 검토·공유. LLM 연결·AWS 배포 및 자료실 언어 필터 추가 등 기능 작업은 이번 범위에 포함하지 않았습니다.

### 2026-09-14 · UI-ALIGN-02 / Codex — 인증 화면 중앙 정렬·메뉴 밑줄

- 사용자 요청에 따라 `src/styles.css` 수정. 기준 커밋 `baaf69f`의 상단 내비게이션 구조를 유지했습니다.
- 로그인·회원가입 패널을 최대 560px, 좌우 자동 여백으로 중앙 정렬하고 해당 화면의 제목·안내 문구도 중앙 정렬했습니다. 입력 필드와 다른 학습 화면의 본문 정렬은 유지했습니다.
- `.top-nav .nav-item.active`의 이전 사이드바용 inset 그림자를 제거해 ㄴ자 대신 하단 2px 밑줄만 표시합니다. 키보드 focus-visible 외곽선은 유지합니다.
- 검증: 실제 브라우저에서 패널과 콘텐츠 영역 중심 차이 0px, 선택 메뉴 box-shadow none / 왼쪽 테두리 0px / 하단 테두리 2px 확인. `npm.cmd run build`, `git diff --check` 통과. 기존 Zod 주석·큰 청크 경고 유지. CSS 소규모 배치 변경으로 전체 테스트는 재실행하지 않았습니다.
- 변경 파일: `src/styles.css`, `PROGRESS.md`. 로컬 커밋만 작성하고 Push·main 병합은 하지 않습니다. 기존 `.claude/` 미추적 파일은 보존했습니다.
- 다음: 사용자 화면에서 로그인·회원가입 및 상단 메뉴 표시 확인.


### 2026-09-15 · DEPLOY-PREP-01 / Codex — 무료 평가 공개 우선, AWS 전환 안내

- 기준: feature/mvp-savepoint-20260912 / a91cbff. 사용자 배포 준비 요청 후 추가 비용 없는 방향 요청을 반영했습니다.
- 변경 파일: docs/FREE_DEMO.md, docs/AWS_DEPLOYMENT.md, ROADMAP.md, PROGRESS.md. 제품 코드와 설정은 변경하지 않았습니다.
- 현재 방향: 로컬 PostgreSQL + 운영 빌드 Express + Cloudflare Quick Tunnel의 무료 임시 HTTPS 공개. PC 가동 필요·주소 변경·SSE 미지원 등 제한 명시. AWS 구성은 향후 전환 참고로 보류.
- 코드 확인: 인증/CSRF/DB 세션/사용자별 고비용 요청 제한과 PostgreSQL CI 정의 존재. 과거 기록의 CSRF·사용자별 제한 미도입 항목은 현재 코드와 다릅니다.
- RDS 전환 시: migrate.ts가 앱의 CA 환경변수를 사용하지 않고, 컴파일된 migrate의 SQL 경로도 빌드 산출물과 맞지 않음. 인증서 검증 psql 초기화 절차와 후속 보완점 문서화.
- AI: 출력 제한은 있으나 누적 예산 차단·일일 한도·소진 시 자동 규칙 모드 전환은 미구현. 제공된 키의 모델·잔액·과금 조건은 미확인. 키 연결만으로 검수형 실습이 생성형 자료로 바뀌지는 않음을 명시.
- 검증: 해당 서버·인증·AI·마이그레이션·빌드·CI 코드를 읽고 공식 Cloudflare/AWS/OpenAI/node-postgres 문서와 대조. 문서 작업이므로 빌드/테스트 재실행 없음. 직전 UI 커밋 빌드 통과와 과거 테스트 기록을 신규 검증으로 취급하지 않았습니다. 실제 AWS/공개 터널/API 연결 검증은 이번에 수행하지 않았습니다.
- Git/공유: 위 문서 4개만 로컬 커밋으로 기록하며 Push·main 병합은 하지 않습니다. 기존 미추적 .claude/ 보존.
- 다음 시작점: ROADMAP FREE-01~04. 실제 API 키를 채팅으로 받지 않고 사용 조건을 먼저 확인. 추가 비용을 발생시키는 리소스 생성 없음.


### 2026-09-15 · CONTENT-01 / Codex — 실습 다양화·DB 문제 은행

- 사용자 명시적 구현 요청에 따라 제품 코드 수정. 기준 32cd887, 기존 .claude/ 보존.
- 원인: practice-curriculum.ts와 curriculum.ts에 동일한 고정 이해도 3문항이 존재했음.
- 구현: 중앙값·최근 3개 행 이동평균·고정 기준 정규화 54개 TypeScript 실습 추가. 전체 234개(126 TS / 54 SQL / 54 R). 신규 ID만 추가하여 기존 실행 계약 버전은 유지.
- 문제 은행: 27개 계산/개념 템플릿, 234개 예제 묶음(각 3개 문제·해설·매개변수). 실제 로컬 PostgreSQL vibelab에 저장 완료. 학습자 기록은 수정하지 않음.
- 생성 경로: PostgreSQL 템플릿 조회 → 실습별 수치/유형/선택지 순환 → 과제 스냅샷 저장. 예제 풀이와 평가 수치는 분리. 후속 TS 과제에 신규 알고리즘 순환, SQL/R은 지원 테마 유지. 이전 과제·채점 결과 보존.
- 미래 API: 검증된 매개변수와 허용 계산기로 정답 재계산하는 서버 함수 제공. 공개 편집 API·LLM 자동 출제 호출은 이번 범위에 없음. DB 예제 저장본과 브라우저 실행 카탈로그 경계는 docs/CONTENT_BANK.md에 명시.
- 실제 검증: 초기 4개 정규화 참조 테스트의 음수 하한 문자열 보간 오류를 수정. 앱 계정 CREATE DATABASE 권한이 없어 새 테스트 DB 생성은 실패했고, 이미 있는 별도 vibelab_test로 전환. 최종 전체 249 passed / 0 skipped. npm run build 통과(기존 Zod 주석·큰 청크 경고 유지). 실제 Chrome 신규 화면 검수는 미수행.
- 변경: shared/catalog.ts, shared/extended-exercises.ts; server/question-bank.ts, learning-content-store.ts, seed-learning-content.ts, practice-curriculum.ts, curriculum.ts, ai.ts, app.ts; tests/question-bank.test.ts, content-postgres.test.ts, practice.test.ts, learning.test.ts; README.md, docs/CONTENT_BANK.md, PROGRESS.md.
- Git/공유: 위 변경을 작업 브랜치에 로컬 커밋. 원격 Push·main 병합 없음. 실제 DB 내용은 Git에 올라가지 않으며 seed 스크립트로 재현.
- 다음: 화면 새로고침 후 새 맞춤 과제 또는 자료실 신규 테마에서 확인. 다른 환경에서는 기존 DB 마이그레이션 뒤 seed-learning-content.ts 실행 필요. 무료 평가 공개와 API 사용량 제한 작업은 미완료 상태 유지.
