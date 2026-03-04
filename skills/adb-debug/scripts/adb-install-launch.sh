#!/bin/bash
# APK 설치 후 자동 실행 스크립트
# Usage: adb-install-launch.sh <apk_path> [package_name]

set -e

APK_PATH="$1"
PACKAGE_NAME="$2"

if [ -z "$APK_PATH" ]; then
  echo "Usage: $0 <apk_path> [package_name]"
  echo "  apk_path     : APK 파일 경로"
  echo "  package_name : 패키지명 (생략 시 APK에서 자동 추출)"
  exit 1
fi

if [ ! -f "$APK_PATH" ]; then
  echo "Error: APK file not found: $APK_PATH"
  exit 1
fi

# 기기 연결 확인
DEVICE_COUNT=$(adb devices | grep -c "device$" || true)
if [ "$DEVICE_COUNT" -eq 0 ]; then
  echo "Error: No Android device connected. Check 'adb devices'."
  exit 1
elif [ "$DEVICE_COUNT" -gt 1 ]; then
  echo "Warning: Multiple devices connected. Using first device."
  echo "Tip: Use 'adb -s <serial>' to specify a device."
fi

# 패키지명 자동 추출 (aapt이 있는 경우)
if [ -z "$PACKAGE_NAME" ]; then
  if command -v aapt &> /dev/null; then
    PACKAGE_NAME=$(aapt dump badging "$APK_PATH" 2>/dev/null | grep "package: name=" | sed "s/.*name='//" | sed "s/'.*//")
  elif command -v aapt2 &> /dev/null; then
    PACKAGE_NAME=$(aapt2 dump badging "$APK_PATH" 2>/dev/null | grep "package: name=" | sed "s/.*name='//" | sed "s/'.*//")
  fi

  if [ -z "$PACKAGE_NAME" ]; then
    echo "Warning: Could not auto-detect package name (aapt not found)."
    echo "Installing APK without auto-launch. Provide package_name to enable auto-launch."
  fi
fi

# 설치
echo "Installing $APK_PATH ..."
adb install -r "$APK_PATH"
echo "Installation complete."

# 실행
if [ -n "$PACKAGE_NAME" ]; then
  echo "Launching $PACKAGE_NAME ..."
  adb shell monkey -p "$PACKAGE_NAME" -c android.intent.category.LAUNCHER 1 2>/dev/null
  echo "App launched: $PACKAGE_NAME"
fi
