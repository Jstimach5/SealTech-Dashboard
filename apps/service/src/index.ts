/**
 * SealTech board service entry point.
 *
 *   tsx src/index.ts          poll loop + HTTP on PORT (the office PC runs this under NSSM)
 *   tsx src/index.ts --once   build one snapshot, write data/snapshot.json, print a summary, exit
 *
 * Configuration comes from the environment and `.env` in the working directory (see .env.example).
 */
import { describeConfig, loadConfig } from './config.js';
import { createHttpServer, listen } from './http/server.js';
import { consoleLogger, errorMessage } from './log.js';
import { startPollLoop } from './schedule.js';
import { BoardService } from './service.js';

async function main(argv: string[]): Promise<void> {
  const once = argv.includes('--once');
  const log = consoleLogger;
  const config = loadConfig();
  if (!process.env.TZ) process.env.TZ = config.tz;
  log.info(`sealtech service ${describeConfig(config)}`);
  const service = new BoardService({ config, log });

  if (once) {
    const r = await service.poll({ quiet: true });
    service.close();
    if (!r.ok) {
      log.error(`once FAILED ${r.error}`);
      process.exitCode = 1;
      return;
    }
    const s = r.snapshot;
    console.log(
      `once ok ${s.boardDate} ${s.generatedAt} mode ${s.mode} hero ${s.hero.cannotInvoice} rail ${s.cannotInvoice.length} attention ${s.attention.length} visits ${s.visits.length} rows ${s.reviewRows.length} queued ${s.queuedWrites.length} in ${r.ms} ms → ${service.writer.path}`,
    );
    return;
  }

  const server = createHttpServer(service);
  const addr = await listen(server, config.port);
  log.info(`http listening on :${addr.port} (board from ${config.boardDist})`);
  const loop = startPollLoop(service, log);

  let closing = false;
  const shutdown = (signal: NodeJS.Signals): void => {
    if (closing) return;
    closing = true;
    log.info(`${signal}: stopping`);
    loop.stop();
    server.close(() => {
      service.close();
      process.exit(0);
    });
    server.closeAllConnections();
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

main(process.argv.slice(2)).catch((err: unknown) => {
  consoleLogger.error(`fatal ${errorMessage(err)}`);
  process.exit(1);
});
