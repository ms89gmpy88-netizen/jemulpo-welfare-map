// 기관 정보는 facilities.js 에 있습니다 (data 폴더의 CSV로 만듦).
// 카카오에는 localhost만 등록되어 있어서, 127.0.0.1로 열리면 localhost로 바꿔 엽니다.
if (location.hostname === "127.0.0.1") location.replace(location.href.replace("127.0.0.1", "localhost"));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

let map, clusterer, info, current = [], category = "전체", me = null, meMarker = null;

// 두 지점 사이 거리(km)
const km = (a, b) => { const r = Math.PI / 180, x = (b.lng - a.lng) * r * Math.cos((a.lat + b.lat) * r / 2), y = (b.lat - a.lat) * r; return Math.hypot(x, y) * 6371; };
const distText = d => d < 1 ? Math.round(d * 1000 / 10) * 10 + "m" : d.toFixed(1) + "km";

// 분야별 지도 표시 색. 메뉴 버튼의 색 점도 같은 색이라 메뉴가 곧 범례입니다.
const colors = {
  "어르신": "#e8590c", "장애인": "#7048e8", "여성/아동": "#f06595", "한부모/다문화": "#8c5a2b",
  "복지관/자활": "#1c7ed6", "건강/재활": "#2f9e44", "대피소": "#c92a2a", "쉼터": "#0c8599",
};
const pins = {};
const pinImage = color => pins[color] ||= new kakao.maps.MarkerImage(
  "data:image/svg+xml;charset=utf-8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="28" height="38" viewBox="0 0 28 38"><path d="M14 1C7 1 1.5 6.4 1.5 13.3 1.5 22.5 14 37 14 37s12.5-14.5 12.5-23.7C26.5 6.4 21 1 14 1z" fill="${color}" stroke="#fff" stroke-width="2"/><circle cx="14" cy="13.5" r="4.5" fill="#fff"/></svg>`),
  new kakao.maps.Size(28, 38), { offset: new kakao.maps.Point(14, 37) });
// 전체 탭에서는 기관의 첫 번째 분야 색, 분야 탭에서는 그 탭 색으로 칠합니다.
const colorOf = f => colors[category === "전체" ? f.categories[0] : category];

document.querySelectorAll(".menu button").forEach(b => {
  if (colors[b.dataset.category]) b.style.setProperty("--dot", colors[b.dataset.category]);
});

// 띄어쓰기를 빼고 비교해서 '송림 동'처럼 입력해도 찾을 수 있게 합니다.
const squash = s => String(s || "").replace(/\s/g, "").toLowerCase();

function show() {
  const q = squash(document.getElementById("search").value);
  current = facilities.filter(f =>
    (category === "전체" || f.categories.includes(category)) &&
    (!q || squash(f.name + f.address + f.type + f.target + f.service).includes(q)));
  // 내 주변 순: 위치가 있는 기관을 가까운 순으로, 위치를 모르는 기관은 맨 뒤로
  if (me) current = current.map(f => ({ f, d: f.lat ? km(me, f) : Infinity })).sort((a, b) => a.d - b.d).map(({ f, d }) => (f.dist = d, f));
  document.getElementById("count").textContent = current.length + "곳";
  document.getElementById("cards").innerHTML = current.length
    ? current.map((f, i) => `
      <article class="card${f.lat ? " has-pin" : ""}" data-i="${i}">
        ${f.categories.map(c => `<span class="tag">${esc(c)}</span>`).join("")}<span class="tag">${esc(f.type)}</span>${f.check ? '<span class="tag check">확인 필요</span>' : ""}
        <h3><button class="name-btn" type="button" title="상세정보 보기">${esc(f.name)}</button>${me && f.dist < Infinity ? `<span class="dist">${distText(f.dist)}</span>` : ""}</h3>
        ${f.target ? `<p class="who"><b>대상</b> ${esc(f.target)}</p>` : ""}
        ${f.service ? `<p class="who"><b>하는 일</b> ${esc(f.service)}</p>` : ""}
        ${f.private ? "<p>이용하는 분들의 안전과 생활 보호를 위해 주소와 전화번호를 공개하지 않습니다.</p>" : `
        <p>주소: ${esc(f.address)}</p>
        <p>전화: ${f.phone ? `<a href="tel:${esc(f.phone)}">${esc(f.phone)}</a>` : "정보 없음"}</p>
        ${f.hours ? `<p>운영: ${esc(f.hours)}</p>` : ""}
        ${f.lat ? '<button class="pin-btn" type="button">지도에서 보기</button>' : ""}`}
      </article>`).join("")
    : `<p>${document.getElementById("search").value.trim() ? "검색 결과가 없습니다. 다른 말로 찾아보세요." : "이 분야의 기관 정보는 준비 중입니다."}</p>`;
  drawMarkers();
}

