// 기관 정보는 facilities.js 에 있습니다 (data 폴더의 CSV로 만듦).
// 카카오에는 localhost만 등록되어 있어서, 127.0.0.1로 열리면 localhost로 바꿔 엽니다.
if (location.hostname === "127.0.0.1") location.replace(location.href.replace("127.0.0.1", "localhost"));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

let map, clusterer, info, current = [], category = "전체";

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
        <h3>${esc(f.name)}</h3>
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
    f.marker = new kakao.maps.Marker({ position: new kakao.maps.LatLng(f.lat, f.lng), title: f.name });
    kakao.maps.event.addListener(f.marker, "click", () => openInfo(f));
    return f.marker;
  }));
}

function openInfo(f) {
  info.setContent(`<div class="info"><strong>${esc(f.name)}</strong><br>${esc(f.type)}</div>`);
  info.open(map, f.marker);
}

// 카드의 '지도에서 보기'를 누르면 지도를 그 기관으로 옮깁니다.
document.getElementById("cards").addEventListener("click", e => {
  if (!e.target.closest(".pin-btn") || !map) return;
  const f = current[e.target.closest(".card").dataset.i];
  map.setLevel(3);
  map.panTo(f.marker.getPosition());
  openInfo(f);
  document.getElementById("map").scrollIntoView({ behavior: "smooth", block: "nearest" });
});

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
