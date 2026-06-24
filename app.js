const storageKey = "welfare-journal-prototype";

const state = loadState();
let selectedClientId = state.clients[0]?.id ?? null;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function loadState() {
  const saved = localStorage.getItem(storageKey);
  if (saved) return JSON.parse(saved);

  return {
    clients: [
      {
        id: crypto.randomUUID(),
        name: "김민수",
        birthDate: "1954-03-12",
        phone: "010-0000-0000",
        address: "서울시",
        status: "진행",
        tags: "독거, 식사지원",
        memo: "식사와 정서 지원 중심으로 관찰 중",
        createdAt: new Date().toISOString(),
      },
    ],
    journals: [],
    settings: {
      apiKey: "",
      modelName: "gemini-2.5-flash",
    },
  };
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function setView(viewId) {
  $$(".view").forEach((view) => view.classList.toggle("active", view.id === viewId));
  $$(".nav-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === viewId);
  });
  if (viewId === "reports") renderReport();
}

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function toDatetimeLocal(date = new Date()) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function getSelectedClient() {
  return state.clients.find((client) => client.id === selectedClientId) ?? null;
}

function renderAll() {
  renderDashboard();
  renderClients();
  renderJournalClientOptions();
  renderSettings();
  renderReport();
}

function renderDashboard() {
  const now = new Date();
  const monthKey = now.toISOString().slice(0, 7);
  $("#clientCount").textContent = state.clients.length;
  $("#journalCount").textContent = state.journals.length;
  $("#monthCount").textContent = state.journals.filter((journal) =>
    journal.writtenAt.startsWith(monthKey)
  ).length;

  const recent = [...state.journals]
    .sort((a, b) => new Date(b.writtenAt) - new Date(a.writtenAt))
    .slice(0, 6);

  const container = $("#recentJournals");
  if (!recent.length) {
    container.className = "timeline empty";
    container.textContent = "아직 작성된 일지가 없습니다.";
    return;
  }

  container.className = "timeline";
  container.innerHTML = recent
    .map((journal) => {
      const client = state.clients.find((item) => item.id === journal.clientId);
      return `<article class="journal-item">
        <strong>${escapeHtml(client?.name ?? "대상자 없음")} · ${escapeHtml(journal.contactType)}</strong>
        <span>${formatDate(journal.writtenAt)}</span>
        <p>${escapeHtml(journal.content.slice(0, 120))}</p>
      </article>`;
    })
    .join("");
}

function renderClients() {
  const query = $("#clientSearch")?.value?.trim().toLowerCase() ?? "";
  const clients = state.clients.filter((client) => {
    const haystack = `${client.name} ${client.tags} ${client.memo}`.toLowerCase();
    return haystack.includes(query);
  });

  const list = $("#clientList");
  list.innerHTML = "";

  if (!clients.length) {
    list.innerHTML = '<p class="hint">검색 결과가 없습니다.</p>';
  }

  clients.forEach((client) => {
    const node = $("#clientItemTemplate").content.cloneNode(true);
    const button = node.querySelector("button");
    button.classList.toggle("active", client.id === selectedClientId);
    button.querySelector("strong").textContent = client.name;
    button.querySelector("span").textContent = `${client.status} · ${client.tags || "태그 없음"}`;
    button.addEventListener("click", () => {
      selectedClientId = client.id;
      renderAll();
    });
    list.appendChild(node);
  });

  renderClientDetail();
}

function renderClientDetail() {
  const client = getSelectedClient();
  $("#clientDetailTitle").textContent = client ? `${client.name} 상세` : "대상자를 선택하세요";
  $("#deleteClient").disabled = !client;
  const form = $("#clientForm");
  form.querySelectorAll("input, select, textarea, button").forEach((field) => {
    field.disabled = !client && field.type !== "submit";
  });

  const values = client ?? {
    name: "",
    birthDate: "",
    phone: "",
    address: "",
    status: "진행",
    tags: "",
    memo: "",
  };
  Object.entries(values).forEach(([key, value]) => {
    if (form.elements[key]) form.elements[key].value = value ?? "";
  });
}

