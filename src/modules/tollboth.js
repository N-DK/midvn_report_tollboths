const { con } = require('../config/db');
const { isPointInBounds } = require('../utils');
const fs = require('fs');
const path = require('path');
let process = [];
const { createPromise } = require('../utils');
const { default: axios } = require('axios');
const { TOKEN } = require('../constant');
const getWays = require('./getWay');
const swith = require('../utils/switch');
const getFileInfo = require('../utils/getFileInfo');
const redisClient = require('../service/redis');

let cachedResults = null;

const tollboth = {
    insertReport: async (car, point, tm, highwayName) => {
        process.push(car.dev_id);
        const query = `INSERT INTO report_tollboths (imei, lat, lng, start_time, dri, tollboth_name, create_at, update_at) VALUES ('${
            car.dev_id
        }', ${point[0]}, ${point[1]}, ${tm}, '${
            car.dri
        }', '${highwayName}', ${Date.now()}, ${Date.now()})`;
        const reportKey = `report:${car.dev_id}:${car.ref_id}:${tm}`;
        await redisClient.set(reportKey, query);

        console.log(
            `Xe ${car.dev_id} đi vào ${highwayName} ${
                car.resync === 1 ? 'resync' : ''
            }`,
        );

        car.highway_name = highwayName;
    },

    initData: () => {
        if (!cachedResults) {
            console.time('Loading data');

            const tollboths = createPromise('tollboths');

            let netKeys = {};
            let data = {};

            const processItems = (items) => {
                items
                    .filter((item) => item.isDelete !== 1)
                    .forEach((item) => {
                        Object.assign(netKeys, item.keyData);
                        Object.assign(data, item.hData);
                    });
            };

            processItems(tollboths);

            console.timeEnd('Loading data');

            cachedResults = { netKeys, data };

            return cachedResults;
        } else if (cachedResults) {
            return cachedResults;
        }
    },

    pullData: async () => {
        console.log('LOADING...');
        const res = await axios.get(
            `https://gps3.binhanh.vn/api/v1/landmarks/systemlandmark/1`,
            {
                headers: {
                    Authorization: `Bearer ${TOKEN}`,
                },
            },
        );
        console.log('LOADED');
        const vietNameTollBoth = res?.data?.data?.filter(
            (node) =>
                node.lname.toLowerCase().includes('trạm') && node.pgon !== '',
        );

        var tollBoth = vietNameTollBoth.map((node, index) => {
            var bufferedLineCoords = node.pgon
                .split(',')
                .map((coord, index) => {
                    if (index % 2 === 0) {
                        return [
                            Number(node.pgon.split(',')[index + 1]),
                            Number(coord),
                        ];
                    }
                    return null;
                })
                .filter((buffer) => buffer !== null);

            return {
                id: index,
                ref: 'Trạm thu phí',
                highways: [
                    {
                        highway_name: node?.lname,
                        ways: [
                            {
                                nodes: [[Number(node.lng), Number(node.lat)]],
                                buffer_geometry: bufferedLineCoords,
                            },
                        ],
                    },
                ],
            };
        });

        tollBoth = tollBoth.map((node, index) => {
            const ways = getWays(node.highways, index);

            return {
                id: node.id,
                ref: node.ref,
                hData: ways.hData,
                keyData: ways.keyData,
                highways: node.highways,
            };
        });

        return tollBoth;
    },

    sendReport: () => {
        setInterval(async () => {
            const result = await redisClient.scan('0', 'MATCH', 'report:*');
            const keys = result.keys;
            if (keys.length > 0) {
                console.log(`Đang gửi ${keys.length} báo cáo`);
                for (const key of keys) {
                    const query = await redisClient.get(key);
                    con.query(query, async (err, result) => {
                        if (err) {
                            console.log(err);
                        } else {
                            await redisClient.del(key);
                        }
                    });
                }
                console.log(`Đã gửi ${keys.length} báo cáo`);
            }
        }, 60000);
    },

    report: async (cars, tollboths, message) => {
        try {
            const data_vid = JSON.parse(message.toString());
            const point = [
                Number(data_vid[0]?.mlat),
                Number(data_vid[0]?.mlng),
            ];
            const { tm, driJn: dri, resync, vid, id } = data_vid[0];

            if (!tm) {
                return;
            }

            const key = swith.getKeyFloor2(point)?.key;

            var netKeys = tollboths.netKeys;
            var data = tollboths.data;

            const boundList = netKeys?.[key] || [];

            for (let wayId of boundList) {
                const way = data?.[wayId];
                const ref_id = Number(way?.id.split('-')[0]);

                const carIndex = cars.findIndex(
                    (car) =>
                        car.vid === vid &&
                        car.ref_id === ref_id &&
                        car.resync === resync,
                );

                const inBounds = isPointInBounds(point, way?.buffer_geometry);

                if (carIndex === -1) {
                    const car = {
                        ref_id,
                        vid: vid,
                        dev_id: id,
                        resync: resync,
                        dri: dri,
                        state: inBounds,
                        highway_name: way?.name,
                    };
                    if (inBounds && process.indexOf(car.dev_id) === -1) {
                        tollboth.insertReport(car, point, tm, way?.name);
                        cars.push(car);
                        process.splice(process.indexOf(car.dev_id), 1);
                    } else if (!inBounds) {
                        cars.push(car);
                    }
                } else {
                    const car = cars[carIndex];
                    if (
                        car.ref_id === ref_id &&
                        car.resync === data_vid[0]?.resync
                    ) {
                        const isInWarning = !car.state && inBounds;
                        const isOutWarning = car.state && !inBounds;

                        if (isInWarning && process.indexOf(car.dev_id) === -1) {
                            tollboth.insertReport(car, point, tm, way?.name);
                            process.splice(process.indexOf(car.dev_id), 1);
                        } else if (isOutWarning) {
                            console.log(
                                `Xe ${car.dev_id} đi ra ${car.highway_name} ${
                                    car.resync === 1 ? 'resync' : ''
                                }`,
                            );
                        }

                        car.state = inBounds;
                    }
                }
            }
        } catch (error) {
            console.log(error);
        }
    },

    getAllReports: async (offset, limit) => {
        const query = `SELECT * FROM report_tollboths LIMIT ${limit} OFFSET ${offset}`;
        return new Promise((resolve, reject) => {
            con.query(query, (err, result) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(result);
                }
            });
        });
    },

    countAllReports: async () => {
        const query = `SELECT COUNT(*) as total FROM report_tollboths`;
        return new Promise((resolve, reject) => {
            con.query(query, (err, result) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(result[0].total);
                }
            });
        });
    },
};

module.exports = tollboth;
