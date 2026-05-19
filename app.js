// ─── 설정 (config.ini에서 관리) ───
const CONFIG = {
  KAKAO_APP_KEY: 'b73aa51f19448374889af9f6d2e4036b', // ← 여기에 본인 키 입력
  DEFAULT_RADIUS: 1500,
  MAX_PAGES: 3
};

// ─── 전역 변수 ───
let allPlaces = [];
let filteredPlaces = [];
let currentAngle = 0;
let isSpinning = false;
let currentFilter = 'lunch';
let userLat = null;
let userLng = null;
let searchRadius = CONFIG.DEFAULT_RADIUS;

const canvas = document.getElementById('wheelCanvas');
const ctx = canvas.getContext('2d');
const CENTER = canvas.width / 2;
const RADIUS = CENTER;

const palette = [
  "#ff6b6b","#ee5a24","#f0932b","#ffbe76","#badc58","#6ab04c",
  "#22a6b3","#7ed6df","#4834d4","#686de0","#be2edd","#e056fd",
  "#ff4757","#2ed573","#1e90ff","#ffa502","#ff6348","#5352ed",
  "#2bcbba","#fa8231","#a55eea","#26de81","#fd9644","#fc5c65",
  "#45aaf2","#fed330","#20bf6b","#eb3b5a","#4b7bec","#f7b731",
  "#0fb9b1","#778ca3","#fc427b","#3dc1d3","#c44569","#574b90"
];

// ─── 초기화 ───
function init() {
  // 시간대 자동 설정
  const hour = new Date().getHours();
  if (hour >= 21 || hour < 4) setFilter('latenight');
  else if (hour >= 17) setFilter('dinner');
  else setFilter('lunch');

  // 반경 슬라이더 초기값
  document.getElementById('radiusRange').value = searchRadius;
  updateRadiusLabel();

  // 카카오 SDK 로드 후 위치 가져오기
  if (typeof kakao === 'undefined' || typeof kakao.maps === 'undefined') {
    document.getElementById('status').textContent = '❌ 카카오 SDK 로드 실패. API 키 또는 도메인 등록을 확인하세요.';
    document.getElementById('result').textContent = '카카오 SDK 오류';
    return;
  }

  kakao.maps.load(() => {
    getUserLocation();
  });
}

// ─── 반경 슬라이더 ───
function updateRadiusLabel() {
  const val = parseInt(document.getElementById('radiusRange').value);
  document.getElementById('radiusLabel').textContent =
    val >= 1000 ? `${(val / 1000).toFixed(1)}km` : `${val}m`;
}

function applyRadius() {
  const val = parseInt(document.getElementById('radiusRange').value);
  if (val === searchRadius && allPlaces.length > 0) return;
  searchRadius = val;
  if (userLat && userLng) {
    reloadPlaces();
  }
}

