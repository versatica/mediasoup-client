/* global RTCIceGatherer, RTCIceTransport, RTCDtlsTransport */

'use strict';

import Logger from '../Logger';
import EnhancedEventEmitter from '../EnhancedEventEmitter';
// import * as utils from '../utils';

const logger = new Logger('Edge11');

// const CNAME = `cname-${utils.randomNumber()}`;

export default class Edge11 extends EnhancedEventEmitter
{
	static get name()
	{
		return 'Edge11';
	}

	static getLocalRtpCapabilities()
	{
		logger.debug('getLocalRtpCapabilities()');

		// TODO
	}

	constructor(direction, extendedRtpCapabilities, settings)
	{
		logger.debug(
			'constructor() [direction:%s, extendedRtpCapabilities:%o]',
			direction, extendedRtpCapabilities);

		super();

		// Got transport local and remote parameters.
		// @type {Boolean}
		this._transportReady = false;

		// ICE gatherer.
		this._iceGatherer = null;

		// ICE transport.
		this._iceTransport = null;

		// DTLS transport.
		// @type {RTCDtlsTransport}
		this._dtlsTransport = null;

		// Set the ICE gatherer.
		this._setIceGatherer(settings);

		// Set the ICE transport.
		this._setIceTransport();

		// Set the DTLS transport.
		this._setDtlsTransport();

		// TODO
	}

	close()
	{
		logger.debug('close()');

		// Close the ICE gatherer.
		// NOTE: Not yet implemented by Edge.
		try
		{
			this._iceGatherer.close();
		}
		catch (error)
		{
			logger.debug(`iceGatherer.close() failed:${error}`);
		}

		// Close the ICE transport.
		try
		{
			this._iceTransport.stop();
		}
		catch (error)
		{
			logger.debug(`iceTransport.stop() failed:${error}`);
		}

		// Close the DTLS transport.
		try
		{
			this._dtlsTransport.stop();
		}
		catch (error)
		{
			logger.debug(`dtlsTransport.stop() failed:${error}`);
		}

		// TODO
	}

	addSender(sender)
	{
		const { track } = sender;

		logger.debug(
			'addSender() [id:%s, kind:%s, trackId:%s]',
			sender.id, sender.kind, track.id);

		// TODO
	}

	removeSender(sender)
	{
		const { track } = sender;

		logger.debug(
			'removeSender() [id:%s, kind:%s, trackId:%s]',
			sender.id, sender.kind, track.id);

		// TODO
	}

	addReceiver(receiver)
	{
		logger.debug(
			'addReceiver() [id:%s, kind:%s]', receiver.id, receiver.kind);

		// TODO
	}

	removeReceiver(receiver)
	{
		logger.debug(
			'removeReceiver() [id:%s, kind:%s]', receiver.id, receiver.kind);

		// TODO
	}

	_setIceGatherer(settings)
	{
		const iceGatherer = new RTCIceGatherer(
			{
				iceServers   : settings.turnServers || [],
				gatherPolicy : 'relay'
			});

		iceGatherer.addEventListener('error', (event) =>
		{
			const { errorCode, errorText } = event;

			logger.error(
				`iceGatherer "error" event [errorCode:${errorCode}, errorText:${errorText}]`);
		});

		// NOTE: Not yet implemented by Edge, which starts gathering automatically.
		try
		{
			iceGatherer.gather();
		}
		catch (error)
		{
			logger.debug(`iceGatherer.gather() failed:${error}`);
		}

		this._iceGatherer = iceGatherer;
	}

	_setIceTransport()
	{
		const iceTransport = new RTCIceTransport(this._iceGatherer);

		// NOTE: Not yet implemented by Edge.
		iceTransport.addEventListener('statechange', () =>
		{
			switch (iceTransport.state)
			{
				case 'checking':
					this.emit('connectionstatechange', 'connecting');
					break;
				case 'connected':
				case 'completed':
					this.emit('connectionstatechange', 'connected');
					break;
				case 'failed':
					this.emit('connectionstatechange', 'failed');
					break;
				case 'disconnected':
					this.emit('connectionstatechange', 'disconnected');
					break;
				case 'closed':
					this.emit('connectionstatechange', 'closed');
					break;
			}
		});

		// NOTE: Not standard, but implemented by Edge.
		iceTransport.addEventListener('icestatechange', () =>
		{
			switch (iceTransport.state)
			{
				case 'checking':
					this.emit('connectionstatechange', 'connecting');
					break;
				case 'connected':
				case 'completed':
					this.emit('connectionstatechange', 'connected');
					break;
				case 'failed':
					this.emit('connectionstatechange', 'failed');
					break;
				case 'disconnected':
					this.emit('connectionstatechange', 'disconnected');
					break;
				case 'closed':
					this.emit('connectionstatechange', 'closed');
					break;
			}
		});

		iceTransport.addEventListener('candidatepairchange', (event) =>
		{
			logger.debug(
				`iceTransport "candidatepairchange" event [pair:${event.pair}]`);
		});

		this._iceTransport = iceTransport;
	}

	_setDtlsTransport()
	{
		const dtlsTransport = new RTCDtlsTransport(this._iceTransport);

		// NOTE: Not yet implemented by Edge.
		dtlsTransport.addEventListener('statechange', () =>
		{
			logger.debug(
				`dtlsTransport "statechange" event [state:${dtlsTransport.state}]`);
		});

		// NOTE: Not standard, but implemented by Edge.
		dtlsTransport.addEventListener('dtlsstatechange', () =>
		{
			logger.debug(
				`dtlsTransport "dtlsstatechange" event [state:${dtlsTransport.state}]`);
		});

		dtlsTransport.addEventListener('error', (event) =>
		{
			let error;

			if (event.message)
				error = event.message;
			else if (event.error)
				error = event.error.message;

			logger.error(`dtlsTransport "error" event:${error}`);
		});

		this._dtlsTransport = dtlsTransport;
	}

	_setupTransport()
	{
		logger.debug('_setupTransport()');

		// TODO

		this._transportReady = true;
	}
}
