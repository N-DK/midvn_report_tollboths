const api = require('../routes/api');

const route = (app) => {
    app.use('/api/v1', api);
};

module.exports = route;
