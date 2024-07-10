const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const mime = require("mime-types");
const Redis = require('ioredis');
const dotenv = require('dotenv');

dotenv.config();

const PROJECT_ID = process.env.PROJECT_ID;
const REDIS_URL = process.env.REDIS_URL;

const publisher = new Redis(REDIS_URL);

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

function publishLog(log) {
  publisher.publish(`logs:${PROJECT_ID}`, JSON.stringify({ log }));
}

async function init() {
  console.log('Executing script.js');
  publishLog('Build Started...');

  const outDirPath = path.join(__dirname, 'output');
  const p = exec(`cd ${outDirPath} && npm install && npm run build`);

  p.stdout.on('data', function (data) {
    console.log(data.toString());
    publishLog(data.toString());
  });

  p.stderr.on('data', function (data) {
    console.error('Error:', data.toString());
    publishLog(`error: ${data.toString()}`);
  });

  p.on('close', async function () {
    console.log('Build Complete');
    publishLog('Build Complete');
    
    const distFolderPath = path.join(__dirname, 'output', 'dist');
    const distFolderContents = fs.readdirSync(distFolderPath, { recursive: true });

    publishLog('Starting to upload');
    for (const file of distFolderContents) {
      const filePath = path.join(distFolderPath, file);
      if (fs.lstatSync(filePath).isDirectory()) continue;

      console.log('Uploading', filePath);
      publishLog(`Uploading ${file}`);

      const command = new PutObjectCommand({
        Bucket: 'vercel-clone-pk',
        Key: `__outputs/${PROJECT_ID}/${file}`,
        Body: fs.createReadStream(filePath),
        ContentType: mime.lookup(filePath)
      });

      try {
        await s3Client.send(command);
        publishLog(`Uploaded ${file}`);
        console.log('Uploaded', filePath);
      } catch (err) {
        console.error('Error uploading', filePath, err);
        publishLog(`Error uploading ${file}: ${err.message}`);
      }
    }

    publishLog('Done');
    console.log('Done...');
  });
}

init();
