# GitHub에 배포하기

## 1. 저장소에 올리기

```bash
# 프로젝트 폴더에서
git init
git add .
git commit -m "벽돌깨기 게임 초기 커밋"
git branch -M main
git remote add origin https://github.com/사용자명/저장소명.git
git push -u origin main
```

## 2. GitHub Pages 켜기

1. GitHub 저장소 페이지 → **Settings** → 왼쪽 **Pages**
2. **Build and deployment**에서:
   - **Source**: `GitHub Actions` 선택
3. `main`(또는 `master`)에 푸시하면 자동으로 배포됩니다.

## 3. 배포 주소

배포가 끝나면 다음 주소로 접속할 수 있습니다.

- `https://사용자명.github.io/저장소명/`
- 저장소 이름이 `username.github.io`이면: `https://사용자명.github.io/`

## 4. Firebase 연동

- Firestore/로그인은 **HTTPS**에서만 동작합니다.
- Firebase 콘솔 → 프로젝트 설정 → **승인된 도메인**에  
  `사용자명.github.io` 를 추가해 두세요.

## 5. 수동 배포 트리거

**Actions** 탭 → **Deploy to GitHub Pages** → **Run workflow** 로 수동 실행할 수 있습니다.
