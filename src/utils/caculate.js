module.exports = {
  getDistance: function (origin, destination) {
    if (!origin[0] || !destination[0]) return 0;
    // return distance in meters

    var lon1 = this.toRadian(origin[1]),
      lat1 = this.toRadian(origin[0]),
      lon2 = this.toRadian(destination[1]),
      lat2 = this.toRadian(destination[0]);

    if (!lon1 || !lon2 || !lat1 || !lat2) {
      return 0;
    }
    var deltaLat = lat2 - lat1;
    var deltaLon = lon2 - lon1;

    var a =
      Math.pow(Math.sin(deltaLat / 2), 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.pow(Math.sin(deltaLon / 2), 2);
    var c = 2 * Math.asin(Math.sqrt(a));
    var EARTH_RADIUS = 6371;
    return c * EARTH_RADIUS * 1000;
  },
  toRadian: function (degree) {
    return (degree * Math.PI) / 180;
  },
};
