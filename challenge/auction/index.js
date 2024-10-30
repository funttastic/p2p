import Hyperswarm from 'hyperswarm';
import DHT from 'hyperdht';
import Hyperbee from 'hyperbee';
import Corestore from 'corestore';
import b4a from 'b4a';
import RPC from '@hyperswarm/rpc';
import crypto from 'hypercore-crypto';
// import process from 'bare-process'

// Setup corestore and Hyperbee
const corestore = new Corestore(`./data/${process.argv[2]}`);
await corestore.ready();
const auctionDB = new Hyperbee(corestore.get({ name: 'auctions' }), {
	keyEncoding: 'utf-8',
	valueEncoding: 'json'
});

// Setup DHT and Hyperswarm
const dht = new DHT();
const swarm = new Hyperswarm();
const rpc = new RPC({ dht });
const topicBuffer = process.argv[3] ? b4a.from(process.argv[3], 'utf8') : crypto.randomBytes(32)
const topic = b4a.toString(topicBuffer, 'utf8');

// Create RPC server
const server = rpc.createServer();
await server.listen();

server.on('listening', () => {
	console.log(`Server is listening on publicKey: ${server.address().publicKey.toString('hex')}`);
});

server.respond('createAuction', async (req) => {
	const { id, description, price } = JSON.parse(b4a.toString(req));
	await auctionDB.put(id, { description, price, bids: [], closed: false });
	console.log(`Auction created: ${id}`);
	broadcastToAll('auctionCreated', { id, description, price });
	return b4a.from(JSON.stringify({ success: true, id }), "utf8");
});

server.respond('makeBid', async (req) => {
	const { auctionId, bidder, bidAmount } = JSON.parse(b4a.toString(req));
	const auction = await auctionDB.get(auctionId);
	if (!auction || auction.value.closed) {
		throw new Error('Auction not found or already closed');
	}
	auction.value.bids.push({ bidder, amount: bidAmount });
	await auctionDB.put(auctionId, auction.value);
	console.log(`Bid made for Auction ${auctionId} by ${bidder} for ${bidAmount} USDt`);
	broadcastToAll('bidMade', { auctionId, bidder, bidAmount });
	return { success: true, auctionId };
});

server.respond('closeAuction', async (req) => {
	const { auctionId, closingInfo } = JSON.parse(b4a.toString(req));
	const auction = await auctionDB.get(auctionId);
	if (!auction) {
		throw new Error('Auction not found');
	}
	auction.value.closed = true;
	auction.value.closingInfo = closingInfo;
	await auctionDB.put(auctionId, auction.value);
	console.log(`Auction ${auctionId} closed.`);
	broadcastToAll('auctionClosed', { auctionId, closingInfo });
	return { success: true, auctionId };
});

// Handle incoming connections
swarm.on('connection', (connection) => {
	console.log('New connection established');
	rpc.pipe(connection).pipe(rpc);
});

// Join Hyperswarm topic for auction
const discovery = swarm.join(topicBuffer, {
	client: true,
	server: true
});

discovery.flushed().then(() => {
	console.log(`Joined auction topic: ${topic}`);
});

// Helper function to broadcast events to all connected peers
async function broadcastToAll(method, data) {
	for (const peer of swarm.peers) {
		try {
			const encoded = b4a.from(JSON.stringify(data), "utf8")
			await rpc.request(peer.publicKey, method, encoded);
		} catch (error) {
			console.error(`Error broadcasting ${method}:`, error);
		}
	}
}

// Example commands via stdin for testing
process.stdin.on('data', (input) => {
	const command = input.toString().trim();
	if (command.startsWith('create')) {
		const id = `auction-${Date.now()}`;
		const description = `Pic#${Math.floor(Math.random() * 1000)}`;
		const price = Math.floor(Math.random() * 100);
		rpc.request(server.address().publicKey, 'createAuction', b4a.from(JSON.stringify({ id, description, price }), "utf8")).then(console.log).catch(console.error);
	} else if (command.startsWith('bid')) {
		const [auctionId, bidAmount] = command.split(' ').slice(1);
		rpc.request(server.address().publicKey, 'makeBid', b4a.from(JSON.stringify({ auctionId, bidder: 'peer1', bidAmount }), "utf8")).then(console.log).catch(console.error);
	} else if (command.startsWith('close')) {
		const auctionId = command.split(' ')[1];
		rpc.request(server.address().publicKey, 'closeAuction', b4a.from(JSON.stringify({ auctionId, closingInfo: { winner: 'peer1', amount: 80 } }), "utf8")).then(console.log).catch(console.error);
	}
});
