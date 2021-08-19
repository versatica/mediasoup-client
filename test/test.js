/**
 * This test runs in Node so no browser auto-detection is done. Instead, a
 * FakeHandler device is used.
 */

const sdpTransform = require('sdp-transform');
const { toBeType } = require('jest-tobetype');
const { FakeMediaStreamTrack } = require('fake-mediastreamtrack');
const pkg = require('../package.json');
const mediasoupClient = require('../');
const {
	version,
	Device,
	detectDevice,
	parseScalabilityMode,
	debug
} = mediasoupClient;
const { UnsupportedError, InvalidStateError } = mediasoupClient.types;
const utils = require('../lib/utils');
const { RemoteSdp } = require('../lib/handlers/sdp/RemoteSdp');
const { FakeHandler } = require('../lib/handlers/FakeHandler');
const fakeParameters = require('./fakeParameters');

expect.extend({ toBeType });

let device;
let sendTransport;
let recvTransport;
let audioProducer;
let videoProducer;
let audioConsumer;
let videoConsumer;
let dataProducer;
let dataConsumer;

test('mediasoup-client exposes a version property', () =>
{
	expect(version).toBeType('string');
	expect(version).toBe(pkg.version);
}, 500);

test('mediasoup-client exposes debug dependency', () =>
{
	expect(debug).toBeType('function');
}, 500);

test('detectDevice() returns nothing in Node', () =>
{
	expect(detectDevice()).toBe(undefined);
}, 500);

test('create a Device in Node without custom handlerName/handlerFactory throws UnsupportedError', () =>
{
	expect(() => new Device())
		.toThrow(UnsupportedError);
}, 500);

test('create a Device with an unknown handlerName string throws TypeError', () =>
{
	expect(() => new Device({ handlerName: 'FooBrowser666' }))
		.toThrow(TypeError);
}, 500);

test('create a Device in Node with a valid handlerFactory succeeds', () =>
{
	expect(
		device = new Device({ handlerFactory: FakeHandler.createFactory(fakeParameters) }))
		.toBeType('object');

	expect(device.handlerName).toBe('FakeHandler');
	expect(device.loaded).toBe(false);
}, 500);

test('device.rtpCapabilities getter throws InvalidStateError if not loaded', () =>
{
	expect(() => device.rtpCapabilities)
		.toThrow(InvalidStateError);
}, 500);

test('device.sctpCapabilities getter throws InvalidStateError if not loaded', () =>
{
	expect(() => device.sctpCapabilities)
		.toThrow(InvalidStateError);
}, 500);

test('device.canProduce() throws InvalidStateError if not loaded', () =>
{
	expect(() => device.canProduce('audio'))
		.toThrow(InvalidStateError);
}, 500);

test('device.createSendTransport() throws InvalidStateError if not loaded', () =>
{
	const {
		id,
		iceParameters,
		iceCandidates,
		dtlsParameters,
		sctpParameters
	} = fakeParameters.generateTransportRemoteParameters();

	expect(() => device.createSendTransport(
		{
			id,
			iceParameters,
			iceCandidates,
			dtlsParameters,
			sctpParameters
		}))
		.toThrow(InvalidStateError);
}, 500);

test('device.load() without routerRtpCapabilities rejects with TypeError', async () =>
{
	await expect(device.load({}))
		.rejects
		.toThrow(TypeError);

	expect(device.loaded).toBe(false);
}, 500);

test('device.load() with invalid routerRtpCapabilities rejects with TypeError', async () =>
{
	// Clonse fake router RTP capabilities to make them invalid.
	const routerRtpCapabilities =
		utils.clone(fakeParameters.generateRouterRtpCapabilities(), {});

	for (const codec of routerRtpCapabilities.codecs)
	{
		delete codec.mimeType;
	}

	await expect(device.load({ routerRtpCapabilities }))
		.rejects
		.toThrow(TypeError);

	expect(device.loaded).toBe(false);
}, 500);

test('device.load() succeeds', async () =>
{
	// Assume we get the router RTP capabilities.
	const routerRtpCapabilities = fakeParameters.generateRouterRtpCapabilities();

	await expect(device.load({ routerRtpCapabilities }))
		.resolves
		.toBe(undefined);

	expect(device.loaded).toBe(true);
}, 500);

test('device.load() rejects with InvalidStateError if already loaded', async () =>
{
	await expect(device.load({}))
		.rejects
		.toThrow(InvalidStateError);

	expect(device.loaded).toBe(true);
}, 500);

test('device.rtpCapabilities getter succeeds', () =>
{
	expect(device.rtpCapabilities).toBeType('object');
}, 500);

test('device.sctpCapabilities getter succeeds', () =>
{
	expect(device.sctpCapabilities).toBeType('object');
}, 500);

test('device.canProduce() with "audio"/"video" kind returns true', () =>
{
	expect(device.canProduce('audio')).toBe(true);
	expect(device.canProduce('video')).toBe(true);
}, 500);

test('device.canProduce() with invalid kind throws TypeError', () =>
{
	expect(() => device.canProduce('chicken'))
		.toThrow(TypeError);
}, 500);

test('device.createSendTransport() for sending media succeeds', () =>
{
	// Assume we create a transport in the server and get its remote parameters.
	const {
		id,
		iceParameters,
		iceCandidates,
		dtlsParameters,
		sctpParameters
	} = fakeParameters.generateTransportRemoteParameters();

	expect(sendTransport = device.createSendTransport(
		{
			id,
			iceParameters,
			iceCandidates,
			dtlsParameters,
			sctpParameters,
			appData : { baz: 'BAZ' }
		}))
		.toBeType('object');

	expect(sendTransport.id).toBe(id);
	expect(sendTransport.closed).toBe(false);
	expect(sendTransport.direction).toBe('send');
	expect(sendTransport.handler).toBeType('object');
	expect(sendTransport.handler instanceof FakeHandler).toBe(true);
	expect(sendTransport.connectionState).toBe('new');
	expect(sendTransport.appData).toEqual({ baz: 'BAZ' }, 500);
}, 500);

test('device.createRecvTransport() for receiving media succeeds', () =>
{
	// Assume we create a transport in the server and get its remote parameters.
	const {
		id,
		iceParameters,
		iceCandidates,
		dtlsParameters,
		sctpParameters
	} = fakeParameters.generateTransportRemoteParameters();

	expect(recvTransport = device.createRecvTransport(
		{
			id,
			iceParameters,
			iceCandidates,
			dtlsParameters,
			sctpParameters
		}))
		.toBeType('object');

	expect(recvTransport.id).toBe(id);
	expect(recvTransport.closed).toBe(false);
	expect(recvTransport.direction).toBe('recv');
	expect(recvTransport.handler).toBeType('object');
	expect(recvTransport.handler instanceof FakeHandler).toBe(true);
	expect(recvTransport.connectionState).toBe('new');
	expect(recvTransport.appData).toEqual({});
}, 500);

