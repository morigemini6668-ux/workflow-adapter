만들고 싶은 것
- tmux native agent orchestration plugin
- claude code와 codex 모두 지원
- 전제조건: tmux session에서 agent가 실행중이어야 함
- main(orchestrator) agent는 tmux session에서 실행중인 agent들을 tmux cli를 통해 제어
- 모든 에이전트는 ~/.uniflow 디렉토리 아래 파일과 tmux cli를 통해 통신(방법은 구상해야함)
- main agent는 tmux cli와 파일 시스템을 통해 agent들을 모니터링 하고 제어
- 이 작업은 P1임. 다음 단계에선 ../workflow-adapter의 기능들이나 다른 에이전트 하네스들을 기반으로 새로운 tmux native 하네스를 만들 것임
- /Users/dalpark/workspace/home/oh-my-codex 이 폴더를 참조하여 쓸만한 것들을 찾아내기 바람
- claude code, codex에 쉽게 설치할 수 있는 setup cli가 있으면 좋겠음, 제어 cli를 따로 만들어도 되긴함
