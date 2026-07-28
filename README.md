# Daymark

Daymark는 오늘 끝낼 일을 고르고, 시간을 배치하고, 집중 기록을 남기는
local-first 일일 실행 플래너입니다. 서버나 계정 없이 브라우저에서 바로
작동하며 데이터는 사용 중인 기기에만 저장됩니다.

배포 주소: [https://whago.net/daymark/](https://whago.net/daymark/)

## 주요 기능

- 해시태그를 지원하는 빠른 수집함
- 순서를 바꿀 수 있는 오늘의 핵심 3개
- 시작 시간과 15–90분 길이를 지정하는 시간 블록
- 일시정지·재개·완료 기록을 지원하는 15/25/45/60분 집중 타이머
- 완료 항목과 집중 시간으로 계산한 월요일 시작 주간 요약
- 제목·메모·태그 통합 검색과 상태·태그 필터
- 검증된 JSON 백업/복원과 마지막 정상 로컬 사본 복구
- 데모 데이터, 빈 상태, 키보드 단축키, 모바일 하단 내비게이션
- `/daymark/` 하위 경로와 오프라인 실행을 지원하는 PWA

## 로컬 실행

Node.js 22 이상이 필요합니다.

```bash
npm ci
npm run dev
```

개발 서버가 안내하는 `/daymark/` 주소를 여세요.

## 검증

```bash
npm test
npm run lint
npm run build
```

`npm test`는 날짜·주간 집계·검색·백업 복구를 검증하고,
`npm run build`는 TypeScript 검사 후 배포 파일을 생성합니다.

## 키보드

| 키 | 동작 |
| --- | --- |
| `C` | 빠른 수집 입력으로 이동 |
| `/` | 전체 기록 검색 |
| `1`–`4` | 오늘, 수집함, 주간, 기록 화면 전환 |
| `?` | 단축키 도움말 |
| `Esc` | 열린 창 닫기 |

입력란을 편집하는 동안에는 전역 단축키가 실행되지 않습니다.

## 데이터와 개인정보

Daymark는 네트워크 API, 분석 도구, 계정 시스템을 사용하지 않습니다.
할 일, 메모, 집중 기록은 `localStorage`에 저장되며 저장 전에 데이터 구조를
검증합니다. 기존 값이 정상일 때만 복구 사본을 교체하므로, 주 저장값이
손상되면 마지막 정상 사본으로 되돌아갈 수 있습니다.

브라우저 데이터 삭제나 기기 분실에는 복구할 수 없으므로 **데이터 → JSON
백업 내려받기**를 정기적으로 사용하세요. 백업에는 메모를 포함한 전체
Daymark 데이터가 평문 JSON으로 들어 있습니다.

## 배포

Vite의 base는 `/daymark/`로 고정되어 다음 두 환경에서 같은 산출물을
사용합니다.

- `https://whago.net/daymark/`
- `https://rad1092.github.io/daymark/`

`.github/workflows/deploy-pages.yml`은 `main` 브랜치가 갱신될 때 테스트와
빌드를 통과한 `dist`만 GitHub Pages에 배포합니다. 저장소 설정의
**Pages → Source**를 **GitHub Actions**로 지정하세요.

다른 하위 경로로 배포하려면 `vite.config.ts`, `public/manifest.webmanifest`,
서비스 워커의 등록 범위를 함께 바꿔야 합니다.

## 기술 구성

- React 19
- TypeScript
- Vite
- Vitest
- ESLint + React Hooks 규칙
- 브라우저 `localStorage`
- 서비스 워커 + Web App Manifest

## 라이선스

[MIT](./LICENSE)
