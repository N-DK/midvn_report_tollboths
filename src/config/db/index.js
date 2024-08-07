var mysql = require('mysql');

require('dotenv').config();

var con = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
});

async function connect() {
    try {
        await con.connect();
        console.log('Connected to MySQL');
    } catch (error) {
        console.error('Error during DB connection', error);
        process.exit(1);
    }
}

module.exports = { connect, con };