test('device.createSendTransport() with missing remote Transport parameters throws TypeError', () =>
{
	expect(() => device.createSendTransport({ id: '1234' }))
		.toThrow(TypeError);

	expect(() => device.createSendTransport({ id: '1234', iceParameters: {} }))
		.toThrow(TypeError);

	expect(() => device.createSendTransport(
		{
			id            : '1234',
			iceParameters : {},
			iceCandidates : []
		}))
		.toThrow(TypeError);
}, 500);

test('device.createRecvTransport() with a non object appData throws TypeError', () =>
{
	const {
		id,
		iceParameters,
		iceCandidates,
		dtlsParameters,
		sctpParameters
	} = fakeParameters.generateTransportRemoteParameters();

	expect(() => device.createRecvTransport(
		{
			id,
			iceParameters,
			iceCandidates,
			dtlsParameters,
			sctpParameters,
			appData : 1234
		}))
		.toThrow(TypeError);
}, 500);

test('transport.produce() without "connect" listener rejects', async () =>
{
	const audioTrack = new FakeMediaStreamTrack({ kind: 'audio' });

	await expect(sendTransport.produce({ track: audioTrack }))
		.rejects
		.toThrow(Error);
}, 500);

test('transport.produce() succeeds', async () =>
{
	const audioTrack = new FakeMediaStreamTrack({ kind: 'audio' });
	const videoTrack = new FakeMediaStreamTrack({ kind: 'video' });
	let audioProducerId;
	let videoProducerId;
	let connectEventNumTimesCalled = 0;
	let produceEventNumTimesCalled = 0;

	// eslint-disable-next-line no-unused-vars
	sendTransport.on('connect', ({ dtlsParameters }, callback, errback) =>
	{
		connectEventNumTimesCalled++;

		expect(dtlsParameters).toBeType('object');

		// Emulate communication with the server and success response (no response
		// data needed).
		setTimeout(callback);
	});

	// eslint-disable-next-line no-unused-vars
	sendTransport.on('produce', ({ kind, rtpParameters, appData }, callback, errback) =>
	{
		produceEventNumTimesCalled++;

		expect(kind).toBeType('string');
		expect(rtpParameters).toBeType('object');

		let id;

		switch (kind)
		{
			case 'audio':
			{
				expect(appData).toEqual({ foo: 'FOO' });

				id = fakeParameters.generateProducerRemoteParameters().id;
				audioProducerId = id;

				break;
			}

			case 'video':
			{
				expect(appData).toEqual({});

				id = fakeParameters.generateProducerRemoteParameters().id;
				videoProducerId = id;

				break;
			}

			default:
			{
				throw new Error('unknown kind');
			}
		}

		// Emulate communication with the server and success response with Producer
		// remote parameters.
		setTimeout(() => callback({ id }));
	});

	let codecs;
	let headerExtensions;
	let encodings;
	let rtcp;

	// Pause the audio track before creating its Producer.
	audioTrack.enabled = false;

	// Use stopTracks: false.
	audioProducer = await sendTransport.produce(
		{ track: audioTrack, stopTracks: false, appData: { foo: 'FOO' } });

	expect(connectEventNumTimesCalled).toBe(1);
	expect(produceEventNumTimesCalled).toBe(1);
	expect(audioProducer).toBeType('object');
	expect(audioProducer.id).toBe(audioProducerId);
	expect(audioProducer.closed).toBe(false);
	expect(audioProducer.kind).toBe('audio');
	expect(audioProducer.track).toBe(audioTrack);
	expect(audioProducer.rtpParameters).toBeType('object');
	expect(audioProducer.rtpParameters.mid).toBeType('string');
	expect(audioProducer.rtpParameters.codecs.length).toBe(1);

	codecs = audioProducer.rtpParameters.codecs;
	expect(codecs[0]).toEqual(
		{
			mimeType     : 'audio/opus',
			payloadType  : 111,
			clockRate    : 48000,
			channels     : 2,
			rtcpFeedback :
			[
				{ type: 'transport-cc', parameter: '' }
			],
			parameters :
			{
				minptime     : 10,
				useinbandfec : 1
			}
		});

	headerExtensions = audioProducer.rtpParameters.headerExtensions;
	expect(headerExtensions).toEqual(
		[
			{
				uri        : 'urn:ietf:params:rtp-hdrext:sdes:mid',
				id         : 1,
				encrypt    : false,
				parameters : {}
			},
			{
				uri        : 'urn:ietf:params:rtp-hdrext:ssrc-audio-level',
				id         : 10,
				encrypt    : false,
				parameters : {}
			}
		]);

	encodings = audioProducer.rtpParameters.encodings;
	expect(encodings).toBeType('array');
	expect(encodings.length).toBe(1);
	expect(encodings[0]).toBeType('object');
	expect(Object.keys(encodings[0])).toEqual([ 'ssrc', 'dtx' ]);
	expect(encodings[0].ssrc).toBeType('number');

	rtcp = audioProducer.rtpParameters.rtcp;
	expect(rtcp).toBeType('object');
	expect(rtcp.cname).toBeType('string');

	expect(audioProducer.paused).toBe(true);
	expect(audioProducer.maxSpatialLayer).toBe(undefined);
	expect(audioProducer.appData).toEqual({ foo: 'FOO' });

	// Reset the audio paused state.
	audioProducer.resume();

	const videoEncodings =
	[
		{ maxBitrate: 100000 },
		{ maxBitrate: 500000 }
	];

	// Note that stopTracks is not give so it's true by default.
	// Use disableTrackOnPause: false and zeroRtpOnPause: true
	videoProducer = await sendTransport.produce(
		{
			track               : videoTrack,
			encodings           : videoEncodings,
			disableTrackOnPause : false,
			zeroRtpOnPause      : true
		});

	expect(connectEventNumTimesCalled).toBe(1);
	expect(produceEventNumTimesCalled).toBe(2);
	expect(videoProducer).toBeType('object');
	expect(videoProducer.id).toBe(videoProducerId);
	expect(videoProducer.closed).toBe(false);
	expect(videoProducer.kind).toBe('video');
	expect(videoProducer.track).toBe(videoTrack);
	expect(videoProducer.rtpParameters).toBeType('object');
	expect(videoProducer.rtpParameters.mid).toBeType('string');
	expect(videoProducer.rtpParameters.codecs.length).toBe(2);

	codecs = videoProducer.rtpParameters.codecs;
	expect(codecs[0]).toEqual(
		{
			mimeType     : 'video/VP8',
			payloadType  : 96,
			clockRate    : 90000,
			rtcpFeedback :
			[
				{ type: 'goog-remb', parameter: '' },
				{ type: 'transport-cc', parameter: '' },
				{ type: 'ccm', parameter: 'fir' },
				{ type: 'nack', parameter: '' },
				{ type: 'nack', parameter: 'pli' }
			],
			parameters :
			{
				baz : '1234abcd'
			}
		});
	expect(codecs[1]).toEqual(
		{
			mimeType     : 'video/rtx',
			payloadType  : 97,
			clockRate    : 90000,
			rtcpFeedback : [],
			parameters   :
			{
				apt : 96
			}
		});

	headerExtensions = videoProducer.rtpParameters.headerExtensions;
	expect(headerExtensions).toEqual(
		[
			{
				uri        : 'urn:ietf:params:rtp-hdrext:sdes:mid',
				id         : 1,
				encrypt    : false,
				parameters : {}
			},
			{
				uri        : 'http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time',
				id         : 3,
				encrypt    : false,
				parameters : {}
			},
			{
				uri        : 'http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01',
				id         : 5,
				encrypt    : false,
				parameters : {}
			},
			{
				uri        : 'urn:3gpp:video-orientation',
				id         : 4,
				encrypt    : false,
				parameters : {}
			},
			{
				uri        : 'urn:ietf:params:rtp-hdrext:toffset',
				id         : 2,
				encrypt    : false,
				parameters : {}
			}
		]);

	encodings = videoProducer.rtpParameters.encodings;
	expect(encodings).toBeType('array');
	expect(encodings.length).toBe(2);
	expect(encodings[0]).toBeType('object');
	expect(encodings[0].ssrc).toBeType('number');
	expect(encodings[0].rtx).toBeType('object');
	expect(Object.keys(encodings[0].rtx)).toEqual([ 'ssrc' ]);
	expect(encodings[0].rtx.ssrc).toBeType('number');
	expect(encodings[1]).toBeType('object');
	expect(encodings[1].ssrc).toBeType('number');
	expect(encodings[1].rtx).toBeType('object');
	expect(Object.keys(encodings[1].rtx)).toEqual([ 'ssrc' ]);
	expect(encodings[1].rtx.ssrc).toBeType('number');

	rtcp = videoProducer.rtpParameters.rtcp;
	expect(rtcp).toBeType('object');
	expect(rtcp.cname).toBeType('string');

	expect(videoProducer.paused).toBe(false);
	expect(videoProducer.maxSpatialLayer).toBe(undefined);
	expect(videoProducer.appData).toEqual({});

	sendTransport.removeAllListeners('connect');
	sendTransport.removeAllListeners('produce');
}, 500);

