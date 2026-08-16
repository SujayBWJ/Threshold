const catalogGrid = document.getElementById("catalog-grid");

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
    testEndpoint(api.endpoint, samplePayload, card);
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

async function fetchCatalog() {
  try {
    const response = await fetch("/api/catalog");
    if (!response.ok) {
      throw new Error("Unable to fetch catalog");
    }

    const data = await response.json();
    const items = Array.isArray(data.apis) ? data.apis : [];

    catalogGrid.innerHTML = "";
    items.forEach((api, index) => {
      catalogGrid.appendChild(createCard(api, index));
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
