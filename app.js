'use strict';

const KEY = 'odekake-planner-v1';
const $ = (s, r = document) => r.querySelector(s);

/** DOM を textContent ベースで組み立てる（入力値をHTMLとして解釈させない） */
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    e.append(k.nodeType ? k : document.createTextNode(String(k)));
  }
  return e;
}

/* ---------- データ ---------- */

const uid = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function blankPerson(station) {
  return { fromStation: station || '', toStation: station || '', departTime: '', returnTime: '', fare: null, url: '' };
}

function blankPlan(settings) {
  return {
    id: uid(), name: '新しい案', date: '', destination: '',
    meetStation: '', meetTime: '', arriveTime: '', leaveTime: '',
    people: settings.people.map(p => blankPerson(p.homeStation)),
    car: { use: false, place: '', start: '', end: '', fee: null, toll: null, parking: null },
    extras: [], memos: [],
  };
}

function sampleState() {
  const settings = {
    people: [
      { name: 'Aさん', homeStation: '三鷹', earliest: '07:00', latest: '20:00' },
      { name: 'Bさん', homeStation: '四街道', earliest: '06:30', latest: '20:30' },
    ],
  };
  const noCar = { use: false, place: '', start: '', end: '', fee: null, toll: null, parking: null };
  const plans = [
    {
      id: 'sample-train', name: '電車のみ', date: '2026-11-21', destination: '御岳山',
      meetStation: '立川駅', meetTime: '08:30', arriveTime: '10:10', leaveTime: '15:30',
      people: [
        { fromStation: '三鷹', toStation: '三鷹', departTime: '08:05', returnTime: '17:40', fare: 2300, url: '' },
        { fromStation: '四街道', toStation: '四街道', departTime: '06:25', returnTime: '19:20', fare: 4600, url: '' },
      ],
      car: { ...noCar }, extras: [],
      memos: [
        { time: '10:30', text: '武蔵御嶽神社へ参拝' },
        { time: '12:00', text: '昼食：山上の茶屋でそば' },
        { time: '13:30', text: 'ロックガーデン散策' },
      ],
    },
    {
      id: 'sample-car', name: '電車＋カーシェア', date: '2026-11-21', destination: '御岳山',
      meetStation: '三鷹駅', meetTime: '08:20', arriveTime: '10:15', leaveTime: '16:00',
      people: [
        { fromStation: '三鷹', toStation: '三鷹', departTime: '08:10', returnTime: '19:05', fare: 0, url: '' },
        { fromStation: '四街道', toStation: '四街道', departTime: '06:40', returnTime: '20:50', fare: 2200, url: '' },
      ],
      car: { use: true, place: '三鷹駅北口ステーション', start: '08:30', end: '19:00', fee: 9800, toll: 2400, parking: null },
      extras: [],
      memos: [
        { time: '12:15', text: '昼食：御岳山の食堂' },
        { time: '16:30', text: '帰りに日帰り温泉へ立ち寄り' },
      ],
    },
    {
      id: 'sample-late', name: '遅め出発', date: '2026-11-22', destination: '御岳山',
      meetStation: '立川駅', meetTime: '10:00', arriveTime: '11:40', leaveTime: '16:10',
      people: [
        { fromStation: '三鷹', toStation: '三鷹', departTime: '09:35', returnTime: '18:20', fare: 2300, url: '' },
        { fromStation: '四街道', toStation: '四街道', departTime: '07:55', returnTime: '20:00', fare: 4600, url: '' },
      ],
      car: { ...noCar }, extras: [],
      memos: [
        { time: '12:00', text: '昼食：山上の茶屋' },
        { time: '13:30', text: '武蔵御嶽神社と長尾平' },
      ],
    },
  ];
  return { settings, plans, selectedId: 'sample-train', lang: 'ja' };
}

const str = v => (typeof v === 'string' ? v : '');
const money = v => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : null);

