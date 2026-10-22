const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000
});

pool.on('error', (err) => {
    console.error('⚠️ [MySQL Pool Error]:', err.message);
    if (err.code === 'PROTOCOL_CONNECTION_LOST') {
        console.warn('⚠️ [MySQL] Koneksi terputus (PROTOCOL_CONNECTION_LOST). Pool akan membuat koneksi baru saat query berikutnya.');
    }
});

module.exports = pool;