# 🍽️ 근처 식당 돌림판

내 위치 기반으로 근처 식당을 자동 검색하고, 돌림판으로 랜덤 추천해주는 웹앱입니다.

## 기능

- 📍 현재 위치 자동 감지 + 주소 표시
- 🔍 카카오맵 API로 근처 음식점 자동 검색
- 📏 검색 반경 조절 (500m ~ 5km)
- 🌞🌆🌙 시간대별 필터 (점심/저녁/야식)
- 🎰 돌림판 랜덤 선택 + 컨페티 효과
- 📱 모바일 최적화

## 설정 방법

1. [카카오 개발자 사이트](https://developers.kakao.com)에서 앱 생성
2. JavaScript 앱 키 복사
3. `index.html`의 `YOUR_KAKAO_JAVASCRIPT_APP_KEY` 부분을 본인 키로 교체
4. `app.js` 상단 `CONFIG.KAKAO_APP_KEY`도 동일하게 교체
5. 카카오 개발자 사이트 → 앱 설정 → 플랫폼 → Web → 사이트 도메인에 배포 URL 등록

## GitHub Pages 배포

1. 이 저장소를 GitHub에 push
2. Settings → Pages → Source: main branch 선택
3. 생성된 URL (예: `https://username.github.io/repo-name`)을 카카오 플랫폼에 도메인 등록
4. 핸드폰 브라우저에서 해당 URL 접속

## 파일 구조

```
├── index.html    # 메인 HTML
├── style.css     # 스타일시트
├── app.js        # 앱 로직
├── config.ini    # 설정 참고 파일
├── .gitignore    # Git 제외 파일
└── README.md     # 이 파일
```

## 주의사항

- `YOUR_KAKAO_JAVASCRIPT_APP_KEY`를 반드시 본인 키로 교체해야 동작합니다
- GitHub에 올릴 때 API 키가 노출되지만, JavaScript 키는 도메인 제한이 걸려있어 다른 사이트에서 사용 불가합니다
- `file://` 프로토콜에서는 동작하지 않습니다 (반드시 웹서버 또는 GitHub Pages 필요)
