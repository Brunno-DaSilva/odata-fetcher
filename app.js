let allData = [];
let cols = [];

(function setDefaults() {
  const now = new Date();
  now.setSeconds(0, 0);
  const yesterday = new Date(now - 86400000);
  document.getElementById("toDate").value = now.toISOString().slice(0, 16);
  document.getElementById("fromDate").value = yesterday
    .toISOString()
    .slice(0, 16);
})();

function updateHint() {
  const ep = document.getElementById("endpoint").value;
  const hints = {
    "/Analytics":
      "Returns turn-by-turn analytics records. Each row = one conversation turn. Fields include inputText, outputText, intent, rating, custom1–5.",
    "/Sessions":
      "Returns one record per session. Useful for session-level aggregates: duration, turn count, completion status.",
    "/Conversations":
      "Returns full conversation transcripts. Each record contains the complete message history for a session.",
  };
  document.getElementById("endpointHint").textContent = hints[ep] || "";
}

function buildUrl() {
  const base = document
    .getElementById("baseUrl")
    .value.trim()
    .replace(/\/$/, "");
  const endpoint = document.getElementById("endpoint").value;
  const key = document.getElementById("apiKey").value.trim();
  const proj = document.getElementById("projectId").value.trim();
  const field =
    document.getElementById("dateField").value.trim() || "timestamp";
  const from = document.getElementById("fromDate").value;
  const to = document.getElementById("toDate").value;
  const fromISO = from ? new Date(from).toISOString() : "";
  const toISO = to ? new Date(to).toISOString() : "";
  let filter = `projectId eq '${proj}'`;
  if (fromISO) filter += ` and ${field} ge '${fromISO}'`;
  if (toISO) filter += ` and ${field} le '${toISO}'`;
  return `${base}${endpoint}/?$filter=${encodeURIComponent(filter)}&apikey=${key}`;
}

function toggleUrlPreview() {
  const el = document.getElementById("urlPreview");
  const visible = el.style.display === "block";
  el.style.display = visible ? "none" : "block";
  if (!visible) {
    document.getElementById("urlText").textContent = buildUrl();
    document.getElementById("copyBtn").className = "copy-btn";
    document.getElementById("copyBtn").innerHTML = "&#128203; Copy";
  }
}

function copyUrl() {
  const url = buildUrl();
  navigator.clipboard.writeText(url).then(() => {
    const btn = document.getElementById("copyBtn");
    btn.classList.add("copied");
    btn.innerHTML = "&#10003; Copied!";
    setTimeout(() => {
      btn.classList.remove("copied");
      btn.innerHTML = "&#128203; Copy";
    }, 2000);
  });
}

async function fetchData() {
  const btn = document.getElementById("fetchBtn");
  const icon = document.getElementById("fetchIcon");
  const errBox = document.getElementById("errorBox");
  const results = document.getElementById("results");

  errBox.style.display = "none";
  results.style.display = "none";
  btn.disabled = true;
  icon.innerHTML = '<span class="spinner"></span>';

  try {
    const url = buildUrl();
    const res = await fetch(url);
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      if (res.status === 401)
        msg += " — Unauthorized. Please check your API key.";
      else if (res.status === 403)
        msg += " — Forbidden. Check your Project ID and permissions.";
      else if (res.status === 404) msg += " — Not found. Check your Base URL.";
      else if (res.status === 500) msg += " — Server error. Try again later.";
      throw new Error(msg);
    }
    const json = await res.json();
    allData = json.value || (Array.isArray(json) ? json : []);
    if (!allData.length) {
      errBox.textContent =
        "No records found for the selected filters. Try widening your date range.";
      errBox.style.display = "block";
    } else {
      cols = Object.keys(allData[0]);
      renderMetrics();
      renderTable();
      results.style.display = "block";
    }
  } catch (e) {
    errBox.textContent = "Error: " + e.message;
    errBox.style.display = "block";
  } finally {
    btn.disabled = false;
    icon.textContent = "\u2B07";
  }
}

function renderMetrics() {
  const box = document.getElementById("metrics");
  const total = allData.length;
  const sessions = new Set(
    allData.map((r) => r.sessionId || r.session_id || r.SessionId),
  ).size;
  const users = new Set(allData.map((r) => r.userId || r.user_id || r.UserId))
    .size;
  const flows = new Set(
    allData.map((r) => r.flowId || r.flow_id || r.FlowId || r.flowName),
  ).size;

  const m = [
    { num: total.toLocaleString(), lbl: "Total records" },
    {
      num: sessions > 1 ? sessions.toLocaleString() : "—",
      lbl: "Unique sessions",
    },
    { num: users > 1 ? users.toLocaleString() : "—", lbl: "Unique users" },
    { num: flows > 1 ? flows.toLocaleString() : "—", lbl: "Unique flows" },
  ];
  box.innerHTML = m
    .map(
      (x) => `
      <div class="metric">
        <div class="num">${x.num}</div>
        <div class="lbl">${x.lbl}</div>
      </div>`,
    )
    .join("");
}

