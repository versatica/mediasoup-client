declare module 'sdp-transform' {
	/**
	 * Descriptor fields that exist only at the session level (before an m=
	 * block).
	 *
	 * @see https://tools.ietf.org/html/rfc4566#section-9
	 */
	export interface SessionDescription
		extends SharedDescriptionFields,
			SessionAttributes {
		// v=
		version: number;
		// o=
		origin: {
			username: string;
			sessionId: string | number;
			sessionVersion: number;
			netType: string;
			ipVer: number;
			address: string;
		};
		// s=
		name: string;
		// t=0 0
		timing: {
			start: number;
			stop: number;
		};
		// u=
		uri?: string;
		// e=
		email?: string;
		// p=
		phone?: string;
		// z=
		timezones?: string;
		// r=
		repeats?: string;
		// m=
		media: MediaDescription[];
	}

	/**
	 * Attributes that only exist at the session level (before an m= block).
	 *
	 * https://www.iana.org/assignments/sdp-parameters/sdp-parameters.xhtml#sdp-parameters-7
	 */
	export interface SessionAttributes extends SharedAttributes {
		// a=ice-lite
		icelite?: 'ice-lite';
		// a=msid-semantic: WMS Jvlam5X3SX1OP6pn20zWogvaKJz5Hjf9OnlV
		msidSemantic?: {
			semantic: string;
			token: string;
		};
		// a=group:BUNDLE audio video
		groups?: {
			type: string;
			mids: string;
		}[];
	}

	/**
	 * Descriptor fields that exist only at the media level (in each m= block).
	 */
	export interface MediaDescription
		extends SharedDescriptionFields,
			MediaAttributes {
		type: string;
		port: number;
		protocol: string;
		payloads?: string;
	}

	/**
	 * Attributes that only exist at the media level (within an m= block).
	 *
	 * https://www.iana.org/assignments/sdp-parameters/sdp-parameters.xhtml#sdp-parameters-9
	 */
	export interface MediaAttributes extends SharedAttributes {
		rtp: {
			payload: number;
			codec: string;
			rate?: number;
			encoding?: number;
		}[];
		rtcp?: {
			port: number;
			netType?: string;
			ipVer?: number;
			address?: string;
		};
		// a=rtcp-fb:98 nack rpsi
		rtcpFb?: {
			payload: number | string;
			type: string;
			subtype?: string;
		}[];
		// a=rtcp-fb:98 trr-int 100
		rtcpFbTrrInt?: {
			payload: number;
			value: number;
		}[];
		// a=fmtp
		fmtp: {
			payload: number;
			config: string;
		}[];
		// a=mid
		mid?: string;
		// a=msid
		msid?: string;
		ptime?: number;
		// a=maxptime
		maxptime?: number;
		// a=crypto
		crypto?: {
			id: number;
			suite: string;
			config: string;
			sessionConfig?: string;
		}[];
		// a=candidate
		candidates?: {
			foundation: string;
			component: number;
			transport: string;
			priority: number | string;
			ip: string;
			port: number;
			type: string;
			raddr?: string;
			rport?: number;
			tcptype?: string;
			generation?: number;
			'network-id'?: number;
			'network-cost'?: number;
		}[];
		// a=end-of-candidates
		endOfCandidates?: string;
		// a=remote-candidates
		remoteCandidates?: string;
		// a=ssrc:
		ssrcs?: {
			id: number | string;
			attribute: string;
			value?: string;
		}[];
		// a=ssrc-group:
		ssrcGroups?: {
			semantics: string;
			ssrcs: string;
		}[];
		// a=rtcp-mux
		rtcpMux?: string;
		// a=rtcp-rsize
		rtcpRsize?: string;
		// a=sctpmap
		sctpmap?: {
			sctpmapNumber: number | string;
			app: string;
			maxMessageSize: number;
		};
		// a=x-google-flag
		xGoogleFlag?: string;
		// a=rid
		rids?: {
			id: number | string;
			direction: string;
			params?: string;
		}[];
		// a=imageattr
		imageattrs?: {
			pt: number | string;
			dir1: string;
			attrs1: string;
			dir2?: string;
			attrs2?: string;
		}[];
		simulcast?: {
			dir1: string;
			list1: string;
			dir2?: string;
			list2?: string;
		};
		simulcast_03?: { value: string };
		// a=framerate
		framerate?: number | string;
	}

	/**
	 * Descriptor fields that exist at both the session level and media level.
	 *
	 * @see https://tools.ietf.org/html/rfc4566#section-9
	 */
	export interface SharedDescriptionFields {
		// i=
		description?: string;
		// c=IN IP4 10.47.197.26
		connection?: {
			version: number;
			ip: string;
		};
		// b=AS:4000
		bandwidth?: {
			type: 'TIAS' | 'AS' | 'CT' | 'RR' | 'RS';
			limit: number | string;
		}[];
	}

	/**
	 * These attributes can exist on both the session level and the media level.
	 *
	 * https://www.iana.org/assignments/sdp-parameters/sdp-parameters.xhtml#sdp-parameters-8
	 */
	export interface SharedAttributes {
		// a=sendrecv
		// a=recvonly
		// a=sendonly
		// a=inactive
		direction?: 'sendrecv' | 'recvonly' | 'sendonly' | 'inactive';
		// a=control
		control?: string;
		// a=extmap
		ext?: {
			value: number;
			direction?: string;
			'encrypt-uri'?: string;
			uri: string;
			config?: string;
		}[];
		// a=setup
		setup?: string;

		iceUfrag?: string;
		icePwd?: string;
		fingerprint?: {
			type: string;
			hash: string;
		};
		// a=source-filter: incl IN IP4 239.5.2.31 10.1.15.5
		sourceFilter?: {
			filterMode: 'excl' | 'incl';
			netType: string;
			addressTypes: string;
			destAddress: string;
			srcList: string;
		};
		// a=bundle-only
		bundleOnly?: 'bundle-only';
		// a=label:1
		label?: string;
		// a=sctp-port
		// @see https://tools.ietf.org/html/draft-ietf-mmusic-sctp-sdp-26#section-5
		sctpPort?: number;
		// a=max-message-size
		// https://tools.ietf.org/html/draft-ietf-mmusic-sctp-sdp-26#section-6
		maxMessageSize?: number;
		// a=extmap-allow-mixed
		extmapAllowMixed?: 'extmap-allow-mixed';
		// a=ice-options:renomination
		iceOptions?: string;
		// Inalid or unsupported attributes.
		invalid?: { value: string }[];
	}

	export interface ParamMap {
		[paramName: string]: number | string;
	}

	export function write(description: SessionDescription): string;

	export function parse(description: string): SessionDescription;

	export function parsePayloads(payloads: string): number[];

	export function parseParams(params: string): ParamMap;

	export function parseImageAttributes(params: string): ParamMap[];

	export function parseRemoteCandidates(candidates: string): {
		component: number;
		ip: string;
		port: number;
	}[];

	export function parseSimulcastStreamList(
		streams: string
	): { scid: number | string; paused: boolean }[][];
}
