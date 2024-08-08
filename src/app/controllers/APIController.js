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
            return res.status(500).json({ message: error.message });
        }
    }

    // [GET] /tollboths/report?offset=0&limit=10&imei=1,2,3&start_date=1723050000&end_date=1723050000
    async getReport(req, res) {
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
            // const currentPage = Math.floor(offset / limit) + 1;

            return res.status(200).json({
                // currentPage,
                result: true,
                message: 'Lấy dữ liệu thành công',
                status: 200,
                total_page: totalPage,
                data: reports,
            });
        } catch (error) {
            return res.status(500).json({ message: error.message });
        }
    }
}

module.exports = new APIController();