function normalizePlan(p, settings) {
  const b = blankPlan(settings);
  const car = p.car || {};
  return {
    id: str(p.id) || b.id, name: str(p.name), date: str(p.date), destination: str(p.destination),
    meetStation: str(p.meetStation), meetTime: str(p.meetTime), arriveTime: str(p.arriveTime), leaveTime: str(p.leaveTime),
    people: [0, 1].map(i => {
      const q = (p.people || [])[i] || {};
      return { fromStation: str(q.fromStation), toStation: str(q.toStation), departTime: str(q.departTime), returnTime: str(q.returnTime), fare: money(q.fare), url: str(q.url) };
    }),
    car: { use: !!car.use, place: str(car.place), start: str(car.start), end: str(car.end), fee: money(car.fee), toll: money(car.toll), parking: money(car.parking) },
    extras: (Array.isArray(p.extras) ? p.extras : []).map(x => ({ label: str(x.label), amount: money(x.amount) })),
    memos: (Array.isArray(p.memos) ? p.memos : []).map(m => ({ time: str(m.time), text: str(m.text) })),
  };
}

function loadState() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw && Array.isArray(raw.plans) && raw.settings && Array.isArray(raw.settings.people)) {
      const def = sampleState().settings.people;
      const settings = {
        people: [0, 1].map(i => {
          const q = raw.settings.people[i] || {};
          return { name: str(q.name) || def[i].name, homeStation: str(q.homeStation), earliest: str(q.earliest), latest: str(q.latest) };
        }),
      };
      return {
        settings,
        plans: raw.plans.map(p => normalizePlan(p || {}, settings)),
        selectedId: str(raw.selectedId),
        lang: raw.lang === 'zh' ? 'zh' : 'ja',
      };
    }
  } catch (e) { /* 壊れた保存データはサンプルで置き換える */ }
  return sampleState();
}

let state = loadState();
let saveFailed = false;
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); saveFailed = false; }
  catch (e) { saveFailed = true; }
}

/* ---------- 計算 ---------- */