test('transport.produce() without track rejects with TypeError', async () =>
{
	await expect(sendTransport.produce({}))
		.rejects
		.toThrow(TypeError);
}, 500);

test('transport.produce() in a receiving Transport rejects with UnsupportedError', async () =>
{
	const track = new FakeMediaStreamTrack({ kind: 'audio' });

	await expect(recvTransport.produce({ track }))
		.rejects
		.toThrow(UnsupportedError);
}, 500);

test('transport.produce() with an ended track rejects with InvalidStateError', async () =>
{
	const track = new FakeMediaStreamTrack({ kind: 'audio' });

	track.stop();

	await expect(sendTransport.produce({ track }))
		.rejects
		.toThrow(InvalidStateError);
}, 500);

test('transport.produce() with a non object appData rejects with TypeError', async () =>
{
	const track = new FakeMediaStreamTrack({ kind: 'audio' });

	await expect(sendTransport.produce({ track, appData: true }))
		.rejects
		.toThrow(TypeError);
}, 500);

test('transport.consume() succeeds', async () =>
{
	const audioConsumerRemoteParameters =
		fakeParameters.generateConsumerRemoteParameters({ codecMimeType: 'audio/opus' });
	const videoConsumerRemoteParameters =
		fakeParameters.generateConsumerRemoteParameters({ codecMimeType: 'video/VP8' });
	let connectEventNumTimesCalled = 0;

	// eslint-disable-next-line no-unused-vars
	recvTransport.on('connect', ({ dtlsParameters }, callback, errback) =>
	{
		connectEventNumTimesCalled++;

		expect(dtlsParameters).toBeType('object');

		// Emulate communication with the server and success response (no response
		// data needed).
		setTimeout(callback);
	});

	let codecs;
	let headerExtensions;
	let encodings;
	let rtcp;

	audioConsumer = await recvTransport.consume(
		{
			id            : audioConsumerRemoteParameters.id,
			producerId    : audioConsumerRemoteParameters.producerId,
			kind          : audioConsumerRemoteParameters.kind,
			rtpParameters : audioConsumerRemoteParameters.rtpParameters,
			appData       : { bar: 'BAR' }
		});

	expect(connectEventNumTimesCalled).toBe(1);
	expect(audioConsumer).toBeType('object');
	expect(audioConsumer.id).toBe(audioConsumerRemoteParameters.id);
	expect(audioConsumer.producerId).toBe(audioConsumerRemoteParameters.producerId);
	expect(audioConsumer.closed).toBe(false);
	expect(audioConsumer.kind).toBe('audio');
	expect(audioConsumer.track).toBeType('object');
	expect(audioConsumer.rtpParameters).toBeType('object');
	expect(audioConsumer.rtpParameters.mid).toBe(undefined);
	expect(audioConsumer.rtpParameters.codecs.length).toBe(1);

	codecs = audioConsumer.rtpParameters.codecs;
	expect(codecs[0]).toEqual(
		{
			mimeType     : 'audio/opus',
			payloadType  : 100,
			clockRate    : 48000,
			channels     : 2,
			rtcpFeedback :
			[
				{ type: 'transport-cc', parameter: '' }
			],
			parameters :
			{
				useinbandfec : 1,
				foo          : 'bar'
			}
		});

	headerExtensions = audioConsumer.rtpParameters.headerExtensions;
	expect(headerExtensions).toEqual(
		[
			{
				uri        : 'urn:ietf:params:rtp-hdrext:sdes:mid',
				id         : 1,
				encrypt    : false,
				parameters : {}
			},
			{
				uri        : 'http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01',
				id         : 5,
				encrypt    : false,
				parameters : {}
			},
			{
				uri        : 'urn:ietf:params:rtp-hdrext:ssrc-audio-level',
				id         : 10,
				encrypt    : false,
				parameters : {}
			}
		]);

	encodings = audioConsumer.rtpParameters.encodings;
	expect(encodings).toBeType('array');
	expect(encodings.length).toBe(1);
	expect(encodings[0]).toBeType('object');
	expect(Object.keys(encodings[0])).toEqual([ 'ssrc', 'dtx' ]);
	expect(encodings[0].ssrc).toBeType('number');

	rtcp = audioProducer.rtpParameters.rtcp;
	expect(rtcp).toBeType('object');
	expect(rtcp.cname).toBeType('string');

	expect(audioConsumer.paused).toBe(false);
	expect(audioConsumer.appData).toEqual({ bar: 'BAR' });

	videoConsumer = await recvTransport.consume(
		{
			id            : videoConsumerRemoteParameters.id,
			producerId    : videoConsumerRemoteParameters.producerId,
			kind          : videoConsumerRemoteParameters.kind,
			rtpParameters : videoConsumerRemoteParameters.rtpParameters
		});

	expect(connectEventNumTimesCalled).toBe(1);
	expect(videoConsumer).toBeType('object');
	expect(videoConsumer.id).toBe(videoConsumerRemoteParameters.id);
	expect(videoConsumer.producerId).toBe(videoConsumerRemoteParameters.producerId);
	expect(videoConsumer.closed).toBe(false);
	expect(videoConsumer.kind).toBe('video');
	expect(videoConsumer.track).toBeType('object');
	expect(videoConsumer.rtpParameters).toBeType('object');
	expect(videoConsumer.rtpParameters.mid).toBe(undefined);
	expect(videoConsumer.rtpParameters.codecs.length).toBe(2);

	codecs = videoConsumer.rtpParameters.codecs;
	expect(codecs[0]).toEqual(
		{
			mimeType     : 'video/VP8',
			payloadType  : 101,
			clockRate    : 90000,
			rtcpFeedback :
			[
				{ type: 'nack', parameter: '' },
				{ type: 'nack', parameter: 'pli' },
				{ type: 'ccm', parameter: 'fir' },
				{ type: 'goog-remb', parameter: '' },
				{ type: 'transport-cc', parameter: '' }
			],
			parameters :
			{
				'x-google-start-bitrate' : 1500
			}
		});
	expect(codecs[1]).toEqual(
		{
			mimeType     : 'video/rtx',
			payloadType  : 102,
			clockRate    : 90000,
			rtcpFeedback : [],
			parameters   :
			{
				apt : 101
			}
		});

	headerExtensions = videoConsumer.rtpParameters.headerExtensions;
	expect(headerExtensions).toEqual(
		[
			{
				uri        : 'urn:ietf:params:rtp-hdrext:sdes:mid',
				id         : 1,
				encrypt    : false,
				parameters : {}
			},
			{
				uri        : 'http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time',
				id         : 4,
				encrypt    : false,
				parameters : {}
			},
			{
				uri        : 'http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01',
				id         : 5,
				encrypt    : false,
				parameters : {}
			},
			{
				uri        : 'urn:3gpp:video-orientation',
				id         : 11,
				encrypt    : false,
				parameters : {}
			},
			{
				uri        : 'urn:ietf:params:rtp-hdrext:toffset',
				id         : 12,
				encrypt    : false,
				parameters : {}
			}
		]);

	encodings = videoConsumer.rtpParameters.encodings;
	expect(encodings).toBeType('array');
	expect(encodings.length).toBe(1);
	expect(encodings[0]).toBeType('object');
	expect(Object.keys(encodings[0])).toEqual([ 'ssrc', 'rtx', 'dtx' ]);
	expect(encodings[0].ssrc).toBeType('number');
	expect(encodings[0].rtx).toBeType('object');
	expect(Object.keys(encodings[0].rtx)).toEqual([ 'ssrc' ]);
	expect(encodings[0].rtx.ssrc).toBeType('number');

	rtcp = videoConsumer.rtpParameters.rtcp;
	expect(rtcp).toBeType('object');
	expect(rtcp.cname).toBeType('string');

	expect(videoConsumer.paused).toBe(false);
	expect(videoConsumer.appData).toEqual({});

	recvTransport.removeAllListeners('connect');
}, 500);

