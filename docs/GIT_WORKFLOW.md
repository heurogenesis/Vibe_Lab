# Git 및 Fork 작업 안내

- 원격 저장소: https://github.com/heurogenesis/Vibe_Lab.git
- 로컬 저장소: C:\Users\monke\Vibe_Lab
- 기본 브랜치: main (origin/main 추적)
- 작업 시작 위치: package.json이 있는 저장소 루트

## Fork에서 기록하기

1. Fork에서 File > Open Repository로 C:\Users\monke\Vibe_Lab 폴더를 엽니다.
2. 현재 브랜치가 main인지 확인합니다. 기능 개발은 main에서 codex/기능명 브랜치를 만들어 진행할 수 있습니다.
3. 코드를 수정하고 Local Changes에서 변경 내용을 확인합니다.
4. 기록할 파일을 Stage하고 변경 목적을 Commit 메시지로 남깁니다.
5. Commit은 로컬 기록, Push는 GitHub 업로드입니다. 다른 환경에서 작업하기 전에는 Fetch/Pull로 최신 이력을 확인합니다.
6. GitHub Actions에서 빌드와 PostgreSQL 포함 테스트 결과를 확인합니다.

.env, .data, node_modules, dist, dist-server는 .gitignore에 의해 커밋되지 않습니다. 실제 API 키는 .env에만 보관하세요.

## 저장소 분리 기록

이전 KNDA1 저장소의 vibe-lab 하위 폴더 이력만 추출해 새 저장소 최상위로 옮겼습니다. VibeLab(Review1) 커밋의 작성자, 메시지와 코드가 유지됩니다. 파일 경로가 바뀌었으므로 커밋 SHA는 새로 계산되었습니다. IN과 ponpoko.html 및 해당 개발 이력은 새 원격 main에 포함되지 않습니다.

이전 상태는 로컬 First-Sec 브랜치와 .git/pre-vibe-lab-migration.bundle에 보관합니다. 이 백업 브랜치는 새 GitHub 저장소에 올리지 않습니다. 원래 C:\Users\monke\KNDA 폴더도 보존되어 있으므로 이후 개발은 반드시 새 Vibe_Lab 폴더에서 진행하세요.