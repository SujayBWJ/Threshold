const catalogGrid = document.getElementById("catalog-grid");
const agentForm = document.getElementById("agent-form");
const agentStatus = document.getElementById("agent-status");
const agentResult = document.getElementById("agent-result");
const summaryFields = document.getElementById("summary-fields");
const reviewFields = document.getElementById("review-fields");
const catalogPanel = document.getElementById("catalog-panel");
const catalogToggle = document.getElementById("catalog-toggle");
const catalogBack = document.getElementById("catalog-back");
const siteNav = document.querySelector(".site-nav");
const activityList = document.getElementById("activity-list");
const metricRuns = document.getElementById("metric-runs");
const metricPayments = document.getElementById("metric-payments");
const metricSpend = document.getElementById("metric-spend");
let agentMode = "summarize";
let catalogScrollPosition = null;
let catalogReturnInProgress = false;
let returnTarget = null;
const activityStorageKey = "threshold.agent.activity.v1";
const bootScreen = document.getElementById("boot-screen");

window.addEventListener("load", () => {
  window.setTimeout(() => bootScreen?.classList.add("is-ready"), 1800);
});

function returnToWorkspace() {
  if (catalogReturnInProgress) return;
  catalogReturnInProgress = true;
  if (returnTarget === "catalog") {
    catalogToggle.setAttribute("aria-expanded", "false");
    catalogToggle.classList.remove("is-open");
  }

  const originalPosition = catalogScrollPosition;
  if (originalPosition === null) {
    if (returnTarget === "catalog") {
      catalogPanel.hidden = true;
      catalogPanel.classList.add("hidden");
    }
    catalogBack.hidden = true;
    returnTarget = null;
    catalogReturnInProgress = false;
    return;
  }

  window.scrollTo({ top: originalPosition, behavior: "smooth" });
  window.setTimeout(() => {
    if (returnTarget === "catalog") {
      catalogPanel.hidden = true;
      catalogPanel.classList.add("hidden");
    }
    catalogBack.hidden = true;
    catalogScrollPosition = null;
    returnTarget = null;
    catalogReturnInProgress = false;
  }, 500);
}

const schemaExamples = {
  "code-review": {
    code: "string",
    language: "string",
    context: "string",
    maxIssues: "number",
  },
  summarize: {
    text: "string",
    tone: "string",
    maxLength: "number",
  },
};

