const fs = require('fs');
const path = require('path');

const getFileInfo = (dir) => {
    const files = fs.readdirSync(dir);

    if (files.length === 0) {
        console.error('No files found in the directory.');
        return;
    }

    function extractNumberFromFileName(fileName) {
        const match = fileName.match(/report-(\d+)\.json/);
        if (match) {
            return Number(match[1]);
        } else {
            console.error('Invalid file name format:', fileName);
            return NaN;
        }
    }

    files.sort(
        (a, b) => extractNumberFromFileName(a) - extractNumberFromFileName(b),
    );

    const length = files.length;

    const start = extractNumberFromFileName(files[0]);

    const end = extractNumberFromFileName(files[length - 1]);

    if (isNaN(start) || isNaN(end)) {
        console.error('Failed to extract numbers from file names.');
        process.exit(1);
    }

    return {
        start,
        end,
        length,
    };
};

module.exports = getFileInfo;
