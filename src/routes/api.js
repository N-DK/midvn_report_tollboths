const express = require('express');
const router = express.Router();
const api = require('../app/controllers/APIController');

// router.get('/tollboths/get-all', api.getAllTollBoths);
// router.put('/tollboths/delete/:id', api.deleteTollBoth);
// router.put('/tollboths/restore/:id', api.restoreTollBoth);
router.get('/tollboths/pull', api.pullTollBoths);
router.get('/tollboths/report', api.getReport);
router.get('/tollboths/report/fee', api.getReportWithFee);
router.post('/tollboths/add-fee', api.addFee);
router.put('/tollboths/update-fee', api.updateFee);
router.get('/', api.index);

module.exports = router;
