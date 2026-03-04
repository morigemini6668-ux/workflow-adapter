#!/bin/bash
# 패키지 기반 logcat 필터링 스크립트
# Usage: adb-logcat-filter.sh <package_name> [log_level] [--save <file>]

set -e

PACKAGE_NAME="$1"
LOG_LEVEL="${2:-D}"
SAVE_FILE=""

# 로그 레벨 검증 (--save가 로그 레벨 위치에 올 경우 대비)
if [[ "$LOG_LEVEL" == --* ]]; then
  # 두 번째 인자가 옵션이면 로그 레벨은 기본값 사용
  LOG_LEVEL="D"
  shift 1 2>/dev/null || true
else
  shift 2 2>/dev/null || true
fi

if [[ ! "$LOG_LEVEL" =~ ^[VDIWEFS]$ ]]; then
  echo "Error: Invalid log level '$LOG_LEVEL'. Use V/D/I/W/E/F/S."
  exit 1
fi
while [ $# -gt 0 ]; do
  case "$1" in
    --save)
      SAVE_FILE="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

if [ -z "$PACKAGE_NAME" ]; then
  echo "Usage: $0 <package_name> [log_level] [--save <file>]"
  echo "  package_name : Android 패키지명 (예: com.example.app)"
  echo "  log_level    : V/D/I/W/E/F (default: D)"
  echo "  --save <file>: 로그를 파일에 저장"
  echo ""
  echo "Examples:"
  echo "  $0 com.example.app"
  echo "  $0 com.example.app W"
  echo "  $0 com.example.app D --save ./app_log.txt"
  exit 1
fi

# 기기 연결 확인
DEVICE_COUNT=$(adb devices | grep -c "device$" || true)
if [ "$DEVICE_COUNT" -eq 0 ]; then
  echo "Error: No Android device connected."
  exit 1
fi

# PID 찾기
PID=$(adb shell pidof "$PACKAGE_NAME" 2>/dev/null || true)

if [ -z "$PID" ]; then
  echo "Warning: Process '$PACKAGE_NAME' not running."
  echo "Starting logcat with tag filter. Launch the app to see logs."
  echo "Listening for: $PACKAGE_NAME (level: $LOG_LEVEL+)"
  echo "Press Ctrl+C to stop."
  echo "---"

  # 프로세스가 없으면 전체 로그에서 패키지명으로 grep
  if [ -n "$SAVE_FILE" ]; then
    adb logcat -v threadtime "*:$LOG_LEVEL" | grep -i "$PACKAGE_NAME" | tee "$SAVE_FILE"
  else
    adb logcat -v threadtime "*:$LOG_LEVEL" | grep -i "$PACKAGE_NAME"
  fi
else
  echo "Filtering logs for: $PACKAGE_NAME (PID: $PID, level: $LOG_LEVEL+)"
  echo "Press Ctrl+C to stop."
  echo "---"

  if [ -n "$SAVE_FILE" ]; then
    adb logcat --pid="$PID" -v threadtime "*:$LOG_LEVEL" | tee "$SAVE_FILE"
  else
    adb logcat --pid="$PID" -v threadtime "*:$LOG_LEVEL"
  fi
fi
