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

    // [GET] /tollboths/report?offset=0&limit=10
    async getReport(req, res) {
        let { offset, limit } = req.query;
        offset = parseInt(offset, 10) || 0;
        limit = parseInt(limit, 10) || 10;

        try {
            const totalReports = await tollboth.countAllReports();
            const reports = await tollboth.getAllReports(offset, limit);

            const totalPage = Math.ceil(totalReports / limit);
            // const currentPage = Math.floor(offset / limit) + 1;

            return res.status(200).json({
                // currentPage,
                total_page: totalPage,
                total_record: totalReports,
                data: reports,
            });
        } catch (error) {
            return res.status(500).json({ message: error.message });
        }
    }
}

module.exports = new APIController();
