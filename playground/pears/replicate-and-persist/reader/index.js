import path from 'bare-path'
import Hyperswarm from 'hyperswarm'
import Hypercore from 'hypercore'

const swarm = new Hyperswarm()
Pear.teardown(() => swarm.destroy())

const core = new Hypercore(path.join(Pear.config.storage, 'reader-storage'), Pear.config.args[0])
await core.ready()

const foundPeers = core.findingPeers()
swarm.join(core.discoveryKey)
swarm.on('connection', conn => core.replicate(conn))

// swarm.flush() will wait until *all* discoverable peers have been connected to
// It might take a while, so don't await it
// Instead, use core.findingPeers() to mark when the discovery process is completed
swarm.flush().then(() => foundPeers())

// This won't resolve until either
//    a) the first peer is found
// or b) no peers could be found
await core.update()

let position = core.length
console.log(`Skipping ${core.length} earlier blocks...`)
for await (const block of core.createReadStream({ start: core.length, live: true })) {
	console.log(`Block ${position++}: ${block}`)
}