test('transport.consume() without remote Consumer parameters rejects with TypeError', async () =>
{
	await expect(recvTransport.consume({}))
		.rejects
		.toThrow(TypeError);
}, 500);

test('transport.consume() with missing remote Consumer parameters rejects with TypeError', async () =>
{
	await expect(recvTransport.consume({ id: '1234' }))
		.rejects
		.toThrow(TypeError);

	await expect(recvTransport.consume({ id: '1234', producerId: '4444' }))
		.rejects
		.toThrow(TypeError);

	await expect(recvTransport.consume(
		{
			id         : '1234',
			producerId : '4444',
			kind       : 'audio'
		}))
		.rejects
		.toThrow(TypeError);

	await expect(recvTransport.consume(
		{
			id         : '1234',
			producerId : '4444',
			kind       : 'audio'
		}))
		.rejects
		.toThrow(TypeError);
}, 500);

test('transport.consume() in a sending Transport rejects with UnsupportedError', async () =>
{
	const {
		id,
		producerId,
		kind,
		rtpParameters
	} = fakeParameters.generateConsumerRemoteParameters({ codecMimeType: 'audio/opus' });

	await expect(sendTransport.consume(
		{
			id,
			producerId,
			kind,
			rtpParameters
		}))
		.rejects
		.toThrow(UnsupportedError);
}, 500);

test('transport.consume() with unsupported rtpParameters rejects with UnsupportedError', async () =>
{
	const {
		id,
		producerId,
		kind,
		rtpParameters
	} = fakeParameters.generateConsumerRemoteParameters({ codecMimeType: 'audio/ISAC' });

	await expect(sendTransport.consume(
		{
			id,
			producerId,
			kind,
			rtpParameters
		}))
		.rejects
		.toThrow(UnsupportedError);
}, 500);

test('transport.consume() with a non object appData rejects with TypeError', async () =>
{
	const consumerRemoteParameters =
		fakeParameters.generateConsumerRemoteParameters({ codecMimeType: 'audio/opus' });

	await expect(recvTransport.consume({ consumerRemoteParameters, appData: true }))
		.rejects
		.toThrow(TypeError);
}, 500);

