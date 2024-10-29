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

// const { versions } = Pear
// console.log(await versions())

console.log("Arguments:", Pear.config.args)

const dht = new DHT()
const keyPair = DHT.keyPair()
const server = dht.createServer(connection => {
	console.log("Got connection!", connection)

	process.stdin.pipe(connection).pipe(process.stdout)
})
server.listen(keyPair).then(() => {
	const publicKey = b4a.toString(keyPair.publicKey, 'hex')

	console.log('Listening on:', publicKey)
})
Pear.teardown(() => {
	console.log("Tearing down server.")

	server.close()

	console.log("Server closed. Teared down.")
})
