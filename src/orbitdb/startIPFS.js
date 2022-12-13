import {create} from 'ipfs'
export const startIPFS = async (_options) => {
    let repo = _options?.repo!==undefined?_options.repo:'./ipfs-repo'
    let ipfs 
    const options = {
      repo: repo,
      EXPERIMENTAL: { pubsub: true },
      preload: { "enabled": false },
      config: {
        // Bootstrap: ['/ip4/65.21.180.203/tcp/4001/p2p/12D3KooWQEaozT9Q7GS7GHEzsVcpAmaaDmjgfH5J8Zba1YoQ4NU3'], 
        // Bootstrap: ['/dns4/65.21.180.203/tcp/4003/wss/p2p-webrtc-star/p2p/12D3KooWQEaozT9Q7GS7GHEzsVcpAmaaDmjgfH5J8Zba1YoQ4NU3'], 
        Bootstrap: [],
        Addresses: {
          Swarm: [
            //Use default 
            // "/dns4/ws-star.discovery.libp2p.io/tcp/443/wss/p2p-webrtc-star" //doesn't work 
            // Use IPFS dev webrtc signal server
            '/dns6/ipfs.le-space.de/tcp/9091/wss/p2p-webrtc-star',
            '/dns4/ipfs.le-space.de/tcp/9091/wss/p2p-webrtc-star',
            // Use local signal server
            // '/ip4/0.0.0.0/tcp/9090/wss/p2p-webrtc-star',
            // '/dns4/ipfs.le-space.de/tcp/4003/wss/p2p-webrtc-star'
          ]
        },
      }
    }

    try {
      if (ipfs !== undefined) await ipfs.stop()
      ipfs = await create(options)
    } catch (ex) {
      console.log("couldn' create ipfs node trying without network", ex)
      options.config.Bootstrap = []
      options.config.Addresses.Swarm = []
      console.log("options", options)
      ipfs = await create(options)
    }

    ipfs.libp2p.on('peer:discovery', (peer) => {
      console.log('discovered', peer)
    })
  
    ipfs.libp2p.on('peer:connect', async (peer) => {
      console.log('connected', peer)
  
      ipfs.swarm.peers().then(peers => console.log('current peers connected: ', peers))
    })
    return {ipfs};
  }