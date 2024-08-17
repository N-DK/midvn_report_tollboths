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
            // create query
            const query = `('${car.dev_id}', ${point[0]}, ${
                point[1]
            }, ${tm}, '${car.dri}', '${highwayName}', ${Date.now()})`;

            // create report key
            const reportKey = `report:${car.dev_id}:${car.ref_id}:${tm}`;

            // check if the car has been reported in the last 5 minutes
            const keys = await redisClient.hGetAll('report');

            const keyFounds = Object.keys(keys).filter((key) =>
                key.includes(`report:${car.dev_id}:${car.ref_id}`),
            );

            keyFounds.sort((a, b) => {
                return Number(b.split(':')[3]) - Number(a.split(':')[3]);
            });

            const reportTime = keyFounds?.[0]?.split(':')?.[3];

            if (reportTime && Math.abs(tm - reportTime) < 300000) return;

            const reports = await tollboth.getReportByImeiAndName(
                car.dev_id,
                highwayName,
            );

            if (reports.length > 0) {
                const reportTime = reports[0].start_time;
                if (Math.abs(tm - reportTime) < 300000) return;
            }
            // ----------------------------

            // save report to redis
            await redisClient.hSet('report', reportKey, query);

            console.log(
                `Xe ${car.dev_id} đi vào ${highwayName} ${point[0]}, ${
                    point[1]
                } ${car.resync === '1' ? 'resync' : ''}`,
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

        var query = `INSERT INTO tbl_tollboths (id, name) VALUES `;
        tollBoth.forEach((node) => {
            query += `(${Number(node.id)}, '${
                Object.values(node.hData).pop().name
            }'),`;
        });
        query = query.slice(0, -1);
        con.query(query, (err, result) => {
            if (err) {
                console.log(err);
            }
        });

        return tollBoth;
    },

    sendReport: () => {
        setInterval(async () => {
            let query = `INSERT INTO report_tollboths (imei, lat, lng, start_time, dri, tollboth_name, create_at) VALUES `;
            const keys = await redisClient.hGetAll('report');

            if (keys && Object.keys(keys).length > 0) {
                Object.keys(keys).forEach((key) => {
                    query += `${keys[key]},`;
                });

                query = query.slice(0, -1);

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
                const key = `${vid}-${resync}`;

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

                        isStopChecked: true,
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

                    const isInWarning = !car.state && inBounds;
                    const isOutWarning = car.state && !inBounds;

                    if (isInWarning && process.indexOf(car.dev_id) === -1) {
                        tollboth.insertReport(car, point, tm, way?.name);
                        process.splice(process.indexOf(car.dev_id), 1);
                    } else if (isOutWarning) {
                        console.log(
                            `Xe ${car.dev_id} đi ra ${car.highway_name} ${
                                point[0]
                            } ${point[1]} ${
                                car.resync === '1' ? 'resync' : ''
                            }`,
                        );
                    }

                    car.state = inBounds;
                    car.isStopChecked =
                        state?.toString() !== '3' && Number(sp) <= 0;
                }
            }
        } catch (error) {
            console.log(error);
        }
    },

    getAllReports: async (offset, limit) => {
        const query = `SELECT r.imei, r.lat, r.lng, r.start_time, t.name, f.fee, r.dri FROM report_tollboths r JOIN tbl_tollboths t ON r.tollboth_name = t.name JOIN tbl_tollboths_vehicle_fee f ON t.id = f.tollboth_id AND vehicle_id = 15 LIMIT ${limit} OFFSET ${offset}`;
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

    getReportByImeiAndName: async (imei, name) => {
        const query = `SELECT * FROM report_tollboths WHERE imei = '${imei}' AND tollboth_name = '${name}' ORDER BY start_time DESC`;
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

    addFee: async (tollboth_id, payload) => {
        let query = `INSERT INTO tbl_tollboths_vehicle_fee (tollboth_id, vehicle_id, fee) VALUES `;

        payload.forEach((item) => {
            query += `(${tollboth_id}, ${item.id}, ${item.fee}),`;
        });

        query = query.slice(0, -1);

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

    updateFee: async (tollboth_id, payload) => {
        let query = `UPDATE tbl_tollboths_vehicle_fee SET fee = CASE vehicle_id `;
        payload.forEach((item) => {
            query += `WHEN ${item.id} THEN ${item.fee} `;
        });

        query += `END, update_at = ${Date.now()} WHERE vehicle_id IN (${payload
            .map((item) => item.id)
            .join(',')})`;
        query += ` AND tollboth_id = ${tollboth_id} AND is_editable = 1`;

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

    async getReports(req, res, includeFee) {
        let { offset, limit, imei, start_date, end_date } = req.query;
        offset = parseInt(offset, 10) || 0;
        limit = parseInt(limit, 10) || 10;

        if (!imei || !start_date || !end_date) {
            return res.status(400).json({
                result: false,
                status: 500,
                message: 'Đã xảy ra lỗi',
                errors: [],
            });
        }

        imei = imei.split(',');
        start_date = parseInt(start_date, 10);
        end_date = parseInt(end_date, 10);

        try {
            const totalReports = await tollboth.countAllReports();
            let reports = await tollboth.getAllReports(offset, limit);

            reports = reports.filter(
                (report) =>
                    imei.includes(report.imei) &&
                    report.start_time >= start_date &&
                    report.start_time <= end_date,
            );

            const totalPage = Math.ceil(totalReports / limit);

            if (!includeFee) {
                reports = reports.map(({ fee, ...rest }) => rest);
            }

            return res.status(200).json({
                result: true,
                message: 'Lấy dữ liệu thành công',
                status: 200,
                total_page: totalPage,
                data: reports,
            });
        } catch (error) {
            return res.status(500).json({ message: error.message });
        }
    },

    isValidData: (message) => {
        const data_vid = JSON.parse(message.toString());
        if (!data_vid[0] || data_vid?.length === 0) return;
        const { tm, resync, vid, id, mlat, mlng, sp, state } = data_vid[0];
        if (!tm || !resync || !vid || !id || !mlat || !mlng || !sp || !state) {
            return;
        }

        return data_vid[0];
    },
};

module.exports = tollboth;