// ─── 위치 가져오기 ───
function getUserLocation() {
  const locEl = document.getElementById('location-info');
  const statusEl = document.getElementById('status');

  if (!navigator.geolocation) {
    locEl.textContent = '⚠️ 위치 정보를 지원하지 않는 브라우저입니다.';
    return;
  }

  locEl.textContent = '📍 위치를 확인하는 중...';
  statusEl.textContent = '';

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      userLat = parseFloat(pos.coords.latitude);
      userLng = parseFloat(pos.coords.longitude);
      reverseGeocode(userLat, userLng);
      searchNearbyRestaurants();
    },
    (err) => {
      locEl.textContent = '📍 서울 강남구 역삼동 (기본 위치)';
      statusEl.textContent = '⚠️ 위치 권한 거부 → 기본 위치로 검색합니다.';
      userLat = 37.497942;
      userLng = 127.027621;
      searchNearbyRestaurants();
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

// ─── 역지오코딩 (현재 위치 → 간략 주소) ───
function reverseGeocode(lat, lng) {
  const geocoder = new kakao.maps.services.Geocoder();

  // coord2RegionCode가 더 안정적으로 행정동 정보를 반환
  geocoder.coord2RegionCode(lng, lat, (result, status) => {
    const locEl = document.getElementById('location-info');
    if (status === kakao.maps.services.Status.OK && result.length > 0) {
      // 행정동(H) 우선, 없으면 법정동(B)
      const region = result.find(r => r.region_type === 'H') || result[0];
      locEl.textContent = '📍 ' + region.address_name;
    } else {
      // fallback: coord2Address 시도
      geocoder.coord2Address(lng, lat, (result2, status2) => {
        if (status2 === kakao.maps.services.Status.OK && result2.length > 0) {
          const addr = result2[0].address;
          let short = '';
          if (addr.region_1depth_name) short += addr.region_1depth_name + ' ';
          if (addr.region_2depth_name) short += addr.region_2depth_name + ' ';
          if (addr.region_3depth_name) short += addr.region_3depth_name;
          locEl.textContent = '📍 ' + short.trim();
        } else {
          locEl.textContent = `📍 위치 확인됨 (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
        }
      });
    }
  });
}

// ─── 카카오 장소 검색 ───
// 참고 코드 패턴: ps.keywordSearch(keyword, placesSearchCB) 방식 사용
function searchNearbyRestaurants() {
  if (typeof kakao === 'undefined' || typeof kakao.maps === 'undefined') {
    document.getElementById('status').textContent = '❌ 카카오 SDK 미로드. API 키와 도메인 등록을 확인하세요.';
    return;
  }

  const statusEl = document.getElementById('status');
  statusEl.textContent = '🔍 식당을 검색하는 중...';

  allPlaces = [];
  const seenIds = new Set();

  // 검색할 키워드 목록
  const keywords = ['맛집', '식당', '음식점', '술집'];
  let keywordIndex = 0;

  function searchNextKeyword() {
    if (keywordIndex >= keywords.length) {
      finalizeSearch();
      return;
    }

    const keyword = keywords[keywordIndex];
    const ps = new kakao.maps.services.Places();

    ps.keywordSearch(keyword, function(data, status, pagination) {
      if (status === kakao.maps.services.Status.OK) {
        for (var i = 0; i < data.length; i++) {
          if (!seenIds.has(data[i].id)) {
            seenIds.add(data[i].id);
            allPlaces.push(data[i]);
          }
        }
      }
      // 다음 키워드로 이동
      keywordIndex++;
      searchNextKeyword();
    }, {
      x: userLng,
      y: userLat,
      radius: searchRadius,
      size: 15,
      sort: kakao.maps.services.SortBy.DISTANCE
    });
  }

  // 먼저 카테고리 검색(FD6) 실행 후 키워드 검색
  var ps = new kakao.maps.services.Places();
  ps.categorySearch('FD6', function(data, status, pagination) {
    if (status === kakao.maps.services.Status.OK) {
      for (var i = 0; i < data.length; i++) {
        if (!seenIds.has(data[i].id)) {
          seenIds.add(data[i].id);
          allPlaces.push(data[i]);
        }
      }
      // 2페이지도 가져오기
      if (pagination.hasNextPage) {
        pagination.nextPage();
        return; // nextPage 콜백에서 다시 이 함수가 호출됨
      }
    } else if (status === kakao.maps.services.Status.ZERO_RESULT) {
      statusEl.textContent = '🔍 카테고리 검색 결과 없음, 키워드로 재검색...';
    } else {
      statusEl.textContent = '⚠️ 검색 오류 (status: ' + status + '). API 키/도메인을 확인하세요.';
    }
    // 카테고리 검색 완료 후 키워드 검색 시작
    searchNextKeyword();
  }, {
    x: userLng,
    y: userLat,
    radius: searchRadius,
    size: 15,
    sort: kakao.maps.services.SortBy.DISTANCE
  });

  function finalizeSearch() {
    // 거리순 정렬
    allPlaces.sort(function(a, b) {
      return (parseInt(a.distance) || 99999) - (parseInt(b.distance) || 99999);
    });

    if (allPlaces.length === 0) {
      statusEl.textContent = '⚠️ 근처에 음식점이 없습니다. 반경을 넓혀보세요.';
      document.getElementById('result').textContent = '검색 결과 없음';
      filteredPlaces = [];
      drawWheel();
      return;
    }
    statusEl.textContent = '✅ ' + allPlaces.length + '개 식당/술집 발견!';
    applyFilter();
  }
}

// ─── 필터 적용 ───
function applyFilter() {
  const hours = getFilterHours(currentFilter);
  filteredPlaces = allPlaces.filter(place => isLikelyOpen(place, hours));

  if (filteredPlaces.length === 0) {
    filteredPlaces = [...allPlaces];
    document.getElementById('status').textContent =
      `ℹ️ 필터 결과 없어 전체 ${allPlaces.length}개 표시`;
  }

  const radiusText = searchRadius >= 1000
    ? `${(searchRadius / 1000).toFixed(1)}km`
    : `${searchRadius}m`;
  document.getElementById('menuCount').textContent =
    `${filteredPlaces.length}개 식당 (반경 ${radiusText})`;
  document.getElementById('spinBtn').disabled = false;
  document.getElementById('result').textContent = '돌려서 골라보세요!';
  document.getElementById('result').className = '';
  document.getElementById('selectedInfo').innerHTML = '';

  currentAngle = 0;
  canvas.style.transition = 'none';
  canvas.style.transform = 'rotate(0deg)';
  drawWheel();
}

// ─── 시간대별 필터 기준 ───
function getFilterHours(filter) {
  switch (filter) {
    case 'lunch': return { open: 11, close: 14 };
    case 'dinner': return { open: 17, close: 21 };
    case 'latenight': return { open: 21, close: 4 };
    default: return { open: 11, close: 22 };
  }
}

// ─── 영업시간 추정 필터 ───
function isLikelyOpen(place, hours) {
  const name = place.place_name || '';
  const category = place.category_name || '';

  if (currentFilter === 'latenight') {
    const lateKeywords = ['포차','주점','술집','바','호프','치킨','야식','24시',
      '심야','라멘','곱창','족발','보쌈','피자','배달','편의점','분식','이자카야'];
    if (lateKeywords.some(k => name.includes(k) || category.includes(k))) return true;
    const earlyClose = ['백반','한정식','정식','구내식당','학식'];
    if (earlyClose.some(k => name.includes(k) || category.includes(k))) return false;
    return false;
  }

  if (currentFilter === 'lunch') {
    const barKeywords = ['포차','주점','술집','호프','이자카야','룸싸롱'];
    if (barKeywords.some(k => name.includes(k) || category.includes(k))) return false;
    return true;
  }

  // dinner: 전부 포함
  return true;
}

// ─── 필터 버튼 ───
function setFilter(filter) {
  currentFilter = filter;
  document.querySelectorAll('.filter-btn[data-filter]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filter);
  });
  if (allPlaces.length > 0) applyFilter();
}

// ─── 돌림판 그리기 ───
function drawWheel() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const items = filteredPlaces;
  const numSegments = items.length;

  if (numSegments === 0) {
    ctx.fillStyle = '#2f3542';
    ctx.beginPath();
    ctx.arc(CENTER, CENTER, RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '15px Noto Sans KR';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('식당을 검색해주세요', CENTER, CENTER);
    return;
  }

  const anglePerSegment = (2 * Math.PI) / numSegments;

  items.forEach((place, i) => {
    const startAngle = i * anglePerSegment;
    const endAngle = startAngle + anglePerSegment;

    ctx.beginPath();
    ctx.moveTo(CENTER, CENTER);
    ctx.arc(CENTER, CENTER, RADIUS, startAngle, endAngle);
    ctx.fillStyle = palette[i % palette.length];
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(CENTER, CENTER);
    ctx.arc(CENTER, CENTER, RADIUS, startAngle, endAngle);
    ctx.closePath();
    ctx.strokeStyle = 'rgba(0,0,0,0.1)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 텍스트
    ctx.save();
    ctx.translate(CENTER, CENTER);
    ctx.rotate(startAngle + anglePerSegment / 2);
    ctx.textAlign = 'right';
    ctx.fillStyle = 'white';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 3;

    let fontSize = 13;
    if (numSegments > 35) fontSize = 8;
    else if (numSegments > 25) fontSize = 9;
    else if (numSegments > 18) fontSize = 10;
    else if (numSegments > 12) fontSize = 11;

    ctx.font = `bold ${fontSize}px 'Noto Sans KR', Arial`;

    let displayText = place.place_name;
    const maxLen = numSegments > 25 ? 4 : numSegments > 15 ? 6 : 9;
    if (displayText.length > maxLen) displayText = displayText.substring(0, maxLen) + '…';

    ctx.fillText(displayText, RADIUS - 10, fontSize / 3);
    ctx.restore();
  });

  // 중앙 원
  ctx.beginPath();
  ctx.arc(CENTER, CENTER, 24, 0, Math.PI * 2);
  ctx.fillStyle = '#1a1a2e';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = 'white';
  ctx.font = 'bold 12px Noto Sans KR';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.fillText('GO', CENTER, CENTER);
}

// ─── 돌리기 ───
function spin() {
  if (isSpinning || filteredPlaces.length === 0) return;
  isSpinning = true;
  document.getElementById('spinBtn').disabled = true;
  document.getElementById('result').className = '';
  document.getElementById('result').innerText = '🥁 두구두구두구...';
  document.getElementById('selectedInfo').innerHTML = '';

  const extraSpins = (Math.floor(Math.random() * 5) + 5) * 360;
  const randomAngle = Math.floor(Math.random() * 360);
  const spinAngle = extraSpins + randomAngle;
  currentAngle += spinAngle;

  canvas.style.transition = 'transform 4s cubic-bezier(0.05, 0, 0, 1)';
  canvas.style.transform = `rotate(${currentAngle}deg)`;

  setTimeout(() => {
    const actualDegree = currentAngle % 360;
    const segmentAngle = 360 / filteredPlaces.length;
    const index = Math.floor(((360 - actualDegree + 270) % 360) / segmentAngle) % filteredPlaces.length;
    const selected = filteredPlaces[index];

    document.getElementById('result').innerText = `🎉 ${selected.place_name}`;
    document.getElementById('result').className = 'highlight';

    let info = '';
    if (selected.road_address_name) info += `📍 ${selected.road_address_name}`;
    else if (selected.address_name) info += `📍 ${selected.address_name}`;
    if (selected.phone) info += ` | 📞 ${selected.phone}`;
    if (selected.place_url) info += ` | <a href="${selected.place_url}" target="_blank">카카오맵 보기</a>`;
    document.getElementById('selectedInfo').innerHTML = info;

    launchConfetti();
    isSpinning = false;
    document.getElementById('spinBtn').disabled = false;
  }, 4100);
}

// ─── 다시 검색 ───
function reloadPlaces() {
  if (typeof kakao === 'undefined' || typeof kakao.maps === 'undefined') {
    document.getElementById('status').textContent = '❌ 카카오 SDK가 로드되지 않았습니다. API 키와 도메인 등록을 확인하세요.';
    return;
  }
  allPlaces = [];
  filteredPlaces = [];
  document.getElementById('spinBtn').disabled = true;
  document.getElementById('status').textContent = '🔄 다시 검색 중...';
  document.getElementById('result').textContent = '식당을 불러오는 중...';
  document.getElementById('result').className = '';
  document.getElementById('selectedInfo').innerHTML = '';
  currentAngle = 0;
  canvas.style.transition = 'none';
  canvas.style.transform = 'rotate(0deg)';
  drawWheel();
  searchNearbyRestaurants();
}

// ─── 컨페티 효과 ───
function launchConfetti() {
  const colors = ['#ff4757','#ffd32a','#2ed573','#1e90ff','#ff6b81','#a55eea','#ff9f43'];
  for (let i = 0; i < 50; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = Math.random() * 100 + 'vw';
    piece.style.top = '-10px';
    piece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    piece.style.width = (Math.random() * 8 + 5) + 'px';
    piece.style.height = (Math.random() * 8 + 5) + 'px';
    piece.style.animationDuration = (Math.random() * 1.5 + 1.5) + 's';
    piece.style.animationDelay = (Math.random() * 0.5) + 's';
    document.body.appendChild(piece);
    setTimeout(() => piece.remove(), 3000);
  }
}

// ─── 시작 ───
init();
