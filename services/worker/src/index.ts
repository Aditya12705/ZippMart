import "dotenv/config";
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

async function main() {
  const connection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    connectTimeout: 2500,
    lazyConnect: true,
    retryStrategy() {
      return null;
    }
  });

  try {
    await connection.connect();
    await connection.ping();
  } catch {
    console.warn(
      `[worker] Redis unavailable at ${redisUrl} — skipping background workers. Start Redis when you need receipt queues (optional).`
    );
    console.warn(
      "[worker] Low-stock checks (if configured) run inside the API process via LOW_STOCK_NOTIFY_WEBHOOK_URL when Redis is absent."
    );
    await connection.quit().catch(() => undefined);
    process.exit(0);
    return;
  }

  new Queue("receipt-dispatch", { connection });
  new Queue("demand-aggregation", { connection });

  new Worker(
    "receipt-dispatch",
    async (job) => {
      const payload = job.data as { receiptNumber: string; whatsapp?: string };
      console.log(`Dispatching receipt ${payload.receiptNumber} to ${payload.whatsapp ?? "admin mailbox"}`);
      return { ok: true };
    },
    { connection }
  );

  new Worker(
    "demand-aggregation",
    async () => {
      console.log("Refreshing high demand products materialized view");
      return { ok: true };
    },
    { connection }
  );

  console.log("Worker started");
}

main().catch((err) => {
  console.warn("[worker] Failed to start:", err);
  process.exit(0);
});
