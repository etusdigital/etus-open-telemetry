import { ingestorApp } from './ingestor.js';
import { persistBatch } from './persistor.js';
import { runAggregator } from './aggregator.js';
import type { Env, QueueMessage } from './env.js';

export default {
  fetch: ingestorApp.fetch,
  async queue(
    batch: MessageBatch<QueueMessage>,
    env: Env,
  ): Promise<void> {
    await persistBatch(batch, env);
  },
  async scheduled(
    _event: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    ctx.waitUntil(runAggregator(env));
  },
} satisfies ExportedHandler<Env, QueueMessage>;
