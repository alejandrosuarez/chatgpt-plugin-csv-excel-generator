// Import necessary modules
const express = require('express');
const fs = require('fs');
const cors = require('cors');
const path = require('path');
const bodyParser = require('body-parser');
const fastcsv = require('fast-csv');
const crypto = require('crypto');
const dotenv = require('dotenv');
const schedule = require('node-schedule');

// Load environment variables from .env file
dotenv.config();
const debug = process.env.DEBUG === 'true' || false;
const port = process.env.PORT || 80;
const domainName = process.env.DOMAIN_NAME || 'http://localhost';
const uploadDirPath = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
const logDirPath = process.env.LOG_DIR || path.join(__dirname, 'logs');

const url = (port === "80") ? domainName : `${domainName}:${port}`;

const staticDir = path.join(__dirname, 'static');

// Initialize Express application
const app = express();

// Enable CORS for all routes
app.use(cors());


// This function deletes a file
function deleteFile(filePath) {
    fs.unlink(filePath, (err) => {
        if (err) {
            console.error(`Error deleting file: ${err}`);
        } else {
            console.log(`File deleted: ${filePath}`);
        }
    });
}

// This function checks the files in the directory and deletes any that are older than 30 minutes
function checkFiles() {
    const directoryPath = uploadDirPath;

    fs.readdir(directoryPath, (err, files) => {
        if (err) {
            console.error(`Error reading directory: ${err}`);
            return;
        }

        files.forEach((file) => {
            const filePath = path.join(directoryPath, file);

            fs.stat(filePath, (err, stats) => {
                if (err) {
                    console.error(`Error getting file stats: ${err}`);
                    return;
                }

                const now = Date.now();
                const fileAge = now - stats.birthtimeMs;

                // If the file is older than 30 minutes, delete it
                if (fileAge > 1800000) {
                    deleteFile(filePath);
                }
            });
        });
    });
}

// Schedule the checkFiles function to run every 30 minutes
schedule.scheduleJob('*/30 * * * *', checkFiles);

// Parse incoming request bodies
app.use(express.json());
app.use(bodyParser.json());

// Serve index.html file
app.get('/', (req, res) => {
    res.sendFile(staticDir + '/index.html');
});

// Serve ai-plugin.json file
app.get('/.well-known/ai-plugin.json', (req, res) => {
    // get the ai-plugin.json file contents and replace all [URL_HERE] with the URL of the app
    const aiPluginJson = fs.readFileSync(staticDir + '/ai-plugin.json', 'utf8');
    const aiPluginJsonWithUrl = aiPluginJson.replace(/\[URL_HERE\]/g, url);
    // set headers and send the file
    res.setHeader('Content-Type', 'application/json');
    res.send(aiPluginJsonWithUrl);
});

// Serve openapi.yaml file
app.get('/openapi.yaml', (req, res) => {
    res.sendFile(staticDir + '/openapi.yaml');
});

// Serve logo.png file
app.get('/logo.png', (req, res) => {
    res.sendFile(staticDir + '/logo.png');
});

// Legal route, display txt file with legal information in the browser
app.get('/legal', (req, res) => {
    res.sendFile(staticDir + '/legal.txt');
});

// Serve static files from the 'uploads' directory
app.use('/uploads', express.static(uploadDirPath));

// If debug mode is enabled, log all incoming requests
if (debug) {
    const myMiddleware = (req, res, next) => {
        const log = {
            timestamp: new Date(),
            method: req.method,
            path: req.path,
            body: req.body,
            query: req.query,
        };

        // Create 'logs' directory if it doesn't exist
        if (!fs.existsSync(logDirPath)) {
            fs.mkdirSync(logDirPath);
        }

        // Write the log to a file
        fs.writeFile(`${logDirPath}/${Date.now()}.json`, JSON.stringify(log, null, 2), (err) => {
            if (err) {
                console.error(err);
            }
        });

        next();
    };

    app.use(myMiddleware);
}

// Handle POST requests to '/generate-csv'
app.post('/generate-csv', (req, res) => {
    const data = req.body.data;

    // Validate the data
    if (!Array.isArray(data) || !data.length || !Array.isArray(data[0])) {
        return res.status(400).json({ error: 'Invalid data. Expected an array of arrays.' });
    }

    // Generate a random file name
    const fileName = crypto.randomBytes(8).toString('hex') + '.csv';
    const filePath = path.join(uploadDirPath, fileName);

    // Create 'uploads' directory if it doesn't exist
    if (!fs.existsSync(uploadDirPath)) {
        fs.mkdirSync(uploadDirPath);
    }

    // Create a write stream
    const ws = fs.createWriteStream(filePath);

    // Write the data to a CSV file
    fastcsv
        .write(data, { headers: true })
        .on('finish', function () {
            console.log(`CSV file successfully created at ${filePath}`);
            res.json({ url: `${url}/uploads/${fileName}` });
        })
        .pipe(ws);
});

// Start the server
app.listen(port, () => {
    console.log(`CSV generator app listening at ${domainName}:${port}`);
});