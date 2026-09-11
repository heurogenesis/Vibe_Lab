# API 명세 (로컬 MVP)

기본 주소 `http://127.0.0.1:3001/api`. 브라우저에서는 Vite의 `/api` 프록시 또는 Express가 제공하는 동일 출처를 사용합니다. JSON 요청이며 쓰기 요청에 `X-Vibe-Lab: 1` 헤더가 필요합니다. 외부 Origin은 차단되고 localhost Host만 허용됩니다. 인증·다중 사용자 API가 아닙니다.

| 메서드·경로 | 요청 | 응답 |
| --- | --- | --- |
| `GET /health` | 없음 | `storage`, `ai`, `githubAuthenticated`, `localOnly` |
| `GET /state` | 없음 | `profile`, `assignments`, `messages` (퀴즈 정답은 채점 전 제외) |
| `PUT /profile` | 아래 Profile | 저장한 Profile |
| `POST /assignments` | `{}` | 프로필에 맞춘 새 과제 (201) |
| `PATCH /assignments/:id/progress` | `{step: 0, completed: true}` | 갱신한 과제 |
| `POST /assignments/:id/quiz` | `{answers: [1,0,2]}` | `score`, `total`, `feedback` |
| `POST /assignments/:id/chat` | `{message: "원리를 설명해 줘", lessonIndex: 0}` | 사용자·튜터 메시지 2개 |
| `GET /github/search?q=...` | 검색어 2~120자 | 공개 저장소 최대 9개 |
| `GET /github/repository?name=owner/repo` | 저장소 이름 | README, 루트 파일명, 라이선스 등 |
| `POST /assignments/:id/submission` | `{url: "https://github.com/owner/repo", reflection: "20자 이상 회고"}` | `evidence`, `submittedAt` 포함 제출 기록 |

Profile:

```json
{
  "name": "학습자",
  "major": "경영학",
  "role": "기획·운영",
  "level": "beginner",
  "style": "guided",
  "domain": "business",
  "goal": "반복되는 업무를 자동화하고 원리를 이해하고 싶어요.",
  "minutes": 60,
  "knowledge": []
}
```

- `level`: `beginner | intermediate | advanced`
- `style`: `hands-on | concept-first | guided`
- `domain`: `business | data | education`
- `knowledge`: `html | javascript | react | api | sql | git`의 배열
- `minutes`: 회당 20~180분
- `source`: `rules | ai`; 생성 출처를 과제와 튜터 답변에 저장

오류 형식: `{ "error": "사용자용 안내", "details": [{ "field": "...", "message": "..." }] }`. `details`는 입력 검증 오류에서만 포함됩니다. 400 입력 오류, 403 출처·접근 제한, 404 자료 없음, 409 과제 한도, 429 호출 제한, 502 외부 API 실패, 500 저장 등 서버 오류입니다. API 키와 외부 서비스의 상세 오류 원문은 반환하지 않습니다.

일반 API는 IP별 분당 120회, AI 과제 생성·대화는 공유 제한기로 분당 12회입니다. 프로세스 메모리의 제한이며 운영 서비스에서는 사용자별 분산 제한과 비용 상한을 추가해야 합니다. 외부 요청 동안 DB 잠금은 보유하지 않습니다.
