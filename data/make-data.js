// data 폴더의 CSV를 웹사이트용 facilities.js로 바꿉니다. 실행: node data/make-data.js
// (index.html을 더블클릭해 열면 브라우저가 CSV를 직접 못 읽기 때문에 JS 파일로 만듭니다.)
const fs = require("fs"), path = require("path");

const parse = file => {
  const [head, ...rows] = fs.readFileSync(path.join(__dirname, file), "utf8").replace(/^﻿/, "").trim().split(/\r?\n/)
    .map(l => l.match(/("([^"]*)"|[^,]*)(,|$)/g).map(c => c.replace(/,$/, "").replace(/^"|"$/g, "").trim()));
  return rows.map(r => Object.fromEntries(head.map((h, i) => [h, r[i] || ""])));
};

// 한 기관이 여러 탭에 나올 수 있습니다 (예: 노인복지관은 어르신 + 복지관/자활).
const extra = f => f.categories.some(c => c === "대피소" || c === "쉼터") ? [] : [
  /종합복지관|노인복지관/.test(f.name) && "복지관/자활",
  (/치매/.test(f.name) || (f.categories.includes("장애인") && /재활/.test(f.type))) && "건강/재활",
].filter(Boolean);

const facilities = [
  ...parse("노인복지시설현황.csv").map(r => ({ name: r["시설명"], categories: ["어르신"], type: r["시설종류"], address: r["소재지"], phone: r["연락처"], operator: r["운영주체(법인명)"] })),
  ...parse("노인요양시설현황.csv").map(r => ({ name: r["시설명"], categories: ["어르신"], type: "노인요양시설", address: r["주소"], phone: r["전화번호"] })),
  ...parse("경로당현황.csv").map(r => ({ name: r["경로당명"], categories: ["어르신"], type: "경로당", address: r["도로명주소"], phone: r["전화번호"], check: r["확인상태"] === "확인 필요" })),
  ...parse("장애인복지시설현황.csv").map(r => ({ name: r["시설명"], categories: ["장애인"], type: r["시설유형"], address: r["소재지"], phone: r["연락처"], operator: r["운영주체(법인명)"], check: r["확인상태"] === "확인 필요" })),
  // 보호시설·공동생활가정은 '주소 비공개'로 이름만 싣습니다.
  ...parse("기타복지시설.csv").map(r => ({ name: r["시설명"], categories: r["분야"].split("|"), type: r["시설유형"], address: r["소재지"], phone: r["연락처"], check: r["확인상태"] === "확인 필요", private: r["확인상태"] === "주소 비공개" })),
  // 대피소·쉼터는 국민안전24 등에서 모은 자료입니다 (운영시간 칸이 있음).
  ...parse("대피소쉼터.csv").map(r => ({ name: r["시설명"], categories: r["분야"].split("|"), type: r["시설유형"], address: r["소재지"], phone: r["연락처"], hours: r["운영시간"], phoneLabel: r["문의처"] || undefined })),
  // 안전·보건(경찰·해양경찰·소방): 공식 홈페이지 + 카카오맵·네이버 플레이스로 확인한 곳
  ...parse("안전보건.csv").map(r => ({ name: r["시설명"], categories: [r["분야"]], type: r["시설유형"], address: r["소재지"], phone: r["연락처"] })),
].map(f => ({ ...f, categories: [...new Set([...f.categories, ...extra(f)])] }));

// 대상·하는 일: 시설 종류별 일반 안내 + 기관별로 확인한 사업(기관별사업.csv)
const guide = require("./시설종류안내.js");
const own = Object.fromEntries(parse("기관별사업.csv").map(r => [r["시설명"], r["하는 일"]]));
facilities.forEach(f => {
  // 대피소·쉼터는 이름(예: ○○경로당)이 아니라 종류로만 맞춥니다.
  const shelter = f.categories.some(c => c === "대피소" || c === "쉼터");
  const g = guide.find(([re]) => re.test(shelter ? f.type : f.type + " " + f.name));
  if (g) [f.target, f.service, f.how] = [g[1], g[2], g[3]];
  // 재가·장기요양기관은 구청 급여종류가 그 기관의 실제 서비스이므로 일반 안내를 붙이지 않습니다.
  if (own[f.name]) f.service = own[f.name] + (f.service && !/재가|장기요양/.test(f.type) ? ", " + f.service : "");
});

// 상세정보: 운영주체구분·법인명·홈페이지 (CSV의 운영주체 칸 + 기관상세.csv)
const detail = Object.fromEntries(parse("기관상세.csv").map(r => [r["시설명"], r]));
const CORP = /법인|재단|협동조합|주식회사|㈜|협회|산학협력단|교회|수녀회|복지회|공사/;
facilities.forEach(f => {
  const d = detail[f.name] || {};
  const op = (d["운영주체"] || f.operator || "").trim();
  delete f.operator;
  if (d["홈페이지"]) f.homepage = d["홈페이지"];
  const kid = f.type.match(/어린이집\((국공립|민간|가정|직장|법인|사회복지법인|협동)/);
  if (kid) f.operatorType = kid[1];                       // 어린이집은 설립 유형
  else if (/^개인$/.test(op)) f.operatorType = "개인";
  else if (/지방자치단체|구립|시립/.test(op) || /보건소/.test(f.type)) f.operatorType = "지방자치단체";
  else if (op === "법인") f.operatorType = "법인";        // 법인 이름은 자료에 없음
  else if (CORP.test(op)) [f.operatorType, f.corp] = ["법인", op];
});

// 사진(기관이 허락한 사진만, data/사진 폴더)과 이용편의 정보(휠체어·엘리베이터·주차)
const photos = parse("기관사진.csv");
const access = Object.fromEntries(parse("이용편의.csv").map(r => [r["시설명"], r]));
facilities.forEach(f => {
  const p = photos.filter(r => r["시설명"] === f.name);
  if (p.length) f.photos = p.map(r => ({ src: "data/사진/" + r["사진파일"], caption: r["설명"], credit: r["출처·허락"] }));
  const a = access[f.name];
  if (a) f.access = { "휠체어 출입": a["휠체어 출입"], "엘리베이터": a["엘리베이터"], "주차": a["주차"], "장애인 화장실": a["장애인 화장실"], "출처": a["출처"] };
});

// 지도 좌표: coords.json (주소 → [위도, 경도]), 카카오 주소 검색으로 만든 파일입니다.
const coords = JSON.parse(fs.readFileSync(path.join(__dirname, "coords.json"), "utf8"));
facilities.forEach(f => { if (coords[f.address]) [f.lat, f.lng] = coords[f.address]; });

// 같은 기관 합치기: 이름이 같고 300m 안(좌표가 없으면 전화번호가 같으면)이면 한 카드로 모읍니다.
// 예) 경로당이면서 무더위쉼터인 곳, 재가시설·장기요양기관으로 따로 등록된 곳
const km = (a, b) => { const r = Math.PI / 180, x = (b.lng - a.lng) * r * Math.cos((a.lat + b.lat) * r / 2), y = (b.lat - a.lat) * r; return Math.hypot(x, y) * 6371; };
// 이름은 옛 구 이름(동구·중구·제물포구·인천)을 빼고 비교합니다. 예) 쉼터 목록의 '동구노인복지관' = '제물포노인복지관'
const core = n => n.replace(/\s/g, "").replace(/^(인천)?(동구|중구|제물포구?)/, "");
// 이름이 똑같으면 300m 안, 구 이름만 다르면(예: 인천중구주간보호센터 ≠ 제물포구주간보호센터) 같은 건물(30m 안)일 때만 합칩니다.
const same = (a, b) => {
  if (core(a.name) !== core(b.name)) return false;
  const exact = a.name.replace(/\s/g, "") === b.name.replace(/\s/g, "");
  return a.lat && b.lat ? km(a, b) < (exact ? 0.3 : 0.03) : exact && !!a.phone && a.phone === b.phone;
};
const isShelter = f => f.categories.every(c => c === "대피소" || c === "쉼터");
const rank = f => (isShelter(f) ? 2 : 0) + (/(로|길)\s?\d/.test(f.address) ? 0 : 1); // 복지시설·도로명주소를 대표로
const uniq = (list, sep) => [...new Set(list.filter(Boolean).flatMap(s => s.split(sep)).map(s => s.trim()))].join(sep);
const merged = [];
for (const f of facilities) {
  const g = merged.find(m => m.some(x => same(x, f)));
  g ? g.push(f) : merged.push([f]);
}
facilities.length = 0;
for (const g of merged) {
  g.sort((a, b) => rank(a) - rank(b));
  const f = { ...g[0] };
  if (g.length > 1) {
    f.categories = [...new Set(g.flatMap(x => x.categories))];
    f.type = uniq(g.map(x => x.type), "·");
    f.service = uniq(g.map(x => x.service), ", ");
    for (const k of ["hours", "homepage", "operatorType", "corp", "lat", "lng"]) f[k] ??= g.find(x => x[k])?.[k];
    // 전화: 기관 자체 번호를 먼저 쓰고, 없을 때만 쉼터 자료의 구청 담당 부서 번호(문의처)를 씁니다.
    const tel = g.find(x => x.phone && !x.phoneLabel) || g.find(x => x.phone);
    f.phone = tel?.phone; f.phoneLabel = tel?.phoneLabel;
  }
  facilities.push(f);
}

// 운영 시간: 운영시간.csv(기관 홈페이지·구청·어린이집정보공개포털에서 확인한 것)가 쉼터 자료의 운영시간보다 먼저입니다.
const hours = Object.fromEntries(parse("운영시간.csv").map(r => [r["시설명"], r["운영시간"]]));
facilities.forEach(f => { if (hours[f.name]) f.hours = hours[f.name]; });
const hoursMissing = Object.keys(hours).filter(n => !facilities.some(f => f.name === n));
if (hoursMissing.length) console.log("운영시간.csv에만 있고 목록에 없는 이름: " + hoursMissing.join(", "));

// 화면의 세부 항목(체크박스)으로 나눕니다. 대피소·쉼터는 시설유형 글자로 나눕니다.
// 예) '경로당·무더위쉼터·한파쉼터' → 어르신 + 무더위쉼터 + 한파쉼터
const shelterSubs = [[/지진옥외/, "지진옥외 대피소"], [/화학사고/, "화학사고 대피소"], [/민방위/, "민방위 대피소"], [/임시주거/, "임시주거시설"], [/한파쉼터/, "한파쉼터"], [/무더위쉼터/, "무더위쉼터"]];
facilities.forEach(f => {
  f.categories = [...new Set(f.categories.flatMap(c => c === "대피소" || c === "쉼터"
    ? shelterSubs.filter(([re]) => re.test(f.type)).map(([, s]) => s) : [c]))];
});
const tabs = ["어르신", "장애인", "여성/아동", "한부모/다문화", "복지관/자활", "건강/재활",
  ...shelterSubs.map(([, s]) => s), "경찰서", "해양경찰서", "소방서", "관광명소", "맛집", "분위기 좋은 카페"];
console.assert(facilities.every(f => f.name && (f.address || f.private) && f.categories.every(c => tabs.includes(c))), "이름·주소가 비었거나 분야 이름이 틀린 기관이 있습니다");
fs.writeFileSync(path.join(__dirname, "..", "facilities.js"),
  "// data/make-data.js 로 자동 생성된 파일입니다. 직접 고치지 말고 CSV를 고친 뒤 다시 만드세요.\nconst facilities = " +
  JSON.stringify(facilities, null, 1) + ";\n");

const noGuide = facilities.filter(f => !f.target).map(f => f.name + "(" + f.type + ")");
if (noGuide.length) console.log("대상·하는 일 안내 없음: " + noGuide.join(", ") + " → 시설종류안내.js에 줄을 추가하세요");
const ownMissing = Object.keys(own).filter(n => !facilities.some(f => f.name === n));
if (ownMissing.length) console.log("기관별사업.csv에만 있고 목록에 없는 이름: " + ownMissing.join(", "));
// 군 관련 시설이라 좌표를 찾을 수 없는 곳(목록에만 싣고 지도에는 안 나옴)
const noPinOk = ["민방위교육장 지하 1층"];
const noPin = facilities.filter(f => !f.private && f.lat === undefined && !noPinOk.includes(f.name)).map(f => f.name);
if (noPin.length) console.log("좌표 없음(지도에 안 나옴): " + noPin.join(", ") + " → 주소가 바뀌었으면 coords.json도 새로 만들어야 합니다");
console.log(facilities.length + "곳 저장",Object.fromEntries(tabs.map(t => [t, facilities.filter(f => f.categories.includes(t)).length])));