function toMin(t) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t || '');
  return m ? +m[1] * 60 + +m[2] : null;
}
const fmtTime = t => { const m = toMin(t); return m == null ? '' : Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0'); };
const yen = n => n.toLocaleString('ja-JP');

function summarize(plan) {
  const arrive = toMin(plan.arriveTime), leave = toMin(plan.leaveTime);
  let stay = null, stayInvalid = false;
  if (arrive != null && leave != null) {
    if (leave >= arrive) stay = leave - arrive; else stayInvalid = true;
  }

  const people = plan.people.map((p, i) => {
    const pref = state.settings.people[i];
    const dep = toMin(p.departTime), ret = toMin(p.returnTime);
    // 帰着が出発より前の時刻なら日付をまたいだ帰着として扱う
    const overnight = dep != null && ret != null && ret < dep;
    const retAbs = ret == null ? null : ret + (overnight ? 1440 : 0);
    const earliest = toMin(pref.earliest), latest = toMin(pref.latest);
    return {
      overnight,
      early: dep != null && earliest != null && dep < earliest,
      late: retAbs != null && latest != null && retAbs > latest,
    };
  });

  const items = plan.people.map((p, i) => ({ kind: 'fare', person: i, value: p.fare }));
  if (plan.car.use) {
    items.push({ kind: 'carFee', value: plan.car.fee }, { kind: 'toll', value: plan.car.toll }, { kind: 'parking', value: plan.car.parking });
  }
  plan.extras.forEach(x => items.push({ kind: 'extra', label: x.label, value: x.amount }));
  const filled = items.filter(x => x.value != null);
  const total = filled.reduce((a, x) => a + x.value, 0);
  const shared = items.filter(x => x.kind !== 'fare');
  const sharedFilled = shared.filter(x => x.value != null);
  return {
    stay, stayInvalid, people, items, total,
    costState: filled.length === 0 ? 'empty' : filled.length < items.length ? 'provisional' : 'final',
    shared,
    sharedTotal: sharedFilled.reduce((a, x) => a + x.value, 0),
    sharedState: shared.length === 0 ? 'none' : sharedFilled.length === 0 ? 'empty' : sharedFilled.length < shared.length ? 'provisional' : 'final',
  };
}

const WD_JA = ['日', '月', '火', '水', '木', '金', '土'];
const WD_ZH = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
function parseDate(d) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || '');
  if (!m) return null;
  const dt = new Date(+m[1], +m[2] - 1, +m[3]);
  return { y: +m[1], m: +m[2], d: +m[3], wd: dt.getDay() };
}
function fmtDate(d, lang = 'ja') {
  const p = parseDate(d);
  if (!p) return '';
  return lang === 'zh' ? `${p.y}年${p.m}月${p.d}日（${WD_ZH[p.wd]}）` : `${p.y}年${p.m}月${p.d}日(${WD_JA[p.wd]})`;
}
function fmtDur(min, lang = 'ja') {
  const hh = Math.floor(min / 60), mm = min % 60;
  if (lang === 'zh') return (hh ? hh + '小时' : '') + (mm || !hh ? mm + '分钟' : '');
  return (hh ? hh + '時間' : '') + (mm || !hh ? mm + '分' : '');
}
const safeUrl = u => (/^https?:\/\//i.test((u || '').trim()) ? u.trim() : null);

/* ---------- 比較ビュー ---------- */

const missing = (text = '未入力') => h('span', { class: 'missing' }, text);
const tag = (cls, text) => h('span', { class: 'tag ' + cls }, text);
const COST_LABEL = { carFee: 'カーシェア利用料', toll: '高速代', parking: '駐車代' };

function costLabel(item, lang = 'ja') {
  if (item.kind === 'fare') {
    const n = state.settings.people[item.person].name;
    return lang === 'zh' ? `${n} 往返交通费` : `${n} 交通費（往復）`;
  }
  if (item.kind === 'extra') return item.label || (lang === 'zh' ? '其他共同费用' : 'その他の共通費');
  return lang === 'zh' ? { carFee: '共享汽车租车费', toll: '高速费', parking: '停车费' }[item.kind] : COST_LABEL[item.kind];
}

function stationTime(station, time, suffix, prefix = '') {
  if (!station && !time) return missing();
  return [station || missing('駅未入力'), ' ', time ? h('strong', { class: 'num' }, prefix + fmtTime(time) + suffix) : missing('時刻未入力')];
}

/** 比較行の定義。表（PC）とカード（スマホ）で同じ定義を使う */
function buildRows(best) {
  const names = state.settings.people.map(p => p.name);
  const rows = [
    { label: '日付', cell: p => fmtDate(p.date) || missing() },
    { label: '行き先', cell: p => p.destination || missing() },
    { label: '集合', cell: p => stationTime(p.meetStation, p.meetTime, '') },
  ];
  [0, 1].forEach(i => {
    rows.push({
      label: `${names[i]} 出発`,
      warn: (p, s) => s.people[i].early,
      cell: (p, s) => [
        stationTime(p.people[i].fromStation, p.people[i].departTime, ' 発'),
        s.people[i].early && [' ', tag('warn', '希望外'), h('span', { class: 'sub' }, `希望：${fmtTime(state.settings.people[i].earliest)} 以降に出発`)],
      ],
    });
    rows.push({
      label: `${names[i]} 帰着`,
      warn: (p, s) => s.people[i].late,
      cell: (p, s) => [
        stationTime(p.people[i].toStation, p.people[i].returnTime, ' 着', s.people[i].overnight ? '翌' : ''),
        s.people[i].late && [' ', tag('warn', '希望外'), h('span', { class: 'sub' }, `希望：${fmtTime(state.settings.people[i].latest)} までに帰着`)],
      ],
    });
  });
  rows.push(
    {
      label: '現地 到着→出発',
      cell: p => (!p.arriveTime && !p.leaveTime) ? missing()
        : h('span', { class: 'num' }, (fmtTime(p.arriveTime) || '?') + ' 着 → ' + (fmtTime(p.leaveTime) || '?') + ' 発'),
    },
    {
      label: '現地で過ごせる時間',
      warn: (p, s) => s.stayInvalid,
      cell: (p, s) => s.stayInvalid ? [tag('warn', '要確認'), h('span', { class: 'sub' }, '出発が到着より前になっています')]
        : s.stay == null ? missing()
        : [h('span', { class: 'big' }, fmtDur(s.stay)), best.stay === s.stay && [' ', tag('best', '最長')]],
    },
  );
  [0, 1].forEach(i => rows.push({
    label: `${names[i]} 交通費（往復）`,
    cell: p => {
      const f = p.people[i].fare, url = safeUrl(p.people[i].url);
      return [
        f == null ? missing() : h('span', { class: 'num' }, yen(f) + '円'),
        url && h('span', { class: 'sub' }, h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, '乗換案内を開く')),
      ];
    },
  }));
  rows.push(
    {
      label: '共通費（1回だけ加算）',
      cell: (p, s) => s.sharedState === 'none' ? 'なし' : h('ul', { class: 'plain costs' },
        s.shared.map(x => h('li', null, h('span', null, costLabel(x)), x.value == null ? missing() : h('span', { class: 'num' }, yen(x.value) + '円')))),
    },
    {
      label: '二人分の合計',
      cell: (p, s) => s.costState === 'empty' ? missing()
        : [
          h('span', { class: 'big' }, yen(s.total) + '円'),
          s.costState === 'provisional' && [' ', tag('prov', '暫定'), h('span', { class: 'sub' }, '未入力：' + s.items.filter(x => x.value == null).map(x => costLabel(x)).join('、'))],
          s.costState === 'final' && best.cost === s.total && [' ', tag('best', '最安')],
        ],
    },
    {
      label: 'カーシェア',
      cell: p => !p.car.use ? '使わない' : [
        p.car.place || missing('場所未入力'),
        h('span', { class: 'sub num' }, (p.car.start || p.car.end) ? `予約 ${fmtTime(p.car.start) || '?'}〜${fmtTime(p.car.end) || '?'}` : '予約時間 未入力'),
      ],
    },
    {
      label: '昼食・立ち寄り',
      cell: p => p.memos.length ? h('ul', { class: 'plain' }, sortedMemos(p).map(m => h('li', null, h('span', { class: 't' }, fmtTime(m.time) || '—'), h('span', null, m.text)))) : 'なし',
    },
  );
  return rows;
}

