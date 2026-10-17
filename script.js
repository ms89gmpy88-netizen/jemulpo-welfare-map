// 기관 정보는 facilities.js 에 있습니다 (data 폴더의 CSV로 만듦).
// 카카오에는 localhost만 등록되어 있어서, 127.0.0.1로 열리면 localhost로 바꿔 엽니다.
if (location.hostname === "127.0.0.1") location.replace(location.href.replace("127.0.0.1", "localhost"));
// 선 아이콘 (그림 글자 대신 같은 굵기의 선으로 그립니다)
const icons = {
  chevron: '<path d="m9 6 6 6-6 6"/>',
  pin: '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
  route: '<path d="m3 11 18-8-8 18-2-8-8-2z"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  locate: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  back: '<path d="m15 6-6 6 6 6"/>',
  map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/>',
  bus: '<rect x="5" y="3" width="14" height="15" rx="2.5"/><path d="M5 11h14M8 18v2.5M16 18v2.5"/><circle cx="8.5" cy="14.5" r=".6"/><circle cx="15.5" cy="14.5" r=".6"/>',
  photo: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="m21 16-5-5-9 8"/>',
  menu: '<path d="M6 3h12v18H6z"/><path d="M9 8h6M9 12h6M9 16h4"/>',
};
const icon = name => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${icons[name]}</svg>`;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

let map, clusterer, info, current = [], me = null, meMarker = null;

// 두 지점 사이 거리(km)
const km = (a, b) => { const r = Math.PI / 180, x = (b.lng - a.lng) * r * Math.cos((a.lat + b.lat) * r / 2), y = (b.lat - a.lat) * r; return Math.hypot(x, y) * 6371; };
const distText = d => d < 1 ? Math.round(d * 1000 / 10) * 10 + "m" : d.toFixed(1) + "km";

// 왼쪽 대분야와 그 안의 세부 항목. 세부 항목 이름은 facilities.js의 categories와 같습니다.
const GROUPS = [
  { id: "welfare", name: "복지시설", icon: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    subs: ["어르신", "장애인", "여성/아동", "한부모/다문화", "복지관/자활", "건강/재활"] },
  { id: "shelter", name: "대피시설", icon: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/>',
    subs: ["지진옥외 대피소", "화학사고 대피소", "한파쉼터", "무더위쉼터", "민방위 대피소", "임시주거시설"] },
  { id: "safety", name: "안전·보건", icon: '<path d="M12 3 4 6v6c0 4.5 3.4 8.2 8 9 4.6-.8 8-4.5 8-9V6l-8-3z"/><path d="M12 9v6M9 12h6"/>',
    subs: ["경찰서", "해양경찰서", "소방서"] },
  { id: "hot", name: "핫플레이스", icon: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
    subs: ["관광명소", "맛집", "분위기 좋은 카페"] },
];
// 세부 항목별 지도 표시 색 (체크박스의 색 점과 같아서 체크박스가 곧 범례입니다)
const colors = {
  "어르신": "#e8590c", "장애인": "#7048e8", "여성/아동": "#d6336c", "한부모/다문화": "#8c5a2b", "복지관/자활": "#1c7ed6", "건강/재활": "#2f9e44",
  "지진옥외 대피소": "#c92a2a", "화학사고 대피소": "#9c36b5", "한파쉼터": "#1971c2", "무더위쉼터": "#e67700", "민방위 대피소": "#495057", "임시주거시설": "#2b8a3e",
  "경찰서": "#1b3a8c", "해양경찰서": "#0b7285", "소방서": "#e03131",
  "관광명소": "#7048e8", "맛집": "#e8590c", "분위기 좋은 카페": "#8c5a2b",
};
// 복지시설의 소분야: 세부 항목 안에서 시설 종류로 한 번 더 나눕니다. [소분야 이름, 시설 종류 글자] — 위에서부터 먼저 맞는 것
const MINORS = {
  "어르신": [["노인복지관", /노인여가복지/], ["경로당", /경로당/], ["재가·주야간보호", /재가/], ["요양원", /노인요양시설/], ["일자리·치매 지원", /노인일자리|치매/]],
  "장애인": [["장애인복지관·재활", /지역사회재활/], ["직업재활", /직업재활/], ["거주시설", /거주|공동생활/]],
  "여성/아동": [["어린이집", /어린이집/], ["지역아동센터·돌봄", /지역아동센터|다함께돌봄/], ["육아·청소년", /장난감|청소년/], ["아동 보호", /아동보호|아동양육/], ["폭력 피해 상담·보호", /폭력/]],
  "한부모/다문화": [["가족센터", /가족센터/], ["자활센터", /자활/], ["푸드마켓", /푸드마켓|기부식품/]],
  "복지관/자활": [["종합사회복지관", /종합사회복지관/], ["노인복지관", /노인여가복지/], ["장애인복지관", /장애인/], ["자활센터", /자활/]],
  "건강/재활": [["보건소·건강센터", /보건소|건강생활/], ["치매안심센터", /치매/], ["정신건강·중독", /정신|중독/], ["장애인 재활", /장애인/], ["재가·주야간보호", /재가/]],
};
const minorOf = (f, c) => (MINORS[c].find(([, re]) => re.test(f.type)) || ["그 밖의 시설"])[0];
// 세부 항목 안의 소분야 목록 (자료가 있는 것만, 정해 둔 순서대로)
const minorsIn = c => {
  const have = new Set(facilities.filter(f => f.categories.includes(c)).map(f => minorOf(f, c)));
  return [...MINORS[c].map(([m]) => m), "그 밖의 시설"].filter((m, i, a) => have.has(m) && a.indexOf(m) === i);
};
const pins = {};
const pinImage = color => pins[color] ||= new kakao.maps.MarkerImage(
  "data:image/svg+xml;charset=utf-8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="28" height="38" viewBox="0 0 28 38"><path d="M14 1C7 1 1.5 6.4 1.5 13.3 1.5 22.5 14 37 14 37s12.5-14.5 12.5-23.7C26.5 6.4 21 1 14 1z" fill="${color}" stroke="#fff" stroke-width="2"/><circle cx="14" cy="13.5" r="4.5" fill="#fff"/></svg>`),
  new kakao.maps.Size(28, 38), { offset: new kakao.maps.Point(14, 37) });

