---
name: adb-debug
description: This skill should be used when the user asks to "install APK", "uninstall app", "adb install", "tap screen", "swipe UI", "input text on device", "adb UI automation", "check logcat", "filter logs", "debug crash", "ANR analysis", "take screenshot", "screen record", "capture screen", "adb shell", or mentions Android device debugging, ADB commands, or app testing on a physical/emulator device.
version: 0.1.0
---

# adb-debug

Android Debug Bridge (ADB) CLI를 활용하여 Android 기기에서 앱 설치, UI 제어, 로그 디버깅, 화면 캡처를 수행하는 스킬.

## Prerequisites

- ADB가 PATH에 설치되어 있어야 함 (`adb version`으로 확인)
- USB 디버깅이 활성화된 Android 기기 또는 에뮬레이터가 연결되어 있어야 함

연결 상태 확인:
```bash
adb devices
```

여러 기기가 연결된 경우 `-s <serial>` 플래그로 대상 지정:
```bash
adb -s <device_serial> <command>
```

## Core Workflows

### 1. APK 설치 및 실행

APK를 설치하고 메인 액티비티를 실행하려면 `scripts/adb-install-launch.sh` 스크립트 활용:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/skills/adb-debug/scripts/adb-install-launch.sh" <apk_path> [package_name]
```

수동 명령어:
```bash
# 설치 (기존 앱 덮어쓰기)
adb install -r <apk_path>

# 패키지명으로 실행
adb shell monkey -p <package_name> -c android.intent.category.LAUNCHER 1

# 제거
adb uninstall <package_name>
```

빌드 후 설치 워크플로우 (Gradle 프로젝트):
```bash
./gradlew assembleDebug && adb install -r app/build/outputs/apk/debug/app-debug.apk
```

### 2. UI 자동화

기기 화면을 제어하여 탭, 스와이프, 텍스트 입력 수행.

기본 명령어:
```bash
# 탭 (x, y 좌표)
adb shell input tap <x> <y>

# 스와이프 (시작x, 시작y, 끝x, 끝y, 지속시간ms)
adb shell input swipe <x1> <y1> <x2> <y2> [duration_ms]

# 텍스트 입력 (공백은 %s로)
adb shell input text "hello%sworld"

# 키 이벤트
adb shell input keyevent <keycode>
```

자주 사용하는 키코드:
| 키코드 | 동작 |
|--------|------|
| 3 | HOME |
| 4 | BACK |
| 26 | POWER |
| 66 | ENTER |
| 67 | DELETE (백스페이스) |
| 82 | MENU |
| 187 | APP_SWITCH (최근 앱) |

좌표를 모를 경우, 스크린샷을 먼저 촬영하여 확인하거나 `adb shell wm size`로 해상도 확인.

상세한 UI 자동화 패턴은 `references/ui-automation.md` 참조.

### 3. 로그 확인 및 디버깅

특정 앱의 로그만 필터링하려면 `scripts/adb-logcat-filter.sh` 스크립트 활용:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/skills/adb-debug/scripts/adb-logcat-filter.sh" <package_name> [log_level]
```

수동 명령어:
```bash
# 패키지 PID로 필터링
adb shell pidof <package_name> | xargs -I{} adb logcat --pid={}

# 태그 필터링
adb logcat -s "MyTag:D"

# 크래시/ANR만 보기
adb logcat -b crash
adb logcat -s "ANR:E"

# 로그 파일로 저장
adb logcat -d > logcat_output.txt
```

크래시 분석 시 핵심 패턴:
- `FATAL EXCEPTION` - 앱 크래시 시작점
- `Caused by:` - 실제 원인 추적
- `ANR in` - Application Not Responding 발생

상세한 logcat 가이드는 `references/logcat-guide.md` 참조.

### 4. 스크린샷 및 화면 녹화

`scripts/adb-capture.sh` 스크립트로 간편하게 캡처:

```bash
# 스크린샷
bash "${CLAUDE_PLUGIN_ROOT}/skills/adb-debug/scripts/adb-capture.sh" screenshot [output_path]

# 화면 녹화 (최대 180초)
bash "${CLAUDE_PLUGIN_ROOT}/skills/adb-debug/scripts/adb-capture.sh" record [output_path] [duration_seconds]
```

수동 명령어:
```bash
# 스크린샷
adb shell screencap /sdcard/screenshot.png
adb pull /sdcard/screenshot.png ./screenshot.png

# 화면 녹화 (Ctrl+C로 중지)
adb shell screenrecord /sdcard/recording.mp4
adb pull /sdcard/recording.mp4 ./recording.mp4
```

## Useful Utility Commands

```bash
# 앱 데이터 초기화
adb shell pm clear <package_name>

# 앱 강제 종료
adb shell am force-stop <package_name>

# 설치된 패키지 목록
adb shell pm list packages | grep <keyword>

# 현재 포그라운드 액티비티 확인
adb shell dumpsys activity activities | grep "mResumedActivity"

# 기기 속성 확인
adb shell getprop ro.build.version.release   # Android 버전
adb shell getprop ro.product.model           # 기기 모델
```

## Additional Resources

### Reference Files

상세한 가이드는 아래 파일 참조:
- **`references/ui-automation.md`** - UI 자동화 고급 패턴 (제스처 조합, 대기 전략, uiautomator dump)
- **`references/logcat-guide.md`** - Logcat 고급 필터링, 크래시/ANR 분석 워크플로우, 성능 로그

### Scripts

반복 작업용 유틸리티 스크립트:
- **`scripts/adb-install-launch.sh`** - APK 설치 후 자동 실행
- **`scripts/adb-logcat-filter.sh`** - 패키지 기반 로그 필터링
- **`scripts/adb-capture.sh`** - 스크린샷/화면 녹화 및 로컬 pull
