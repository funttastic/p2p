import Hyperswarm from 'hyperswarm';
import DHT from 'hyperdht';
import Hyperbee from 'hyperbee';
import Corestore from 'corestore';
import b4a from 'b4a';
import RPC from '@hyperswarm/rpc';
import crypto from 'hypercore-crypto';

const corestore = new Corestore('./data');
await corestore.ready();

const auctionDB = new Hyperbee(corestore.get({ name: 'auctions' }), {
	keyEncoding: 'utf-8',
	valueEncoding: 'json'
});

const dht = new DHT();
const swarm = new Hyperswarm();

const rpc = new RPC({ dht });

const peers = {};

const topicBuffer = crypto.randomBytes(32);
const topic = b4a.toString(topicBuffer, 'hex');

// Join the auction topic in Hyperswarm
const discovery = swarm.join(topicBuffer, {
	client: true,
	server: true
});

discovery.flushed().then(() => {
	console.log(`Joined auction topic: ${topic}`);
});

// Handle incoming connections
swarm.on('connection', (connection, info) => {
	const peerPublicKey = b4a.toString(info.publicKey, 'hex');
	console.log(`Connected to peer: ${peerPublicKey}`);
	peers[peerPublicKey] = connection;

	rpc.pipe(connection).pipe(rpc);
	connection.on('close', () => {
		delete peers[peerPublicKey];
		console.log(`Disconnected from peer: ${peerPublicKey}`);
	});
});

// Set up RPC server with auction actions
rpc.on('createAuction', async (args, cb) => {
	const { id, description, price } = args;
	await auctionDB.put(id, { description, price, bids: [] });
	console.log(`Auction created: ${id}`);
	broadcastToAll('auctionCreated', { id, description, price });
	cb(null, `Auction ${id} created.`);
});

rpc.on('makeBid', async (args, cb) => {
	const { auctionId, bidder, bidAmount } = args;
	const auction = await auctionDB.get(auctionId);
	if (!auction) return cb(new Error('Auction not found'));
	auction.value.bids.push({ bidder, amount: bidAmount });
	await auctionDB.put(auctionId, auction.value);
	console.log(`Bid made for Auction ${auctionId} by ${bidder} for ${bidAmount} USDt`);
	broadcastToAll('bidMade', { auctionId, bidder, bidAmount });
	cb(null, `Bid placed on Auction ${auctionId}.`);
});

rpc.on('closeAuction', async (args, cb) => {
	const { auctionId, closingInfo } = args;
	const auction = await auctionDB.get(auctionId);
	if (!auction) return cb(new Error('Auction not found'));
	auction.value.closed = true;
	auction.value.closingInfo = closingInfo;
	await auctionDB.put(auctionId, auction.value);
	console.log(`Auction ${auctionId} closed.`);
	broadcastToAll('auctionClosed', { auctionId, closingInfo });
	cb(null, `Auction ${auctionId} closed.`);
});

function broadcastToAll(event, data) {
	for (const connection of Object.values(peers)) {
		rpc.call(connection, event, data, (err) => {
			if (err) console.error(`Error broadcasting ${event}:`, err);
		});
	}
}

// Example input handlers for demonstration purposes
process.stdin.on('data', (input) => {
	const command = input.toString().trim();
	if (command.startsWith('create')) {
		const id = `auction-${Date.now()}`;
		const description = `Pic#${Math.floor(Math.random() * 1000)}`;
		const price = Math.floor(Math.random() * 100);
		rpc.call('createAuction', { id, description, price }, console.log);
	} else if (command.startsWith('bid')) {
		const [auctionId, bidAmount] = command.split(' ').slice(1);
		rpc.call('makeBid', { auctionId, bidder: 'peer1', bidAmount }, console.log);
	} else if (command.startsWith('close')) {
		const auctionId = command.split(' ')[1];
		rpc.call('closeAuction', { auctionId, closingInfo: { winner: 'peer1', amount: 80 } }, console.log);
	}
});