let group = GROUPS[0];
// 켜 둔 항목. 복지시설은 '어르신|경로당'처럼 소분야까지 적습니다. 처음에는 모두 켭니다.
const keysOf = g => g.id === "welfare" ? g.subs.flatMap(c => minorsIn(c).map(m => c + "|" + m)) : g.subs;
const checked = Object.fromEntries(GROUPS.map(g => [g.id, new Set(keysOf(g))]));
const groupOf = sub => GROUPS.find(g => g.subs.includes(sub));
// 그 기관이 지금 켜 둔 항목에 들어가면 그 세부 항목 이름을, 아니면 undefined
const shownAs = f => f.categories.find(c => checked[group.id].has(group.id === "welfare" && MINORS[c] ? c + "|" + minorOf(f, c) : c));
// 지도 표시 색: 지금 켜 둔 항목 가운데 그 기관이 속한 첫 항목의 색
const colorOf = f => colors[shownAs(f) || f.categories[0]];
const opened = new Set(); // 소분야를 펼쳐 둔 세부 항목
let subsOpen = false; // 휴대폰에서 복지시설 세부 항목을 펼쳤는지 (처음엔 접어서 지도·목록이 먼저 보이게)
const isWide = () => matchMedia("(min-width: 900px)").matches;

// 띄어쓰기를 빼고 비교해서 '송림 동'처럼 입력해도 찾을 수 있게 합니다.
const squash = s => String(s || "").replace(/\s/g, "").toLowerCase();
const searchBox = document.getElementById("search");

