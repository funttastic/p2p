import fsp from 'bare-fs/promises'
import Hyperswarm from 'hyperswarm'
import Corestore from 'corestore'
import Hyperbee from 'hyperbee'
import b4a from 'b4a'
// create a corestore instance with the given location
const store = new Corestore(Pear.config.storage)

const swarm = new Hyperswarm()
Pear.teardown(() => swarm.destroy())

// replication of corestore instance
swarm.on('connection', conn => store.replicate(conn))

// creation of Hypercore instance (if not already created)
const core = store.get({ name: 'my-bee-core' })

// creation of Hyperbee instance using the core instance
const bee = new Hyperbee(core, {
	keyEncoding: 'utf-8',
	valueEncoding: 'utf-8'
})

// wait till all the properties of the hypercore are initialized
await core.ready()

// join a topic
const discovery = swarm.join(core.discoveryKey)

// Only display the key once the Hyperbee has been announced to the DHT
discovery.flushed().then(() => {
	console.log('bee key:', b4a.toString(core.key, 'hex'))
})

// Only import the dictionary the first time this script is executed
// The first block will always be the Hyperbee header block
if (core.length <= 1) {
	console.log('importing dictionary...')
	const dict = JSON.parse(await fsp.readFile('./dict.json'))
	const batch = bee.batch()
	for (const { key, value } of dict) {
		await batch.put(key, value)
	}
	await batch.flush()
} else {
	// Otherwise just seed the previously-imported dictionary
	console.log('seeding dictionary...')
}
