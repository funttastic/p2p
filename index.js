import RPC from '@hyperswarm/rpc'
import Hyperbee from 'hyperbee'
// import Hypercore from 'hypercore'
import crypto from 'hypercore-crypto'
import DHT from 'hyperdht'
import b4a from 'b4a'
import Hyperswarm from 'hyperswarm'
import Corestore from 'corestore'
// import Pipe from 'bare-pipe'
// import path from 'bare-path'
// import process from 'bare-process'


// if (Pear.config.dev) {
// 	const { Inspector } = await import('pear-inspect')
// 	const inspector = await new Inspector()
// 	const key = await inspector.enable()
// 	console.log(`Debug with pear://runtime/devtools/${key.toString('hex')}\n`)
// }

// const { versions } = Pear
// console.log(await versions())

const environment = 'development'

// const arguments = Pear.config.args
const args = process.argv.slice(2)
console.log("Arguments:", args)

// const id = Pear.config.args[0]
const id = args[0]

// const databaseFolder = `${Pear.config.storage}/${id}`
const databaseFolder = `./resources/databases/${id}`

const encodeHex = (data) => b4a.from(data, 'hex')
const decodeHex = (data) => b4a.toString(data, 'hex')
const encodeString = (data) => b4a.from(data, 'utf8')
const decodeString = (data) => b4a.toString(data)
const encodeObject = (data) => b4a.from(JSON.stringify(data), 'utf8')
const decodeObject = (data) => JSON.parse(b4a.toString(data, 'utf8'))
const randomBytes = (size) => b4a.from(crypto.randomBytes(size), 'hex')
const randomString = (size) => encodeHex(randomBytes(size))

let topic
let topicBuffer
if (environment === 'development') {
	topic = '9f1e9ac48fa2a694fe99257a3d05e11d'
	topicBuffer = b4a.from(topic, 'hex')
} else {
	topic = args[1] ? args[1] : randomString(32)
	topicBuffer = b4a.from(topic, 'hex')
}

const store = new Corestore(databaseFolder, id)
await store.ready()

// const core = new Hypercore(databaseFolder)
const core = store.get({ name: 'db' })
await core.ready()

const db = new Hyperbee(core, { keyEncoding: 'utf-8', valueEncoding: 'json' })
await db.ready()

async function getOrCreateSeed(seedKey) {
	let seedEntry = await db.get(seedKey)
	let seed

	if (seedEntry && seedEntry.value) {
		seed = seedEntry.value
	} else {
		seed = randomString(32)
		await db.put(seedKey, seed)
	}

	return seed
}

const dhtBootstrap = { host: '127.0.0.1', port: 30001 }

const dhtSeed = encodeHex(await getOrCreateSeed('dht-seed'))
const dhtKeyPair = DHT.keyPair(dhtSeed)

const dht = new DHT({
	keyPair: dhtKeyPair,
	bootstrap: [dhtBootstrap]
})

// const swarm = new Hyperswarm({ dht })
const swarm = new Hyperswarm()

const rpcSeed = encodeHex(await getOrCreateSeed('rpc-seed'))
const rpc = new RPC({ seed: rpcSeed, dht })
// const rpc = new RPC({ seed: rpcSeed, dth: swarm.dht })
const rpcServer = rpc.createServer()
await rpcServer.listen()
const rpcServerPublicKey = decodeHex(rpcServer.publicKey)

console.log('RPC server listening on:', rpcServerPublicKey)

// Pear.teardown(async () => {
// 	console.log("Tearing down...")
//
// 	if (swarm) {
// 		await swarm.destroy()
// 		console.log("Swarm destroyed.")
// 	}
//
// 	if (server) {
// 		await rpcServer.close()
// 		console.log("Server closed.")
// 	}
//
// 	console.log("Tear down complete.")
// })

rpcServer.on('listening', () => {
	const serverPublicKey = rpcServer.address().publicKey.toString('hex')
	console.log(`RPC server is listening on publicKey: ${serverPublicKey}`)
})

rpcServer.on('connection', (rpc) => {
	console.log("New connection established to the RPC server.")
})

rpcServer.on('close', () => {
	console.log("RPC server closed.")
})

