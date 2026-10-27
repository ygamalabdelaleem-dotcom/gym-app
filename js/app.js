// منطق التطبيق: البروفايل، توليد البرنامج، الأدوات، السجل، المدرب

const $ = (s) => document.querySelector(s);
const DAY_NAMES = ["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"];

const store = {
  get(key, def) {
    try { return JSON.parse(localStorage.getItem(key)) ?? def; } catch { return def; }
  },
  set(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  }
};

// ---------- التنقل بين التبويبات ----------
function showTab(id) {
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.id === id));
  document.querySelectorAll("nav button").forEach((b) => b.classList.toggle("active", b.dataset.tab === id));
  store.set("tab", id);
}

// ---------- حسابات ----------
function maxHR(age) { return Math.round(208 - 0.7 * age); } // معادلة Tanaka

function zoneRange(z, age, rest) {
  const mx = maxHR(age);
  const zone = HR_ZONES[z - 1];
  if (rest) { // Karvonen
    const r = mx - rest;
    return [Math.round(rest + r * zone.lo), Math.round(rest + r * zone.hi)];
  }
  return [Math.round(mx * zone.lo), Math.round(mx * zone.hi)];
}

function calories(p) {
  const bmr = 10 * p.weight + 6.25 * p.height - 5 * p.age + (p.sex === "m" ? 5 : -161);
  const factor = { 3: 1.45, 4: 1.55, 5: 1.65, 6: 1.75 }[p.days] || 1.5;
  const tdee = Math.round(bmr * factor);
  const target = { fat_loss: tdee - 450, muscle: tdee + 250 }[p.goal] ?? tdee;
  const protein = Math.round(p.weight * (p.goal === "endurance" ? 1.5 : 1.8));
  return { bmr: Math.round(bmr), tdee, target, protein };
}

// ---------- توليد البرنامج ----------
const SPLITS = {
  3: [["full", "فول بادي A"], ["full", "فول بادي B"], ["full", "فول بادي C"]],
  4: [["upper", "جزء علوي"], ["lower", "جزء سفلي"], ["upper", "جزء علوي"], ["lower", "جزء سفلي"]],
  5: [["push", "دفع (صدر/كتف/ترايسبس)"], ["pull", "سحب (ظهر/بايسبس)"], ["lower", "رجل وبطن"], ["upper", "جزء علوي"], ["lower", "رجل وبطن"]],
  6: [["push", "دفع"], ["pull", "سحب"], ["lower", "رجل"], ["push", "دفع"], ["pull", "سحب"], ["lower", "رجل"]]
};

const SPLIT_MUSCLES = {
  full: ["legs", "chest", "back", "shoulders", "core"],
  upper: ["chest", "back", "shoulders", "arms"],
  lower: ["legs", "legs", "core"],
  push: ["chest", "chest", "shoulders", "arms"],
  pull: ["back", "back", "arms", "core"]
};

// أيام التمرين موزعة على الأسبوع (index في DAY_NAMES)
const DAY_SLOTS = {
  3: [0, 2, 4],
  4: [0, 1, 3, 4],
  5: [0, 1, 2, 4, 5],
  6: [0, 1, 2, 3, 4, 5]
};

const SCHEME = {
  muscle: { sets: "4", reps: "8-12", rest: "90 ث" },
  fat_loss: { sets: "3", reps: "10-15", rest: "60 ث" },
  endurance: { sets: "2-3", reps: "12-20", rest: "45 ث" },
  fitness: { sets: "3", reps: "8-12", rest: "75 ث" }
};

function pickExercises(muscles, p, seed) {
  const used = new Set();
  return muscles.map((m, i) => {
    const pool = EXERCISES[m].items.filter(
      (e) => e.level <= p.level && (p.place === "gym" || e.equip === "home")
    );
    const list = pool.length ? pool : EXERCISES[m].items.filter((e) => e.equip === "home");
    let idx = (seed + i) % list.length;
    for (let k = 0; k < list.length && used.has(list[idx].name); k++) idx = (idx + 1) % list.length;
    if (used.has(list[idx].name)) return null; // مفيش تمرين جديد متاح للعضلة دي
    used.add(list[idx].name);
    return { ...list[idx], muscle: EXERCISES[m].name };
  }).filter(Boolean);
}

