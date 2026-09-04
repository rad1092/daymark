> **개발 종료 · 2026-09-05**
> Daymark의 독립 제품 개발을 종료했습니다. 원본 자료는 삭제하지 않습니다.
> [자료 회수](https://daymark.whago.net/) · [구버전 열기](https://daymark.whago.net/legacy/)
> 아래 문서는 보존된 구버전의 문서입니다. 웹 종료 배포는 `npm run build:retired`, 원래 앱 빌드는 기존 명령을 사용합니다.

# Daymark

Daymark는 오늘 끝낼 약속을 세 개까지 정하고, 일이 중단됐을 때 다음
시작점을 남기는 로컬 우선 소프트웨어입니다.

이 저장소에는 서로 다른 두 제품 표면이 있습니다.

| 표면 | 용도 | 저장소 |
| --- | --- | --- |
| 설치 소프트웨어 | 실제 사용 제품 | 운영체제 앱 데이터 폴더의 SQLite |
| [웹 데모](https://daymark.whago.net/) | 제품 흐름 체험 | 브라우저 `localStorage` |

웹 데모를 Tauri 창에 넣은 구조가 아닙니다. 설치 소프트웨어는 별도
부트스트랩, UI, 비동기 저장소, 플랫폼 서비스와 Rust 런타임을 사용합니다.

## 설치 소프트웨어

데스크톱 빌드에는 다음 기능이 포함됩니다.

- 독립 실행 파일과 플랫폼 설치 번들
- 단일 인스턴스
- 메뉴바·시스템 트레이
- `Cmd/Ctrl + Shift + D`: Daymark 열기
- `Cmd/Ctrl + Shift + N`: 열고 빠른 수집으로 이동
- 선택적 항상 위
- 선택적 로그인 시 실행
- 창 위치와 크기 복원
- 앱 전용 SQLite 데이터베이스
- revision compare-and-swap을 사용한 충돌 방지
- 트랜잭션 기반 스키마 마이그레이션
- 변경 전 SQLite 백업 20개와 외부 JSON 백업 10개
- 서명된 업데이트를 연결할 수 있는 비활성 기본 경로

모바일 빌드는 같은 도메인 규칙과 SQLite 저장소를 사용합니다. 트레이,
전역 단축키, 항상 위, 로그인 시 실행은 모바일에서 노출하지 않습니다.

## 코드 경계

```text
src/lib/daymark.ts              기존 import를 유지하는 도메인 facade
src/lib/common.ts               날짜·식별자·공통 값 처리
src/lib/schema.ts               데이터 검증과 마이그레이션
src/lib/queries.ts              읽기 전용 도메인 질의
src/lib/mutations.ts            상태 전이와 업무 규칙
src/lib/browserStorage.ts       웹 데모 저장·복구
src/storage/                    저장소 계약과 web/native adapter
src/platform/                   운영체제 기능 계약과 adapter
src/software/                   설치 소프트웨어 UI와 상태 hooks
src/WebDemoApp.tsx              웹 데모 상태·저장 조정자
src/web/                        웹 데모 화면·다이얼로그·브라우저 경계
src-tauri/src/storage.rs        SQLite, migration, CAS, backup
src-tauri/src/lib.rs            창, tray, shortcut, updater 연결
```

React 화면은 SQLite나 운영체제 API를 직접 호출하지 않습니다.
`DaymarkRepository`와 `DaymarkPlatform` 경계만 사용합니다.

## 데이터

네이티브 데이터는 Tauri가 반환하는 운영체제별 앱 데이터 폴더에
저장됩니다.

```text
daymark.sqlite3
daymark.sqlite3-wal
daymark.sqlite3-shm
backups/daymark-<timestamp>-<revision>.json
```

SQLite 저장은 `BEGIN IMMEDIATE` 트랜잭션 안에서 현재 revision을 확인합니다.
외부 JSON 백업 쓰기가 실패하면 SQLite commit도 수행하지 않습니다. commit
뒤 오래된 파일을 지우는 작업만 비치명적인 정리 작업입니다.

기존 웹판 v1·v2·v3 JSON은 설치판 설정의 `JSON 가져오기`로 옮길 수
있습니다. 브라우저 저장 공간을 몰래 읽거나 공유하지 않습니다.

## 개발

Node.js 22 이상과 Rust stable이 필요합니다.

```bash
npm ci

# 웹 데모
npm run demo:dev
npm run demo:build

# 설치 소프트웨어
npm run software:dev
npm run software:build
```

모바일 프로젝트 초기화와 로컬 실행:

```bash
npm run mobile:android:init
npm run mobile:android:dev

npm run mobile:ios:init
npm run mobile:ios:dev
```

전체 정적 검증:

```bash
npm test
npm run lint
npm run demo:build
npm run software:web:build
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

macOS CI는 위 검증에 더해 실제 `.app`을 빌드하고 실행해 시작 직후
종료되거나 플러그인 초기화 오류가 발생하지 않는지도 확인합니다.

## 배포 상태

- macOS: 최적화 `.app`·`.dmg` 로컬 번들과 ad-hoc 구조 서명 검증 완료,
  Developer ID 서명·공증 필요
- Windows: 코드와 설치 설정 준비, Windows 실기기 검증 필요
- Linux: 코드 준비, 배포판별 tray·Wayland 동작 검증 필요
- iOS: 코드와 아이콘 준비, Xcode 프로젝트·서명·실기기 검증 필요
- Android: 코드와 아이콘 준비, Android SDK·서명·실기기 검증 필요

서명, 공증, 스토어 등록과 업데이트 키 구성은
[배포 절차](docs/RELEASING.md)를 따릅니다. 플랫폼별 동작을 출시 전에
확인할 항목은 [네이티브 동작 기준](docs/NATIVE_BEHAVIOR.md)에 있습니다.

## 라이선스

[MIT](LICENSE)
