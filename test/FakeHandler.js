const { EventEmitter } = require('events');
const { FakeMediaStreamTrack } = require('fake-mediastreamtrack');
const utils = require('../lib/utils');
const ortc = require('../lib/ortc');
const fakeParameters = require('./fakeParameters');

class FakeHandler extends EventEmitter
{
	/**
	 * Creates a factory function.
	 */
	static createFactory()
	{
		return () => new FakeHandler();
	}

	constructor()
	{
		super();
	}

	get name()
	{
		return 'FakeHandler';
	}

	close()
	{
	}

	run(
		{
			direction, // eslint-disable-line no-unused-vars
			iceParameters, // eslint-disable-line no-unused-vars
			iceCandidates, // eslint-disable-line no-unused-vars
			dtlsParameters, // eslint-disable-line no-unused-vars
			sctpParameters, // eslint-disable-line no-unused-vars
			iceServers, // eslint-disable-line no-unused-vars
			iceTransportPolicy, // eslint-disable-line no-unused-vars
			proprietaryConstraints, // eslint-disable-line no-unused-vars
			extendedRtpCapabilities
		}
	)
	{
		// Generic sending RTP parameters for audio and video.
		// @type {Object}
		this._rtpParametersByKind =
		{
			audio : ortc.getSendingRtpParameters('audio', extendedRtpCapabilities),
			video : ortc.getSendingRtpParameters('video', extendedRtpCapabilities)
		};

		// Local RTCP CNAME.
		// @type {String}
		this._cname = `CNAME-${utils.generateRandomNumber()}`;

		// Got transport local and remote parameters.
		// @type {Boolean}
		this._transportReady = false;

		// Next localId.
		// @type {Number}
		this._nextLocalId = 1;

		// Sending and receiving tracks indexed by localId.
		// @type {Map<Number, FakeMediaStreamTrack>}
		this._tracks = new Map();

		// DataChannel id value counter. It must be incremented for each new DataChannel.
		// @type {Number}
		this._nextSctpStreamId = 0;
	}

	// NOTE: Custom method for simulation purposes.
	setConnectionState(connectionState)
	{
		this.emit('@connectionstatechange', connectionState);
	}

	async getNativeRtpCapabilities()
	{
		return fakeParameters.generateNativeRtpCapabilities();
	}

	async getNativeSctpCapabilities()
	{
		return fakeParameters.generateNativeSctpCapabilities();
	}

	async updateIceServers(iceServers) // eslint-disable-line no-unused-vars
	{
		return;
	}

	async restartIce(iceParameters) // eslint-disable-line no-unused-vars
	{
		return;
	}

	async getTransportStats()
	{
		return new Map(); // NOTE: Whatever.
	}

	async send({ track, encodings, codecOptions }) // eslint-disable-line no-unused-vars
	{
		if (!this._transportReady)
			await this._setupTransport({ localDtlsRole: 'server' });

		const rtpParameters =
			utils.clone(this._rtpParametersByKind[track.kind]);
		const useRtx = rtpParameters.codecs
			.some((codec) => /.+\/rtx$/i.test(codec.mimeType));

		rtpParameters.mid = `mid-${utils.generateRandomNumber()}`;

		if (!encodings)
			encodings = [ {} ];

		for (const encoding of encodings)
		{
			encoding.ssrc = utils.generateRandomNumber();

			if (useRtx)
				encoding.rtx = { ssrc: utils.generateRandomNumber() };
		}

		rtpParameters.encodings = encodings;

		// Fill RTCRtpParameters.rtcp.
		rtpParameters.rtcp =
		{
			cname       : this._cname,
			reducedSize : true,
			mux         : true
		};

		const localId = this._nextLocalId++;

		this._tracks.set(localId, track);

		return { localId, rtpParameters };
	}

	async stopSending(localId)
	{
		if (!this._tracks.has(localId))
			throw new Error('local track not found');

		this._tracks.delete(localId);
	}

	async replaceTrack(localId, track)
	{
		this._tracks.delete(localId);
		this._tracks.set(localId, track);
	}

	// eslint-disable-next-line no-unused-vars
	async setMaxSpatialLayer(localId, spatialLayer)
	{
	}

	// eslint-disable-next-line no-unused-vars
	async setRtpEncodingParameters(localId, params)
	{
	}

	async getSenderStats(localId) // eslint-disable-line no-unused-vars
	{
		return new Map(); // NOTE: Whatever.
	}

	async sendDataChannel(
		{
			ordered,
			maxPacketLifeTime,
			maxRetransmits,
			label,
			protocol,
			priority
		})
	{
		if (!this._transportReady)
			await this._setupTransport({ localDtlsRole: 'server' });

		const dataChannel =
		{
			id               : this._nextSctpStreamId++,
			ordered,
			maxPacketLifeTime,
			maxRetransmits,
			priority,
			label,
			protocol,
			addEventListener : () => {},
			close            : () => {}
		};

		const sctpStreamParameters =
		{
			streamId          : this._nextSctpStreamId,
			ordered           : ordered,
			maxPacketLifeTime : maxPacketLifeTime,
			maxRetransmits    : maxRetransmits
		};

		return { dataChannel, sctpStreamParameters };
	}

	async receive({ trackId, kind, rtpParameters }) // eslint-disable-line no-unused-vars
	{
		if (!this._transportReady)
			await this._setupTransport({ localDtlsRole: 'client' });

		const localId = this._nextLocalId++;
		const track = new FakeMediaStreamTrack({ kind });

		this._tracks.set(localId, track);

		return { localId, track };
	}

	async stopReceiving(localId)
	{
		this._tracks.delete(localId);
	}

	async getReceiverStats(localId) // eslint-disable-line no-unused-vars
	{
		return new Map(); //
	}

	async receiveDataChannel({ sctpStreamParameters, label, protocol })
	{
		if (!this._transportReady)
			await this._setupTransport({ localDtlsRole: 'client' });

		const dataChannel =
		{
			id                : sctpStreamParameters.id,
			ordered           : sctpStreamParameters.ordered,
			maxPacketLifeTime : sctpStreamParameters.maxPacketLifeTime,
			maxRetransmits    : sctpStreamParameters.maxRetransmits,
			label,
			protocol,
			addEventListener  : () => {},
			close             : () => {}
		};

		return { dataChannel };
	}

	async _setupTransport({ localDtlsRole } = {})
	{
		const dtlsParameters = utils.clone(fakeParameters.generateLocalDtlsParameters());

		// Set our DTLS role.
		if (localDtlsRole)
			dtlsParameters.role = localDtlsRole;

		// Assume we are connecting now.
		this.emit('@connectionstatechange', 'connecting');

		// Need to tell the remote transport about our parameters.
		await new Promise((resolve, reject) => (
			this.emit('@connect', { dtlsParameters }, resolve, reject)
		));

		this._transportReady = true;
	}
}

exports.FakeHandler = FakeHandler;
