// ---------- Settings ----------
const CATEGORIES = ["Food & drink", "Transport", "Lodging", "Shopping", "Work & software", "Other"];
const COLORS = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)", "var(--c5)", "var(--c6)"];

// Rough rates, used only if the API fails and nothing is saved yet
const FALLBACK = { USD: 1, EUR: 0.92, GBP: 0.78, JPY: 150, KES: 129, INR: 83, CAD: 1.36, AUD: 1.52, CHF: 0.88 };

// ---------- State (saved in the browser) ----------
let expenses = JSON.parse(localStorage.getItem("expenses") || "[]");
let home = localStorage.getItem("home") || "USD";
let rates = JSON.parse(localStorage.getItem("rates") || "null") || { values: FALLBACK, note: "Built-in estimates" };

// ---------- Shortcuts ----------
const $ = (id) => document.getElementById(id);

function money(amount, currency) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
  } catch {
    return amount.toFixed(2) + " " + currency;
  }
}

function convert(amount, from, to) {
  if (from === to) return amount;
  const r = rates.values;
  if (!r[from] || !r[to]) return null;
  return (amount / r[from]) * r[to]; // go through USD
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function save() {
  localStorage.setItem("expenses", JSON.stringify(expenses));
  localStorage.setItem("home", home);
}

// ---------- Exchange rates (free API, no key needed) ----------
async function loadRates() {
  $("status").textContent = "Fetching live rates…";
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD");
    const data = await res.json();
    if (data.result !== "success") throw new Error("Bad response");
    rates = { values: data.rates, note: "Live rates, updated " + new Date(data.time_last_update_unix * 1000).toLocaleString() };
    localStorage.setItem("rates", JSON.stringify(rates));
  } catch {
    rates.note = rates.note + " (couldn't reach the rate service)";
  }
  fillCurrencyMenus();
  render();
}

// ---------- Dropdowns ----------
function fillCurrencyMenus() {
  const codes = Object.keys(rates.values).sort();
  const currentCur = $("cur").value || "EUR";
  const options = codes.map((c) => `<option value="${c}">${c}</option>`).join("");
  $("cur").innerHTML = options;
  $("home").innerHTML = options;
  $("cur").value = codes.includes(currentCur) ? currentCur : "USD";
  $("home").value = codes.includes(home) ? home : "USD";
}

// ---------- Rendering ----------
function renderPreview() {
  const amount = parseFloat($("amount").value);
  const cur = $("cur").value;
  if (!(amount > 0)) {
    $("preview").innerHTML = `<div class="from">Enter an amount to see it in ${home}.</div>`;
    return;
  }
  const converted = convert(amount, cur, home);
  $("preview").innerHTML =
    `<div class="from">${money(amount, cur)} is about</div>` +
    `<div class="to">${converted === null ? "No rate" : money(converted, home)}</div>`;
}

function renderSummary() {
  let total = 0;
  const byCat = {};

  expenses.forEach((x) => {
    const c = convert(x.amount, x.cur, home);
    if (c === null) return;
    total += c;
    byCat[x.cat] = (byCat[x.cat] || 0) + c;
  });

  $("total").textContent = money(total, home);
  $("count").textContent = expenses.length ? expenses.length + " expense(s)" : "";

  $("bar").innerHTML = "";
  $("legend").innerHTML = "";
  CATEGORIES.forEach((cat, i) => {
    if (!byCat[cat]) return;
    const pct = (byCat[cat] / total) * 100;
    $("bar").innerHTML += `<span style="width:${pct}%; background:${COLORS[i]}" title="${cat}"></span>`;
    $("legend").innerHTML +=
      `<li><span class="sw" style="background:${COLORS[i]}"></span>${cat}` +
      `<span class="amt">${money(byCat[cat], home)} (${Math.round(pct)}%)</span></li>`;
  });
}

function renderList() {
  const list = $("ledger");

  if (expenses.length === 0) {
    list.innerHTML =
      `<li class="empty"><strong>No expenses yet</strong>Add your first purchase on the left.</li>`;
    return;
  }

  // newest first
  const sorted = [...expenses].sort((a, b) => (a.date < b.date ? 1 : -1));

  list.innerHTML = "";
  sorted.forEach((x) => {
    const converted = convert(x.amount, x.cur, home);
    const li = document.createElement("li");
    li.className = "entry";
    li.innerHTML = `
      <div class="date">${x.date.slice(5)}</div>
      <div class="main">
        <div class="desc"></div>
        <div class="cat">${x.cat}</div>
      </div>
      <div class="orig ${x.cur === home ? "same" : ""}">${money(x.amount, x.cur)}</div>
      <div class="conv">${converted === null ? "No rate" : money(converted, home)}</div>
      <button class="del" aria-label="Delete">×</button>`;
    li.querySelector(".desc").textContent = x.desc; // textContent keeps user text safe
    li.querySelector(".del").onclick = () => removeExpense(x.id);
    list.appendChild(li);
  });
}

function render() {
  $("status").textContent = rates.note;
  renderPreview();
  renderSummary();
  renderList();
}

// ---------- Actions ----------
function addExpense() {
  const desc = $("desc").value.trim();
  const amount = parseFloat($("amount").value);

  if (!desc) { $("err").textContent = "Add a short description."; return; }
  if (!(amount > 0)) { $("err").textContent = "Enter an amount greater than zero."; return; }
  $("err").textContent = "";

  expenses.push({
    id: Date.now(),
    desc,
    amount,
    cur: $("cur").value,
    cat: $("cat").value,
    date: $("date").value || today(),
  });
  save();

  $("desc").value = "";
  $("amount").value = "";
  render();
}

function removeExpense(id) {
  expenses = expenses.filter((x) => x.id !== id);
  save();
  render();
}

function exportCSV() {
  const rows = [["Date", "Description", "Category", "Amount", "Currency", "Converted", "Home"]];
  expenses.forEach((x) => {
    const c = convert(x.amount, x.cur, home);
    rows.push([x.date, `"${x.desc.replace(/"/g, '""')}"`, x.cat, x.amount, x.cur, c === null ? "" : c.toFixed(2), home]);
  });
  const blob = new Blob([rows.map((r) => r.join(",")).join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "expenses.csv";
  a.click();
}

// ---------- Start ----------
$("cat").innerHTML = CATEGORIES.map((c) => `<option>${c}</option>`).join("");
$("date").value = today();

$("add").onclick = addExpense;
$("amount").oninput = renderPreview;
$("cur").onchange = renderPreview;
$("home").onchange = () => { home = $("home").value; save(); render(); };
$("refresh").onclick = loadRates;
$("export").onclick = exportCSV;

fillCurrencyMenus();
render();
loadRates();
