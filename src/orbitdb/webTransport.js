import { logger } from '@libp2p/logger';
import { Noise } from '@chainsafe/libp2p-noise';
import { symbol } from '@libp2p/interface-transport';
import { protocols } from '@multiformats/multiaddr';
import { peerIdFromString } from '@libp2p/peer-id';
import { bases, digest } from 'multiformats/basics';
import { Uint8ArrayList } from 'uint8arraylist';
const log = logger('libp2p:webtransport');
// @ts-expect-error - Not easy to combine these types.
const multibaseDecoder = Object.values(bases).map(b => b.decoder).reduce((d, b) => d.or(b));
function decodeCerthashStr(s) {
    return digest.decode(multibaseDecoder.decode(s));
}
// Duplex that does nothing. Needed to fulfill the interface
function inertDuplex() {
    return {
        source: {
            [Symbol.asyncIterator]() {
                return {
                    async next() {
                        // This will never resolve
                        return await new Promise(() => { });
                    }
                };
            }
        },
        sink: async (source) => {
            // This will never resolve
            return await new Promise(() => { });
        }
    };
}
async function webtransportBiDiStreamToStream(bidiStream, streamId, direction, activeStreams, onStreamEnd) {
    const writer = bidiStream.writable.getWriter();
    const reader = bidiStream.readable.getReader();
    await writer.ready;
    function cleanupStreamFromActiveStreams() {
        const index = activeStreams.findIndex(s => s === stream);
        if (index !== -1) {
            activeStreams.splice(index, 1);
            stream.stat.timeline.close = Date.now();
            onStreamEnd?.(stream);
        }
    }
    let writerClosed = false;
    let readerClosed = false;
    (async function () {
        await (writer.closed.then((ok) => ({ ok })).catch((err) => ({ err })));
        writerClosed = true;
        if (writerClosed && readerClosed) {
            cleanupStreamFromActiveStreams();
        }
    })().catch(() => {
        log.error('WebTransport failed to cleanup closed stream');
    });
    (async function () {
        await (reader.closed.then((ok) => ({ ok })).catch((err) => ({ err })));
        readerClosed = true;
        if (writerClosed && readerClosed) {
            cleanupStreamFromActiveStreams();
        }
    })().catch(() => {
        log.error('WebTransport failed to cleanup closed stream');
    });
    const stream = {
        id: streamId,
        abort(_err) {
            if (!writerClosed) {
                writer.abort();
                writerClosed = true;
            }
            stream.closeRead();
            readerClosed = true;
            cleanupStreamFromActiveStreams();
        },
        close() {
            stream.closeRead();
            stream.closeWrite();
            cleanupStreamFromActiveStreams();
        },
        closeRead() {
            if (!readerClosed) {
                reader.cancel().catch((err) => {
                    if (err.toString().includes('RESET_STREAM') === true) {
                        writerClosed = true;
                    }
                });
                readerClosed = true;
            }
            if (writerClosed) {
                cleanupStreamFromActiveStreams();
            }
        },
        closeWrite() {
            if (!writerClosed) {
                writerClosed = true;
                writer.close().catch((err) => {
                    if (err.toString().includes('RESET_STREAM') === true) {
                        readerClosed = true;
                    }
                });
            }
            if (readerClosed) {
                cleanupStreamFromActiveStreams();
            }
        },
        reset() {
            stream.close();
        },
        stat: {
            direction: direction,
            timeline: { open: Date.now() }
        },
        metadata: {},
        source: (async function* () {
            while (true) {
                const val = await reader.read();
                if (val.done === true) {
                    readerClosed = true;
                    if (writerClosed) {
                        cleanupStreamFromActiveStreams();
                    }
                    return;
                }
                yield new Uint8ArrayList(val.value);
            }
        })(),
        sink: async function (source) {
            for await (const chunks of source) {
                if (chunks.constructor === Uint8Array) {
                    await writer.write(chunks);
                }
                else {
                    for (const buf of chunks) {
                        await writer.write(buf);
                    }
                }
            }
        }
    };
    return stream;
}
function parseMultiaddr(ma) {
    const parts = ma.stringTuples();
    // This is simpler to have inline than extract into a separate function
    // eslint-disable-next-line complexity
    const { url, certhashes, remotePeer } = parts.reduce((state, [proto, value]) => {
        switch (proto) {
            case protocols('ip4').code:
            case protocols('ip6').code:
            case protocols('dns4').code:
            case protocols('dns6').code:
                if (state.seenHost || state.seenPort) {
                    throw new Error('Invalid multiaddr, saw host and already saw the host or port');
                }
                return {
                    ...state,
                    url: `${state.url}${value ?? ''}`,
                    seenHost: true
                };
            case protocols('quic').code:
            case protocols('webtransport').code:
                if (!state.seenHost || !state.seenPort) {
                    throw new Error("Invalid multiaddr, Didn't see host and port, but saw quic/webtransport");
                }
                return state;
            case protocols('udp').code:
                if (state.seenPort) {
                    throw new Error('Invalid multiaddr, saw port but already saw the port');
                }
                return {
                    ...state,
                    url: `${state.url}:${value ?? ''}`,
                    seenPort: true
                };
            case protocols('certhash').code:
                if (!state.seenHost || !state.seenPort) {
                    throw new Error('Invalid multiaddr, saw the certhash before seeing the host and port');
                }
                return {
                    ...state,
                    certhashes: state.certhashes.concat([decodeCerthashStr(value ?? '')])
                };
            case protocols('p2p').code:
                return {
                    ...state,
                    remotePeer: peerIdFromString(value ?? '')
                };
            default:
                throw new Error(`unexpected component in multiaddr: ${proto} ${protocols(proto).name} ${value ?? ''} `);
        }
    }, 
    // All webtransport urls are https
    { url: 'https://', seenHost: false, seenPort: false, certhashes: [] });
    return { url, certhashes, remotePeer };
}
// Determines if `maybeSubset` is a subset of `set`. This means that all byte arrays in `maybeSubset` are present in `set`.
export function isSubset(set, maybeSubset) {
    const intersection = maybeSubset.filter(byteArray => {
        return Boolean(set.find((otherByteArray) => {
            if (byteArray.length !== otherByteArray.length) {
                return false;
            }
            for (let index = 0; index < byteArray.length; index++) {
                if (otherByteArray[index] !== byteArray[index]) {
                    return false;
                }
            }
            return true;
        }));
    });
    return (intersection.length === maybeSubset.length);
}
class WebTransport {
    constructor(components, init = {}) {
        this.components = components;
        this.config = {
            maxInboundStreams: init.maxInboundStreams ?? 1000
        };
    }
    get [Symbol.toStringTag]() {
        return '@libp2p/webtransport';
    }
    get [symbol]() {
        return true;
    }
    async dial(ma, options) {
        log('dialing %s', ma);
        const localPeer = this.components.peerId;
        if (localPeer === undefined) {
            throw new Error('Need a local peerid');
        }
        options = options ?? {};
        const { url, certhashes, remotePeer } = parseMultiaddr(ma);
        const wt = new window.WebTransport(`${url}/.well-known/libp2p-webtransport?type=noise`, {
            serverCertificateHashes: certhashes.map(certhash => ({
                algorithm: 'sha-256',
                value: certhash.digest
            }))
        });
        wt.closed.catch((error) => {
            log.error('WebTransport transport closed due to:', error);
        });
        await wt.ready;
        if (remotePeer == null) {
            throw new Error('Need a target peerid');
        }
        if (!await this.authenticateWebTransport(wt, localPeer, remotePeer, certhashes)) {
            throw new Error('Failed to authenticate webtransport');
        }
        const maConn = {
            close: async (err) => {
                if (err != null) {
                    log('Closing webtransport with err:', err);
                }
                wt.close();
            },
            remoteAddr: ma,
            timeline: {
                open: Date.now()
            },
            // This connection is never used directly since webtransport supports native streams.
            ...inertDuplex()
        };
        wt.closed.catch((err) => {
            log.error('WebTransport connection closed:', err);
            // This is how we specify the connection is closed and shouldn't be used.
            maConn.timeline.close = Date.now();
        });
        try {
            options?.signal?.throwIfAborted();
        }
        catch (e) {
            wt.close();
            throw e;
        }
        return await options.upgrader.upgradeOutbound(maConn, { skipEncryption: true, muxerFactory: this.webtransportMuxer(wt), skipProtection: true });
    }
    async authenticateWebTransport(wt, localPeer, remotePeer, certhashes) {
        const stream = await wt.createBidirectionalStream();
        const writer = stream.writable.getWriter();
        const reader = stream.readable.getReader();
        await writer.ready;
        const duplex = {
            source: (async function* () {
                while (true) {
                    const val = await reader.read();
                    yield val.value;
                }
            })(),
            sink: async function (source) {
                for await (const chunk of source) {
                    await writer.write(chunk);
                }
            }
        };
        const noise = new Noise();
        const { remoteExtensions } = await noise.secureOutbound(localPeer, duplex, remotePeer);
        // We're done with this authentication stream
        writer.close().catch((err) => {
            log.error(`Failed to close authentication stream writer: ${err.message}`);
        });
        reader.cancel().catch((err) => {
            log.error(`Failed to close authentication stream reader: ${err.message}`);
        });
        // Verify the certhashes we used when dialing are a subset of the certhashes relayed by the remote peer
        if (!isSubset(remoteExtensions?.webtransportCerthashes ?? [], certhashes.map(ch => ch.bytes))) {
            throw new Error("Our certhashes are not a subset of the remote's reported certhashes");
        }
        return true;
    }
    webtransportMuxer(wt) {
        let streamIDCounter = 0;
        const config = this.config;
        return {
            protocol: 'webtransport',
            createStreamMuxer: (init) => {
                // !TODO handle abort signal when WebTransport supports this.
                if (typeof init === 'function') {
                    // The api docs say that init may be a function
                    init = { onIncomingStream: init };
                }
                const activeStreams = [];
                (async function () {
                    //! TODO unclear how to add backpressure here?
                    const reader = wt.incomingBidirectionalStreams.getReader();
                    while (true) {
                        const { done, value: wtStream } = await reader.read();
                        if (done === true) {
                            break;
                        }
                        if (activeStreams.length >= config.maxInboundStreams) {
                            // We've reached our limit, close this stream.
                            wtStream.writable.close().catch((err) => {
                                log.error(`Failed to close inbound stream that crossed our maxInboundStream limit: ${err.message}`);
                            });
                            wtStream.readable.cancel().catch((err) => {
                                log.error(`Failed to close inbound stream that crossed our maxInboundStream limit: ${err.message}`);
                            });
                        }
                        else {
                            const stream = await webtransportBiDiStreamToStream(wtStream, String(streamIDCounter++), 'inbound', activeStreams, init?.onStreamEnd);
                            activeStreams.push(stream);
                            init?.onIncomingStream?.(stream);
                        }
                    }
                })().catch(() => {
                    log.error('WebTransport failed to receive incoming stream');
                });
                const muxer = {
                    protocol: 'webtransport',
                    streams: activeStreams,
                    newStream: async (name) => {
                        const wtStream = await wt.createBidirectionalStream();
                        const stream = await webtransportBiDiStreamToStream(wtStream, String(streamIDCounter++), init?.direction ?? 'outbound', activeStreams, init?.onStreamEnd);
                        activeStreams.push(stream);
                        return stream;
                    },
                    /**
                     * Close or abort all tracked streams and stop the muxer
                     */
                    close: (err) => {
                        if (err != null) {
                            log('Closing webtransport muxer with err:', err);
                        }
                        wt.close();
                    },
                    // This stream muxer is webtransport native. Therefore it doesn't plug in with any other duplex.
                    ...inertDuplex()
                };
                try {
                    init?.signal?.throwIfAborted();
                }
                catch (e) {
                    wt.close();
                    throw e;
                }
                return muxer;
            }
        };
    }
    createListener(options) {
        throw new Error('Webtransport servers are not supported in Node or the browser');
    }
    /**
     * Takes a list of `Multiaddr`s and returns only valid webtransport addresses.
     */
    filter(multiaddrs) {
        return multiaddrs.filter(ma => ma.protoNames().includes('webtransport'));
    }
}
export function webTransport(init = {}) {
    return (components) => new WebTransport(components, init);
}
//# sourceMappingURL=index.js.map