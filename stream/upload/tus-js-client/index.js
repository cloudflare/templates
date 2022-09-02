import fs from 'fs';
import tus from 'tus-js-client';
import * as url from 'url';
import process from 'process';
import * as dotenv from 'dotenv';
dotenv.config()

const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

const { CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN } = process.env;

const path = `${__dirname}default.mp4`;
const file = fs.createReadStream(path);
const size = fs.statSync(path).size;
const endpoint = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/stream`;
const headers = {
	Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
};

let mediaId = '';

const options = {
	endpoint,
	headers,
	chunkSize: 50 * 1024 * 1024, // Required a minimum chunk size of 5MB, here we use 50MB.
	resume: true,
	uploadSize: size,
	onError: error => {
		throw error;
	},
	onProgress: (bytesUploaded, bytesTotal) => {
		const percentage = ((bytesUploaded / bytesTotal) * 100).toFixed(2);
		console.log(bytesUploaded, bytesTotal, percentage + '%');
	},
	onSuccess: () => {
		console.log('Upload finished');
	},
	onAfterResponse: (req, res) => {
		return new Promise(resolve => {
			const mediaIdHeader = res.getHeader('stream-media-id');
			if (mediaIdHeader) {
				mediaId = mediaIdHeader;
				console.log(`Cloudflare Stream UID for uploaded video: ${mediaId}`);
			}
			resolve();
		});
	},
};

const upload = new tus.Upload(file, options);
upload.start();