rpcServer.respond('echo', async (request) => {
	const payload = decodeObject(request)

	console.log('Received request:', payload)

	return request
})

rpcServer.respond('createAuction', async (request) => {
	const { id, description, price, status } = decodeObject(request)

	const auction = { id, description, price, status: 'open', bids: [], closingInfo: {} }

	await db.put(id, auction)

	console.log(`Successfully created the auction ${id}`)

	await broadcastToAll('auctionCreated', auction)

	return encodeObject({
		payload: auction,
		status: 'ok'
	})
})

rpcServer.respond('makeBid', async (request) => {
	const { auctionId, bidder, bidAmount } = decodeObject(request)

	const auction = (await db.get(auctionId))?.value

	if (!auction || auction.status !== 'open') {
		throw new Error('Auction not found or already closed')
	}

	auction.bids.push({ bidder, amount: bidAmount })

	await db.put(auctionId, auction.value)

	console.log(`Bid made for Auction ${auctionId} by ${bidder} for ${bidAmount} USDT`)

	await broadcastToAll('bidMade', auction)

	return encodeObject({
		payload: auction,
		status: 'ok'
	})
})

rpcServer.respond('closeAuction', async (request) => {
	const { auctionId } = decodeObject(request)

	const auction = (await db.get(auctionId))?.value

	if (!auction || auction.status !== 'open') {
		throw new Error('Auction not found or has already been closed.')
	}

	auction.status = 'closed'

	const closingInfo = { winner: null, amount: null }
	for (const bid of auction.bids) {
		if (!closingInfo.amount || bid.amount > closingInfo.amount) {
			closingInfo.winner = bid.bidder
			closingInfo.amount = bid.amount
		}
	}

	auction.closingInfo = closingInfo

	await db.put(auctionId, auction)

	console.log(`Auction ${auctionId} closed.`)

	await broadcastToAll('auctionClosed', auction)

	return encodeObject({
		payload: auction,
		status: 'ok'
	})
})

rpcServer.respond('auctionCreated', async (request) => {
	const auction = decodeObject(request)

	await db.put(auction.id, auction)

	console.log(`Successfully synchronized new auction ${id}`)
})

rpcServer.respond('bidMade', async (request) => {
	const auction = decodeObject(request)

	const bidding = auction.bids[auction.bids.length - 1]

	db.put(auction.id, auction)

	console.log(`Synchronized new bid for Auction ${auction.id} by ${bidding.bidder} for ${bidding.amount} USDT`)
})

rpcServer.respond('auctionClosed', async (request) => {
	const auction = decodeObject(request)

	await db.put(auction.id, auction)

	console.log(`Synchronized auction close for ${auction.id}`)
})

// const discovery = swarm.join(core.discoveryKey, {
const discovery = swarm.join(topicBuffer, {
	client: true,
	server: true
})

discovery.flushed().then(() => {
	console.log(`Successfully joined auction: ${topic}`)
})

swarm.on('connection', (connection, peerInfo) => {
	// store.replicate(connection)

	const peerPublicKey = decodeHex(peerInfo.publicKey)

	console.log(`Swarm connected with the peer: ${peerPublicKey}`)
})

async function broadcastToAll(method, data) {
	const encoded = encodeObject(data)

	for (const [key, peer] of swarm.peers) {
		try {
			await rpc.request(peer.publicKey, method, encoded)
		} catch (error) {
			console.error(`Error broadcasting ${method}:`, error)
		}
	}
}

// const stdin = new Pipe(0)
const stdin = process.stdin

stdin.on('data', async (input) => {
	const command = input.toString().trim()

	if (command.startsWith('test')) {
		await broadcastToAll('test', { message: 'Hello from server!' })
	} else if (command.startsWith('create')) {
		const auction = {
			id: `auction-${Date.now()}`,
			description: `Pic#${Math.floor(Math.random() * 1000)}`,
			price: Math.floor(Math.random() * 100),
			status: 'open',
			bids: []
		}

		rpc.request(server.address().publicKey, 'createAuction', encodeObject(auction))
			.then(console.log)
			.catch(console.error)
	}
})
