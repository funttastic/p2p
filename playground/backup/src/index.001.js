import Hyperswarm from 'hyperswarm';
import Hyperbee from 'hyperbee';
import Hypercore from 'hypercore';
import crypto from 'crypto';
import { pipeline } from 'stream';
import readline from 'readline';
// import RAM from 'random-access-memory';

const TOPIC = crypto.createHash('sha256').update('my-chat-room').digest();

const swarm = new Hyperswarm();

const storagePath = `./storage/${process.pid}`;

// const feed = new Hypercore(() => new RAM(), { valueEncoding: 'utf-8' });
const feed = new Hypercore(storagePath, { valueEncoding: 'utf-8' });

const db = new Hyperbee(feed, {
	keyEncoding: 'utf-8',
	valueEncoding: 'utf-8',
});

(async () => {
	await feed.ready();

	swarm.join(TOPIC, {
		lookup: true,
		announce: true,
	});

	await swarm.flush();

	swarm.on('connection', (socket, details) => {
		console.log('Connected to a new peer');

		const replicateStream = feed.replicate(details.client, { live: true });
		pipeline(socket, replicateStream, socket, (err) => {
			if (err) console.error('Replication error:', err);
		});
	});

	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	const prompt = () => {
		rl.question('> ', async (message) => {
			const timestamp = Date.now().toString();
			await db.put(timestamp, message);
			prompt();
		});
	};

	const stream = db.createReadStream({ live: true });

	stream.on('data', ({ key, value }) => {
		console.log(`[${new Date(parseInt(key)).toLocaleTimeString()}] ${value}`);
	});

	prompt();
})();