function cardioFor(p, dayIdx, isStrength) {
  const g = p.goal;
  if (g === "endurance") {
    // برنامج جري: خفيف، انترفال، تمبو، طويل
    const runOrder = ["easy", "intervals", "easy", "tempo", "recovery", "long"];
    const run = RUN_TYPES.find((r) => r.id === runOrder[dayIdx % runOrder.length]);
    return { title: run.name, detail: run.example, zone: run.zone };
  }
  if (!isStrength) return null;
  if (g === "fat_loss") {
    return dayIdx % 2 === 0
      ? { title: "LISS بعد الحديد", detail: "25-30 د مشي بميل أو عجلة", zone: 2 }
      : { title: "HIIT بعد الحديد", detail: "10 × (20 ث سريع / 40 ث بطيء)", zone: 5 };
  }
  if (g === "muscle") {
    return dayIdx % 2 === 0 ? { title: "كارديو خفيف", detail: "15-20 د زون 2", zone: 2 } : null;
  }
  return dayIdx % 2 === 0
    ? { title: "جري خفيف", detail: "20-25 د سرعة مريحة", zone: 2 }
    : { title: "فارتلك", detail: "20 د: 2 د خفيف / 1 د سريع", zone: 3 };
}

function buildPlan(p) {
  const split = SPLITS[p.days];
  const slots = DAY_SLOTS[p.days];
  const scheme = SCHEME[p.goal];
  const week = DAY_NAMES.map((d) => ({ day: d, rest: true }));

  split.forEach(([type, title], i) => {
    const exercises = pickExercises(SPLIT_MUSCLES[type], p, i * 2);
    // المبتدئ ياخد تمارين أقل
    const ex = p.level === 0 ? exercises.slice(0, 4) : exercises;
    // في هدف التحمل: يوم حديد خفيف + جري
    week[slots[i]] = {
      day: DAY_NAMES[slots[i]], rest: false, title, scheme,
      exercises: ex, cardio: cardioFor(p, i, true)
    };
  });

  // في هدف التحمل/اللياقة نضيف جري طويل في يوم راحة
  if (p.goal === "endurance" || p.goal === "fat_loss") {
    const free = week.findIndex((d, i) => d.rest && i !== 6);
    if (free !== -1 && p.days < 6) {
      const long = p.goal === "endurance" ? RUN_TYPES.find((r) => r.id === "long") : null;
      week[free] = {
        day: DAY_NAMES[free], rest: false, title: "كارديو فقط", exercises: [],
        cardio: long
          ? { title: long.name, detail: long.example, zone: 2 }
          : { title: "LISS طويل", detail: "40-50 د مشي سريع / عجلة", zone: 2 }
      };
    }
  }
  return week;
}

// ---------- العرض ----------
const GOAL_NAMES = { fat_loss: "خسارة دهون", muscle: "بناء عضل", endurance: "تحمّل وجري", fitness: "لياقة عامة" };

function renderPlan() {
  const p = store.get("profile");
  const out = $("#plan-output");
  if (!p) { out.innerHTML = `<p class="muted">املأ بياناتك فوق واضغط "اعمل البرنامج".</p>`; return; }

  const c = calories(p);
  const week = buildPlan(p);
  const z2 = zoneRange(2, p.age, p.rest);

  out.innerHTML = `
    <div class="card summary">
      <h3>ملخص — ${GOAL_NAMES[p.goal]}</h3>
      <div class="stats">
        <div><b>${c.target}</b><span>سعر/يوم</span></div>
        <div><b>${c.protein} جم</b><span>بروتين</span></div>
        <div><b>${z2[0]}-${z2[1]}</b><span>نبض زون 2</span></div>
        <div><b>${(p.weight / (p.height / 100) ** 2).toFixed(1)}</b><span>BMI</span></div>
      </div>
    </div>
    ${week.map(dayCard).join("")}
  `;
}

function dayCard(d) {
  if (d.rest) return `<div class="card day rest"><h4>${d.day}</h4><p>راحة 😴 — مشي خفيف وإطالات اختياري</p></div>`;
  const ex = d.exercises.map((e) => `
    <li>
      <details>
        <summary><span>${e.name}</span><small>${d.scheme ? `${d.scheme.sets} × ${d.scheme.reps}` : ""}</small></summary>
        <p>${e.how}</p><p class="muted">العضلة: ${e.muscle} — راحة ${d.scheme ? d.scheme.rest : ""}</p>
      </details>
    </li>`).join("");
  const cardio = d.cardio
    ? `<div class="cardio"><b>🏃 ${d.cardio.title}</b> <span class="zone z${d.cardio.zone}">زون ${d.cardio.zone}</span><br><small>${d.cardio.detail}</small></div>`
    : "";
  return `
    <div class="card day">
      <h4>${d.day} <span class="tag">${d.title}</span></h4>
      ${ex ? `<ul class="ex-list">${ex}</ul>` : ""}
      ${cardio}
    </div>`;
}

