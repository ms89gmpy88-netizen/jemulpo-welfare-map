// 국토교통부(TAGO) 버스정류소정보로 버스 정류장과 지나는 버스 번호를 받습니다. 실행: node data/fetch-bus.js
// 인증키는 data/.api-key (비밀, git 제외). 개발용 키는 하루 요청 횟수 제한이 있어 한 번에 몰아서 받고, 하루 한 번만 돌립니다.
// 결과: data/버스정류장.csv (제물포구 근처 정류장), data/버스노선.csv (기관 근처에서 쓰는 정류장만, 정류장ID → 버스 번호)
const fs = require("fs"), path = require("path");
const KEY = fs.readFileSync(path.join(__dirname, ".api-key"), "utf8").trim();
const API = "https://apis.data.go.kr/1613000/BusSttnInfoInqireService/";
const q = v => /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
const write = (file, head, rows) => fs.writeFileSync(path.join(__dirname, file), "﻿" + head + "\n" + rows.map(r => r.map(q).join(",")).join("\n") + "\n");
const km = (a, b) => { const r = Math.PI / 180, x = (b.lng - a.lng) * r * Math.cos((a.lat + b.lat) * r / 2), y = (b.lat - a.lat) * r; return Math.hypot(x, y) * 6371; };
let calls = 0;
async function get(op, params, tries = 3) {
  calls++;
  const u = API + op + "?serviceKey=" + KEY + "&_type=json&cityCode=23&" + new URLSearchParams(params);
  const j = await (await fetch(u)).json().catch(() => ({}));
  if (j.response?.header?.resultCode !== "00") {
    // 가끔 'HTTP 에러'가 나므로 조금 쉬었다가 두 번 더 해 봅니다.
    if (tries > 1) { await new Promise(r => setTimeout(r, 1500)); return get(op, params, tries - 1); }
    throw new Error(op + ": " + JSON.stringify(j).slice(0, 200));
  }
  const it = j.response.body.items?.item || [];
  return { items: Array.isArray(it) ? it : [it], total: j.response.body.totalCount };
}

(async () => {
  // 1) 인천 정류장 전체 → 제물포구 근처만
  const all = [];
  for (let p = 1; ; p++) {
    const { items, total } = await get("getSttnNoList", { numOfRows: 1000, pageNo: p });
    all.push(...items);
    if (all.length >= total || !items.length) break;
  }
  const stops = all.map(s => ({ id: s.nodeid, name: s.nodenm, no: s.nodeno || "", lat: +s.gpslati, lng: +s.gpslong }))
    .filter(s => s.lat > 37.43 && s.lat < 37.50 && s.lng > 126.585 && s.lng < 126.685)
    .sort((a, b) => a.name.localeCompare(b.name, "ko") || a.id.localeCompare(b.id));
  write("버스정류장.csv", "정류장명,정류장번호,정류장ID,위도,경도", stops.map(s => [s.name, s.no, s.id, s.lat, s.lng]));

  // 2) 기관마다 500m 안 가까운 정류장 이름 2개 → 그 이름의 정류장(길 건너 반대 방향 포함, 200m 안)만 버스 번호를 받습니다
  global.window = global;
  eval(fs.readFileSync(path.join(__dirname, "..", "facilities.js"), "utf8").replace(/^const facilities/m, "global.facilities"));
  const need = new Set();
  for (const f of facilities.filter(f => f.lat)) {
    const near = stops.map(s => ({ s, d: km(f, s) })).filter(x => x.d <= 0.5).sort((a, b) => a.d - b.d);
    const names = [];
    for (const { s } of near) if (!names.includes(s.name) && names.length < 2) names.push(s.name);
    for (const n of names) {
      const first = near.find(x => x.s.name === n).s;
      near.filter(x => x.s.name === n && km(first, x.s) < 0.2).forEach(x => need.add(x.s.id));
    }
  }
  const routes = [];
  for (const id of need) {
    const { items } = await get("getSttnThrghRouteList", { nodeid: id, numOfRows: 100, pageNo: 1 });
    for (const r of items) routes.push([id, String(r.routeno), r.routetp || ""]);
    await new Promise(r => setTimeout(r, 120));
  }
  write("버스노선.csv", "정류장ID,버스번호,종류", routes);
  console.log(`정류장 ${stops.length}곳(인천 ${all.length}곳 중), 버스 번호 받은 정류장 ${need.size}곳, 요청 ${calls}번`);
})().catch(e => { console.error("실패:", e.message); process.exit(1); });
