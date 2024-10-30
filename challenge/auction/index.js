import RPC from '@hyperswarm/rpc'
import b4a from 'b4a'
import Corestore from 'corestore'
import Hyperbee from 'hyperbee'
// import DHT from 'hyperdht'
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
const args = process.argv.slice(1)
console.log("Arguments:", args)

// const id = Pear.config.args[0]
const id = args[0]

// const databaseFolder = Pear.config.storage
const databaseFolder = './resources/databases'

let topic
if (environment === 'development') {
	topic = '0000000000000000000000000000000000000000000000000000000000000000'
} else {
	topic = args[1] ? args[1] : b4a.toString(crypto.randomBytes(64), 'hex')
}
const topicBuffer = b4a.from(topic, 'utf8')

const peers = {}

// const dht = new DHT()

const corestore = new Corestore(databaseFolder, id)
await corestore.ready()

const swarm = new Hyperswarm()

const rpc = new RPC({ dth: swarm.dht })
// const rpc = new RPC({ dht })

const core = store.get({ name: 'auctions' })

const db = new Hyperbee(
	core,
	{
		keyEncoding: 'utf-8',
		valueEncoding: 'json'
	}
)

await core.ready()

const server = rpc.createServer()

Pear.teardown(async () => {
	console.log("Tearing down...")

	if (swarm) {
		await swarm.destroy()
		console.log("Swarm destroyed.")
	}

	if (server) {
		await server.close()
		console.log("Server closed.")
	}

	console.log("Tear down complete.")
})

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
const decodeString = (data) => b4a.toString(data, 'utf8')
const encodeObject = (data) => b4a.from(JSON.stringify(data), 'utf8')
const decodeObject = (data) => JSON.parse(b4a.toString(data, 'utf8'))

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
	corestore.replicate(connection)

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
