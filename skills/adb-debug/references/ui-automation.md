# UI Automation Advanced Guide

## 좌표 확인 방법

### 방법 1: 개발자 옵션 - 포인터 위치
기기 설정 > 개발자 옵션 > "포인터 위치" 활성화하면 화면 터치 시 좌표 표시.

### 방법 2: uiautomator dump
현재 화면의 UI 계층을 XML로 덤프:
```bash
adb shell uiautomator dump /sdcard/ui_dump.xml
adb pull /sdcard/ui_dump.xml ./ui_dump.xml
```

XML에서 `bounds` 속성으로 좌표 확인:
```xml
<node bounds="[100,200][300,400]" text="로그인" class="android.widget.Button" />
```
이 경우 버튼 중앙 좌표는 `(200, 300)`.

### 방법 3: 스크린샷 + 이미지 분석
```bash
adb shell screencap /sdcard/screen.png
adb pull /sdcard/screen.png ./screen.png
```
이미지 뷰어에서 좌표 확인.

## 제스처 패턴

### 스크롤 다운
```bash
# 화면 중앙에서 아래로 스크롤
adb shell input swipe 540 1500 540 500 300
```

### 스크롤 업
```bash
adb shell input swipe 540 500 540 1500 300
```

### 좌우 스와이프 (페이지 넘기기)
```bash
# 오른쪽에서 왼쪽 (다음 페이지)
adb shell input swipe 900 800 100 800 200

# 왼쪽에서 오른쪽 (이전 페이지)
adb shell input swipe 100 800 900 800 200
```

### 롱 프레스
```bash
# 같은 좌표로 긴 스와이프 = 롱 프레스
adb shell input swipe 500 500 500 500 1500
```

### 핀치 줌 (멀티터치)
ADB 기본 input 명령은 멀티터치를 지원하지 않음. 대안:
```bash
# sendevent를 사용한 멀티터치 (기기별 이벤트 디바이스 확인 필요)
# 또는 앱 내 줌 컨트롤 UI 활용
```

## 대기 전략

UI 자동화 시 화면 로딩을 기다려야 하는 경우:

### 방법 1: sleep
```bash
adb shell input tap 500 500
sleep 2
adb shell input tap 500 800
```

### 방법 2: UI 요소 확인 루프
```bash
# 특정 텍스트가 화면에 나타날 때까지 대기
while true; do
  adb shell uiautomator dump /sdcard/ui.xml 2>/dev/null
  if adb shell cat /sdcard/ui.xml | grep -q "로그인 성공"; then
    break
  fi
  sleep 1
done
```

### 방법 3: 액티비티 전환 대기
```bash
# 특정 액티비티가 포그라운드에 올 때까지 대기
TARGET_ACTIVITY="com.example.app/.MainActivity"
while true; do
  CURRENT=$(adb shell dumpsys activity activities | grep "mResumedActivity" | head -1)
  if echo "$CURRENT" | grep -q "$TARGET_ACTIVITY"; then
    break
  fi
  sleep 1
done
```

## 텍스트 입력 팁

### 한글 입력 문제
`adb shell input text`는 ASCII만 지원. 한글 입력 방법:

```bash
# 방법 1: ADB 키보드 앱 사용 (ADBKeyBoard)
# 설치 후:
adb shell am broadcast -a ADB_INPUT_TEXT --es msg "한글 텍스트"

# 방법 2: 클립보드 활용
adb shell input text "temp"
adb shell am broadcast -a clipper.set -e text "한글 텍스트"
adb shell input keyevent 279  # PASTE
```

### 특수문자 입력
```bash
# 공백: %s
adb shell input text "hello%sworld"

# URL 등 특수문자가 많은 경우 base64 활용
echo -n "https://example.com?q=test" | base64
# 디코딩 후 입력하는 스크립트 활용
```

## 복합 자동화 예제

### 앱 열기 > 로그인 > 스크린샷
```bash
#!/bin/bash
PACKAGE="com.example.app"

# 앱 실행
adb shell monkey -p $PACKAGE -c android.intent.category.LAUNCHER 1
sleep 3

# 이메일 입력 필드 탭
adb shell input tap 540 600
sleep 0.5
adb shell input text "user@example.com"

# 비밀번호 필드 탭
adb shell input tap 540 800
sleep 0.5
adb shell input text "password123"

# 로그인 버튼 탭
adb shell input tap 540 1000
sleep 3

# 결과 스크린샷
adb shell screencap /sdcard/login_result.png
adb pull /sdcard/login_result.png ./login_result.png
echo "Screenshot saved: ./login_result.png"
```

## Activity/Intent 직접 실행

특정 화면을 바로 열기:
```bash
# 특정 액티비티 실행
adb shell am start -n <package>/<activity>

# 딥링크로 실행
adb shell am start -a android.intent.action.VIEW -d "myapp://settings"

# 인텐트 extras 전달
adb shell am start -n com.example.app/.DetailActivity --es "item_id" "12345"
```
