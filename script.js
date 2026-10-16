// 기관 정보는 facilities.js 에 있습니다 (data 폴더의 CSV로 만듦).
// 카카오에는 localhost만 등록되어 있어서, 127.0.0.1로 열리면 localhost로 바꿔 엽니다.
if (location.hostname === "127.0.0.1") location.replace(location.href.replace("127.0.0.1", "localhost"));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

let map, clusterer, info, current = [], category = "전체";

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
  document.getElementById("count").textContent = current.length + "곳";
  document.getElementById("cards").innerHTML = current.length
    ? current.map((f, i) => `
      <article class="card${f.lat ? " has-pin" : ""}" data-i="${i}">
        ${f.categories.map(c => `<span class="tag">${esc(c)}</span>`).join("")}<span class="tag">${esc(f.type)}</span>${f.check ? '<span class="tag check">확인 필요</span>' : ""}
        <h3><button class="name-btn" type="button" title="상세정보 보기">${esc(f.name)}</button></h3>
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
    kakao.maps.event.addListener(f.marker, "click", () => openInfo(f));
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
  const shelter = f.categories.some(c => c === "대피소" || c === "쉼터");
  document.getElementById("detail-body").innerHTML = `
    <p class="tags">${f.categories.map(c => `<span class="tag">${esc(c)}</span>`).join("")}</p>
    <h2 id="detail-name">${esc(f.name)}</h2>
    ${f.private ? "<p>이용하는 분들의 안전과 생활 보호를 위해 주소·전화·사진을 공개하지 않습니다.</p>" : `
    <h3>사진</h3>
    <div id="roadview" class="roadview"><p>${f.lat ? "거리 사진을 불러오는 중입니다…" : "주소 위치를 찾지 못해 거리 사진을 보여 드릴 수 없습니다."}</p></div>
    <p class="note">바깥 모습: 카카오 로드뷰 거리 사진입니다. 촬영 시기에 따라 지금 모습과 다를 수 있습니다.<br>
      내부 사진: 기관이 공개한 사진 자료가 없어 싣지 않았습니다.${f.homepage ? " 홈페이지에서 확인해 보세요." : ""}</p>`}
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
    ${f.lat ? `<p class="actions">
      <button class="pin-btn" type="button" id="detail-map">지도에서 보기</button>
      <a class="pin-btn" href="https://map.kakao.com/link/to/${encodeURIComponent(f.name)},${f.lat},${f.lng}" target="_blank" rel="noopener">길찾기 (카카오맵)</a>
    </p>` : ""}`;
  dialog.showModal();
  document.getElementById("detail-map")?.addEventListener("click", () => { dialog.close(); focusOnMap(f); });
  if (f.lat && !f.private && window.kakao && kakao.maps.RoadviewClient) showRoadview(f);
}

// 기관 위치에서 가장 가까운 로드뷰(50m 안)를 보여 줍니다.
function showRoadview(f) {
  const box = document.getElementById("roadview");
  const pos = new kakao.maps.LatLng(f.lat, f.lng);
  new kakao.maps.RoadviewClient().getNearestPanoId(pos, 50, panoId => {
    if (!panoId) { box.innerHTML = "<p>이 주변은 카카오 로드뷰 거리 사진이 없습니다.</p>"; return; }
    box.innerHTML = "";
    const rv = new kakao.maps.Roadview(box);
    rv.setPanoId(panoId, pos);
    // 건물 쪽을 바라보도록 방향을 맞춥니다.
    kakao.maps.event.addListener(rv, "init", () => {
      const p = rv.getPosition();
      const pan = Math.atan2(f.lng - p.getLng(), f.lat - p.getLat()) * 180 / Math.PI;
      rv.setViewpoint({ pan: (pan + 360) % 360, tilt: 0, zoom: 0 });
    });
  });
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