function renderJournalClientOptions() {
  const select = $("#journalClient");
  select.innerHTML = state.clients
    .map((client) => `<option value="${client.id}">${escapeHtml(client.name)}</option>`)
    .join("");
  if (selectedClientId) select.value = selectedClientId;
  $("#writtenAt").value ||= toDatetimeLocal();
}

function renderSettings() {
  $("#apiKey").value = state.settings.apiKey ?? "";
  $("#modelName").value = state.settings.modelName || "gemini-2.5-flash";
}

function renderReport() {
  const from = $("#reportFrom").value;
  const to = $("#reportTo").value;
  const rows = filterJournalsByDate(from, to);

  if (!rows.length) {
    $("#reportTable").innerHTML = '<p class="hint">선택한 기간에 저장된 일지가 없습니다.</p>';
    return;
  }

  $("#reportTable").innerHTML = `<table>
    <thead>
      <tr>
        <th>일시</th>
        <th>대상자</th>
        <th>유형</th>
        <th>상담 내용</th>
        <th>후속 조치</th>
      </tr>
    </thead>
    <tbody>
      ${rows
        .map((journal) => {
          const client = state.clients.find((item) => item.id === journal.clientId);
          return `<tr>
            <td>${formatDate(journal.writtenAt)}</td>
            <td>${escapeHtml(client?.name ?? "")}</td>
            <td>${escapeHtml(journal.contactType)}</td>
            <td>${escapeHtml(journal.content)}</td>
            <td>${escapeHtml(journal.followUp)}</td>
          </tr>`;
        })
        .join("")}
    </tbody>
  </table>`;
}

function filterJournalsByDate(from, to) {
  return [...state.journals]
    .filter((journal) => {
      const day = journal.writtenAt.slice(0, 10);
      return (!from || day >= from) && (!to || day <= to);
    })
    .sort((a, b) => new Date(b.writtenAt) - new Date(a.writtenAt));
}

async function generateDraft() {
  const clientId = $("#journalClient").value;
  const client = state.clients.find((item) => item.id === clientId);
  const memo = $("#sourceMemo").value.trim();
  const contactType = $("#contactType").value;

  if (!client) return setStatus("대상자를 먼저 등록하거나 선택하세요.", true);
  if (!memo) return setStatus("현장 메모를 입력하세요.", true);

  setStatus("초안을 생성하는 중입니다...");
  $("#generateDraft").disabled = true;

  try {
    const draft = state.settings.apiKey
      ? await generateWithGemini({ client, memo, contactType })
      : createDemoDraft({ client, memo, contactType });

    $("#draftContent").value = draft.content;
    $("#draftService").value = draft.serviceProvided;
    $("#draftCondition").value = draft.clientCondition;
    $("#draftFollowUp").value = draft.followUp;
    $("#draftBadge").textContent = "검토 필요";
    $("#draftBadge").classList.remove("done");
    setStatus(state.settings.apiKey ? "Gemini 초안이 생성되었습니다." : "데모 초안이 생성되었습니다.");
  } catch (error) {
    console.error(error);
    setStatus(buildGeminiErrorMessage(error), true);
  } finally {
    $("#generateDraft").disabled = false;
  }
}

async function generateWithGemini({ client, memo, contactType }) {
  const modelName = state.settings.modelName || "gemini-2.5-flash";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    modelName
  )}:generateContent?key=${encodeURIComponent(state.settings.apiKey)}`;
  const prompt = `너는 종합사회복지관 사회복지사의 개인 상담일지 작성 보조자다.
아래 메모만 바탕으로 객관적이고 간결한 일지 초안을 JSON으로 작성하라.
추측하지 말고, 메모에 없는 사실은 쓰지 말라.
주민등록번호, 상세 주소 같은 민감정보는 포함하지 말라.

대상자 참고 정보:
- 이름: ${client.name}
- 상태: ${client.status}
- 태그: ${client.tags || "없음"}
- 상담 유형: ${contactType}

현장 메모:
${memo}

