import assert from "node:assert/strict";

const baseUrl = `http://localhost:${process.env.PORT?.trim() || "4021"}`;

async function collect(options: { wallet: "funded" | "empty" }) {
  const response = await fetch(`${baseUrl}/api/agent/run-payment-flow`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bug: "divide", network: "testnet", wallet: options.wallet }),
  });
  assert.equal(response.ok, true, `flow endpoint returned HTTP ${response.status}`);
  assert.ok(response.body, "flow endpoint returned no event stream");
  const text = await response.text();
  return text.split("\n\n")
    .map((block) => block.split("\n").find((line) => line.startsWith("data: ")))
    .filter((line): line is string => Boolean(line))
    .map((line) => JSON.parse(line.slice(6)) as { type: string; title: string; timestamp: string; data?: Record<string, any> });
}

const successfulRuns = [];
for (let index = 0; index < 3; index += 1) {
  const events = await collect({ wallet: "funded" });
  const paid = events.find((event) => event.title === "Paid retry accepted");
  const wallet = events.find((event) => event.title === "Wallet loaded");
  const payment = events.find((event) => event.title === "Payment required");
  const complete = events.find((event) => event.type === "complete");
  assert.ok(paid, `run ${index + 1}: no paid retry event`);
  assert.ok(wallet, `run ${index + 1}: no wallet event`);
  assert.ok(payment, `run ${index + 1}: no payment event`);
  assert.ok(complete, `run ${index + 1}: no completion event`);
  assert.equal(complete?.data?.response?.resolution?.patch?.length > 0, true, `run ${index + 1}: no structured patch`);
  successfulRuns.push({
    transaction: paid.data?.transaction,
    timestamp: paid.timestamp,
    payer: wallet.data?.payer,
    provider: payment.data?.provider,
  });
}

assert.equal(new Set(successfulRuns.map((run) => run.transaction)).size, 3, "settlement transaction IDs repeated");
assert.equal(new Set(successfulRuns.map((run) => run.timestamp)).size, 3, "event timestamps repeated");
assert.ok(successfulRuns.every((run) => typeof run.transaction === "string" && run.transaction.length > 0), "a run had no real transaction ID");
assert.ok(successfulRuns.every((run) => typeof run.payer === "string" && run.payer.length > 0), "a run had no payer wallet");
assert.ok(successfulRuns.every((run) => typeof run.provider === "string" && run.provider.length > 0), "a run had no provider wallet");
assert.equal(new Set(successfulRuns.map((run) => run.payer)).size, 1, "funded payer wallet changed between runs");
assert.equal(new Set(successfulRuns.map((run) => run.provider)).size, 1, "provider wallet changed between runs");

const failureEvents = await collect({ wallet: "empty" });
const failure = failureEvents.find((event) => event.type === "error");
assert.ok(failure, "underfunded run emitted no error event");
assert.equal(failure?.title, "Payment failed: insufficient funds");
assert.equal(failure?.data?.failureReason, "insufficient-funds");

console.log("Liveness proof passed");
console.log(`3 unique transactions, ${new Set(successfulRuns.map((run) => run.timestamp)).size} unique timestamps`);
console.log(`Stable funded payer/provider wallets: ${successfulRuns[0].payer} / ${successfulRuns[0].provider}`);
console.log("Underfunded wallet produced the expected insufficient-funds error event");