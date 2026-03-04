# Logcat Advanced Guide

## 로그 레벨

| 레벨 | 약어 | 설명 |
|------|------|------|
| Verbose | V | 가장 상세한 로그 |
| Debug | D | 디버그용 로그 |
| Info | I | 정보성 로그 |
| Warning | W | 경고 |
| Error | E | 에러 |
| Fatal | F | 치명적 에러 |
| Silent | S | 출력 없음 |

## 필터링 패턴

### 태그:레벨 필터
```bash
# MyTag의 Debug 이상 로그만
adb logcat -s "MyTag:D"

# 여러 태그 조합
adb logcat -s "MyTag:D" "NetworkLib:W" "*:S"

# 마지막 *:S는 나머지 모든 태그를 Silent로 설정
```

### PID 기반 필터링 (특정 앱만)
```bash
# 패키지명으로 PID 찾기
PID=$(adb shell pidof com.example.app)

# PID로 필터링
adb logcat --pid=$PID
```

### grep 조합
```bash
# 특정 키워드 포함 로그
adb logcat | grep -i "error\|exception\|crash"

# 특정 키워드 제외
adb logcat | grep -v "chatty\|ViewRootImpl"

# 타임스탬프 포함
adb logcat -v time | grep "MyTag"
```

### 시간 기반 필터링
```bash
# 최근 로그만 (버퍼 클리어 후 시작)
adb logcat -c && adb logcat

# 특정 시간 이후
adb logcat -T "2024-01-15 10:30:00.000"

# 최근 N줄
adb logcat -t 100
```

## 로그 포맷

```bash
# 기본 (brief)
adb logcat -v brief

# 타임스탬프 포함
adb logcat -v time

# 스레드 정보 포함
adb logcat -v threadtime

# 긴 형식 (모든 메타데이터)
adb logcat -v long

# 색상 (터미널)
adb logcat -v color
```

## 크래시 분석 워크플로우

### 1. 크래시 로그 수집
```bash
# crash 버퍼에서 읽기
adb logcat -b crash -d

# 또는 FATAL EXCEPTION 검색
adb logcat -d | grep -A 50 "FATAL EXCEPTION"
```

### 2. 크래시 로그 구조 이해
```
E/AndroidRuntime(12345): FATAL EXCEPTION: main
E/AndroidRuntime(12345): Process: com.example.app, PID: 12345
E/AndroidRuntime(12345): java.lang.NullPointerException: Attempt to invoke virtual method...
E/AndroidRuntime(12345):     at com.example.app.MainActivity.onCreate(MainActivity.kt:42)
E/AndroidRuntime(12345):     at android.app.Activity.performCreate(Activity.java:8086)
E/AndroidRuntime(12345): Caused by: java.lang.IllegalStateException: ...
E/AndroidRuntime(12345):     at com.example.app.DataManager.init(DataManager.kt:15)
```

핵심 분석 포인트:
- **FATAL EXCEPTION: main** - 메인 스레드에서 발생 (UI 스레드)
- **Process** - 크래시한 앱의 패키지명과 PID
- **첫 번째 Exception** - 최종 발생한 예외
- **Caused by** - 실제 근본 원인 (가장 마지막 Caused by가 root cause)
- **at ...** - 스택 트레이스에서 자신의 코드 라인 찾기

### 3. ANR 분석
```bash
# ANR 로그 확인
adb logcat -s "ANR:E" -d

# ANR traces 파일 가져오기
adb pull /data/anr/traces.txt ./traces.txt

# 최근 ANR 정보
adb shell dumpsys activity processes | grep -A 5 "ANR"
```

ANR 주요 원인:
- 메인 스레드에서 네트워크 요청
- 메인 스레드에서 DB 쿼리
- 메인 스레드에서 무거운 연산
- 데드락

### 4. OOM (Out of Memory) 분석
```bash
# OOM 관련 로그
adb logcat -d | grep -i "out of memory\|OOM\|lowmemorykiller"

# 메모리 상태
adb shell dumpsys meminfo <package_name>
```

## 성능 로그

### 프레임 드롭 (Jank) 확인
```bash
# GPU 렌더링 프로파일
adb shell dumpsys gfxinfo <package_name>

# Choreographer 프레임 스킵 로그
adb logcat -s "Choreographer:W" | grep "skipped"
```

### 네트워크 트래픽
```bash
# 앱별 네트워크 사용량
adb shell cat /proc/net/xt_qtaguid/stats | grep <uid>
```

### 배터리 사용
```bash
adb shell dumpsys batterystats --charged <package_name>
```

## 로그 저장 및 공유

```bash
# 파일로 저장
adb logcat -d > full_log.txt

# 크래시만 저장
adb logcat -b crash -d > crash_log.txt

# 특정 앱 로그만 저장
PID=$(adb shell pidof com.example.app)
adb logcat --pid=$PID -d > app_log.txt

# 버그 리포트 생성 (시스템 전체 정보)
adb bugreport > bugreport.zip
```

## Tombstone (네이티브 크래시)

```bash
# 네이티브 크래시 로그 (C/C++ 레이어)
adb shell ls /data/tombstones/
adb pull /data/tombstones/ ./tombstones/
```

Tombstone 파일에서 확인할 내용:
- `signal` - 크래시 시그널 (SIGSEGV, SIGABRT 등)
- `backtrace` - 네이티브 스택 트레이스
- `registers` - CPU 레지스터 상태