반드시 아래 JSON 형식만 반환:
{
  "content": "상담 내용",
  "serviceProvided": "제공 서비스",
  "clientCondition": "대상자 상태",
  "followUp": "후속 조치"
}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    const error = new Error(body || response.statusText);
    error.status = response.status;
    throw error;
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini 응답에 초안 텍스트가 없습니다.");
  return normalizeDraft(JSON.parse(text));
}

function createDemoDraft({ client, memo, contactType }) {
  const hasFood = /식사|도시락|반찬|영양/.test(memo);
  const hasVisit = /방문|가정/.test(memo);
  const hasCall = /전화|통화/.test(memo);
  return normalizeDraft({
    content: `${client.name} 대상자와 ${contactType} 방식으로 상담을 진행하였다. 상담 중 확인된 내용은 다음과 같다. ${memo}`,
    serviceProvided: hasFood
      ? "식사지원 관련 정보를 안내하고 필요 서비스 이용 가능성을 확인하였다."
      : "상담 내용을 바탕으로 필요한 복지 서비스와 지원 방향을 안내하였다.",
    clientCondition: hasFood
      ? "식생활 관련 어려움을 표현하여 지속적인 확인이 필요하다."
      : "상담 과정에서 확인된 욕구와 생활 상황을 기록하였다.",
    followUp: hasVisit
      ? "다음 가정방문 시 생활환경과 추가 욕구를 확인한다."
      : hasCall
        ? "추가 확인이 필요한 사항은 다음 전화 상담에서 점검한다."
        : "후속 상담 일정을 조율하고 지원 경과를 확인한다.",
  });
}

function normalizeDraft(draft) {
  return {
    content: draft.content ?? "",
    serviceProvided: draft.serviceProvided ?? "",
    clientCondition: draft.clientCondition ?? "",
    followUp: draft.followUp ?? "",
  };
}

function saveJournal() {
  const clientId = $("#journalClient").value;
  if (!clientId) return setStatus("대상자를 먼저 선택하세요.", true);
  if (!$("#draftContent").value.trim()) return setStatus("저장할 상담 내용이 없습니다.", true);

  state.journals.push({
    id: crypto.randomUUID(),
    clientId,
    writtenAt: new Date($("#writtenAt").value || new Date()).toISOString(),
    contactType: $("#contactType").value,
    sourceMemo: $("#sourceMemo").value.trim(),
    content: $("#draftContent").value.trim(),
    serviceProvided: $("#draftService").value.trim(),
    clientCondition: $("#draftCondition").value.trim(),
    followUp: $("#draftFollowUp").value.trim(),
    privateMemo: $("#privateMemo").value.trim(),
    aiGenerated: true,
    createdAt: new Date().toISOString(),
  });

  saveState();
  $("#draftBadge").textContent = "저장 완료";
  $("#draftBadge").classList.add("done");
  setStatus("일지가 저장되었습니다.");
  renderAll();
}

function setStatus(message, isError = false) {
  const status = $("#aiStatus");
  status.textContent = message;
  status.style.color = isError ? "#b13d28" : "";
}

function buildGeminiErrorMessage(error) {
  let parsed = null;
  try {
    parsed = JSON.parse(error.message);
  } catch {
    parsed = null;
  }

  const status = error.status ?? parsed?.error?.code;
  const message = parsed?.error?.message ?? error.message;

  if (status === 403) {
    return "Gemini 접근이 거부되었습니다. API 키가 올바른지, 해당 Google Cloud/AI Studio 프로젝트에서 Gemini API 사용 권한이 있는지 확인한 뒤 새 키로 다시 시도하세요.";
  }

  if (status === 400) {
    return "Gemini 요청 형식이 거부되었습니다. 모델명과 입력 내용을 확인하세요.";
  }

  if (status === 404) {
    return "선택한 Gemini 모델을 찾을 수 없습니다. 설정에서 모델명을 gemini-2.5-flash 또는 사용 가능한 모델명으로 바꿔보세요.";
  }

  return `초안 생성 실패: ${message}`;
}