function drawRail() {
  document.getElementById("rail").innerHTML = GROUPS.map(g => `
    <button type="button" data-g="${g.id}" aria-pressed="${g === group}"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${g.icon}</svg><span>${g.name}</span></button>`).join("");
}
function drawSubs() {
  document.getElementById("group-name").textContent = group.name;
  const subs = document.getElementById("subs"), set = checked[group.id];
  const tree = group.id === "welfare";
  subs.classList.toggle("tree", tree);
  subs.innerHTML = group.subs.map(s => {
    const n = facilities.filter(f => f.categories.includes(s)).length;
    if (!tree) return `<label class="subitem${n ? "" : " empty-sub"}" style="--dot:${colors[s]}"><input type="checkbox" value="${esc(s)}"${set.has(s) ? " checked" : ""}${n ? "" : " disabled"}><span class="dot"></span><span class="sub-name">${esc(s)}</span><span class="sub-n">${n}</span></label>`;
    // 복지시설: 세부 항목(전체 켜기/끄기) 아래에 소분야 체크박스
    const ms = minorsIn(s), on = ms.filter(m => set.has(s + "|" + m)).length, open = opened.has(s);
    return `<div class="tree-item">
      <div class="tree-head">
        <label class="subitem" style="--dot:${colors[s]}"><input type="checkbox" data-cat="${esc(s)}"${on === ms.length ? " checked" : ""}${on && on < ms.length ? ' data-mixed="1"' : ""}><span class="dot"></span><span class="sub-name">${esc(s)}</span><span class="sub-n">${n}</span></label>
        <button type="button" class="expand" data-open="${esc(s)}" aria-expanded="${open}" aria-label="${esc(s)} 소분야 ${open ? "접기" : "펼치기"}">${icon("chevron")}</button>
      </div>
      <div class="minors"${open ? "" : " hidden"}>${ms.map(m => `<label class="subitem minor"><input type="checkbox" value="${esc(s + "|" + m)}"${set.has(s + "|" + m) ? " checked" : ""}><span class="sub-name">${esc(m)}</span><span class="sub-n">${facilities.filter(f => f.categories.includes(s) && minorOf(f, s) === m).length}</span></label>`).join("")}</div>
    </div>`;
  }).join("");
  subs.querySelectorAll("[data-mixed]").forEach(i => { i.indeterminate = true; }); // 일부만 켜졌을 때 '−' 표시
  // 휴대폰: 복지시설 세부 항목은 단추 하나로 접어 두고, 켜 둔 개수를 단추에 적습니다.
  const toggle = document.getElementById("subs-toggle");
  toggle.hidden = !tree;
  if (tree) {
    const on = group.subs.filter(s => minorsIn(s).every(m => set.has(s + "|" + m))).length;
    const some = group.subs.filter(s => minorsIn(s).some(m => set.has(s + "|" + m))).length;
    const state = on === group.subs.length ? "모두 켜짐" : some ? `${some}개 켜짐` : "모두 꺼짐";
    toggle.innerHTML = `<span>세부 항목 고르기</span><span class="subs-state">${group.subs.length}개 중 ${state}</span>${icon("chevron")}`;
    toggle.setAttribute("aria-expanded", String(subsOpen));
    subs.classList.toggle("folded", !subsOpen);
  } else subs.classList.remove("folded");
  const none = group.subs.every(s => !facilities.some(f => f.categories.includes(s)));
  const note = document.getElementById("filters-note");
  note.hidden = !none;
  note.textContent = none ? "이 분야의 자료를 모으고 있어요. 곧 채워 넣을게요." : "";
}

