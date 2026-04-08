/**
 * Sequelize instance — Render Postgres bilan.
 *
 * Render external Postgres SSL'ni majburiy talab qiladi va sertifikat self-signed
 * bo'lishi mumkin, shuning uchun rejectUnauthorized=false standart pattern.
 */

const { Sequelize } = require('sequelize');
const config = require('../config');

const sequelize = new Sequelize(config.databaseUrl, {
  dialect: 'postgres',
  logging: config.databaseLogging ? (msg) => console.log(`[sql] ${msg}`) : false,
  dialectOptions: config.databaseSsl
    ? {
        ssl: {
          require: true,
          rejectUnauthorized: false,
        },
      }
    : {},
  pool: {
    max: 10,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
  define: {
    underscored: true,
    freezeTableName: true,
    timestamps: true,
  },
});

module.exports = sequelize;