function renderLibrary() {
  const filter = $("#lib-filter").value;
  $("#lib-output").innerHTML = Object.entries(EXERCISES)
    .filter(([k]) => filter === "all" || filter === k)
    .map(([, g]) => `
      <div class="card">
        <h3>${g.name}</h3>
        <ul class="ex-list">${g.items.map((e) => `
          <li><details>
            <summary><span>${e.name}</span><small>${e.equip === "home" ? "🏠 بيت" : "🏋️ جيم"} · ${["مبتدئ", "متوسط", "متقدم"][e.level]}</small></summary>
            <p>${e.how}</p>
          </details></li>`).join("")}
        </ul>
      </div>`).join("");
}

function renderRunning() {
  $("#run-output").innerHTML = `
    <div class="card"><h3>أنواع الجري</h3>
      ${RUN_TYPES.map((r) => `
        <details class="run">
          <summary><span>${r.name}</span><span class="zone z${r.zone}">زون ${r.zone}</span></summary>
          <p>${r.desc}</p>
          <p><b>مثال:</b> ${r.example}</p>
          <p class="tip">💡 ${r.tip}</p>
        </details>`).join("")}
    </div>
    <div class="card"><h3>أنواع الكارديو</h3>
      ${CARDIO_TYPES.map((c) => `<details class="run"><summary><span>${c.name}</span></summary><p>${c.desc}</p></details>`).join("")}
    </div>
    <div class="card"><h3>برنامج مبتدئ: من الصفر لـ 5 كم (8 أسابيع)</h3>
      <table>
        <tr><th>الأسبوع</th><th>التمرين (3 مرات/أسبوع)</th></tr>
        <tr><td>1</td><td>8 × (1 د جري / 1.5 د مشي)</td></tr>
        <tr><td>2</td><td>6 × (2 د جري / 1 د مشي)</td></tr>
        <tr><td>3</td><td>5 × (3 د جري / 1 د مشي)</td></tr>
        <tr><td>4</td><td>4 × (5 د جري / 1 د مشي)</td></tr>
        <tr><td>5</td><td>3 × (8 د جري / 1 د مشي)</td></tr>
        <tr><td>6</td><td>2 × (12 د جري / 1 د مشي)</td></tr>
        <tr><td>7</td><td>25 د جري متواصل</td></tr>
        <tr><td>8</td><td>30 د جري / 5 كم 🎉</td></tr>
      </table>
    </div>`;
}

function renderZones() {
  const age = +$("#hr-age").value;
  const rest = +$("#hr-rest").value || 0;
  if (!age) { $("#hr-output").innerHTML = ""; return; }
  $("#hr-output").innerHTML = `
    <p>أقصى نبض تقريبي: <b>${maxHR(age)}</b> ${rest ? "(معادلة Karvonen)" : ""}</p>
    <table>
      <tr><th>الزون</th><th>النبض</th><th>الإحساس</th></tr>
      ${HR_ZONES.map((z) => {
        const [lo, hi] = zoneRange(z.z, age, rest);
        return `<tr><td><span class="zone z${z.z}">${z.z}</span> ${z.name}</td><td>${lo}-${hi}</td><td>${z.feel}</td></tr>`;
      }).join("")}
    </table>`;
}

