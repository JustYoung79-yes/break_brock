# Firestore 연결 문제 해결 가이드

인터넷이 연결된 상태에서도 "온라인 저장소에 연결할 수 없습니다" 오류가 나는 경우, 아래 항목을 순서대로 확인해 주세요.

## 1. 브라우저 콘솔에서 실제 오류 확인

1. 게임 페이지에서 **F12** (또는 우클릭 → 검사)를 눌러 개발자 도구를 엽니다.
2. **Console** 탭을 선택합니다.
3. 페이지를 새로고침한 뒤, 빨간색으로 표시된 오류 메시지를 확인합니다.

**자주 나오는 오류와 해결 방법:**

| 오류 코드 | 원인 | 해결 방법 |
|-----------|------|-----------|
| `permission-denied` | Firestore 보안 규칙이 접근을 막음 | 아래 2번 참고 |
| `unavailable` | Firestore 서버 연결 실패 | 잠시 후 재시도, 방화벽/회사 네트워크 확인 |
| `not-found` | Firestore가 프로젝트에 없음 | 아래 3번 참고 |
| `timeout` | 연결 시간 초과 | 네트워크 상태 확인, VPN 사용 시 해제 후 시도 |

---

## 2. Firestore 보안 규칙 설정 (가장 흔한 원인)

1. [Firebase Console](https://console.firebase.google.com/) 접속
2. **breakbrock-young** 프로젝트 선택
3. 왼쪽 메뉴에서 **Firestore Database** 클릭
4. 상단 **규칙** 탭 선택
5. 아래 규칙으로 **전체 교체** 후 **게시** 클릭:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /game/{document=**} {
      allow read, write: if true;
    }
  }
}
```

---

## 3. Firestore 데이터베이스 생성

1. Firebase Console → **Firestore Database**
2. "데이터베이스 만들기" 또는 "Cloud Firestore"가 비활성화되어 있다면 먼저 생성
3. **테스트 모드** 또는 **프로덕션 모드** 중 선택 후 생성

---

## 4. 실행 방식 확인 (file:// vs http://)

- **file://** (파일을 직접 더블클릭해서 열기): Firestore 연결이 되지 않을 수 있습니다.
- **해결**: 로컬 웹 서버로 실행하세요.
  - VS Code: Live Server 확장 설치 후 "Go Live" 클릭
  - 또는 터미널에서: `npx serve` 실행 후 `http://localhost:3000` 접속

---

## 5. Firebase 인증된 도메인 확인

1. Firebase Console → 프로젝트 설정(⚙️) → **일반** 탭
2. **인증된 도메인** 섹션 확인
3. 사용 중인 도메인(예: localhost, GitHub Pages URL)이 목록에 있는지 확인
4. 없다면 **도메인 추가**로 등록

---

## 6. 방화벽/네트워크

- 회사 네트워크나 학교 Wi-Fi에서는 Google/Firebase 접속이 차단될 수 있습니다.
- VPN 사용 시 연결이 불안정할 수 있으니, VPN을 끄고 다시 시도해 보세요.
