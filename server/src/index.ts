// Entry point: config → database + migrations → background jobs → HTTP server.
import path from 'node:path';
import cron from 'node-cron';
import { createApp } from './app';
import { loadConfig } from './config';
import { Db } from './db/db';
import { migrate } from './db/migrate';
import { createLogger } from './lib/logger';
import { expireOrders } from './modules/orders/service';

async function main() {
  const config = loadConfig();
  const logger = createLogger(config.LOG_LEVEL);

  let db: Db;
  try {
    db = await Db.connect(config.MSSQL_CONNECTION_STRING);
    await migrate(db, (msg) => logger.info(msg));
  } catch (err) {
    logger.fatal({ err }, 'Cannot open the SQL Server database. Is the SQL Server service running? Check MSSQL_CONNECTION_STRING in .env.');
    process.exit(1);
  }

  // Unpaid online orders past their deadline give their stock back.
  cron.schedule('* * * * *', () => {
    expireOrders(db)
      .then((n) => n > 0 && logger.info({ expired: n }, 'expired unpaid orders'))
      .catch((err) => logger.error({ err }, 'order expiry job failed'));
  });
  // Old sessions.
  cron.schedule('17 * * * *', () => {
    db.run('DELETE FROM dbo.Sessions WHERE ExpiresAt < SYSUTCDATETIME()').catch((err) => logger.error({ err }, 'session cleanup failed'));
  });

  const clientDir = path.resolve(process.cwd(), '../client/dist');
  const app = createApp({ db, config, logger }, { clientDir });
  const server = app.listen(config.PORT, config.HOST, () => {
    logger.info(`GrocerAI running at http://localhost:${config.PORT} (database ${db.databaseName}${config.GEMINI_API_KEY ? ', AI on' : ', AI off'})`);
  });

  const shutdown = () => {
    logger.info('shutting down');
    server.close(() => db.close().finally(() => process.exit(0)));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();
