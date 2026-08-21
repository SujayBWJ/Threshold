import { config } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  runIncidentPaymentFlow,
  type IncidentFlowEvent,
} from "../src/services/payment/incident-flow.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
config({ path: resolve(__dirname, "../../.env") });
config({ path: resolve(__dirname, "../.env"), override: true });

console.log("=== Threshold autonomous incident-resolution run ===");

await runIncidentPaymentFlow({
  useTestnet: process.env.X402_NETWORK?.trim() === "testnet",
  emit(event: IncidentFlowEvent) {
    console.log(`[${event.timestamp}] ${event.actor}: ${event.title} - ${event.detail}`);
    if (event.type === "error") process.exitCode = 1;
    if (event.data?.settlement || event.data?.response) {
      console.log(JSON.stringify(event.data, null, 2));
    }
  },
});
