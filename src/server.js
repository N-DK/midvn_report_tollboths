const express = require('express');
const app = express();
const http = require('http');
const cors = require('cors');
var bodyParser = require('body-parser');

const route = require('./routes');
const db = require('./config/db');
const MQTTService = require('./service/mqttService');
const tollboth = require('./modules/tollboth');

require('dotenv').config();
const port = process.env.PORT || 3000;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: false }));

// Connect DB
const connectDB = async () => {
    try {
        await db.connect();
        await tollboth.initData();
    } catch (error) {
        console.error('Error during initialization', error);
        process.exit(1);
    }
};

const server = http.createServer(app);

// connect redis
const redisClient = require('./service/redis');
redisClient.connect();

// Connect DB, then start server
connectDB().then(async () => {
    const mqttService = new MQTTService(process.env.MQTT_HOST, null, null);
    await mqttService.initialize();
    mqttService.connect();
    mqttService.subscribe('live/status');

    tollboth.sendReport();

    route(app);

    server.listen(port, () => {
        console.log(`Example app listening on port ${port}`);
    });
});