function formatWallet(address) {
  if (!address) return "Unknown Wallet";
  if (address.length <= 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-5)}`;
}

function decodePaymentRequiredHeader(headerValue) {
  if (!headerValue) return null;

  try {
    const decoded = atob(headerValue);
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function buildSchemaBlock(api) {
  const schema = schemaExamples[api.id] ?? {
    input: "object",
  };

  return JSON.stringify(schema, null, 2);
}

function setActionState(button, loading) {
  button.disabled = loading;
  button.classList.toggle("loading", loading);
  button.innerHTML = loading
    ? '<span class="inline-flex items-center gap-2"><span class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-900 border-t-transparent"></span>Processing</span>'
    : '<span class="inline-flex items-center gap-2">Try Endpoint <i data-lucide="arrow-right" class="h-4 w-4"></i></span>';

  if (window.lucide) {
    lucide.createIcons();
  }
}

function renderPaymentIntercept(card, requirement) {
  const intercept = card.querySelector(".payment-intercept");
  const accept = requirement?.accepts?.[0] ?? {};
  const rawAmount = Number(accept.amount ?? 1000);
  const formattedAmount = Number.isFinite(rawAmount)
    ? `$${(rawAmount / 1000000).toFixed(3)} USDC`
    : "$0.001 USDC";
  const destinationWallet = accept.payTo || card.dataset.wallet || "Unknown wallet";
  const scheme = accept.scheme || "ExactAvmScheme";

  intercept.innerHTML = `
    <div class="intercept-header">
      <span>HTTP 402 PAYMENT REQUIRED</span>
      <span class="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] text-amber-300"><i data-lucide="shield-alert" class="h-3 w-3"></i> Protected</span>
    </div>
    <div class="intercept-body">
      <div class="breakdown-row">
        <span class="label">Amount</span>
        <span class="value">${formattedAmount}</span>
      </div>
      <div class="breakdown-row">
        <span class="label">Destination Wallet</span>
        <span class="value">${formatWallet(destinationWallet)}</span>
      </div>
      <div class="breakdown-row">
        <span class="label">Scheme</span>
        <span class="value">${scheme}</span>
      </div>
      <div class="notice">Gateway Protected. Automated AI agents automatically construct and settle this payment via x402 before API execution.</div>
    </div>
  `;

  intercept.classList.add("visible");

  if (window.lucide) {
    lucide.createIcons();
  }
}

async function testEndpoint(endpoint, payload, cardElement) {
  const button = cardElement.querySelector(".primary-action");
  const intercept = cardElement.querySelector(".payment-intercept");

  setActionState(button, true);
  intercept.classList.remove("visible");

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (response.status === 402) {
      const requirement = decodePaymentRequiredHeader(
        response.headers.get("payment-required"),
      );
      renderPaymentIntercept(cardElement, requirement);
      setActionState(button, false);
      return;
    }

    const data = await response.json();
    const output = cardElement.querySelector(".muted-stat");
    if (output) {
      output.textContent = response.ok ? "Executed" : "Error";
    }

    if (!response.ok) {
      throw new Error(data?.error || "Request failed");
    }

    if (data?.success) {
      const status = cardElement.querySelector(".muted-stat");
      if (status) {
        status.textContent = "Paid & Complete";
      }

      const summaryOutput = cardElement.querySelector(".summary-output");
      if (summaryOutput && typeof data.summary === "string") {
        summaryOutput.textContent = data.summary;
        summaryOutput.classList.remove("hidden");
      }

      const transaction = cardElement.querySelector(".transaction-output");
      if (transaction && data.payment?.transaction) {
        transaction.textContent = `Transaction: ${data.payment.transaction}`;
        transaction.classList.remove("hidden");
      }

      const reviewOutput = cardElement.querySelector(".review-output");
      if (reviewOutput && data.review) {
        const review = data.review;
        reviewOutput.innerHTML = `
          <div class="review-summary">${escapeHtml(review.summary || "No summary returned.")}</div>
          <div class="review-score">Score: ${escapeHtml(review.score ?? "n/a")}/10</div>
          <div class="review-issues">${(review.issues || []).map((issue) => `
            <div class="review-issue">
              <strong>${escapeHtml(issue.severity || "issue")} · ${escapeHtml(issue.title || "Untitled issue")}</strong>
              <span>${escapeHtml(issue.description || "")}</span>
            </div>
          `).join("") || "No issues found."}</div>
          <div class="review-suggestions"><strong>Suggestions</strong><ul>${(review.suggestions || []).map((suggestion) => `<li>${escapeHtml(suggestion)}</li>`).join("") || "<li>No suggestions returned.</li>"}</ul></div>
        `;
        reviewOutput.classList.remove("hidden");
      }
    }
  } catch (error) {
    const output = cardElement.querySelector(".muted-stat");
    if (output) {
      output.textContent = "Request Failed";
    }
    console.error(error);
  } finally {
    setActionState(button, false);
  }
}

function createCard(api, index) {
  const card = document.createElement("article");
  const schema = buildSchemaBlock(api);
  const samplePayload = {
    "code-review": {
      code: "function sum(a, b) { return a + b; }",
      language: "javascript",
      context: "Review for correctness and maintainability.",
      maxIssues: 5,
    },
    summarize: {
      text: "Threshold routes AI workloads through an x402 marketplace with programmable micropayments.",
      tone: "concise",
      maxLength: 180,
    },
  }[api.id] ?? { input: "value" };
  const isSummarizer = api.id === "summarize";
  const isCodeReview = api.id === "code-review";

  card.className = `api-card ${index === 0 ? "featured" : "compact"}`;
  card.dataset.wallet = api.provider.walletAddress;
  card.dataset.endpoint = api.endpoint;

  card.innerHTML = `
    <div class="card-header">
      <div>
        <div class="breadcrumb">${api.method} / ${api.endpoint.replace("/", "")}</div>
        <h3>${api.name}</h3>
      </div>
      <span class="rounded-sm border border-zinc-800 bg-zinc-900/80 px-2 py-0.5 text-[10px] font-mono text-zinc-400 tracking-wider uppercase">${api.category}</span>
    </div>
    <p class="description">${api.description}</p>
    <div class="provider-row">
      <div class="provider-meta">
        <span>Provider</span>
        <div class="provider-name">
          <strong>${api.provider.name}</strong>
          <span class="muted-text">${formatWallet(api.provider.walletAddress)}</span>
        </div>
      </div>
      <button class="copy-button" type="button" data-copy="${api.provider.walletAddress}" aria-label="Copy wallet address">
        <i data-lucide="copy" class="h-3.5 w-3.5"></i>
      </button>
    </div>
    <div class="price-badge">$${api.price.replace(/^\$/,'')} ${api.currency} / req</div>
    <div class="endpoint-box">
      <span class="method-badge">${api.method}</span>
      <span>${api.endpoint}</span>
    </div>
    <button class="schema-toggle" type="button" aria-expanded="false">
      <span>Schema</span>
      <i data-lucide="chevron-down" class="h-4 w-4"></i>
    </button>
    <div class="schema-panel">
      <pre>${escapeHtml(schema)}</pre>
    </div>
    ${isSummarizer ? `
      <div class="summarizer-input">
        <label for="summarizer-text">Sample text</label>
        <textarea id="summarizer-text" class="summarizer-text" rows="5" placeholder="Paste text to summarize...">${escapeHtml(samplePayload.text)}</textarea>
      </div>
      <div class="summary-output hidden" aria-live="polite"></div>
      <div class="transaction-output hidden"></div>
    ` : ""}
    ${isCodeReview ? `
      <div class="review-input">
        <label for="review-code">Code sample</label>
        <textarea id="review-code" class="review-code" rows="8" placeholder="Paste code to review...">${escapeHtml(samplePayload.code)}</textarea>
        <label for="review-language">Language</label>
        <input id="review-language" class="review-language" value="${escapeHtml(samplePayload.language)}" />
      </div>
      <div class="review-output hidden" aria-live="polite"></div>
      <div class="transaction-output hidden"></div>
    ` : ""}
    <div class="payment-intercept" aria-live="polite"></div>
    <div class="action-row">
      <button class="primary-action" type="button">
        <span class="inline-flex items-center gap-2">Try Endpoint <i data-lucide="arrow-right" class="h-4 w-4"></i></span>
      </button>
      <span class="muted-stat">Ready</span>
    </div>
  `;

  const toggle = card.querySelector(".schema-toggle");
  const panel = card.querySelector(".schema-panel");
  toggle.addEventListener("click", () => {
    const open = panel.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
    toggle.querySelector("i").style.transform = open ? "rotate(180deg)" : "rotate(0deg)";
  });

  const copyButton = card.querySelector("[data-copy]");
  copyButton.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(api.provider.walletAddress);
      copyButton.innerHTML = '<i data-lucide="check" class="h-3.5 w-3.5"></i>';
      if (window.lucide) lucide.createIcons();
      window.setTimeout(() => {
        copyButton.innerHTML = '<i data-lucide="copy" class="h-3.5 w-3.5"></i>';
        if (window.lucide) lucide.createIcons();
      }, 1200);
    } catch (error) {
      console.error("Copy failed", error);
    }
  });

  const actionButton = card.querySelector(".primary-action");
  actionButton.addEventListener("click", () => {
    const textInput = card.querySelector(".summarizer-text");
    const codeInput = card.querySelector(".review-code");
    const languageInput = card.querySelector(".review-language");
    const payload = isSummarizer && textInput
      ? { text: textInput.value }
      : isCodeReview && codeInput && languageInput
        ? { code: codeInput.value, language: languageInput.value }
        : samplePayload;
    const endpoint = isSummarizer
      ? "/api/summarize/paid"
      : isCodeReview
        ? "/api/code-review/paid"
        : api.endpoint;
    testEndpoint(endpoint, payload, card);
  });

  if (window.lucide) {
    lucide.createIcons();
  }

  return card;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function readActivity() {
  try {
    const stored = JSON.parse(localStorage.getItem(activityStorageKey) || "[]");
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

function renderActivity() {
  const activity = readActivity();
  const payments = activity.reduce((total, item) => total + (item.steps?.length || 0), 0);
  const spend = activity.reduce((total, item) => total + Number(item.cost || 0), 0);
  metricRuns.textContent = String(activity.length);
  metricPayments.textContent = String(payments);
  metricSpend.textContent = `$${spend.toFixed(3)} USDC`;
  if (!activity.length) return;
  activityList.innerHTML = activity.map((item) => `
    <article class="activity-item">
      <div class="activity-main"><span class="activity-type">${escapeHtml(item.intent)}</span><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.time)}</small></div>
      <div class="activity-meta"><strong>${escapeHtml(item.costLabel)}</strong><span>${item.steps?.length || 0} settled ${(item.steps?.length || 0) === 1 ? "request" : "requests"}</span></div>
    </article>
  `).join("");
}

function saveActivity(data) {
  const activity = readActivity();
  const item = {
    intent: data.intent === "code-review-and-summarize" ? "review + summary" : data.intent,
    label: data.intent === "summarize" ? "Text summary" : data.intent === "code-review" ? "Code review" : "Code review + summary",
    cost: Number(data.totalCost?.match(/[0-9.]+/)?.[0] || 0),
    costLabel: data.totalCost || "$0.000 USDC",
    steps: data.steps || [],
    time: new Date().toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
  };
  localStorage.setItem(activityStorageKey, JSON.stringify([item, ...activity].slice(0, 8)));
  renderActivity();
}

function setAgentStatus(message, running = false) {
  if (!agentStatus) return;
  agentStatus.classList.toggle("running", running);
  agentStatus.classList.toggle("error", !running && /failed|quota|error|try again/i.test(message));
  agentStatus.innerHTML = `<span class="agent-status-dot"></span><span>${escapeHtml(message)}</span>`;
}

function renderAgentResult(data) {
  const step = data.steps?.[0];
  const resultMarkup = data.intent === "code-review"
    ? renderReviewResult(data.result?.review)
    : `<p>${escapeHtml(data.result?.summary || "No result returned.")}</p>`;
  agentResult.innerHTML = `
    <div class="agent-result-header">
      <div>
        <span class="section-kicker">Final response</span>
        <div class="agent-answer"><span class="answer-label">Threshold result</span>${resultMarkup}</div>
      </div>
      <strong>${escapeHtml(data.totalCost || "")}</strong>
    </div>
    <div class="agent-trace">
      <div class="trace-step"><span class="trace-index">01</span><div><strong>Intent detected</strong><span>${escapeHtml(data.intent || "unknown")}</span></div></div>
      <div class="trace-step"><span class="trace-index">02</span><div><strong>API selected</strong><span>${escapeHtml(step?.apiName || "Unknown API")} / ${escapeHtml(step?.provider || "Unknown provider")}</span></div></div>
      <div class="trace-step"><span class="trace-index">03</span><div><strong>Payment settled</strong><span>${escapeHtml(step?.transaction || "Settlement confirmed")}</span></div></div>
    </div>
  `;
  agentResult.classList.remove("hidden");
}

function renderReviewResult(review) {
  if (!review || typeof review !== "object") return "<p>No review returned.</p>";
  return `<div class="review-agent-answer"><strong>Score ${escapeHtml(review.score ?? "n/a")}/10</strong><p>${escapeHtml(review.summary || "No summary returned.")}</p><ul>${(review.issues || []).map((issue) => `<li><b>${escapeHtml(issue.severity || "issue")}:</b> ${escapeHtml(issue.title || "Untitled issue")} <span>${escapeHtml(issue.description || "")}</span></li>`).join("") || "<li>No issues found.</li>"}</ul></div>`;
}

function setAgentMode(mode) {
  agentMode = mode;
  document.querySelectorAll(".mode-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === mode);
  });
  const reviewMode = mode === "code-review" || mode === "code-review-and-summarize";
  summaryFields.classList.toggle("hidden", reviewMode);
  reviewFields.classList.toggle("hidden", !reviewMode);
  document.getElementById("agent-task").value = mode === "code-review"
    ? "Review this code and explain the important issues"
    : mode === "code-review-and-summarize"
      ? "Review this code and give me a concise explanation"
      : "Get me a concise summary";
  setAgentStatus(
    mode === "code-review-and-summarize"
      ? "Ready to review and summarize"
      : mode === "code-review"
        ? "Ready to review code"
        : "Ready to summarize text",
  );
}

async function runAgent(event) {
  event.preventDefault();
  const submit = agentForm.querySelector(".agent-submit");
  const task = document.getElementById("agent-task").value;
  const text = document.getElementById("agent-text").value;
  const code = document.getElementById("agent-code").value;
  const language = document.getElementById("agent-language").value;
  submit.disabled = true;
  submit.classList.add("loading");
  agentResult.classList.add("hidden");
  setAgentStatus("Discovering a matching API", true);

  try {
    setAgentStatus(
      agentMode === "code-review-and-summarize"
        ? "Selecting review and summarization capabilities"
        : agentMode === "code-review"
          ? "Selecting code analysis capability"
          : "Selecting text summarization capability",
      true,
    );
    const response = await fetch("/api/agent/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task, mode: agentMode, text, code, language }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || "Agent request failed");
    setAgentStatus("Payment settled and result returned");
    renderAgentResult(data);
    saveActivity(data);
  } catch (error) {
    setAgentStatus(error instanceof Error ? error.message : "Agent request failed");
  } finally {
    submit.disabled = false;
    submit.classList.remove("loading");
  }
}

async function fetchCatalog() {
  try {
    const response = await fetch("/api/catalog");
    if (!response.ok) {
      throw new Error("Unable to fetch catalog");
    }

    const data = await response.json();
    const items = Array.isArray(data.apis) ? data.apis : [];

    catalogGrid.innerHTML = "";
    items.forEach((api) => {
      const card = document.createElement("article");
      card.className = "public-api-item";
      card.innerHTML = `<div><span class="public-api-kind">${escapeHtml(api.category)}</span><h3>${escapeHtml(api.name)}</h3><p>${escapeHtml(api.description)}</p></div><span class="public-api-price">${escapeHtml(api.price)} ${escapeHtml(api.currency)} / request</span>`;
      catalogGrid.appendChild(card);
    });
  } catch (error) {
    catalogGrid.innerHTML = `
      <div class="api-card featured">
        <h3>Catalog unavailable</h3>
        <p class="description">The API catalog could not be loaded.</p>
      </div>
    `;
    console.error(error);
  }
}

fetchCatalog();
renderActivity();
agentForm?.addEventListener("submit", runAgent);
siteNav?.addEventListener("click", (event) => {
  const link = event.target.closest("a[href^='#']");
  if (!link) return;
  const target = document.querySelector(link.getAttribute("href"));
  if (!target) return;
  event.preventDefault();
  if (target.id === "profile-panel") {
    catalogScrollPosition = window.scrollY;
    returnTarget = "profile";
    catalogBack.hidden = false;
  }
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  history.replaceState(null, "", link.getAttribute("href"));
});
document.querySelectorAll(".mode-button").forEach((button) => {
  button.addEventListener("click", () => setAgentMode(button.dataset.mode));
});
catalogToggle?.addEventListener("click", () => {
  const opening = catalogPanel.hidden;

  if (opening) {
    catalogScrollPosition = window.scrollY;
    returnTarget = "catalog";
    catalogPanel.hidden = false;
    catalogPanel.classList.remove("hidden");
    catalogToggle.setAttribute("aria-expanded", "true");
    catalogToggle.classList.add("is-open");
    catalogBack.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      catalogPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    }));
    return;
  }

  returnToWorkspace();
});

catalogBack?.addEventListener("click", returnToWorkspace);
