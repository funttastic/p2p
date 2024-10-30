/** @typedef {import('pear-interface')} */ /* global Pear */

import fsp from 'bare-fs/promises'
import Pipe from 'bare-pipe'
import path from 'bare-path'
import process from 'bare-process'
import b4a from 'b4a'
import Corestore from 'corestore'
import debounce from 'debounceify'
import Hyperbee from 'hyperbee'
import { Node } from 'hyperbee/lib/messages'
import Hypercore from 'hypercore'
import crypto from 'hypercore-crypto'
import DHT from 'hyperdht'
import Hyperdrive from 'hyperdrive'
import Hyperswarm from 'hyperswarm'
import Localdrive from 'localdrive'
// import stdio from 'pear-stdio'

if (Pear.config.dev) {
	const { Inspector } = await import('pear-inspect')
	const inspector = await new Inspector()
	const key = await inspector.enable()
	console.log(`Debug with pear://runtime/devtools/${key.toString('hex')}\n`)
}

// const { versions } = Pear
// console.log(await versions())

console.log("Arguments:", Pear.config.args)

const peers = {
};

const dht = new DHT()
const swarm = new Hyperswarm()

let topicBuffer
let topic
if (Pear.config.args.length === 1 && Pear.config.args[0]) {
	topicBuffer = b4a.from(Pear.config.args[0], 'utf8')
	topic = b4a.toString(topicBuffer, 'utf8')
} else if (Pear.config.args.length === 2 && Pear.config.args[1]) {
	topicBuffer = b4a.from(Pear.config.args[0], 'utf8')
	topic = b4a.toString(topicBuffer, 'utf8')
} else {
	topicBuffer = crypto.randomBytes(32)
	topic = b4a.toString(topicBuffer, 'hex')
}
console.log("Topic:", topic)

// const keyPair = DHT.keyPair()
// const server = dht.createServer(connection => {
// 	const peerPublicKey = b4a.toString(connection.remotePublicKey, 'hex')
//
// 	console.log("Connected to dht peer: ", peerPublicKey)
//
// 	peers[peerPublicKey] = connection
//
// 	process.stdin.pipe(connection).pipe(process.stdout)
// })
// server.listen(keyPair).then(() => {
// 	const publicKey = b4a.toString(keyPair.publicKey, 'hex')
//
// 	console.log('Listening on:', publicKey)
// })

Pear.teardown(() => {
	console.log("Tearing down...")

	if (server) {
		server.close ()
		console.log ("Server closed.")
	}

	if (swarm) {
		swarm.destroy ()
		console.log ("Swarm destroyed.")
	}

	console.log("Teared down.")
})

swarm.on('connection', connection => {
	const peerPublicKey = b4a.toString(connection.remotePublicKey, 'hex')

	console.log("Connected to swarm peer: ", peerPublicKey)

	peers[peerPublicKey] = connection

	console.log(Object.keys(peers))

	connection.once('close', () => {
		console.log("Disconnecting from peer: ", peerPublicKey)

		delete peers[peerPublicKey]

		console.log("Disconnected from peer: ", peerPublicKey)
	})

	connection.on('data', data => {
		console.log(`Received data from peer ${peerPublicKey}: ${data}`)
	})

	connection.on('error', error => {
		console.log(`An error has occurred while communicating with peer ${peerPublicKey}: ${error}`)
	})
})

// Broadcast stdin data to all connections
process.stdin.on('data', data => {
	const dataString = data.toString('utf8')
	console.log("Broadcasting data to all peers: ", dataString)
	console.log(Object.keys(peers))

	for (const [key, connection] of Object.entries(peers)) {
		connection.write(data)

		console.log("Broadcasted data to peer: ", key)
	}
})

// Join a common topic
const discovery = swarm.join(
	topicBuffer,
	{
		client: true, server: true
	}
)

// The flushed promise will resolve when the topic has been fully announced to the DHT
discovery.flushed().then(() => {
	console.log('Joined topic:', topic)
})
