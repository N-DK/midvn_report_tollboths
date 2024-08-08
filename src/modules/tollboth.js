const { con } = require('../config/db');
const { isPointInBounds } = require('../utils');
let process = [];
const { createPromise } = require('../utils');
const { default: axios } = require('axios');
const { TOKEN } = require('../constant');
const getWays = require('./getWay');
const swith = require('../utils/switch');
const redisClient = require('../service/redis');

let cachedResults = null;

const tollboth = {
    insertReport: async (car, point, tm, highwayName) => {
        try {
            process.push(car.dev_id);
            const query = `('${car.dev_id}', ${point[0]}, ${
                point[1]
            }, ${tm}, '${car.dri}', '${highwayName}', ${Date.now()})`;
            const reportKey = `report:${car.dev_id}:${car.ref_id}:${tm}`;

            const keys = await redisClient.hGetAll('report');
            const match = Object.keys(keys)?.pop()?.split(':')?.pop();

            if (match && tm - match < 300000) return;

            await redisClient.hSet('report', reportKey, query);

            console.log(
                `Xe ${car.dev_id} đi vào ${highwayName} ${
                    car.resync === '1' ? 'resync' : car.resync
                }`,
            );

            car.highway_name = highwayName;
        } catch (error) {
            console.log(error);
        }
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

        // insert into db
        tollBoth.forEach((node) => {
            const query = `INSERT INTO tollboths (id, ref, hData, keyData, highways) VALUES ('${
                node.id
            }', '${node.ref}', '${JSON.stringify(
                node.hData,
            )}', '${JSON.stringify(node.keyData)}', '${JSON.stringify(
                node.highways,
            )}')`;
            con.query(query, (err, result) => {
                if (err) {
                    console.log(err);
                }
            });
        });

        return tollBoth;
    },

    sendReport: () => {
        setInterval(async () => {
            let query = `INSERT INTO report_tollboths (imei, lat, lng, start_time, dri, tollboth_name, create_at) VALUES`;
            const keys = await redisClient.hGetAll('report');

            if (keys && Object.keys(keys).length > 0) {
                console.log(`Đang gửi ${Object.keys(keys).length} báo cáo`);
                Object.keys(keys).forEach((key) => (query += keys[key]));
                con.query(query, async (err, result) => {
                    if (err) {
                        console.log(err);
                    } else {
                        Object.keys(keys).forEach(async (key) => {
                            await redisClient.hDel('report', key);
                        });
                    }
                });
                console.log(`Đã gửi ${Object.keys(keys).length} báo cáo`);
            }
        }, 10000);
    },

    report: async (cars, tollboths, message) => {
        try {
            if (!tollboth.isValidData(message)) return;
            const {
                tm,
                driJn: dri,
                resync,
                vid,
                id,
                mlat,
                mlng,
                sp,
                state,
            } = tollboth?.isValidData(message);

            const point = [Number(mlat), Number(mlng)];

            const key = swith.getKeyFloor2(point)?.key;

            var netKeys = tollboths.netKeys;
            var data = tollboths.data;

            const boundList = netKeys?.[key] || [];

            for (let wayId of boundList) {
                const way = data?.[wayId];
                const ref_id = Number(way?.id.split('-')[0]);
                // const key = `${vid}-${ref_id}-${resync}`;
                const key = vid;

                const inBounds = isPointInBounds(point, way?.buffer_geometry);

                if (!cars[key]) {
                    const car = {
                        ref_id,
                        vid: vid,
                        dev_id: id,
                        resync: resync,
                        dri: dri,
                        state: inBounds,
                        highway_name: way?.name,
                        isStopChecked: false,
                    };
                    if (inBounds && process.indexOf(car.dev_id) === -1) {
                        tollboth.insertReport(car, point, tm, way?.name);
                        cars[key] = car;
                        process.splice(process.indexOf(car.dev_id), 1);
                    } else if (!inBounds) {
                        cars[key] = car;
                    }
                } else {
                    const car = cars[key];

                    // if (car.ref_id === ref_id && car.resync === resync) {

                    // }
                    const isInWarning = !car.state && inBounds;
                    const isOutWarning = car.state && !inBounds;

                    if (isInWarning && process.indexOf(car.dev_id) === -1) {
                        tollboth.insertReport(car, point, tm, way?.name);
                        process.splice(process.indexOf(car.dev_id), 1);
                    } else if (isOutWarning) {
                        console.log(
                            `Xe ${car.dev_id} đi ra ${car.highway_name} ${
                                car.resync === 1 ? 'resync' : car.resync
                            }`,
                        );
                    }

                    car.state = inBounds;
                    car.isStopChecked =
                        state?.toString() === '2' && Number(sp) <= 0;
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

    isValidData: (message) => {
        const data_vid = JSON.parse(message.toString());
        if (!data_vid[0] || data_vid?.length === 0) return;
        const {
            tm,
            driJn: dri,
            resync,
            vid,
            id,
            mlat,
            mlng,
            sp,
            state,
        } = data_vid[0];
        if (
            !tm ||
            !dri ||
            !resync ||
            !vid ||
            !id ||
            !mlat ||
            !mlng ||
            !sp ||
            !state
        ) {
            return;
        }

        return data_vid[0];
    },
};

module.exports = tollboth;
