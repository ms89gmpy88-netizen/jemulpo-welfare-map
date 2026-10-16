// 장애인편의시설 API(한국사회보장정보원)에서 이용 편의 정보를 받아 data/이용편의.csv 를 만듭니다.
// 실행: node data/fetch-access.js   (인증키는 data/.api-key 파일, git에 저장하지 않음)
// 순서: 옛 동구·중구·제물포구 건물 목록 → 우리 기관과 맞추기(50m 안 + 이름 또는 도로명주소 일치) → 기관별 설치 항목(evalInfo)
const fs = require("fs"), path = require("path");
const KEY = fs.readFileSync(path.join(__dirname, ".api-key"), "utf8").trim();
const BASE = "https://apis.data.go.kr/B554287/DisabledPersonConvenientFacility/";
const get = async (op, params) => {
  const url = BASE + op + "?" + new URLSearchParams({ serviceKey: KEY, ...params });
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(url); if (r.ok) return await r.text(); } catch (e) {}
    await new Promise(s => setTimeout(s, 1000));
  }
  throw new Error("API 응답 없음: " + op);
};
const tag = (xml, t) => [...xml.matchAll(new RegExp(`<${t}>([^<]*)</${t}>`, "g"))].map(m => m[1]);
const items = xml => xml.split("<servList>").slice(1).map(s => Object.fromEntries(
  ["faclNm", "lcMnad", "faclLat", "faclLng", "wfcltId", "faclTyCd", "salStaNm"].map(k => [k, tag(s, k)[0] || ""])));

const YJ = /운서|운남|운북|중산|영종|용유|을왕|남북동|덕교|무의|공항|하늘달빛|신도시|은하수|흰바위/;
const sq = s => (s || "").replace(/\s/g, "");
const core = n => sq(n).replace(/^(인천)?(동구|중구|제물포구?)/, "").replace(/\(.*\)/, "");
const road = a => (sq(a).replace(/^인천광역시(동구|중구|제물포구)/, "").match(/^.+?(로|길)\d*번?길?[\d-]+/) || [""])[0];
const km = (a, b) => { const r = Math.PI / 180, x = (b.lng - a.lng) * r * Math.cos((a.lat + b.lat) * r / 2), y = (b.lat - a.lat) * r; return Math.hypot(x, y) * 6371; };

(async () => {
  // 1) 건물 목록 (cggNm은 '동구'로 찾으면 '남동구'도 나와서 주소로 다시 거릅니다)
  const all = [];
  for (const cgg of ["제물포구", "동구", "중구"]) {
    for (let page = 1; ; page++) {
      const xml = await get("getDisConvFaclList", { siDoNm: "인천광역시", cggNm: cgg, numOfRows: 1000, pageNo: page });
      const list = items(xml);
      all.push(...list.filter(x => new RegExp(`^인천광역시\\s*${cgg}\\s`).test(x.lcMnad) && !YJ.test(x.lcMnad) && x.salStaNm !== "폐업"));
      if (list.length < 1000) break;
    }
  }
  const bld = [...new Map(all.map(x => [x.wfcltId, { ...x, lat: +x.faclLat, lng: +x.faclLng }])).values()].filter(x => x.lat);
  console.log("편의시설 자료 건물:", bld.length);

  // 2) 우리 기관과 맞추기
  const ctx = {}; new Function("ctx", fs.readFileSync(path.join(__dirname, "..", "facilities.js"), "utf8") + ";ctx.f=facilities")(ctx);
  const matches = [];
  for (const f of ctx.f.filter(f => f.lat && !f.private)) {
    const cand = bld.map(b => ({ b, d: km(f, b) })).filter(x => x.d < 0.05)
      .filter(({ b }) => core(b.faclNm).includes(core(f.name)) || core(f.name).includes(core(b.faclNm)) || (road(f.address) && road(f.address) === road(b.lcMnad)))
      .sort((x, y) => x.d - y.d);
    if (cand.length) matches.push({ f, b: cand[0].b });
  }
  console.log("맞춘 기관:", matches.length);

  // 3) 기관별 설치 항목
  const yes = (list, re) => list.some(s => re.test(s));
  const rows = [];
  // 응답이 없는 곳은 지난번 이용편의.csv 줄을 그대로 둡니다 (파일이 비지 않게).
  const file = path.join(__dirname, "이용편의.csv");
  const old = Object.fromEntries((fs.existsSync(file) ? fs.readFileSync(file, "utf8").replace(/^﻿/, "").trim().split(/\r?\n/).slice(1) : [])
    .map(l => [l.match(/^("([^"]*)"|[^,]*)/)[0].replace(/^"|"$/g, ""), l]));
  const skipped = [], kept = [];
  for (const { f, b } of matches) {
    let xml;
    try { xml = await get("getFacInfoOpenApiJpEvalInfoList", { wfcltId: b.wfcltId }); }
    catch (e) { skipped.push(f.name); if (old[f.name]) kept.push(old[f.name]); continue; }
    const info = (tag(xml, "evalInfo")[0] || "").split(",").map(s => s.trim()).filter(Boolean);
    const entrance = info.filter(s => /주출입구|접근로|높이차이/.test(s));
    rows.push([f.name,
      entrance.length ? "편의시설 있음 (" + entrance.join(", ") + ")" : "자료에 없음",
      yes(info, /승강기/) ? "있음" : "자료에 없음",
      yes(info, /주차/) ? "장애인 전용 주차구역 있음" : "자료에 없음",
      yes(info, /화장실/) ? "있음" : "자료에 없음",
      `한국사회보장정보원 장애인편의시설 현황(${new Date().toISOString().slice(0, 7)}) — 자료상 건물: ${b.faclNm}`]);
  }
  const q = s => /[,"]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  fs.writeFileSync(file, "﻿시설명,휠체어 출입,엘리베이터,주차,장애인 화장실,출처\r\n" +
    [...rows.map(r => r.map(q).join(",")), ...kept].join("\r\n") + "\r\n");
  if (skipped.length) console.log(`API 응답이 없어 ${skipped.length}곳은 지난번 자료를 그대로 두었습니다(잠시 뒤 다시 실행하세요).`);
  console.log("이용편의.csv 저장:", rows.length + kept.length + "곳 → node data/make-data.js 로 화면 자료를 다시 만드세요");
})();