test('transport.produceData() succeeds', async () =>
{
	let dataProducerId;
	let produceDataEventNumTimesCalled = 0;

	// eslint-disable-next-line no-unused-vars
	sendTransport.on('producedata', ({ sctpStreamParameters, label, protocol, appData }, callback, errback) =>
	{
		produceDataEventNumTimesCalled++;

		expect(sctpStreamParameters).toBeType('object');
		expect(label).toBe('FOO');
		expect(protocol).toBe('BAR');
		expect(appData).toEqual({ foo: 'FOO' });

		const id = fakeParameters.generateDataProducerRemoteParameters().id;

		dataProducerId = id;

		// Emulate communication with the server and success response with Producer
		// remote parameters.
		setTimeout(() => callback({ id }));
	});

	dataProducer = await sendTransport.produceData(
		{
			ordered           : false,
			maxPacketLifeTime : 5555,
			label             : 'FOO',
			protocol          : 'BAR',
			appData           : { foo: 'FOO' }
		});

	expect(produceDataEventNumTimesCalled).toBe(1);
	expect(dataProducer).toBeType('object');
	expect(dataProducer.id).toBe(dataProducerId);
	expect(dataProducer.closed).toBe(false);
	expect(dataProducer.sctpStreamParameters).toBeType('object');
	expect(dataProducer.sctpStreamParameters.streamId).toBeType('number');
	expect(dataProducer.sctpStreamParameters.ordered).toBe(false);
	expect(dataProducer.sctpStreamParameters.maxPacketLifeTime).toBe(5555);
	expect(dataProducer.sctpStreamParameters.maxRetransmits).toBe(undefined);
	expect(dataProducer.label).toBe('FOO');
	expect(dataProducer.protocol).toBe('BAR');

	sendTransport.removeAllListeners('producedata');
}, 500);

test('transport.produceData() in a receiving Transport rejects with UnsupportedError', async () =>
{
	await expect(recvTransport.produceData({}))
		.rejects
		.toThrow(UnsupportedError);
}, 500);

test('transport.produceData() with a non object appData rejects with TypeError', async () =>
{
	await expect(sendTransport.produceData({ appData: true }))
		.rejects
		.toThrow(TypeError);
}, 500);

test('transport.consumeData() succeeds', async () =>
{
	const dataConsumerRemoteParameters =
		fakeParameters.generateDataConsumerRemoteParameters();

	dataConsumer = await recvTransport.consumeData(
		{
			id                   : dataConsumerRemoteParameters.id,
			dataProducerId       : dataConsumerRemoteParameters.dataProducerId,
			sctpStreamParameters : dataConsumerRemoteParameters.sctpStreamParameters,
			label                : 'FOO',
			protocol             : 'BAR',
			appData              : { bar: 'BAR' }
		});

	expect(dataConsumer).toBeType('object');
	expect(dataConsumer.id).toBe(dataConsumerRemoteParameters.id);
	expect(dataConsumer.dataProducerId).toBe(dataConsumerRemoteParameters.dataProducerId);
	expect(dataConsumer.closed).toBe(false);
	expect(dataConsumer.sctpStreamParameters).toBeType('object');
	expect(dataConsumer.sctpStreamParameters.streamId).toBeType('number');
	expect(dataConsumer.label).toBe('FOO');
	expect(dataConsumer.protocol).toBe('BAR');
}, 500);

test('transport.consumeData() without remote DataConsumer parameters rejects with TypeError', async () =>
{
	await expect(recvTransport.consumeData({}))
		.rejects
		.toThrow(TypeError);
}, 500);

test('transport.consumeData() with missing remote DataConsumer parameters rejects with TypeError', async () =>
{
	await expect(recvTransport.consumeData({ id: '1234' }))
		.rejects
		.toThrow(TypeError);

	await expect(recvTransport.consumeData({ id: '1234', dataProducerId: '4444' }))
		.rejects
		.toThrow(TypeError);
}, 500);

test('transport.consumeData() in a sending Transport rejects with UnsupportedError', async () =>
{
	const {
		id,
		dataProducerId,
		sctpStreamParameters
	} = fakeParameters.generateDataConsumerRemoteParameters();

	await expect(sendTransport.consumeData(
		{
			id,
			dataProducerId,
			sctpStreamParameters
		}))
		.rejects
		.toThrow(UnsupportedError);
}, 500);

test('transport.consumeData() with a non object appData rejects with TypeError', async () =>
{
	const dataConsumerRemoteParameters =
		fakeParameters.generateDataConsumerRemoteParameters();

	await expect(recvTransport.consumeData({ dataConsumerRemoteParameters, appData: true }))
		.rejects
		.toThrow(TypeError);
}, 500);

test('transport.getStats() succeeds', async () =>
{
	await expect(sendTransport.getStats())
		.resolves
		.toBeType('map');
}, 500);

test('transport.restartIce() succeeds', async () =>
{
	await expect(sendTransport.restartIce({ iceParameters: {} }))
		.resolves
		.toBe(undefined);
}, 500);

test('transport.restartIce() without remote iceParameters rejects with TypeError', async () =>
{
	await expect(sendTransport.restartIce({}))
		.rejects
		.toThrow(TypeError);
}, 500);

test('transport.updateIceServers() succeeds', async () =>
{
	await expect(sendTransport.updateIceServers({ iceServers: [] }))
		.resolves
		.toBe(undefined);
}, 500);

test('transport.updateIceServers() without iceServers rejects with TypeError', async () =>
{
	await expect(sendTransport.updateIceServers({}))
		.rejects
		.toThrow(TypeError);
}, 500);

test('transport.appData cannot be overridden', () =>
{
	expect(() => (sendTransport.appData = { lalala: 'LALALA' }))
		.toThrow(Error);

	expect(sendTransport.appData).toEqual({ baz: 'BAZ' });
}, 500);

test('transport.appData can be modified', () =>
{
	sendTransport.appData.lololo = 'LOLOLO';
	recvTransport.appData.nanana = 'NANANA';

	expect(sendTransport.appData).toEqual({ baz: 'BAZ', lololo: 'LOLOLO' });
	expect(recvTransport.appData).toEqual({ nanana: 'NANANA' });
}, 500);

test('connection state change fires "connectionstatechange" in live Transport', () =>
{
	let connectionStateChangeEventNumTimesCalled = 0;

	sendTransport.on('connectionstatechange', (connectionState) =>
	{
		connectionStateChangeEventNumTimesCalled++;

		expect(connectionState).toBe('completed');
	});

	sendTransport.handler.setConnectionState('completed');

	expect(connectionStateChangeEventNumTimesCalled).toBe(1);
	expect(sendTransport.connectionState).toBe('completed');

	sendTransport.removeAllListeners('connectionstatechange');
}, 500);

test('producer.pause() succeeds', () =>
{
	videoProducer.pause();
	expect(videoProducer.paused).toBe(true);

	// Track will be still enabled due to disableTrackOnPause: false.
	expect(videoProducer.track.enabled).toBe(true);
}, 500);

test('producer.resume() succeeds', () =>
{
	videoProducer.resume();
	expect(videoProducer.paused).toBe(false);
	expect(videoProducer.track.enabled).toBe(true);
}, 500);

