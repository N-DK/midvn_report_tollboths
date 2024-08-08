const mqtt = require('mqtt');
const { createPromise } = require('../utils');
const tollboth = require('../modules/tollboth');

require('dotenv').config();

class MQTTService {
    constructor(host, messageCallback, io) {
        this.mqttClient = null;
        this.host = host;
        this.messageCallback = messageCallback;
        this.io = io;
        this.cars = {};
    }

    async initialize() {
        try {
            const results = tollboth.initData();
            this.highways = results;
        } catch (error) {
            console.error(error);
        }
    }

    connect() {
        this.mqttClient = mqtt.connect(this.host, {
            username: process.env.MQTT_USERNAME,
            password: process.env.MQTT_PASS,
        });

        // MQTT Callback for 'error' event
        this.mqttClient.on('error', (err) => {
            console.log(err);
            this.mqttClient.end();
        });

        // MQTT Callback for 'connect' event
        this.mqttClient.on('connect', () => {
            console.log(`MQTT client connected`);
        });

        // Call the message callback function when message arrived
        this.mqttClient.on('message', (topic, message) => {
            const data_vid = JSON.parse(message.toString());

            // if (
            //     this.cars.some(
            //         (car) =>
            //             car.dev_id === data_vid[0]?.id &&
            //             car.isStopChecked &&
            //             data_vid[0]?.state === '2' &&
            //             Number(data_vid[0]?.sp) <= 0,
            //     )
            // )
            //     return;

            tollboth.report(this.cars, this.highways, message);
            if (this.messageCallback) this.messageCallback(topic, message);
        });

        this.mqttClient.on('close', () => {
            console.log(`MQTT client disconnected`);
        });
    }

    // Subscribe to MQTT Message
    subscribe(topic, options) {
        this.mqttClient.subscribe(topic, options);
    }
}

module.exports = MQTTService;
