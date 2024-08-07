const express = require('express');
const router = express.Router();
const api = require('../app/controllers/APIController');

// router.get('/tollboths/get-all', api.getAllTollBoths);
// router.put('/tollboths/delete/:id', api.deleteTollBoth);
// router.put('/tollboths/restore/:id', api.restoreTollBoth);
router.get('/tollboths/pull', api.pullTollBoths);
router.get('/tollboths/report', api.getReport);
router.get('/', api.index);

module.exports = router;
