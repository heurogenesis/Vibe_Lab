# 검증 기록

검증일: 2026-09-11. 환경: Windows, Node.js 24.21.0.

| 항목 | 결과 |
| --- | --- |
| TypeScript + React/Vite + Express 빌드 | 통과 |
| 자동 테스트 | 13개 통과, 실제 PostgreSQL 테스트 1개 미실행 |
| PostgreSQL SQL·JSONB 계약 | pg-mem에서 확인; 실제 잠금·롤백의 증명은 아님 |
| AI SDK 응답 스키마·실패 처리 | 모의 응답 테스트 통과; 실제 모델 호출 미실행 |
| npm 패키지 감사 | vitest 4.1.11 업데이트 후 취약점 0건 |
| 로컬 UI·health 응답 | HTTP 200, demo-file, AI 미연결 |
| GitHub 실제 저장소 상세 조회 | microsoft/Web-Dev-For-Beginners 조회 HTTP 200 |
| GitHub 실제 검색 | 외부 게이트웨이 504 반복; 실검색 성공 확인 못함 |
| 브라우저 클릭·시각 회귀 테스트 | 미실행 |
| 공개 배포·GitHub 저장소 생성 | 미실행 |

검색 장애 중에도 주제 카드의 '대표 저장소 살펴보기'로 알려진 공개 저장소의 상세 조회를 사용할 수 있습니다. 검색 실패를 가짜 검색 결과로 대체하지 않습니다.

다음 검증은 별도 테스트용 PostgreSQL을 준비해 TEST_DATABASE_URL로 실제 DB 테스트를 실행하고, 선택한 AI 모델·키에서 과제와 대화를 확인하는 것입니다. GitHub 검색은 외부 서비스 연결이 복구되면 재확인해야 합니다.