function show() {
  const q = squash(searchBox.value);
  // 검색할 때는 분야와 상관없이 전체에서 찾습니다.
  current = q
    ? facilities.filter(f => squash(f.name + f.address + f.type + f.target + f.service + (f.menu || []).join("")).includes(q))
    : facilities.filter(shownAs);
  // 내 주변 순: 위치가 있는 기관을 가까운 순으로, 위치를 모르는 기관은 맨 뒤로
  if (me) current = current.map(f => ({ f, d: f.lat ? km(me, f) : Infinity })).sort((a, b) => a.d - b.d).map(({ f, d }) => (f.dist = d, f));
  document.getElementById("list-title").firstChild.textContent = q ? `'${searchBox.value.trim()}' 검색 결과 ` : group.name + " ";
  document.getElementById("count").textContent = current.length + "곳";
  document.getElementById("cards").innerHTML = current.length
    ? current.map((f, i) => `
      <li><button class="row" type="button" data-i="${i}">
        <span class="dot" style="--dot:${colorOf(f)}"></span>
        <span class="row-main">
          <strong>${esc(f.name)}</strong>
          <span class="addr">${f.private ? "주소 비공개" : esc(f.address)}</span>
          <span class="meta">${esc(f.categories.join(" · "))}${f.check ? ' <span class="badge">확인 필요</span>' : ""}</span>
        </span>
        ${me && f.dist < Infinity ? `<span class="dist">${distText(f.dist)}</span>` : icon("chevron")}
      </button></li>`).join("")
    : `<li class="empty">${q ? "검색 결과가 없습니다. 다른 말로 찾아보세요." : checked[group.id].size ? "이 분야의 자료를 모으고 있어요." : "보고 싶은 항목을 골라 주세요."}</li>`;
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
  if (!f.marker) return;
  map.setLevel(3);
  map.panTo(f.marker.getPosition());
  openInfo(f);
  if (!isWide()) document.getElementById("map").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// 목록: 줄을 누르면 상세정보
document.getElementById("cards").addEventListener("click", e => {
  const row = e.target.closest(".row");
  if (row) openDetail(current[row.dataset.i]);
});

// 대분야 바꾸기
document.getElementById("rail").addEventListener("click", e => {
  const b = e.target.closest("button");
  if (!b) return;
  group = GROUPS.find(g => g.id === b.dataset.g);
  searchBox.value = "";
  closeDetail();
  drawRail(); drawSubs(); show();
});
// 세부 항목 켜고 끄기
document.getElementById("subs").addEventListener("change", e => {
  const set = checked[group.id], cat = e.target.dataset.cat;
  // 복지시설 세부 항목을 누르면 그 안의 소분야를 한꺼번에 켜고 끕니다.
  const keys = cat ? minorsIn(cat).map(m => cat + "|" + m) : [e.target.value];
  keys.forEach(k => e.target.checked ? set.add(k) : set.delete(k));
  if (group.id === "welfare") { // 위아래 체크 표시를 맞추고, 누르던 칸에 그대로 머뭅니다
    drawSubs();
    e.currentTarget.querySelector(cat ? `[data-cat="${CSS.escape(cat)}"]` : `[value="${CSS.escape(keys[0])}"]`)?.focus();
  }
  closeDetail();
  show();
});
// 휴대폰: 세부 항목 고르기 단추
document.getElementById("subs-toggle").addEventListener("click", () => { subsOpen = !subsOpen; drawSubs(); });
// 소분야 펼치기·접기
document.getElementById("subs").addEventListener("click", e => {
  const b = e.target.closest(".expand");
  if (!b) return;
  const s = b.dataset.open;
  opened.has(s) ? opened.delete(s) : opened.add(s);
  drawSubs();
  document.querySelector(`.expand[data-open="${CSS.escape(s)}"]`)?.focus();
});

// 운영 시간 읽기 쉽게 두 부분으로 나눕니다.
// "월,화,수,목,금 / 09:00~18:00 / 점심 12:00~13:00 / 공휴일 휴무"
//   → 기본: "월~금 09:00 ~ 18:00", 덧붙임: "점심 12:00 ~ 13:00, 공휴일 휴무"
const week = "월화수목금토일";
const dayRange = part => {
  if (!/^[월화수목금토일](,[월화수목금토일])*$/.test(part)) return null;
  const idx = part.split(",").map(d => week.indexOf(d)), runs = [];
  idx.forEach(i => (runs.length && i === runs.at(-1).at(-1) + 1 ? runs.at(-1).push(i) : runs.push([i])));
  return runs.map(r => r.length > 2 ? week[r[0]] + "~" + week[r.at(-1)] : r.map(i => week[i]).join(", ")).join(", ");
};
const spaced = s => s.replace(/(\d{1,2}:\d{2})\s*~\s*(\d{1,2}:\d{2})/g, "$1 ~ $2");
const hoursParts = h => {
  const parts = h.split(" / ").map(s => s.trim()), main = [];
  const days = dayRange(parts[0]);
  if (days) { main.push(days); parts.shift(); }
  if (parts.length) main.push(days ? parts.shift().replace(/^평일\s+/, "") : parts.shift());
  return { main: spaced(main.join(" ")), extra: parts.map(spaced).join(", ") };
};
const hoursText = h => { const { main, extra } = hoursParts(h); return main + (extra ? ` (${extra})` : ""); };

const dialog = document.getElementById("detail");
const row = (label, value) => `<tr><th>${label}</th><td>${value || '<span class="none">정보 없음</span>'}</td></tr>`;

const listView = document.getElementById("list-view"), detailView = document.getElementById("detail-view");
let listScroll = 0;
function closeDetail() {
  if (dialog.open) dialog.close();
  if (!detailView.hidden) { detailView.hidden = true; detailView.innerHTML = ""; listView.hidden = false; document.getElementById("list").scrollTop = listScroll; }
}

// 상세정보는 분야마다 보여 주는 항목이 다릅니다.
//  복지시설·대피시설: 대상·하는 일·운영 시간·이용 방법·기관 정보·이용 편의·오시는 길
//  안전·보건: 주소·연락처·오시는 길
//  관광명소: 사진·운영 시간·주소·연락처·이용 편의·오시는 길
//  맛집·카페: 사진 보기·운영 시간·메뉴·주소·연락처·이용 편의·오시는 길
const kindOf = f => {
  const ids = f.categories.map(c => groupOf(c)?.id);
  if (ids.includes("welfare")) return "welfare"; // 복지시설이면서 쉼터인 곳은 복지시설로 봅니다
  if (f.categories.includes("관광명소")) return "tour"; // 예) 자유공원 = 관광명소 + 지진옥외 대피소
  if (ids.includes("hot")) return "food";
  if (ids.includes("shelter")) return "shelter";
  return "safety";
};
// 요양원처럼 사람이 지내는 시설은 시간이 따로 없으므로, 운영 시간 대신 그렇게 알려 줍니다.
const LIVE_IN = /노인요양시설|거주시설|공동생활|양육시설/;
const hoursHtml = (h, f) => !h && f && LIVE_IN.test(f.type) ? '24시간 생활하는 시설입니다.<span class="sub">(면회·상담 시간은 전화로 확인하세요)</span>' : h ? (({ main, extra }) => esc(main) + (extra ? `<span class="sub">(${esc(extra)})</span>` : ""))(hoursParts(h))
  : '<span class="none">아직 확인하지 못했습니다. 방문 전에 전화로 확인하세요.</span>';
// "깐풍활전복 28,000원 (대표)" → 이름, 가격, 대표 여부
const menuItem = s => { const m = s.match(/^(.*?)\s+([\d,]+원~?|변동|시가)( \(대표\))?$/); return m ? [m[1], m[2], !!m[3]] : [s, "", false]; };
const naverPlace = (f, tab) => `https://m.place.naver.com/${f.categories.includes("관광명소") ? "place" : "restaurant"}/${f.naver}/${tab}`;

// 이용 편의: 장애인편의시설 자료(이용편의.csv) + 네이버 플레이스 편의 정보(맛집·카페·관광명소)
function accessHtml(f) {
  const conv = (f.conv || "").split(",").map(s => s.trim()).filter(Boolean);
  const a = f.access || {};
  const rows = [
    // 장애인편의시설 자료(공공데이터)가 있으면 그것을 먼저, 없으면 지도 앱(네이버·카카오) 표시
    ["휠체어 출입", a["휠체어 출입"] && a["휠체어 출입"] !== "자료에 없음" ? a["휠체어 출입"] : f.wheel ? "가능 (네이버 플레이스 표시)" : a["휠체어 출입"]],
    ["엘리베이터", a["엘리베이터"]],
    ["주차", conv.includes("발렛파킹") ? "가능 (발렛파킹)" : conv.includes("무료 주차") ? "가능 (무료)" : conv.includes("주차") ? "가능" : a["주차"]],
    ["장애인 화장실", a["장애인 화장실"]],
  ];
  if (conv.includes("장애인 편의시설")) rows.push(["장애인 편의시설", "있음 (지도 앱 표시)"]);
  if (conv.includes("남/녀 화장실 구분")) rows.push(["화장실", "남녀 따로"]);
  const rest = conv.filter(s => !["주차", "무료 주차", "발렛파킹", "남/녀 화장실 구분", "장애인 편의시설"].includes(s));
  if (rest.length) rows.push(["그 밖에", rest.join(", ")]);
  const src = [a["출처"], (f.conv || f.wheel) && (f.convSrc || "네이버 플레이스 편의 정보(2026-10-17)")].filter(Boolean);
  // 네이버 정보만 있으면 엘리베이터·장애인 화장실 줄은 빼서 '정보 없음'이 줄줄이 나오지 않게 합니다.
  const shown = a["출처"] ? rows : rows.filter(([, v]) => v);
  return `<h3>이용 편의</h3>
    ${shown.length ? `<table class="info-table">${shown.map(([k, v]) => row(k, esc(v || ""))).join("")}</table>` : ""}
    <p class="note">${src.length ? "출처: " + src.map(esc).join(", ") + "<br>'정보 없음'은 없다는 뜻이 아닐 수 있습니다. 방문 전에 전화로 확인하세요." : "아직 확인된 이용 편의 정보가 없습니다. 방문 전에 전화로 확인하세요."}</p>`;
}

function openDetail(f) {
  const kind = kindOf(f), hot = kind === "tour" || kind === "food";
  const wide = isWide();
  if (wide) { // 컴퓨터: 오른쪽 목록 자리에 보여 주고, 지도를 그 기관으로 옮깁니다
    if (dialog.open) dialog.close();
    if (detailView.hidden) listScroll = document.getElementById("list").scrollTop;
    listView.hidden = true; detailView.hidden = false;
    if (map && f.marker) { map.panTo(f.marker.getPosition()); openInfo(f); }
  } else if (!detailView.hidden) { detailView.hidden = true; detailView.innerHTML = ""; listView.hidden = false; }
  const box = wide ? detailView : document.getElementById("detail-body");
  const tel = f.phone && `<a href="tel:${esc(f.phone)}">${esc(f.phone)}</a>${f.phoneLabel ? `<br><span class="by">${esc(f.phoneLabel)} (제물포구 담당 부서. 시설 직통 번호가 아닙니다)</span>` : ""}`;
  // 사진: 관광명소는 자유 이용 사진(위키미디어 공용)을 바로 보여 주고, 가게 사진은 저작권 때문에 네이버 플레이스로 연결합니다.
  const photos = kind === "tour" && f.pics ? `
    <div class="pics">${f.pics.map(p => `<figure><img src="${esc(p.src)}" alt="${esc(f.name)} 사진" loading="lazy" referrerpolicy="no-referrer"><figcaption>사진: <a href="${esc(p.page)}" target="_blank" rel="noopener">${esc(p.by)}</a> · ${esc(p.license.replace("KOGL Type 1", "공공누리 제1유형"))} (위키미디어 공용)</figcaption></figure>`).join("")}</div>`
    : hot && f.naver ? `
    <p class="actions photo-links">
      <a class="pin-btn" href="${naverPlace(f, "photo")}" target="_blank" rel="noopener">${icon("photo")}${kind === "food" ? "가게 사진 보기" : "사진 보기"}</a>
      ${f.menu ? `<a class="pin-btn" href="${naverPlace(f, "menu/list")}" target="_blank" rel="noopener">${icon("menu")}메뉴판 사진 보기</a>` : ""}
    </p>
    <p class="note photo-note">사진은 저작권이 있어 네이버 플레이스에서 보여 드립니다.</p>` : "";
  box.innerHTML = (wide ? `<button class="back" type="button" id="detail-back">${icon("back")}목록으로</button>` : "") + `
    <p class="tags">${f.categories.map(c => `<span class="tag">${esc(c)}</span>`).join("")}</p>
    <h2 id="detail-name">${esc(f.name)}</h2>
    ${f.private ? "<p>이용하는 분들의 안전과 생활 보호를 위해 주소·전화를 공개하지 않습니다.</p>" : `
    <div class="quick">
      ${f.phone ? `<a class="main" href="tel:${esc(f.phone)}">${icon("phone")}${f.phoneLabel ? "문의 전화" : "전화"}</a>` : ""}
      ${f.lat ? `<a${f.phone ? "" : ' class="main"'} href="https://map.kakao.com/link/to/${encodeURIComponent(f.name)},${f.lat},${f.lng}" target="_blank" rel="noopener">${icon("route")}길찾기</a>` : ""}
      <button type="button" id="detail-share">${icon("share")}공유</button>
    </div>
    <p class="share-msg" id="share-msg" role="status" hidden></p>`}
    ${photos}
    ${kind === "safety" ? "" : hot ? `
    <div class="summary">
      <p class="hours first"><b>운영 시간</b><span>${!f.hours && /^(거리|공원|산책로)(·|$)/.test(f.type) ? "거리·공원이라 따로 정한 운영 시간이 없습니다.<span class=\"sub\">(안에 있는 가게·시설은 저마다 다릅니다)</span>" : hoursHtml(f.hours, f)}</span></p>
      ${f.menu ? `<p class="menu-title"><b>메뉴</b></p>
      <ul class="menu">${f.menu.map(menuItem).map(([n, p, best]) => `<li><span>${esc(n)}${best ? ' <span class="best">대표</span>' : ""}</span><span class="price">${esc(p)}</span></li>`).join("")}</ul>
      <p class="menu-note">네이버 플레이스 메뉴${f.menuDate ? ` (${esc(f.menuDate.replace(/-/g, "."))} 기준)` : ""}. 가격은 바뀔 수 있습니다.</p>` : ""}
    </div>` : `
    <div class="summary">
      ${f.target ? `<p><b>대상</b>${esc(f.target)}</p>` : ""}
      ${f.service ? `<p><b>하는 일</b></p><ul>${f.service.split(/,\s*(?![^()]*\))/).map(s => `<li>${esc(s)}</li>`).join("")}</ul>` : ""}
      <p class="hours"><b>운영 시간</b><span>${hoursHtml(f.hours, f)}</span></p>
    </div>
    ${f.how ? `<h3>이용 방법</h3><p class="how">${esc(f.how)}</p>` : ""}`}
    ${f.private ? "" : `<table class="info-table${kind === "welfare" || kind === "shelter" ? "" : " short"}">
      ${row("주소", esc(f.address))}
      ${row(f.phoneLabel ? "문의" : "연락처", tel)}
      ${kind === "welfare" || kind === "shelter" ? row("홈페이지", f.homepage && `<a href="${esc(f.homepage)}" target="_blank" rel="noopener">${esc(f.homepage.replace(/^https?:\/\//, "").replace(/\/$/, ""))}</a>`) : ""}
      ${kind === "welfare" ? row("운영주체 구분", esc(f.operatorType || "")) : ""}
      ${kind === "welfare" || kind === "shelter" ? row("시설 종류", esc(f.type)) : ""}
      ${kind === "welfare" ? row("법인명", esc(f.corp || "")) : ""}
    </table>`}
    ${f.private || kind === "safety" ? "" : accessHtml(f)}
    ${f.lat ? `<h3>오시는 길</h3>
    <div class="way-map" id="way-map"></div>
    <ul class="way-list">
      <li>${esc(f.address)}</li>
      <li id="way-subway">가까운 지하철역 찾는 중…</li>
      ${f.bus ? f.bus.map(([n, m, no]) => `<li class="bus-stop">버스 정류장 <b>${esc(n)}</b> (약 ${m < 50 ? 50 : Math.round(m / 10) * 10}m, 걸어서 약 ${Math.max(1, Math.round(m / 67))}분)${no.length ? `<span class="bus-no">${no.map(x => `<span>${esc(x)}</span>`).join("")}</span>` : ""}</li>`).join("") : "<li>걸어갈 만한 거리(500m)에 버스 정류장이 없습니다.</li>"}
    </ul>
    <p class="note">거리는 직선거리라 실제로 걷는 길은 더 멀 수 있습니다. 버스 정류장과 지나는 버스는 국토교통부 버스정류소정보(2026-10-17)이며, 길 건너 반대 방향 정류장의 버스도 함께 적었습니다. 갈아타는 길과 도착 시간은 '대중교통 길찾기'에서 확인하세요.</p>
    <p class="actions">
      <a class="pin-btn" id="detail-transit" href="https://map.kakao.com/link/to/${encodeURIComponent(f.name)},${f.lat},${f.lng}" target="_blank" rel="noopener">${icon("bus")}대중교통 길찾기</a>
      <button class="pin-btn" type="button" id="detail-map">${icon("pin")}지도에서 보기</button>
    </p>` : ""}
    ${f.checkedAt ? `<p class="checked">정보 확인일: <b>${esc(f.checkedAt.replace(/^(\d{4})-(\d\d)-(\d\d)$/,(m, y, mo, d) => `${y}년 ${+mo}월 ${+d}일`))}</b><br><span>${esc(f.checkedWhat || "")}. 그 뒤에 바뀌었을 수 있으니 방문 전에 전화로 확인하세요.</span></p>` : ""}`;
  if (wide) document.getElementById("list").scrollTop = 0;
  else { if (!dialog.open) dialog.showModal(); dialog.scrollTop = 0; }
  document.getElementById("detail-back")?.addEventListener("click", closeDetail);
  document.getElementById("detail-map")?.addEventListener("click", () => { if (dialog.open) dialog.close(); if (map) focusOnMap(f); });
  document.getElementById("detail-share")?.addEventListener("click", () => share(f));
  // 사진을 못 불러오면 그 칸을 숨깁니다.
  box.querySelectorAll(".pics img").forEach(img => img.addEventListener("error", () => img.closest("figure").remove()));
  if (f.lat) showWay(f);
}

// 공유: 휴대폰은 공유 창(카카오톡 등), 컴퓨터는 링크 복사. 링크를 열면 이 기관 창이 바로 열립니다.
async function share(f) {
  const msg = document.getElementById("share-msg");
  const url = location.origin + location.pathname + "#" + encodeURIComponent(f.name);
  const text = [f.name, f.address, f.phone && (f.phoneLabel ? `문의 ${f.phone} (${f.phoneLabel})` : "전화 " + f.phone)].filter(Boolean).join("\n");
  const tell = t => { msg.textContent = t; msg.hidden = false; };
  try {
    if (navigator.share) await navigator.share({ title: f.name, text, url });
    else { await navigator.clipboard.writeText(text + "\n" + url); tell("기관 정보와 링크를 복사했습니다. 카카오톡이나 문자에 붙여넣기 하세요."); }
  } catch (e) {
    if (e.name !== "AbortError") tell("공유하지 못했습니다. 주소창의 링크를 직접 복사해 주세요.");
  }
}

// 오시는 길: 작은 지도와 가까운 지하철역(카카오 장소 검색, 1.5km 안 2곳)
function showWay(f) {
  const subway = document.getElementById("way-subway");
  if (!map) { // 공유 링크로 들어와 지도가 아직 준비되지 않았으면, 준비된 뒤에 다시 그립니다
    if (window.kakao && kakao.maps) kakao.maps.load(() => { if (subway.isConnected) showWay(f); });
    else subway.remove();
    return;
  }
  const pos = new kakao.maps.LatLng(f.lat, f.lng);
  new kakao.maps.StaticMap(document.getElementById("way-map"), { center: pos, level: 3, marker: { position: pos } });
  // 작은 지도는 카카오맵으로 가는 링크인데 글자가 없어서, 화면 읽기 프로그램이 읽을 이름을 붙입니다.
  const wayLink = document.querySelector("#way-map a");
  if (wayLink) { wayLink.setAttribute("aria-label", `${f.name} 위치를 카카오맵에서 크게 보기 (새 창)`); wayLink.rel = "noopener"; }
  // 컴퓨터: 카카오맵 길찾기를 '대중교통'으로, 도착지를 이 기관으로 채워서 엽니다 (휴대폰은 카카오맵 앱 길찾기 그대로).
  if (isWide()) new kakao.maps.services.Geocoder().transCoord(f.lng, f.lat, (r, status) => {
    const a = document.getElementById("detail-transit");
    if (status !== kakao.maps.services.Status.OK || !a?.isConnected) return;
    a.href = `https://map.kakao.com/?map_type=TYPE_MAP&target=traffic&rt=${encodeURIComponent(`,,${Math.round(r[0].x)},${Math.round(r[0].y)}`)}&rt1=&rt2=${encodeURIComponent(f.name)}`;
  }, { input_coord: kakao.maps.services.Coords.WGS84, output_coord: kakao.maps.services.Coords.WCONGNAMUL });
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

searchBox.addEventListener("input", () => { closeDetail(); show(); });

// 내 주변 가까운 순: 휴대폰·컴퓨터의 위치를 받아 가까운 순으로 정렬합니다 (위치는 저장하거나 보내지 않습니다).
const nearBtn = document.getElementById("near"), nearMsg = document.getElementById("near-msg");
const say = text => { nearMsg.textContent = text; nearMsg.hidden = !text; };
nearBtn.addEventListener("click", () => {
  if (me) { // 다시 누르면 원래 순서로
    me = null;
    meMarker?.setMap(null);
    nearBtn.innerHTML = icon("locate") + "<span>내 주변</span>";
    nearBtn.setAttribute("aria-pressed", "false");
    say("");
    return show();
  }
  if (!navigator.geolocation) return say("이 브라우저는 위치 찾기를 지원하지 않습니다.");
  say("내 위치를 찾는 중입니다… 위치 사용을 묻는 창이 뜨면 '허용'을 눌러 주세요.");
  navigator.geolocation.getCurrentPosition(p => {
    me = { lat: p.coords.latitude, lng: p.coords.longitude };
    nearBtn.innerHTML = icon("undo") + "<span>원래 순서로</span>";
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
  mapToggle.querySelector("span").textContent = folded ? "지도 펴기" : "지도 접기";
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
  addEventListener("resize", () => map && map.relayout());
}

drawRail();
drawSubs();
show();

// 공유받은 링크(#기관이름)로 들어오면 그 기관 창을 바로 엽니다.
try {
  const linked = location.hash && facilities.find(f => f.name === decodeURIComponent(location.hash.slice(1)));
  if (linked) openDetail(linked);
} catch (e) {}
