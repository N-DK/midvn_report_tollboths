const stringConstant = require('../constant/string.constant');
const geolib = require('geolib');

const swith = {
    km2_2_m2(d) {
        return d * Math.pow(10, 6);
    },
    m2_2_km2(d) {
        return d * Math.pow(10, -6);
    },
    fixedNum(d) {
        return Number(d?.toFixed?.(5));
    },
    fixedString(d) {
        return d?.toFixed?.(5);
    },
    fixedFloor2(num) {
        return num.toString().match(/^-?\d+(?:\.\d{0,2})?/)[0];
    },

    getLatLng(node) {
        return {
            latitude: Number(node?.[0]),
            longitude: Number(node?.[1]),
        };
    },
    getLatLngBound(bound) {
        return bound?.map?.((p) => ({
            latitude: p?.[0],
            longitude: p?.[1],
        }));
    },
    getBound(bound) {
        const boundLatLng = swith.getLatLngBound(bound);

        const { maxLat, maxLng, minLat, minLng } =
            geolib.getBounds(boundLatLng);

        const bound_ = [
            [minLat, minLng],
            [minLat, maxLng],
            [maxLat, maxLng],
            [maxLat, minLng],
        ];

        return bound_;
    },
    getPointBetween2Point(point1, point2, num = 1) {
        const lat1 = Number(point1?.[0]);
        const lng1 = Number(point1?.[1]);
        const lat2 = Number(point2?.[0]);
        const lng2 = Number(point2?.[1]);

        const center = geolib.getCenter([
            swith.getLatLng(point1),
            swith.getLatLng(point2),
        ]);

        if (num == 1) {
            return [center];
        }

        const p1 = geolib.getCenter([swith.getLatLng(point1), center]);
        const p3 = geolib.getCenter([center, swith.getLatLng(point2)]);

        if (num == 3) {
            return [p1, center, p3];
        }
        if (num == 7) {
            return [
                geolib.getCenter([swith.getLatLng(point1), center]),
                center,
                geolib.getCenter([center, swith.getLatLng(point2)]),
            ];
        }
    },

    getKeyFloor2(node) {
        const step = stringConstant.step;
        const minLat = swith.fixedFloor2(Number(node?.[0]));
        const minLng = swith.fixedFloor2(Number(node?.[1]));
        const maxLat = swith.fixedFloor2(Number(node?.[0]) + step);
        const maxLng = swith.fixedFloor2(Number(node?.[1]) + step);

        return {
            key: `${minLat}_${minLng}__${maxLat}_${maxLng}`,
            payload: {
                minLat,
                minLng,
                maxLat,
                maxLng,
            },
        };
    },
};

module.exports = swith;