function sortedMemos(plan) {
  return plan.memos.map((m, i) => ({ ...m, i })).sort((a, b) => (toMin(a.time) ?? 9999) - (toMin(b.time) ?? 9999) || a.i - b.i);
}

function planActions(plan) {
  return h('div', { class: 'actions' },
    h('button', { type: 'button', class: 'small', onclick: () => openEditor(plan.id) }, '編集'),
    h('button', { type: 'button', class: 'small', onclick: () => duplicatePlan(plan.id) }, '複製'),
    h('button', { type: 'button', class: 'small', onclick: () => pickPlan(plan.id, true) }, 'この案で共有文を作る'),
    h('button', { type: 'button', class: 'small danger', onclick: () => deletePlan(plan.id) }, '削除'),
  );
}

function renderCompare() {
  const plans = state.plans;
  const sums = plans.map(summarize);
  const stays = sums.filter(s => s.stay != null).map(s => s.stay);
  const finals = sums.filter(s => s.costState === 'final').map(s => s.total);
  const best = {
    stay: plans.length > 1 && stays.length > 1 ? Math.max(...stays) : null,
    cost: plans.length > 1 && finals.length > 1 ? Math.min(...finals) : null,
  };
  const rows = buildRows(best);
  const head = p => [
    h('span', { class: 'plan-name' }, p.name || '（名前なし）'),
    p.id === state.selectedId && tag('pick', '共有する案'),
  ];

  const tableWrap = $('#compareTable'), cards = $('#compareCards');
  tableWrap.replaceChildren(); cards.replaceChildren();
  $('#empty').hidden = plans.length > 0;
  tableWrap.hidden = cards.hidden = plans.length === 0;
  if (!plans.length) return;

  tableWrap.append(h('table', { class: 'cmp' },
    h('thead', null, h('tr', null,
      h('th', { scope: 'col' }, '項目'),
      plans.map(p => h('th', { scope: 'col', class: p.id === state.selectedId ? 'picked' : null }, head(p), planActions(p))))),
    h('tbody', null, rows.map(r => h('tr', null,
      h('th', { scope: 'row' }, r.label),
      plans.map((p, i) => h('td', { class: [r.warn && r.warn(p, sums[i]) ? 'is-warn' : '', p.id === state.selectedId ? 'picked' : ''].join(' ').trim() || null }, r.cell(p, sums[i]))))))));

  plans.forEach((p, i) => cards.append(h('article', { class: 'card' + (p.id === state.selectedId ? ' picked' : '') },
    h('div', { class: 'card-head' }, head(p), planActions(p)),
    h('dl', null, rows.map(r => h('div', { class: 'row' + (r.warn && r.warn(p, sums[i]) ? ' is-warn' : '') },
      h('dt', null, r.label), h('dd', null, r.cell(p, sums[i]))))))));
}

/* ---------- 二人の設定 ---------- */