function fmtPace(secPerKm) {
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function renderPace() {
  const km = +$("#pace-km").value;
  const min = +$("#pace-min").value + (+$("#pace-sec").value || 0) / 60;
  if (!km || !min) { $("#pace-output").innerHTML = ""; return; }
  const pace = (min * 60) / km;
  const speed = km / (min / 60);
  // توقع أزمنة سباقات بمعادلة Riegel
  const predict = (d) => {
    const t = min * 60 * (d / km) ** 1.06;
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = Math.round(t % 60);
    return `${h ? h + ":" : ""}${String(m).padStart(h ? 2 : 1, "0")}:${String(s).padStart(2, "0")}`;
  };
  $("#pace-output").innerHTML = `
    <p>الـ Pace: <b>${fmtPace(pace)}</b> د/كم — السرعة: <b>${speed.toFixed(1)}</b> كم/س</p>
    <p class="muted">توقع أزمنتك:</p>
    <table>
      <tr><th>5 كم</th><th>10 كم</th><th>21 كم</th><th>42 كم</th></tr>
      <tr><td>${predict(5)}</td><td>${predict(10)}</td><td>${predict(21.1)}</td><td>${predict(42.2)}</td></tr>
    </table>
    <p class="muted">سرعة الجري الخفيف المقترحة: ${fmtPace(pace * 1.25)} - ${fmtPace(pace * 1.35)} د/كم</p>`;
}

// ---------- السجل ----------
function renderLog() {
  const log = store.get("log", []);
  const week = log.filter((l) => Date.now() - new Date(l.date).getTime() < 7 * 864e5);
  const totalMin = week.reduce((a, l) => a + (+l.min || 0), 0);
  const totalKm = week.reduce((a, l) => a + (+l.km || 0), 0);
  $("#log-stats").innerHTML = `
    <div class="stats">
      <div><b>${week.length}</b><span>تمرين الأسبوع ده</span></div>
      <div><b>${totalMin}</b><span>دقيقة</span></div>
      <div><b>${totalKm.toFixed(1)}</b><span>كم جري</span></div>
    </div>`;
  $("#log-list").innerHTML = log.length
    ? log.slice().reverse().map((l, i) => `
      <li><b>${l.date}</b> — ${l.type}${l.min ? ` · ${l.min} د` : ""}${l.km ? ` · ${l.km} كم` : ""}
        ${l.note ? `<br><small>${escapeHtml(l.note)}</small>` : ""}
        <button class="del" data-i="${log.length - 1 - i}" aria-label="حذف">✕</button></li>`).join("")
    : `<p class="muted">لسه مفيش تمارين مسجلة.</p>`;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------- اسأل المدرب ----------
function askCoach(q) {
  const box = $("#chat");
  box.insertAdjacentHTML("beforeend", `<div class="msg me">${escapeHtml(q)}</div>`);
  const hits = COACH_TIPS.filter((t) => t.keys.some((k) => q.includes(k)));
  const answer = hits.length
    ? hits.map((h) => h.answer).join("<br><br>")
    : "مش فاهم السؤال كويس 🤔 جرّب تسأل عن: التخسيس، العضل، الجري، الإحماء، الأكل، النوم، النبض، أو الإصابات.";
  box.insertAdjacentHTML("beforeend", `<div class="msg coach">${answer}</div>`);
  box.scrollTop = box.scrollHeight;
}

// ---------- التشغيل ----------
function init() {
  document.querySelectorAll("nav button").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
  showTab(store.get("tab", "plan"));

  const form = $("#profile-form");
  const p = store.get("profile");
  if (p) Object.entries(p).forEach(([k, v]) => { if (form.elements[k]) form.elements[k].value = v; });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = form.elements;
    const profile = {
      age: +f.age.value, weight: +f.weight.value, height: +f.height.value, sex: f.sex.value,
      goal: f.goal.value, level: +f.level.value, days: +f.days.value, place: f.place.value,
      rest: +f.rest.value || 0
    };
    store.set("profile", profile);
    $("#hr-age").value = profile.age;
    if (profile.rest) $("#hr-rest").value = profile.rest;
    renderPlan(); renderZones();
    $("#plan-output").scrollIntoView({ behavior: "smooth" });
  });

  if (p) { $("#hr-age").value = p.age; if (p.rest) $("#hr-rest").value = p.rest; }

  $("#lib-filter").addEventListener("change", renderLibrary);
  ["#hr-age", "#hr-rest"].forEach((s) => $(s).addEventListener("input", renderZones));
  ["#pace-km", "#pace-min", "#pace-sec"].forEach((s) => $(s).addEventListener("input", renderPace));

  $("#log-form").date.value = new Date().toISOString().slice(0, 10);
  $("#log-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target.elements;
    const log = store.get("log", []);
    log.push({ date: f.date.value, type: f.type.value, min: f.min.value, km: f.km.value, note: f.note.value.trim() });
    store.set("log", log);
    f.min.value = f.km.value = f.note.value = "";
    renderLog();
  });
  $("#log-list").addEventListener("click", (e) => {
    if (!e.target.classList.contains("del")) return;
    const log = store.get("log", []);
    log.splice(+e.target.dataset.i, 1);
    store.set("log", log);
    renderLog();
  });

  $("#chat-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const q = e.target.q.value.trim();
    if (q) askCoach(q);
    e.target.q.value = "";
  });
  document.querySelectorAll(".quick button").forEach((b) => b.addEventListener("click", () => askCoach(b.textContent)));

  renderPlan(); renderLibrary(); renderRunning(); renderZones(); renderLog();
}

document.addEventListener("DOMContentLoaded", init);
