import {create} from 'ipfs'
import Identities from 'orbit-db-identity-provider'
import { ethers } from "ethers";

export const startIPFS = async (options) => {
    let repo = options?.repo!==undefined?options.repo:'./ipfs-repo'
    const ipfs = await create({
      repo: repo,
      EXPERIMENTAL: { pubsub: true },
      preload: { "enabled": false },
      config: {
        Bootstrap: ['/ip4/65.21.180.203/tcp/4001/p2p/12D3KooWQEaozT9Q7GS7GHEzsVcpAmaaDmjgfH5J8Zba1YoQ4NU3 '
        ],
        Addresses: {
          Swarm: [
            // Use IPFS dev webrtc signal server
            '/dns6/ipfs.le-space.de/tcp/9091/wss/p2p-webrtc-star',
            '/dns4/ipfs.le-space.de/tcp/9091/wss/p2p-webrtc-star',
            // Use local signal server
            // '/ip4/0.0.0.0/tcp/9090/wss/p2p-webrtc-star',
          ]
        },
      }
    })
    
    let identity
    if(options.noAuth===undefined){
      try {
          const provider = new ethers.providers.Web3Provider(window.ethereum);
          const wallet = provider.getSigner();
          await provider.send("eth_requestAccounts", []) // <- this promps user to connect metamask
          identity = await Identities.createIdentity({
            type: "ethereum",
            wallet,
          })
          console.log("Identity created", identity)
      } catch (ex) {
        console.log("Identity not given.")
      }
    }

    return {ipfs, identity};
  }