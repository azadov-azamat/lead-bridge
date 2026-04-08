/**
 * Umzug migration runner.
 *
 * CLI:
 *   node src/db/umzug.js up        # barcha pending migration'larni qo'llaydi
 *   node src/db/umzug.js down      # so'nggi migration'ni rollback qiladi
 *   node src/db/umzug.js status    # holatni ko'rsatadi
 *
 * Programmatic:
 *   const { migrator } = require('./db/umzug');
 *   await migrator.up();
 */

const path = require('path');
const { Umzug, SequelizeStorage } = require('umzug');
const sequelize = require('./sequelize');

const migrator = new Umzug({
  migrations: {
    glob: path.join(__dirname, 'migrations/*.js'),
    resolve: ({ name, path: migrationPath, context }) => {
      const migration = require(migrationPath);
      return {
        name,
        up: async () => migration.up({ context, Sequelize: sequelize.constructor }),
        down: async () => migration.down({ context, Sequelize: sequelize.constructor }),
      };
    },
  },
  context: sequelize.getQueryInterface(),
  storage: new SequelizeStorage({ sequelize }),
  logger: console,
});

module.exports = { migrator };

// CLI rejimi
if (require.main === module) {
  (async () => {
    const cmd = process.argv[2] || 'up';
    try {
      if (cmd === 'up') {
        const applied = await migrator.up();
        console.log(`[migrate] ${applied.length} ta migration qo'llandi`);
      } else if (cmd === 'down') {
        const reverted = await migrator.down();
        console.log(`[migrate] ${reverted.length} ta migration rollback qilindi`);
      } else if (cmd === 'status') {
        const executed = await migrator.executed();
        const pending = await migrator.pending();
        console.log('Executed:', executed.map((m) => m.name));
        console.log('Pending: ', pending.map((m) => m.name));
      } else {
        console.error(`Noma'lum buyruq: ${cmd}`);
        process.exit(1);
      }
      await sequelize.close();
      process.exit(0);
    } catch (err) {
      console.error('[migrate] xato:', err);
      await sequelize.close().catch(() => {});
      process.exit(1);
    }
  })();
}
