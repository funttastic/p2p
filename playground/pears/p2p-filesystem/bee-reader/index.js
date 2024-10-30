import Hyperswarm from 'hyperswarm'
import Corestore from 'corestore'
import Hyperbee from 'hyperbee'
import b4a from 'b4a'
import process from 'bare-process'

// create a Corestore instance
const store = new Corestore(Pear.config.storage)

const swarm = new Hyperswarm()
Pear.teardown(() => swarm.destroy())

// replicate corestore instance on connection with other peers
swarm.on('connection', conn => store.replicate(conn))

// create/get the hypercore instance using the public key supplied as command-line arg
const core = store.get({ key: b4a.from(process.argv[4], 'hex') })

// create a hyperbee instance using the hypercore instance
const bee = new Hyperbee(core, {
	keyEncoding: 'utf-8',
	valueEncoding: 'json'
})

// wait till the properties of the hypercore instance are initialized
await core.ready()

const foundPeers = store.findingPeers()
swarm.join(core.discoveryKey)
swarm.flush().then(() => foundPeers())

// execute the listBee function whenever the data is appended to the underlying hypercore
core.on('append', listBee)

listBee()

// listBee function will list the key-value pairs present in the hyperbee instance
async function listBee () {
	console.log('\n***************')
	console.log('hyperbee contents are now:')
	for await (const node of bee.createReadStream()) {
		console.log('  ', node.key, '->', node.value)
	}
}