test('producer.replaceTrack() with a new track succeeds', async () =>
{
	// Have the audio Producer paused.
	audioProducer.pause();

	const audioProducerPreviousTrack = audioProducer.track;
	const newAudioTrack = new FakeMediaStreamTrack({ kind: 'audio' });

	await expect(audioProducer.replaceTrack({ track: newAudioTrack }))
		.resolves
		.toBe(undefined);

	// Previous track must be 'live' due to stopTracks: false.
	expect(audioProducerPreviousTrack.readyState).toBe('live');
	expect(audioProducer.track.readyState).toBe('live');
	expect(audioProducer.track).not.toBe(audioProducerPreviousTrack);
	expect(audioProducer.track).toBe(newAudioTrack);
	// Producer was already paused.
	expect(audioProducer.paused).toBe(true);

	// Reset the audio paused state.
	audioProducer.resume();

	const videoProducerPreviousTrack = videoProducer.track;
	const newVideoTrack = new FakeMediaStreamTrack({ kind: 'video' });

	await expect(videoProducer.replaceTrack({ track: newVideoTrack }))
		.resolves
		.toBe(undefined);

	// Previous track must be 'ended' due to stopTracks: true.
	expect(videoProducerPreviousTrack.readyState).toBe('ended');
	expect(videoProducer.track).not.toBe(videoProducerPreviousTrack);
	expect(videoProducer.track).toBe(newVideoTrack);
	expect(videoProducer.paused).toBe(false);
}, 500);

test('producer.replaceTrack() with null succeeds', async () =>
{
	// Have the audio Producer paused.
	audioProducer.pause();

	const audioProducerPreviousTrack = audioProducer.track;

	await expect(audioProducer.replaceTrack({ track: null }))
		.resolves
		.toBe(undefined);

	// Previous track must be 'live' due to stopTracks: false.
	expect(audioProducerPreviousTrack.readyState).toBe('live');
	expect(audioProducer.track).toBeNull();
	// Producer was already paused.
	expect(audioProducer.paused).toBe(true);

	// Reset the audio paused state.
	audioProducer.resume();

	expect(audioProducer.paused).toBe(false);

	// Manually "mute" the original audio track.
	audioProducerPreviousTrack.enabled = false;

	// Set the original audio track back.
	await expect(audioProducer.replaceTrack({ track: audioProducerPreviousTrack }))
		.resolves
		.toBe(undefined);

	// The given audio track was muted but the Producer was not, so the track
	// must not be muted now.
	expect(audioProducer.paused).toBe(false);
	expect(audioProducerPreviousTrack.enabled).toBe(true);

	// Reset the audio paused state.
	audioProducer.resume();
}, 500);

test('producer.replaceTrack() with an ended track rejects with InvalidStateError', async () =>
{
	const track = new FakeMediaStreamTrack({ kind: 'audio' });

	track.stop();

	await expect(videoProducer.replaceTrack({ track }))
		.rejects
		.toThrow(InvalidStateError);

	expect(track.readyState).toBe('ended');
	expect(videoProducer.track.readyState).toBe('live');
}, 500);

test('producer.replaceTrack() with the same track succeeds', async () =>
{
	await expect(audioProducer.replaceTrack({ track: audioProducer.track }))
		.resolves
		.toBe(undefined);

	expect(audioProducer.track.readyState).toBe('live');
}, 500);

test('producer.setMaxSpatialLayer() succeeds', async () =>
{
	await expect(videoProducer.setMaxSpatialLayer(0))
		.resolves
		.toBe(undefined);

	expect(videoProducer.maxSpatialLayer).toBe(0);
}, 500);

test('producer.setMaxSpatialLayer() in an audio Producer rejects with UnsupportedError', async () =>
{
	await expect(audioProducer.setMaxSpatialLayer(1))
		.rejects
		.toThrow(UnsupportedError);

	expect(audioProducer.maxSpatialLayer).toBe(undefined);
}, 500);

test('producer.setMaxSpatialLayer() with invalid spatialLayer rejects with TypeError', async () =>
{
	await expect(videoProducer.setMaxSpatialLayer('chicken'))
		.rejects
		.toThrow(TypeError);
}, 500);

test('producer.setMaxSpatialLayer() without spatialLayer rejects with TypeError', async () =>
{
	await expect(videoProducer.setMaxSpatialLayer())
		.rejects
		.toThrow(TypeError);
}, 500);

test('producer.setRtpEncodingParameters() succeeds', async () =>
{
	await expect(videoProducer.setRtpEncodingParameters({ foo: 'bar' }))
		.resolves
		.toBe(undefined);

	expect(videoProducer.maxSpatialLayer).toBe(0);
}, 500);

test('producer.getStats() succeeds', async () =>
{
	await expect(videoProducer.getStats())
		.resolves
		.toBeType('map');
}, 500);

test('producer.appData cannot be overridden', () =>
{
	expect(() => (videoProducer.appData = { lalala: 'LALALA' }))
		.toThrow(Error);

	expect(videoProducer.appData).toEqual({});
}, 500);

test('consumer.resume() succeeds', () =>
{
	videoConsumer.resume();
	expect(videoConsumer.paused).toBe(false);
}, 500);

test('consumer.pause() succeeds', () =>
{
	videoConsumer.pause();
	expect(videoConsumer.paused).toBe(true);
}, 500);

test('consumer.getStats() succeeds', async () =>
{
	await expect(videoConsumer.getStats())
		.resolves
		.toBeType('map');
}, 500);

test('cnosumer.appData cannot be overridden', () =>
{
	expect(() => (audioConsumer.appData = { lalala: 'LALALA' }))
		.toThrow(Error);

	expect(audioConsumer.appData).toEqual({ bar: 'BAR' });
}, 500);

test('dataProducer.appData cannot be overridden', () =>
{
	expect(() => (dataProducer.appData = { lalala: 'LALALA' }))
		.toThrow(Error);

	expect(dataProducer.appData).toEqual({ foo: 'FOO' });
}, 500);

test('dataConsumer.appData cannot be overridden', () =>
{
	expect(() => (dataConsumer.appData = { lalala: 'LALALA' }))
		.toThrow(Error);

	expect(dataConsumer.appData).toEqual({ bar: 'BAR' });
}, 500);

test('producer.close() succeed', () =>
{
	audioProducer.close();
	expect(audioProducer.closed).toBe(true);
	// Track will be still 'live' due to stopTracks: false.
	expect(audioProducer.track.readyState).toBe('live');
}, 500);

test('producer.replaceTrack() rejects with InvalidStateError if closed', async () =>
{
	const audioTrack = new FakeMediaStreamTrack({ kind: 'audio' });

	await expect(audioProducer.replaceTrack({ track: audioTrack }))
		.rejects
		.toThrow(InvalidStateError);

	expect(audioTrack.readyState).toBe('live');
}, 500);

test('producer.getStats() rejects with InvalidStateError if closed', async () =>
{
	await expect(audioProducer.getStats())
		.rejects
		.toThrow(InvalidStateError);
}, 500);

