import RPC from '@hyperswarm/rpc'
import b4a from 'b4a'
import Corestore from 'corestore'
import Hyperbee from 'hyperbee'
import crypto from 'hypercore-crypto'
import DHT from 'hyperdht'
import Hyperswarm from 'hyperswarm'
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

// const databaseFolder = Pear.config.storage
const databaseFolder = `./resources/databases/${id}`

let topic
let topicBuffer
if (environment === 'development') {
	// topic = b4a.toString(crypto.randomBytes(32), 'hex')

	topic = '0000000000000000000000000000000000000000000000000000000000000000'
	topicBuffer = b4a.from(topic, 'hex')

	// topicBuffer = crypto.randomBytes(32)
	// topic = b4a.toString(topicBuffer, 'hex')
} else {
	topic = args[1] ? args[1] : b4a.toString(crypto.randomBytes(64), 'hex')
	topicBuffer = b4a.from(topic, 'hex')
}

async function getOrCreateSeed(seedKey) {
	let seedEntry = await db.get(seedKey)
	let seed

	if (seedEntry && seedEntry.value) {
		seed = seedEntry.value.buffer
	} else {
		seed = crypto.randomBytes(32)
		await db.put(seedKey, seed)
	}

	return seed
}

const store = new Corestore(databaseFolder, id)
await store.ready()

const core = store.get({ name: 'auctions' })
const db = new Hyperbee(
	core,
	{
		keyEncoding: 'utf-8',
		valueEncoding: 'json'
	}
)
await core.ready()

const dhtSeed = await getOrCreateSeed('dht-seed')
const dhtKeyPair = DHT.keyPair(dhtSeed)
const dht = new DHT({
	port: 40001,
	keyPair: dhtKeyPair,
	bootstrap: [{ host: '127.0.0.1', port: 30001 }]
})

const swarm = new Hyperswarm()

const rpcSeed = await getOrCreateSeed('rpc-seed')
const rpc = new RPC({ seed: rpcSeed, dht })

const server = rpc.createServer()

// Pear.teardown(async () => {
// 	console.log("Tearing down...")
//
// 	if (swarm) {
// 		await swarm.destroy()
// 		console.log("Swarm destroyed.")
// 	}
//
// 	if (server) {
// 		await server.close()
// 		console.log("Server closed.")
// 	}
//
// 	console.log("Tear down complete.")
// })

await server.listen()

server.on('listening', () => {
	const serverPublicKey = server.address().publicKey.toString('hex')
	console.log(`RPC server is listening on publicKey: ${serverPublicKey}`)
})

server.on('connection', (rpc) => {
	console.log("New connection established to the RPC server.", rpc)
})

server.on('close', () => {
	console.log("RPC server closed.")
})

const encodeHex = (data) => b4a.from(data, 'hex')
const decodeHex = (data) => b4a.toString(data, 'hex')
const encodeString = (data) => b4a.from(data, 'utf8')
const decodeString = (data) => b4a.toString(data)
const encodeObject = (data) => b4a.from(JSON.stringify(data), 'utf8')
const decodeObject = (data) => JSON.parse(b4a.toString(data, 'utf8'))

server.respond('echo', (request) => {
	console.log('echo:', request)

	return request
})

server.respond('createAuction', async (request) => {
	const { id, description, price, status } = decodeObject(request)

	const item = { id, description, price, status: 'open', bids: [] }

	await db.put(id, item)

	console.log(`Successfully created the auction ${id}`)

	await broadcastToAll('auctionCreated', item)

	return encodeObject({
		payload: item,
		status: 'ok'
	})
})

server.respond('auctionCreated', async (request) => {
	const item = decodeObject(request)

	await db.put(item.id, item)

	console.log(`Successfully synchronized new auction ${id}`)
})

swarm.on('connection', (connection, peerInfo) => {
	store.replicate(connection)

	const peerPublicKey = decodeHex(peerInfo.publicKey)

	console.log(`Swarm connected with the peer: ${peerPublicKey}`)
})

// const discovery = swarm.join(core.discoveryKey, {
const discovery = swarm.join(topicBuffer, {
	client: true,
	server: true
})

discovery.flushed().then(() => {
	console.log(`Successfully joined auction: ${topic}`)
})

async function broadcastToAll(method, data) {
	const encoded = encodeObject(data)

	for (const [key, peer] of swarm.peers) {
		try {
			// await rpc.request(peer.publicKey, method, encoded)
			const client = rpc.connect(peer.publicKey)
			await client.request('echo', b4a.from('hello world', 'utf8'))
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