function drawMarkers() {
  if (!map) return;
  info.close();
  clusterer.clear();
  clusterer.addMarkers(current.filter(f => f.lat).map(f => {
    f.marker = new kakao.maps.Marker({ position: new kakao.maps.LatLng(f.lat, f.lng), title: f.name, image: pinImage(colorOf(f)) });
    kakao.maps.event.addListener(f.marker, "click", () => openDetail(f)); // 지도 표시를 누르면 바로 상세정보
    return f.marker;
  }));
}

function openInfo(f) {
  info.setContent(`<div class="info"><strong>${esc(f.name)}</strong><br>${esc(f.type)}</div>`);
  info.open(map, f.marker);
}

function focusOnMap(f) {
  map.setLevel(3);
  map.panTo(f.marker.getPosition());
  openInfo(f);
  document.getElementById("map").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// 카드: 이름을 누르면 상세정보, '지도에서 보기'를 누르면 지도를 그 기관으로 옮깁니다.
document.getElementById("cards").addEventListener("click", e => {
  const card = e.target.closest(".card");
  if (!card) return;
  const f = current[card.dataset.i];
  if (e.target.closest(".name-btn")) openDetail(f);
  else if (e.target.closest(".pin-btn") && map) focusOnMap(f);
});

const dialog = document.getElementById("detail");
const row = (label, value) => `<tr><th>${label}</th><td>${value || '<span class="none">정보 없음</span>'}</td></tr>`;

function openDetail(f) {
  const shelter = f.categories.every(c => c === "대피소" || c === "쉼터"); // 복지시설이면서 쉼터인 곳은 복지시설로 봅니다
  document.getElementById("detail-body").innerHTML = `
    <p class="tags">${f.categories.map(c => `<span class="tag">${esc(c)}</span>`).join("")}</p>
    <h2 id="detail-name">${esc(f.name)}</h2>
    ${f.private ? "<p>이용하는 분들의 안전과 생활 보호를 위해 주소·전화를 공개하지 않습니다.</p>" : ""}
    ${f.how ? `<h3>이용 방법</h3><p class="how">${esc(f.how)}</p>` : ""}
    <table class="info-table">
      ${f.private ? "" : row("주소", esc(f.address))}
      ${f.private ? "" : row("연락처", f.phone && `<a href="tel:${esc(f.phone)}">${esc(f.phone)}</a>`)}
      ${f.private ? "" : row("홈페이지", f.homepage && `<a href="${esc(f.homepage)}" target="_blank" rel="noopener">${esc(f.homepage.replace(/^https?:\/\//, "").replace(/\/$/, ""))}</a>`)}
      ${shelter ? "" : row("운영주체 구분", esc(f.operatorType || ""))}
      ${row("시설 종류", esc(f.type))}
      ${shelter ? "" : row("법인명", esc(f.corp || ""))}
      ${f.target ? row("대상", esc(f.target)) : ""}
      ${f.service ? row("하는 일", esc(f.service)) : ""}
      ${f.hours ? row("운영", esc(f.hours)) : ""}
    </table>
    ${f.private ? "" : `<h3>이용 편의</h3>
    <table class="info-table">
      ${["휠체어 출입", "엘리베이터", "주차", "장애인 화장실"].map(k => row(k, esc(f.access?.[k] || ""))).join("")}
    </table>
    <p class="note">${f.access?.["출처"] ? "출처: " + esc(f.access["출처"]) + "<br>기관이 들어 있는 건물 기준이며, '자료에 없음'은 설치되지 않았다는 뜻이 아닐 수 있습니다. 방문 전에 전화로 확인하세요." : "아직 확인된 이용 편의 정보가 없습니다. 방문 전에 전화로 확인하세요."}</p>`}
    ${f.lat ? `<h3>오시는 길</h3>
    <div class="way-map" id="way-map"></div>
    <ul class="way-list"><li>${esc(f.address)}</li><li id="way-subway">가까운 지하철역 찾는 중…</li></ul>
    <p class="note">지하철역 거리는 직선거리라 실제로 걷는 길은 더 멀 수 있습니다. 버스 노선은 카카오맵 길찾기에서 확인하세요.</p>
    <p class="actions">
      <button class="pin-btn" type="button" id="detail-map">지도에서 보기</button>
      <a class="pin-btn" href="https://map.kakao.com/link/to/${encodeURIComponent(f.name)},${f.lat},${f.lng}" target="_blank" rel="noopener">길찾기 (카카오맵)</a>
    </p>` : ""}`;
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
  document.getElementById("detail-map")?.addEventListener("click", () => { dialog.close(); if (map) focusOnMap(f); });
  if (f.lat) showWay(f);
}

// 오시는 길: 작은 지도와 가까운 지하철역(카카오 장소 검색, 1.5km 안 2곳)
function showWay(f) {
  const subway = document.getElementById("way-subway");
  if (!map) { subway.remove(); return; }
  const pos = new kakao.maps.LatLng(f.lat, f.lng);
  new kakao.maps.StaticMap(document.getElementById("way-map"), { center: pos, level: 3, marker: { position: pos } });
  new kakao.maps.services.Places().categorySearch("SW8", (list, status) => {
    if (!subway.isConnected) return; // 그사이 다른 기관 창을 열었으면 그만둡니다
    if (status === kakao.maps.services.Status.ZERO_RESULT) { subway.textContent = "걸어갈 만한 거리(1.5km)에 지하철역이 없습니다."; return; }
    if (status !== kakao.maps.services.Status.OK) { subway.remove(); return; }
    subway.textContent = "가까운 지하철역: " + list.slice(0, 2).map(s => {
      const m = Number(s.distance);
      return `${s.place_name} (약 ${m >= 1000 ? (m / 1000).toFixed(1) + "km" : Math.round(m / 10) * 10 + "m"}, 걸어서 약 ${Math.max(1, Math.round(m / 67))}분)`;
    }).join(", ");
  }, { location: pos, radius: 1500, sort: kakao.maps.services.SortBy.DISTANCE });
}

dialog.querySelector(".close").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", e => { if (e.target === dialog) dialog.close(); }); // 바깥(어두운 곳) 누르면 닫기

// 휴대폰에서 지도가 메뉴 바로 아래에 붙도록 메뉴 높이를 CSS에 알려 줍니다.
document.documentElement.style.setProperty("--menu-h", document.querySelector(".menu").offsetHeight + "px");

document.querySelectorAll(".menu button").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelector(".menu .active").classList.remove("active");
    button.classList.add("active");
    category = button.dataset.category;
    show();
  });
});

document.getElementById("search").addEventListener("input", show);

// 내 주변 가까운 순: 휴대폰·컴퓨터의 위치를 받아 가까운 순으로 정렬합니다 (위치는 저장하거나 보내지 않습니다).
const nearBtn = document.getElementById("near"), nearMsg = document.getElementById("near-msg");
const say = text => { nearMsg.textContent = text; nearMsg.hidden = !text; };
nearBtn.addEventListener("click", () => {
  if (me) { // 다시 누르면 원래 순서로
    me = null;
    meMarker?.setMap(null);
    nearBtn.textContent = "📍 내 주변 가까운 순";
    nearBtn.setAttribute("aria-pressed", "false");
    say("");
    return show();
  }
  if (!navigator.geolocation) return say("이 브라우저는 위치 찾기를 지원하지 않습니다.");
  say("내 위치를 찾는 중입니다… 위치 사용을 묻는 창이 뜨면 '허용'을 눌러 주세요.");
  navigator.geolocation.getCurrentPosition(p => {
    me = { lat: p.coords.latitude, lng: p.coords.longitude };
    nearBtn.textContent = "↩ 원래 순서로";
    nearBtn.setAttribute("aria-pressed", "true");
    const far = facilities.every(f => !f.lat || km(me, f) > 10);
    say(far ? "지금 위치가 제물포구에서 10km 넘게 떨어져 있어요. 가까운 순 정렬은 제물포구 안에서 쓰면 정확합니다." : "내 위치에서 가까운 순으로 보여 드립니다. 컴퓨터는 위치가 정확하지 않을 수 있습니다.");
    if (map) {
      const pos = new kakao.maps.LatLng(me.lat, me.lng);
      meMarker?.setMap(null);
      meMarker = new kakao.maps.CustomOverlay({ map, position: pos, content: '<div class="me-dot" title="내 위치"></div>', zIndex: 3 });
      if (!far) { map.setLevel(4); map.panTo(pos); }
    }
    show();
  }, () => say("위치를 가져오지 못했습니다. 브라우저 주소창 왼쪽의 자물쇠(또는 설정)에서 위치 권한을 '허용'으로 바꿔 주세요."),
  { enableHighAccuracy: true, timeout: 10000 });
});

// 지도 접기/펴기
const mapToggle = document.getElementById("map-toggle");
mapToggle.addEventListener("click", () => {
  const folded = document.body.classList.toggle("map-folded");
  mapToggle.textContent = folded ? "🗺️ 지도 펴기" : "🗺️ 지도 접기";
  mapToggle.setAttribute("aria-pressed", String(folded));
  if (!folded && map) setTimeout(() => map.relayout(), 0); // 다시 보일 때 지도 크기 맞추기
});

// 글씨 크게 보기 (다음에 열어도 기억합니다)
const bigBtn = document.getElementById("big-text");
const setBig = on => {
  document.documentElement.classList.toggle("big", on);
  bigBtn.textContent = on ? "가 글씨 보통" : "가 글씨 크게";
  bigBtn.setAttribute("aria-pressed", String(on));
  try { localStorage.setItem("bigText", on ? "1" : "0"); } catch (e) {}
  document.documentElement.style.setProperty("--menu-h", document.querySelector(".menu").offsetHeight + "px");
  if (map) setTimeout(() => map.relayout(), 0);
};
bigBtn.addEventListener("click", () => setBig(!document.documentElement.classList.contains("big")));
setBig(document.documentElement.classList.contains("big"));

// 카카오 지도는 인터넷 연결과 등록된 주소(실행.bat)가 있어야 열립니다. 없으면 목록만 보여 줍니다.
if (window.kakao && kakao.maps) {
  kakao.maps.load(() => {
    const box = document.getElementById("map");
    box.innerHTML = "";
    map = new kakao.maps.Map(box, { center: new kakao.maps.LatLng(37.4745, 126.633), level: 6 });
    map.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.RIGHT);
    clusterer = new kakao.maps.MarkerClusterer({ map, averageCenter: true, minLevel: 5 });
    info = new kakao.maps.InfoWindow({ removable: true });
    drawMarkers();
  });
}

show();