function renderTable() {
  const q = document.getElementById("searchBox").value.toLowerCase();
  const filtered = q
    ? allData.filter((r) =>
        Object.values(r).some((v) => String(v).toLowerCase().includes(q)),
      )
    : allData;

  document.getElementById("countLabel").textContent =
    `${filtered.length.toLocaleString()} of ${allData.length.toLocaleString()} rows`;

  const priority = [
    "timestamp",
    "sessionId",
    "userId",
    "channel",
    "flowName",
    "intentName",
    "state",
    "inputText",
    "outputText",
    "rating",
    "custom1",
    "custom2",
    "custom3",
  ];
  const shown = [
    ...priority.filter((c) => cols.includes(c)),
    ...cols.filter((c) => !priority.includes(c)),
  ].slice(0, 14);

  const nice = (c) =>
    c
      .replace(/([A-Z])/g, " $1")
      .replace(/_/g, " ")
      .trim()
      .toLowerCase()
      .replace(/^\w/, (x) => x.toUpperCase());

  if (!filtered.length) {
    document.getElementById("tableContainer").innerHTML =
      '<div class="empty">No records match your search.</div>';
    return;
  }

  let html =
    "<table><thead><tr>" +
    shown.map((c) => `<th>${nice(c)}</th>`).join("") +
    "</tr></thead><tbody>";

  const slice = filtered.slice(0, 500);
  for (const row of slice) {
    html +=
      "<tr>" +
      shown
        .map((c) => {
          const v = row[c];
          if (v === null || v === undefined || v === "") {
            return `<td style="color:#bbb;">—</td>`;
          }
          if (
            c === "timestamp" ||
            (typeof v === "string" && /\d{4}-\d{2}-\d{2}T/.test(v))
          ) {
            return `<td>${new Date(v).toLocaleString()}</td>`;
          }
          if (c === "rating" && v != null) {
            const cls =
              v >= 4 ? "badge-ok" : v >= 2 ? "badge-warn" : "badge-err";
            return `<td><span class="badge ${cls}">${v}</span></td>`;
          }
          if (typeof v === "boolean") {
            return `<td><span class="badge ${v ? "badge-ok" : "badge-err"}">${v}</span></td>`;
          }
          const str = typeof v === "object" ? JSON.stringify(v) : String(v);
          return `<td title="${str.replace(/"/g, "&quot;")}">${str.length > 90 ? str.slice(0, 90) + "…" : str}</td>`;
        })
        .join("") +
      "</tr>";
  }

  if (filtered.length > 500) {
    html += `<tr><td colspan="${shown.length}" style="text-align:center;color:#aaa;font-size:12px;padding:14px;">
        Showing first 500 of ${filtered.length.toLocaleString()} rows — use search to narrow results.
      </td></tr>`;
  }
  html += "</tbody></table>";
  document.getElementById("tableContainer").innerHTML = html;
}

function exportXLSX() {
  if (!allData.length) return;

  const ws = XLSX.utils.json_to_sheet(allData);

  // Auto-size columns based on content
  const colWidths = cols.map((c) => {
    const maxLen = Math.max(
      c.length,
      ...allData.slice(0, 100).map((r) => {
        const v = r[c];
        return v === null || v === undefined ? 0 : String(v).length;
      }),
    );
    return { wch: Math.min(maxLen + 2, 60) };
  });
  ws["!cols"] = colWidths;

  // Style the header row bold
  const range = XLSX.utils.decode_range(ws["!ref"]);
  for (let C = range.s.c; C <= range.e.c; C++) {
    const cellAddr = XLSX.utils.encode_cell({ r: 0, c: C });
    if (!ws[cellAddr]) continue;
    ws[cellAddr].s = { font: { bold: true } };
  }

  const wb = XLSX.utils.book_new();
  const ep = document
    .getElementById("endpoint")
    .value.replace("/", "")
    .toLowerCase();
  XLSX.utils.book_append_sheet(wb, ws, ep || "Data");

  XLSX.writeFile(wb, `cognigy-${ep}.xlsx`);
}