function addClient() {
  const client = {
    id: crypto.randomUUID(),
    name: "새 대상자",
    birthDate: "",
    phone: "",
    address: "",
    status: "진행",
    tags: "",
    memo: "",
    createdAt: new Date().toISOString(),
  };
  state.clients.unshift(client);
  selectedClientId = client.id;
  saveState();
  renderAll();
}

function saveClient(event) {
  event.preventDefault();
  const client = getSelectedClient();
  if (!client) return;
  const form = event.currentTarget;
  Object.assign(client, {
    name: form.elements.name.value.trim() || "이름 없음",
    birthDate: form.elements.birthDate.value,
    phone: form.elements.phone.value.trim(),
    address: form.elements.address.value.trim(),
    status: form.elements.status.value,
    tags: form.elements.tags.value.trim(),
    memo: form.elements.memo.value.trim(),
  });
  saveState();
  renderAll();
}

function deleteClient() {
  const client = getSelectedClient();
  if (!client) return;
  const ok = confirm(`${client.name} 대상자와 연결된 일지를 삭제할까요?`);
  if (!ok) return;
  state.clients = state.clients.filter((item) => item.id !== client.id);
  state.journals = state.journals.filter((journal) => journal.clientId !== client.id);
  selectedClientId = state.clients[0]?.id ?? null;
  saveState();
  renderAll();
}

function startVoiceInput() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return setStatus("이 브라우저는 음성 입력을 지원하지 않습니다.", true);

  const recognition = new SpeechRecognition();
  recognition.lang = "ko-KR";
  recognition.interimResults = false;
  recognition.onstart = () => setStatus("음성을 듣고 있습니다...");
  recognition.onerror = () => setStatus("음성 입력에 실패했습니다.", true);
  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    $("#sourceMemo").value = `${$("#sourceMemo").value} ${transcript}`.trim();
    setStatus("음성 메모가 추가되었습니다.");
  };
  recognition.start();
}

function downloadCsv() {
  const rows = filterJournalsByDate($("#reportFrom").value, $("#reportTo").value);
  const header = ["일시", "대상자", "유형", "상담내용", "제공서비스", "대상자상태", "후속조치"];
  const body = rows.map((journal) => {
    const client = state.clients.find((item) => item.id === journal.clientId);
    return [
      formatDate(journal.writtenAt),
      client?.name ?? "",
      journal.contactType,
      journal.content,
      journal.serviceProvided,
      journal.clientCondition,
      journal.followUp,
    ];
  });
  const csv = [header, ...body]
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "대상자_일지_보고서.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

$$(".nav-button").forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.view));
});

$("#quickJournal").addEventListener("click", () => setView("journal"));
$("#addClient").addEventListener("click", addClient);
$("#clientSearch").addEventListener("input", renderClients);
$("#clientForm").addEventListener("submit", saveClient);
$("#deleteClient").addEventListener("click", deleteClient);
$("#journalClient").addEventListener("change", (event) => {
  selectedClientId = event.target.value;
  renderClients();
});
$("#generateDraft").addEventListener("click", generateDraft);
$("#saveJournal").addEventListener("click", saveJournal);
$("#startVoice").addEventListener("click", startVoiceInput);
$("#clearMemo").addEventListener("click", () => {
  $("#sourceMemo").value = "";
});
$("#saveSettings").addEventListener("click", () => {
  state.settings.apiKey = $("#apiKey").value.trim();
  state.settings.modelName = $("#modelName").value.trim() || "gemini-2.5-flash";
  saveState();
  setView("journal");
  setStatus("Gemini 설정이 저장되었습니다.");
});
$("#clearSettings").addEventListener("click", () => {
  state.settings.apiKey = "";
  saveState();
  renderSettings();
});
$("#reportFrom").addEventListener("change", renderReport);
$("#reportTo").addEventListener("change", renderReport);
$("#downloadCsv").addEventListener("click", downloadCsv);

renderAll();

if (location.protocol === "file:") {
  setStatus("파일을 직접 열면 브라우저 보안 제약이 생길 수 있습니다. 가능하면 http://127.0.0.1:8765/index.html 주소로 열어 테스트하세요.", true);
}
