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
  ...parse("대피소쉼터.csv").map(r => ({ name: r["시설명"], categories: r["분야"].split("|"), type: r["시설유형"], address: r["소재지"], phone: r["연락처"], hours: r["운영시간"] })),
].map(f => ({ ...f, categories: [...new Set([...f.categories, ...extra(f)])] }));

// 대상·하는 일: 시설 종류별 일반 안내 + 기관별로 확인한 사업(기관별사업.csv)
const guide = require("./시설종류안내.js");
const own = Object.fromEntries(parse("기관별사업.csv").map(r => [r["시설명"], r["하는 일"]]));
facilities.forEach(f => {
  // 대피소·쉼터는 이름(예: ○○경로당)이 아니라 종류로만 맞춥니다.
  const shelter = f.categories.some(c => c === "대피소" || c === "쉼터");
  const g = guide.find(([re]) => re.test(shelter ? f.type : f.type + " " + f.name));
  if (g) [f.target, f.service] = [g[1], g[2]];
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

// 지도 좌표: coords.json (주소 → [위도, 경도]), 카카오 주소 검색으로 만든 파일입니다.
const coords = JSON.parse(fs.readFileSync(path.join(__dirname, "coords.json"), "utf8"));
facilities.forEach(f => { if (coords[f.address]) [f.lat, f.lng] = coords[f.address]; });

const tabs = ["어르신", "장애인", "여성/아동", "한부모/다문화", "복지관/자활", "건강/재활", "대피소", "쉼터"];
console.assert(facilities.every(f => f.name && (f.address || f.private) &&f.categories.every(c => tabs.includes(c))), "이름·주소가 비었거나 분야 이름이 틀린 기관이 있습니다");
fs.writeFileSync(path.join(__dirname, "..", "facilities.js"),
  "// data/make-data.js 로 자동 생성된 파일입니다. 직접 고치지 말고 CSV를 고친 뒤 다시 만드세요.\nconst facilities = " +
  JSON.stringify(facilities, null, 1) + ";\n");
const noGuide = facilities.filter(f => !f.target).map(f => f.name + "(" + f.type + ")");
if (noGuide.length) console.log("대상·하는 일 안내 없음: " + noGuide.join(", ") + " → 시설종류안내.js에 줄을 추가하세요");
const ownMissing = Object.keys(own).filter(n => !facilities.some(f => f.name === n));
if (ownMissing.length) console.log("기관별사업.csv에만 있고 목록에 없는 이름: " + ownMissing.join(", "));
const noPin =facilities.filter(f => !f.private && f.lat === undefined).map(f => f.name);
if (noPin.length) console.log("좌표 없음(지도에 안 나옴): " + noPin.join(", ") + " → 주소가 바뀌었으면 coords.json도 새로 만들어야 합니다");
console.log(facilities.length + "곳 저장",Object.fromEntries(tabs.map(t => [t, facilities.filter(f => f.categories.includes(t)).length])));
