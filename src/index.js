import Hyperswarm from 'hyperswarm';
import Hyperbee from 'hyperbee';
import Hypercore from 'hypercore';
import crypto from 'crypto';
import { pipeline } from 'stream';
import readline from 'readline';
import fs from 'fs';
import path from 'path';

// Parse command-line arguments to determine if this peer is a writer or reader
const isWriter = process.argv.includes('writer');

// Constants for the chat room configuration
const CHAT_TOPIC = 'my-chat-room';
const COMMON_KEY_PASSPHRASE = 'super-secret-passphrase'; // All peers must know this

const STORAGE_DIR = `./storage/${process.pid}`;
const KEY_FILE = path.join(STORAGE_DIR, 'common-feed-key');

// Generate a consistent topic hash for peer discovery
const TOPIC_HASH = crypto.createHash('sha256').update(CHAT_TOPIC).digest();

// Function to create or load the common key
const getOrCreateCommonKey = () => {
	if (fs.existsSync(KEY_FILE)) {
		// Load the key if it exists
		return fs.readFileSync(KEY_FILE);
	} else {
		// Create a new key based on the passphrase (used by the writer initially)
		const key = crypto.createHash('sha256').update(COMMON_KEY_PASSPHRASE).digest();
		fs.writeFileSync(KEY_FILE, key);
		return key;
	}
};

// Initialize Hyperswarm for peer-to-peer connectivity
const swarm = new Hyperswarm();

// Ensure storage directory exists
if (!fs.existsSync(STORAGE_DIR)) {
	fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

// Create or load the shared Hypercore feed key
const commonKey = getOrCreateCommonKey();
console.log(`Using common key: ${commonKey.toString('hex')}`);

// Setup a Hypercore feed with the shared key for all peers
const feed = new Hypercore(path.join(STORAGE_DIR, 'feed'), commonKey, { valueEncoding: 'utf-8', writable: isWriter });

// Setup a Hyperbee database on top of the Hypercore feed
const db = new Hyperbee(feed, {
	keyEncoding: 'utf-8',
	valueEncoding: 'utf-8',
});

(async () => {
	// Ensure the feed is ready before using it
	await feed.ready();
	console.log(`Feed ready with key: ${feed.key.toString('hex')}`);

	// Join the Hyperswarm network with the generated topic hash
	swarm.join(TOPIC_HASH, {
		lookup: true,
		announce: true,
	});

	await swarm.flush();
	console.log('Swarm joined the topic and is ready for peer discovery.');

	// Event listener for new peer connections
	swarm.on('connection', (socket, details) => {
		console.log(`Connected to a new peer. Is client: ${details.client}`);

		// Setup Hypercore replication stream between peers
		const replicateStream = feed.replicate(details.client, { live: true });
		pipeline(socket, replicateStream, socket, (err) => {
			if (err) console.error('Replication pipeline error:', err);
		});

		console.log('Replication stream established.');
	});

	// If this peer is a writer, setup readline for receiving user input from the console
	if (isWriter) {
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
		});

		// Function to prompt for user messages
		const promptForMessage = () => {
			rl.question('> ', async (message) => {
				const timestamp = Date.now().toString();
				try {
					await db.put(timestamp, message);
					console.log('Message saved to database:', message);
				} catch (err) {
					console.error('Error saving message:', err);
				}
				promptForMessage(); // Continue prompting for messages
			});
		};

		// Start the prompt loop for the writer
		console.log('Chat application started. Type your messages below:');
		promptForMessage();
	}

	// Create a stream to continuously read messages from the database
	const messageStream = db.createReadStream({ live: true });

	// Event listener for new data in the message stream
	messageStream.on('data', ({ key, value }) => {
		const formattedTime = new Date(parseInt(key)).toLocaleTimeString();
		console.log(`[${formattedTime}] ${value}`);
	});

	messageStream.on('error', (err) => {
		console.error('Error reading from message stream:', err);
	});

	// Listen for data download events to confirm replication is working
	feed.on('download', (index, data) => {
		console.log(`Downloaded data at index: ${index}, data: ${data.toString()}`);
	});

	// Listen for data upload events (optional, for debugging purposes)
	feed.on('upload', (index, data) => {
		console.log(`Uploaded data at index: ${index}, data: ${data.toString()}`);
	});
})().catch((err) => {
	console.error('Application encountered an error:', err);
});