test('consumer.close() succeed', () =>
{
	audioConsumer.close();
	expect(audioConsumer.closed).toBe(true);
	expect(audioConsumer.track.readyState).toBe('ended');
}, 500);

test('consumer.getStats() rejects with InvalidStateError if closed', async () =>
{
	await expect(audioConsumer.getStats())
		.rejects
		.toThrow(InvalidStateError);
}, 500);

test('dataProducer.close() succeed', () =>
{
	dataProducer.close();
	expect(dataProducer.closed).toBe(true);
}, 500);

test('dataConsumer.close() succeed', () =>
{
	dataConsumer.close();
	expect(dataConsumer.closed).toBe(true);
}, 500);

test('remotetely stopped track fires "trackended" in live Producers/Consumers', () =>
{
	let audioProducerTrackendedEventCalled = false;
	let videoProducerTrackendedEventCalled = false;
	let audiosConsumerTrackendedEventCalled = false;
	let videoConsumerTrackendedEventCalled = false;

	audioProducer.on('trackended', () =>
	{
		audioProducerTrackendedEventCalled = true;
	});

	videoProducer.on('trackended', () =>
	{
		videoProducerTrackendedEventCalled = true;
	});

	audioConsumer.on('trackended', () =>
	{
		audiosConsumerTrackendedEventCalled = true;
	});

	videoConsumer.on('trackended', () =>
	{
		videoConsumerTrackendedEventCalled = true;
	});

	audioProducer.track.remoteStop();
	// Audio Producer was already closed.
	expect(audioProducerTrackendedEventCalled).toBe(false);

	videoProducer.track.remoteStop();
	expect(videoProducerTrackendedEventCalled).toBe(true);

	audioConsumer.track.remoteStop();
	// Audio Consumer was already closed.
	expect(audiosConsumerTrackendedEventCalled).toBe(false);

	videoConsumer.track.remoteStop();
	expect(videoConsumerTrackendedEventCalled).toBe(true);

	audioProducer.removeAllListeners();
	videoProducer.removeAllListeners();
	audioConsumer.removeAllListeners();
	videoConsumer.removeAllListeners();
}, 500);

test('transport.close() fires "transportclose" in live Producers/Consumers', () =>
{
	let audioProducerTransportcloseEventCalled = false;
	let videoProducerTransportcloseEventCalled = false;
	let audioConsumerTransportcloseEventCalled = false;
	let videoConsumerTransportcloseEventCalled = false;

	audioProducer.on('transportclose', () =>
	{
		audioProducerTransportcloseEventCalled = true;
	});

	videoProducer.on('transportclose', () =>
	{
		videoProducerTransportcloseEventCalled = true;
	});

	audioConsumer.on('transportclose', () =>
	{
		audioConsumerTransportcloseEventCalled = true;
	});

	videoConsumer.on('transportclose', () =>
	{
		videoConsumerTransportcloseEventCalled = true;
	});

	// Audio Producer was already closed.
	expect(audioProducer.closed).toBe(true);
	expect(videoProducer.closed).toBe(false);

	sendTransport.close();
	expect(sendTransport.closed).toBe(true);
	expect(videoProducer.closed).toBe(true);
	// Audio Producer was already closed.
	expect(audioProducerTransportcloseEventCalled).toBe(false);
	expect(videoProducerTransportcloseEventCalled).toBe(true);

	// Audio Consumer was already closed.
	expect(audioConsumer.closed).toBe(true);
	expect(videoConsumer.closed).toBe(false);

	recvTransport.close();
	expect(recvTransport.closed).toBe(true);
	expect(videoConsumer.closed).toBe(true);
	// Audio Consumer was already closed.
	expect(audioConsumerTransportcloseEventCalled).toBe(false);
	expect(videoConsumerTransportcloseEventCalled).toBe(true);

	audioProducer.removeAllListeners();
	videoProducer.removeAllListeners();
	audioConsumer.removeAllListeners();
	videoConsumer.removeAllListeners();
}, 500);

test('transport.produce() rejects with InvalidStateError if closed', async () =>
{
	const track = new FakeMediaStreamTrack({ kind: 'audio' });

	// Add noop listener to avoid the method fail.
	sendTransport.on('produce', () => {});

	await expect(sendTransport.produce({ track, stopTracks: false }))
		.rejects
		.toThrow(InvalidStateError);

	// The track must be 'live' due to stopTracks: false.
	expect(track.readyState).toBe('live');

	sendTransport.removeAllListeners('produce');
}, 500);

test('transport.consume() rejects with InvalidStateError if closed', async () =>
{
	await expect(recvTransport.consume({}))
		.rejects
		.toThrow(InvalidStateError);

	recvTransport.removeAllListeners();
}, 500);

test('transport.produceData() rejects with InvalidStateError if closed', async () =>
{
	// Add noop listener to avoid the method fail.
	sendTransport.on('producedata', () => {});

	await expect(sendTransport.produceData({}))
		.rejects
		.toThrow(InvalidStateError);

	sendTransport.removeAllListeners('producedata');
}, 500);

test('transport.consumeData() rejects with InvalidStateError if closed', async () =>
{
	await expect(recvTransport.consumeData({}))
		.rejects
		.toThrow(InvalidStateError);
}, 500);

test('transport.getStats() rejects with InvalidStateError if closed', async () =>
{
	await expect(sendTransport.getStats())
		.rejects
		.toThrow(InvalidStateError);
}, 500);

test('transport.restartIce() rejects with InvalidStateError if closed', async () =>
{
	await expect(sendTransport.restartIce({ ieParameters: {} }))
		.rejects
		.toThrow(InvalidStateError);
}, 500);

test('transport.updateIceServers() rejects with InvalidStateError if closed', async () =>
{
	await expect(sendTransport.updateIceServers({ iceServers: [] }))
		.rejects
		.toThrow(InvalidStateError);
}, 500);

test('connection state change does not fire "connectionstatechange" in closed Transport', () =>
{
	let connectionStateChangeEventNumTimesCalled = 0;

	// eslint-disable-next-line no-unused-vars
	sendTransport.on('connectionstatechange', (connectionState) =>
	{
		connectionStateChangeEventNumTimesCalled++;
	});

	sendTransport.handler.setConnectionState('disconnected');
	expect(connectionStateChangeEventNumTimesCalled).toBe(0);
	expect(sendTransport.connectionState).toBe('disconnected');

	sendTransport.removeAllListeners('connectionstatechange');
}, 500);

