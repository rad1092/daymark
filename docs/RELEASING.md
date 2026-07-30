# Daymark 배포 절차

설치 파일이 생성되는 것과 사용자에게 배포 가능한 것은 다릅니다. 이 문서는
서명·공증·업데이트·스토어 제출을 포함한 출시 조건을 기록합니다.

## 공통

1. `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`의
   버전을 동일하게 맞춥니다.
2. JavaScript와 Rust 검증을 모두 통과시킵니다.
3. 기존 버전의 실제 데이터 사본으로 migration과 rollback을 확인합니다.
4. `docs/NATIVE_BEHAVIOR.md`의 대상 플랫폼 표를 실기기에서 완료합니다.
5. 깨끗한 CI runner에서 번들을 만듭니다. 개발자 노트북의 임시 키로
   배포 파일을 만들지 않습니다.

## 업데이트 서명

기본 빌드에서는 updater가 비활성화되어 있습니다. 가짜 endpoint나 빈 공개
키를 넣지 않습니다.

출시 CI에는 다음 값이 필요합니다.

- `DAYMARK_UPDATE_ENDPOINT`: 서명된 `latest.json`의 HTTPS 주소
- `DAYMARK_UPDATER_PUBKEY`: 저장소에 공개해도 되는 updater 공개 키
- `TAURI_SIGNING_PRIVATE_KEY`: CI secret에만 저장하는 updater 개인 키
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: CI secret

release build에는 `bundle.createUpdaterArtifacts`를 `true`로 병합하는
별도 Tauri config가 필요합니다. 개인 키와 암호는 파일이나 Git 기록에
넣지 않습니다. 앱은 endpoint와 공개 키가 모두 컴파일된 경우에만 update
check를 활성화합니다.

## macOS

필요 조건:

- 전체 Xcode
- Apple Developer Program 계정
- `Developer ID Application` 인증서
- 공증용 App Store Connect API key 또는 Apple ID 자격 증명

직접 배포 `.app`과 `.dmg`는 Developer ID로 서명한 뒤 Apple 공증과
stapling을 완료합니다. 다음을 별도로 확인합니다.

- `codesign --verify --deep --strict`
- `spctl --assess --type execute`
- 새 사용자 계정에서 최초 실행
- Gatekeeper가 경고 없이 실행하는지

Mac App Store 배포는 별도 provisioning profile과 sandbox entitlement
검토가 필요합니다. 직접 배포와 같은 번들을 재사용한다고 가정하지 않습니다.

## Windows

필요 조건:

- Windows x64와 arm64 CI runner
- 신뢰 가능한 코드 서명 인증서
- Windows SDK와 WebView2 테스트 환경

NSIS 설치·업데이트·제거를 일반 사용자 권한에서 시험합니다. SmartScreen,
시작 프로그램 등록, tray 재시작, 다중 모니터 복원을 실제 Windows 11에서
확인하기 전에는 Windows 지원 완료로 표시하지 않습니다.

## Linux

AppImage 또는 배포판 패키지를 대상별로 만듭니다. X11에서 성공한 tray,
always-on-top, shortcut 결과를 Wayland 결과로 간주하지 않습니다. GNOME,
KDE와 최소 한 개 Wayland compositor에서 각각 검증합니다.

## iOS

필요 조건:

- 전체 Xcode와 iOS SDK
- Apple Developer Program
- App Store Connect 앱 레코드
- distribution certificate와 provisioning profile

`npm run mobile:ios:init` 뒤 bundle identifier가
`net.whago.daymark`인지 확인합니다. simulator 통과만으로 제출하지 않고
실기기에서 background/foreground, 강제 종료, 저용량 저장소, JSON import,
SQLite migration을 시험합니다.

## Android

필요 조건:

- Android Studio와 Android SDK/NDK
- Java toolchain
- 업로드 keystore와 Google Play 앱 레코드

`npm run mobile:android:init` 뒤 application id가
`net.whago.daymark`인지 확인합니다. release AAB는 CI secret의 keystore로
서명합니다. 화면 overlay 권한은 추가하지 않습니다.

## 제거와 데이터

앱 제거 시 운영체제 정책에 따라 앱 데이터가 남거나 삭제될 수 있습니다.
출시 전 플랫폼별 실제 제거 결과를 문서화합니다. 데이터가 삭제되는
플랫폼에서는 제거 전에 JSON export를 안내해야 합니다.
