// db.js
const { Client } = require('pg');

const client = new Client({
  user: 'postgres',
  host: 'localhost',
  database: 'postgres',
  password: 'Vitor',
  port: 5432,
});

client.connect();

module.exports = client;
