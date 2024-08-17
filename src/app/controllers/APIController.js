const tollboth = require('../../modules/tollboth');
const fs = require('fs');

class APIController {
    // [GET] /
    async index(req, res) {
        res.json({ message: 'Welcome to the API' });
    }

    // [GET] /tollboths/pull
    async pullTollBoths(req, res) {
        try {
            const tollboths = await tollboth.pullData();
            if (tollboths.length > 0) {
                tollboths.forEach((item, index) => {
                    fs.writeFileSync(
                        `./src/common/tollboths/tollboths-${index}.json`,
                        JSON.stringify(item),
                    );
                });
                return res
                    .status(200)
                    .json({ message: 'Pull data successfully' });
            } else {
                return res.status(404).json({ message: 'No data to pull' });
            }
        } catch (error) {
            console.log(error);

            return res.status(500).json({ message: error.message });
        }
    }

    // [POST] /tollboths/add-fee?tollboth_id=1
    async addFee(req, res) {
        const { tollboth_id } = req.query;
        const payload = req.body;

        if (!tollboth_id || !payload) {
            return res.status(400).json({
                result: false,
                status: 500,
                message: 'Đã xảy ra lỗi',
                errors: [],
            });
        }

        try {
            const result = await tollboth.addFee(tollboth_id, payload);

            return res.status(200).json({
                result: true,
                message: 'Thêm phí thành công',
                status: 200,
                data: result,
            });
        } catch (error) {
            return res.status(500).json({ message: error.message });
        }
    }

    // [PUT] /tollboths/update-fee?tollboth_id=1
    async updateFee(req, res) {
        const { tollboth_id } = req.query;
        const payload = req.body;

        if (!tollboth_id || !payload) {
            return res.status(400).json({
                result: false,
                status: 500,
                message: 'Đã xảy ra lỗi',
                errors: [],
            });
        }

        try {
            const result = await tollboth.updateFee(tollboth_id, payload);

            return res.status(200).json({
                result: true,
                message: 'Cập nhật phí thành công',
                status: 200,
                data: result,
            });
        } catch (error) {
            return res.status(500).json({ message: error.message });
        }
    }

    // [GET] /tollboths/report?offset=0&limit=10&imei=1,2,3&start_date=1723050000&end_date=1723050000
    async getReport(req, res) {
        return tollboth.getReports(req, res, false);
    }

    // [GET] /tollboths/report/fee?offset=0&limit=10&imei=1,2,3&start_date=1723050000&end_date=1723050000
    async getReportWithFee(req, res) {
        return tollboth.getReports(req, res, true);
    }
}

module.exports = new APIController();
