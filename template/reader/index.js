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

if (!Pear.config.args[0])
	throw new Error("No server public key provided.")

const serverPublicKey = b4a.from(Pear.config.args[0], 'hex')

const dht = new DHT()
const connection = dht.connect(topic)
connection.once('open', () => {
	console.log('Got connection!')
})
process.stdin.pipe(connection).pipe(process.stdout)
