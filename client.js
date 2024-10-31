import RPC from '@hyperswarm/rpc';
import Hyperbee from 'hyperbee';
import Hypercore from 'hypercore';
import crypto from 'hypercore-crypto';
import DHT from 'hyperdht';
import b4a from 'b4a';

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

const core = new Hypercore(databaseFolder)

const db = new Hyperbee(core, { keyEncoding: 'utf-8', valueEncoding: 'binary' })
await db.ready()

const encodeHex = (data) => b4a.from(data, 'hex')
const decodeHex = (data) => b4a.toString(data, 'hex')
const encodeString = (data) => b4a.from(data, 'utf8')
const decodeString = (data) => b4a.toString(data)
const encodeObject = (data) => b4a.from(JSON.stringify(data), 'utf8')
const decodeObject = (data) => JSON.parse(b4a.toString(data, 'utf8'))

async function getOrCreateSeed(seedKey) {
	let seedEntry = await db.get(seedKey)
	let seed

	if (seedEntry && seedEntry.value) {
		seed = seedEntry.value
	} else {
		seed = crypto.randomBytes(32)
		await db.put(seedKey, seed)
	}

	return seed
}

const dhtBootstrap = { host: '127.0.0.1', port: 30001 }

const dhtSeed = await getOrCreateSeed('dht-seed')
const dhtKeyPair = DHT.keyPair(dhtSeed)
const dht = new DHT({
	port: 50001,
	keyPair: dhtKeyPair,
	bootstrap: [dhtBootstrap]
})

const serverPubKey = Buffer.from('e3e0c862cd43df96965bdae867515ba780ff20195337bbdf7b2721ad4e45c75d', 'hex')

const rpc = new RPC({ dht })

const payload = {a: 'b', c: 1, d: true}
const encoded = encodeObject(payload)
const response = await rpc.request(serverPubKey, 'echo', encoded)
const decoded = decodeObject(response)

console.log(decoded)

await rpc.destroy()
await dht.destroy()