function renderSettings() {
  const box = $('#settings');
  box.replaceChildren(...state.settings.people.map((p, i) => {
    const field = (label, key, type, ph) => h('label', null, label,
      h('input', { type: type || 'text', value: p[key], placeholder: ph, oninput: e => { p[key] = e.target.value; save(); renderCompare(); renderShare(); } }));
    return h('div', { class: 'person-set' }, h('div', { class: 'grid' },
      field('名前', 'name', 'text', i ? 'Bさん' : 'Aさん'),
      field('普段の駅', 'homeStation'),
      field('この時刻以降に出発したい', 'earliest', 'time'),
      field('この時刻までに帰りたい', 'latest', 'time')));
  }));
}

/* ---------- 案の操作 ---------- */

function pickPlan(id, scroll) {
  state.selectedId = id;
  save(); renderCompare(); renderShare();
  if (scroll) $('#hShare').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function duplicatePlan(id) {
  const idx = state.plans.findIndex(p => p.id === id);
  if (idx < 0) return;
  const copy = JSON.parse(JSON.stringify(state.plans[idx]));
  copy.id = uid();
  copy.name = (copy.name || '案') + '（コピー）';
  state.plans.splice(idx + 1, 0, copy);
  save(); renderAll();
  openEditor(copy.id);
}

function deletePlan(id) {
  const plan = state.plans.find(p => p.id === id);
  if (!plan || !confirm(`「${plan.name || '名前なし'}」を削除しますか？`)) return;
  state.plans = state.plans.filter(p => p.id !== id);
  if (state.selectedId === id) state.selectedId = state.plans[0] ? state.plans[0].id : '';
  save(); renderAll();
}

/* ---------- 編集ダイアログ ---------- */

const editor = $('#editor');
let editingId = null, isNew = false;

function memoRow(m = { time: '', text: '' }) {
  const row = h('div', { class: 'r memo' },
    h('input', { type: 'time', value: m.time, 'aria-label': '時刻' }),
    h('input', { type: 'text', value: m.text, placeholder: '例：昼食（駅前のそば屋）', 'aria-label': 'メモ' }),
    h('button', { type: 'button', class: 'small', 'aria-label': 'このメモを削除', onclick: () => row.remove() }, '削除'));
  return row;
}
function extraRow(x = { label: '', amount: null }) {
  const row = h('div', { class: 'r extra' },
    h('input', { type: 'text', value: x.label, placeholder: '例：レンタル用品', 'aria-label': '項目名' }),
    h('input', { type: 'number', min: '0', step: '1', inputmode: 'numeric', value: x.amount == null ? '' : x.amount, placeholder: '円（未入力）', 'aria-label': '金額（円）' }),
    h('button', { type: 'button', class: 'small', 'aria-label': 'この共通費を削除', onclick: () => row.remove() }, '削除'));
  return row;
}
const readMoney = v => { const t = String(v).trim(); return t === '' ? null : money(Number(t)); };

function openEditor(id, fresh) {
  const plan = fresh || state.plans.find(p => p.id === id);
  if (!plan) return;
  editingId = plan.id; isNew = !!fresh;
  $('#edTitle').textContent = isNew ? '新しい案' : '案を編集';
  editor.querySelectorAll('[data-k]').forEach(el => { el.value = plan[el.dataset.k]; });
  $('#edPeople').replaceChildren(...plan.people.map((p, i) => h('fieldset', null,
    h('legend', null, state.settings.people[i].name),
    h('div', { class: 'grid' },
      h('label', null, '出発駅', h('input', { 'data-p': i, 'data-pk': 'fromStation', value: p.fromStation })),
      h('label', null, '出発時刻', h('input', { type: 'time', 'data-p': i, 'data-pk': 'departTime', value: p.departTime })),
      h('label', null, '帰着駅', h('input', { 'data-p': i, 'data-pk': 'toStation', value: p.toStation })),
      h('label', null, '帰着時刻', h('input', { type: 'time', 'data-p': i, 'data-pk': 'returnTime', value: p.returnTime })),
      h('label', null, '往復の交通費（円）', h('input', { type: 'number', min: '0', step: '1', inputmode: 'numeric', placeholder: '未入力', 'data-p': i, 'data-pk': 'fare', value: p.fare == null ? '' : p.fare })),
      h('label', { class: 'wide' }, '乗換案内の検索結果URL', h('input', { type: 'url', inputmode: 'url', placeholder: 'https://…', 'data-p': i, 'data-pk': 'url', value: p.url }))))));
  $('#edCarUse').checked = plan.car.use;
  editor.querySelectorAll('[data-c]').forEach(el => { const v = plan.car[el.dataset.c]; el.value = v == null ? '' : v; });
  $('#edCar').hidden = !plan.car.use;
  $('#edExtras').replaceChildren(...plan.extras.map(extraRow));
  $('#edMemos').replaceChildren(...plan.memos.map(memoRow));
  editor.showModal();
  $('.ed-body').scrollTop = 0;
}

function readEditor() {
  const plan = { id: editingId, people: [{}, {}], car: { use: $('#edCarUse').checked } };
  editor.querySelectorAll('[data-k]').forEach(el => { plan[el.dataset.k] = el.value.trim(); });
  editor.querySelectorAll('[data-p]').forEach(el => {
    const k = el.dataset.pk;
    plan.people[+el.dataset.p][k] = k === 'fare' ? readMoney(el.value) : el.value.trim();
  });
  editor.querySelectorAll('[data-c]').forEach(el => {
    const k = el.dataset.c;
    plan.car[k] = ['fee', 'toll', 'parking'].includes(k) ? readMoney(el.value) : el.value.trim();
  });
  plan.extras = [...$('#edExtras').children].map(r => { const [l, a] = r.querySelectorAll('input'); return { label: l.value.trim(), amount: readMoney(a.value) }; })
    .filter(x => x.label || x.amount != null);
  plan.memos = [...$('#edMemos').children].map(r => { const [t, x] = r.querySelectorAll('input'); return { time: t.value, text: x.value.trim() }; })
    .filter(m => m.time || m.text);
  return normalizePlan(plan, state.settings);
}

$('#editorForm').addEventListener('submit', e => {
  e.preventDefault();
  const plan = readEditor();
  const idx = state.plans.findIndex(p => p.id === plan.id);
  if (idx >= 0) state.plans[idx] = plan; else state.plans.push(plan);
  if (!state.selectedId) state.selectedId = plan.id;
  save(); editor.close(); renderAll();
});
$('#edCancel').addEventListener('click', () => editor.close());
$('#edClose').addEventListener('click', () => editor.close());
$('#edCarUse').addEventListener('change', e => { $('#edCar').hidden = !e.target.checked; });
$('#edAddMemo').addEventListener('click', () => { const r = memoRow(); $('#edMemos').append(r); r.querySelector('input').focus(); });
$('#edAddExtra').addEventListener('click', () => { const r = extraRow(); $('#edExtras').append(r); r.querySelector('input').focus(); });

$('#btnNew').addEventListener('click', () => openEditor(null, blankPlan(state.settings)));
$('#btnReset').addEventListener('click', () => {
  if (!confirm('いまの案と設定をすべて消して、サンプルの3案に戻しますか？')) return;
  state = sampleState(); save(); renderAll();
});

/* ---------- 共有文 ---------- */

const TXT = {
  ja: {
    title: d => `【お出かけプラン】${d}`, date: '日付', meet: '集合', tbd: '未定', none: '未入力',
    go: (st, t) => `行き：${st} ${t}発`, back: (st, t) => `帰り：${st} ${t}着`, nextDay: '翌',
    itinerary: '当日の行程', evMeet: st => `${st}に集合`, evArrive: d => `${d}に到着`, evLeave: d => `${d}を出発`,
    evCarStart: pl => `カーシェア利用開始${pl ? `（${pl}）` : ''}`, evCarEnd: pl => `カーシェア返却${pl ? `（${pl}）` : ''}`,
    stay: s => `（現地滞在 ${s}）`, cost: '概算費用（二人分）', total: '合計', approx: n => `約${n}円`, yen: n => `${n}円`,
    prov: '※一部の費用が未入力のため暫定です', here: '現地',
  },
  zh: {
    title: d => `【出行计划】${d}`, date: '日期', meet: '集合', tbd: '待定', none: '未填',
    go: (st, t) => `去程：${st} ${t} 出发`, back: (st, t) => `回程：${st} ${t} 到达`, nextDay: '次日',
    itinerary: '当天行程', evMeet: st => `${st} 集合`, evArrive: d => `到达 ${d}`, evLeave: d => `从 ${d} 出发返回`,
    evCarStart: pl => `取车${pl ? `（${pl}）` : ''}`, evCarEnd: pl => `还车${pl ? `（${pl}）` : ''}`,
    stay: s => `（当地停留约 ${s}）`, cost: '预估费用（两人合计）', total: '合计', approx: n => `约${n}日元`, yen: n => `${n}日元`,
    prov: '※部分费用未填，合计为暂定', here: '目的地',
  },
};

function shareText(plan, lang) {
  const t = TXT[lang], s = summarize(plan), L = [];
  const tm = v => fmtTime(v) || t.tbd;
  L.push(t.title(plan.destination || t.tbd));
  L.push(`${t.date}：${fmtDate(plan.date, lang) || t.tbd}`);
  L.push(`${t.meet}：${[plan.meetStation, fmtTime(plan.meetTime)].filter(Boolean).join(' ') || t.tbd}`);

  plan.people.forEach((p, i) => {
    L.push('', `▼ ${state.settings.people[i].name}`);
    L.push(t.go(p.fromStation || t.tbd, tm(p.departTime)));
    L.push(t.back(p.toStation || t.tbd, (s.people[i].overnight ? t.nextDay : '') + tm(p.returnTime)));
  });

  const dest = plan.destination || t.here;
  const ev = [];
  const add = (time, text, order) => { const m = toMin(time); if (m != null) ev.push({ m, text, order }); };
  add(plan.meetTime, t.evMeet(plan.meetStation || t.tbd), 0);
  if (plan.car.use) add(plan.car.start, t.evCarStart(plan.car.place), 1);
  add(plan.arriveTime, t.evArrive(dest), 2);
  sortedMemos(plan).forEach(m => { if (m.text) add(m.time, m.text, 3); });
  add(plan.leaveTime, t.evLeave(dest), 4);
  if (plan.car.use) add(plan.car.end, t.evCarEnd(plan.car.place), 5);
  ev.sort((a, b) => a.m - b.m || a.order - b.order);
  const untimed = plan.memos.filter(m => m.text && toMin(m.time) == null);
  L.push('', `▼ ${t.itinerary}`);
  ev.forEach(e => L.push(`${Math.floor(e.m / 60)}:${String(e.m % 60).padStart(2, '0')} ${e.text}`));
  untimed.forEach(m => L.push(`・${m.text}`));
  if (!ev.length && !untimed.length) L.push(t.tbd);
  if (s.stay != null) L.push(t.stay(fmtDur(s.stay, lang)));

  L.push('', `▼ ${t.cost}`);
  s.items.forEach(x => L.push(`${costLabel(x, lang)}：${x.value == null ? t.none : t.yen(yen(x.value))}`));
  L.push(`${t.total}：${s.costState === 'empty' ? t.none : t.approx(yen(s.total))}`);
  if (s.costState === 'provisional') L.push(t.prov);
  return L.join('\n');
}

function renderShare() {
  const sel = $('#sharePlan');
  if (!state.plans.some(p => p.id === state.selectedId)) state.selectedId = state.plans[0] ? state.plans[0].id : '';
  sel.replaceChildren(...state.plans.map(p => h('option', { value: p.id }, [p.name || '（名前なし）', fmtDate(p.date), p.destination].filter(Boolean).join(' ／ '))));
  sel.value = state.selectedId;
  sel.disabled = !state.plans.length;
  document.querySelectorAll('.seg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === state.lang)));
  const plan = state.plans.find(p => p.id === state.selectedId);
  const ta = $('#shareText');
  ta.value = plan ? shareText(plan, state.lang) : '';
  ta.lang = state.lang === 'zh' ? 'zh-Hans' : 'ja';
  $('#btnCopy').disabled = !plan;
  $('#copyMsg').textContent = '';
}

$('#sharePlan').addEventListener('change', e => pickPlan(e.target.value));
document.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => { state.lang = b.dataset.lang; save(); renderShare(); }));

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    const ta = $('#shareText');
    ta.focus(); ta.select(); ta.setSelectionRange(0, text.length);
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
    return ok;
  }
}
$('#btnCopy').addEventListener('click', async () => {
  const ok = await copyText($('#shareText').value);
  const msg = $('#copyMsg');
  msg.textContent = ok ? 'コピーしました。WeChatに貼り付けてください。' : 'コピーできませんでした。文章を長押し／選択してコピーしてください。';
  clearTimeout(copyText.timer);
  copyText.timer = setTimeout(() => { msg.textContent = ''; }, 4000);
});

/* ---------- 起動 ---------- */

function renderAll() { renderCompare(); renderShare(); }
renderSettings();
renderAll();
save();
if (saveFailed) $('.note').textContent += '（このブラウザでは保存が無効になっているため、閉じると入力内容は消えます）';
