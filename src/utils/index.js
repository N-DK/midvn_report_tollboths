const fs = require('fs');
const path = require('path');

const haversineDistance = (lat1, lon1, lat2, lon2) => {
    const toRad = (angle) => angle * (Math.PI / 180);

    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) *
            Math.cos(toRad(lat2)) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return distance;
};

function isPointInCircle(center, r, point) {
    const [x, y] = center;
    const x1 = Number(point[0]),
        y1 = Number(point[1]);
    const distance = haversineDistance(x, y, x1, y1) * 1000;
    return distance <= r;
}

function isPointInBounds(point, bounds) {
    const x = Number(point[0]),
        y = Number(point[1]);
    let inside = false;
    for (let i = 0, j = bounds.length - 1; i < bounds.length; j = i++) {
        const xi = bounds[i][0],
            yi = bounds[i][1];
        const xj = bounds[j][0],
            yj = bounds[j][1];

        const intersect =
            yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
        if (intersect) inside = !inside;
    }
    return inside;
}

function isPointInHighway(point, highways) {
    for (const highway of highways) {
        if (highway.isDelete !== 1) {
            for (const way of highway.ways) {
                if (isPointInBounds(point, way.buffer_geometry)) {
                    return {
                        isInBounds: true,
                        max_speed: way.maxSpeed,
                        min_speed: way.minSpeed,
                        highway_name: way.way_name ?? highway.highway_name,
                        key: `${highway.id}-${way.id}`,
                    };
                }
            }
        }
    }
    return {
        isInBounds: false,
    };
}

function createPromise(col, req) {
    const results = [];
    const length = fs.readdirSync(`./src/common/${col}`).length;

    for (let i = 0; i < length; i++) {
        const filePath = path.join(`./src/common/${col}`, `${col}-${i}.json`);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

        results.push(data);
    }

    return results;
}

module.exports = {
    haversineDistance,
    isPointInCircle,
    isPointInBounds,
    isPointInHighway,
    createPromise,
};
