#!/bin/bash
# 스크린샷/화면 녹화 스크립트
# Usage:
#   adb-capture.sh screenshot [output_path]
#   adb-capture.sh record [output_path] [duration_seconds]

set -e

MODE="$1"
OUTPUT_PATH="$2"
DURATION="${3:-180}"

if [ -z "$MODE" ]; then
  echo "Usage:"
  echo "  $0 screenshot [output_path]"
  echo "  $0 record [output_path] [duration_seconds]"
  echo ""
  echo "Modes:"
  echo "  screenshot  - Capture screen as PNG"
  echo "  record      - Record screen as MP4 (max 180s, Ctrl+C to stop)"
  echo ""
  echo "Examples:"
  echo "  $0 screenshot ./screen.png"
  echo "  $0 record ./video.mp4 30"
  exit 1
fi

# 기기 연결 확인
DEVICE_COUNT=$(adb devices | grep -c "device$" || true)
if [ "$DEVICE_COUNT" -eq 0 ]; then
  echo "Error: No Android device connected."
  exit 1
fi

TIMESTAMP=$(date +%Y%m%d_%H%M%S)

case "$MODE" in
  screenshot)
    OUTPUT_PATH="${OUTPUT_PATH:-./screenshot_${TIMESTAMP}.png}"
    DEVICE_PATH="/sdcard/screenshot_${TIMESTAMP}.png"

    echo "Capturing screenshot..."
    adb shell screencap "$DEVICE_PATH"
    adb pull "$DEVICE_PATH" "$OUTPUT_PATH"
    adb shell rm "$DEVICE_PATH"

    echo "Screenshot saved: $OUTPUT_PATH"
    ;;

  record)
    OUTPUT_PATH="${OUTPUT_PATH:-./recording_${TIMESTAMP}.mp4}"
    DEVICE_PATH="/sdcard/recording_${TIMESTAMP}.mp4"

    if [ "$DURATION" -gt 180 ]; then
      echo "Warning: Maximum duration is 180 seconds. Setting to 180."
      DURATION=180
    fi

    echo "Recording screen (max ${DURATION}s). Press Ctrl+C to stop..."
    trap 'echo "Stopping recording..."' INT

    adb shell screenrecord --time-limit "$DURATION" "$DEVICE_PATH" || true
    sleep 1

    echo "Pulling recording..."
    if adb pull "$DEVICE_PATH" "$OUTPUT_PATH"; then
      adb shell rm "$DEVICE_PATH"
      echo "Recording saved: $OUTPUT_PATH"
    else
      echo "Warning: Failed to pull recording from device."
      echo "File may still be on device at: $DEVICE_PATH"
    fi
    ;;

  *)
    echo "Error: Unknown mode '$MODE'. Use 'screenshot' or 'record'."
    exit 1
    ;;
esac