test('RemoteSdp properly handles multiple streams of the same type in planB', async () =>
{
	let sdp = undefined;
	let sdpObject = undefined;

	const remoteSdp = new RemoteSdp({ planB: true });

	await remoteSdp.receive(
		{
			mid                : 'video',
			kind               : 'video',
			offerRtpParameters : fakeParameters.generateConsumerRemoteParameters({ codecMimeType: 'video/VP8' }).rtpParameters,
			streamId           : 'streamId-1',
			trackId            : 'trackId-1'
		});

	sdp = remoteSdp.getSdp();
	sdpObject = sdpTransform.parse(sdp);

	expect(sdpObject.media.length).toBe(1);
	expect(sdpObject.media[0].payloads).toBe('101 102');
	expect(sdpObject.media[0].rtp.length).toBe(2);
	expect(sdpObject.media[0].rtp[0].payload).toBe(101);
	expect(sdpObject.media[0].rtp[0].codec).toBe('VP8');
	expect(sdpObject.media[0].rtp[1].payload).toBe(102);
	expect(sdpObject.media[0].rtp[1].codec).toBe('rtx');
	expect(sdpObject.media[0].ssrcs.length).toBe(4);

	await remoteSdp.receive(
		{
			mid                : 'video',
			kind               : 'video',
			offerRtpParameters : fakeParameters.generateConsumerRemoteParameters({ codecMimeType: 'video/H264' }).rtpParameters,
			streamId           : 'streamId-2',
			trackId            : 'trackId-2'
		});

	sdp = remoteSdp.getSdp();
	sdpObject = sdpTransform.parse(sdp);

	expect(sdpObject.media.length).toBe(1);
	expect(sdpObject.media[0].payloads).toBe('101 102 103 104');
	expect(sdpObject.media[0].rtp.length).toBe(4);
	expect(sdpObject.media[0].rtp[0].payload).toBe(101);
	expect(sdpObject.media[0].rtp[0].codec).toBe('VP8');
	expect(sdpObject.media[0].rtp[1].payload).toBe(102);
	expect(sdpObject.media[0].rtp[1].codec).toBe('rtx');
	expect(sdpObject.media[0].rtp[2].payload).toBe(103);
	expect(sdpObject.media[0].rtp[2].codec).toBe('H264');
	expect(sdpObject.media[0].rtp[3].payload).toBe(104);
	expect(sdpObject.media[0].rtp[3].codec).toBe('rtx');
	expect(sdpObject.media[0].ssrcs.length).toBe(8);

	await remoteSdp.planBStopReceiving(
		{
			mid                : 'video',
			offerRtpParameters : fakeParameters.generateConsumerRemoteParameters({ codecMimeType: 'video/H264' }).rtpParameters,
			streamId           : 'streamId-2',
			trackId            : 'trackId-2'
		});

	sdp = remoteSdp.getSdp();
	sdpObject = sdpTransform.parse(sdp);

	expect(sdpObject.media.length).toBe(1);
	expect(sdpObject.media[0].payloads).toBe('101 102 103 104');
	expect(sdpObject.media[0].rtp.length).toBe(4);
	expect(sdpObject.media[0].rtp[0].payload).toBe(101);
	expect(sdpObject.media[0].rtp[0].codec).toBe('VP8');
	expect(sdpObject.media[0].rtp[1].payload).toBe(102);
	expect(sdpObject.media[0].rtp[1].codec).toBe('rtx');
	expect(sdpObject.media[0].rtp[2].payload).toBe(103);
	expect(sdpObject.media[0].rtp[2].codec).toBe('H264');
	expect(sdpObject.media[0].rtp[3].payload).toBe(104);
	expect(sdpObject.media[0].rtp[3].codec).toBe('rtx');
	expect(sdpObject.media[0].ssrcs.length).toBe(4);
}, 500);

test('RemoteSdp does not duplicate codec descriptions', async () =>
{
	let sdp = undefined;
	let sdpObject = undefined;

	const remoteSdp = new RemoteSdp({ planB: true });

	await remoteSdp.receive(
		{
			mid                : 'video',
			kind               : 'video',
			offerRtpParameters : fakeParameters.generateConsumerRemoteParameters({ codecMimeType: 'video/VP8' }).rtpParameters,
			streamId           : 'streamId-1',
			trackId            : 'trackId-1'
		});

	sdp = remoteSdp.getSdp();
	sdpObject = sdpTransform.parse(sdp);

	expect(sdpObject.media.length).toBe(1);
	expect(sdpObject.media[0].payloads).toBe('101 102');
	expect(sdpObject.media[0].rtp.length).toBe(2);
	expect(sdpObject.media[0].rtp[0].payload).toBe(101);
	expect(sdpObject.media[0].rtp[0].codec).toBe('VP8');
	expect(sdpObject.media[0].rtp[1].payload).toBe(102);
	expect(sdpObject.media[0].rtp[1].codec).toBe('rtx');
	expect(sdpObject.media[0].ssrcs.length).toBe(4);

	await remoteSdp.receive(
		{
			mid                : 'video',
			kind               : 'video',
			offerRtpParameters : fakeParameters.generateConsumerRemoteParameters({ codecMimeType: 'video/VP8' }).rtpParameters,
			streamId           : 'streamId-1',
			trackId            : 'trackId-1'
		});

	sdp = remoteSdp.getSdp();
	sdpObject = sdpTransform.parse(sdp);

	expect(sdpObject.media.length).toBe(1);
	expect(sdpObject.media[0].payloads).toBe('101 102');
	expect(sdpObject.media[0].rtp.length).toBe(2);
	expect(sdpObject.media[0].rtp[0].payload).toBe(101);
	expect(sdpObject.media[0].rtp[0].codec).toBe('VP8');
	expect(sdpObject.media[0].rtp[1].payload).toBe(102);
	expect(sdpObject.media[0].rtp[1].codec).toBe('rtx');
	expect(sdpObject.media[0].ssrcs.length).toBe(8);
}, 500);

test('parseScalabilityMode() works', () =>
{
	expect(parseScalabilityMode('L1T3')).toEqual({ spatialLayers: 1, temporalLayers: 3 });
	expect(parseScalabilityMode('L3T2_KEY')).toEqual({ spatialLayers: 3, temporalLayers: 2 });
	expect(parseScalabilityMode('S2T3')).toEqual({ spatialLayers: 2, temporalLayers: 3 });
	expect(parseScalabilityMode('foo')).toEqual({ spatialLayers: 1, temporalLayers: 1 });
	expect(parseScalabilityMode(null)).toEqual({ spatialLayers: 1, temporalLayers: 1 });
	expect(parseScalabilityMode('S0T3')).toEqual({ spatialLayers: 1, temporalLayers: 1 });
	expect(parseScalabilityMode('S1T0')).toEqual({ spatialLayers: 1, temporalLayers: 1 });
	expect(parseScalabilityMode('L20T3')).toEqual({ spatialLayers: 20, temporalLayers: 3 });
	expect(parseScalabilityMode('S200T3')).toEqual({ spatialLayers: 1, temporalLayers: 1 });
}, 500);
