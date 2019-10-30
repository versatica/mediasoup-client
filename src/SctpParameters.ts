/**
 * SCTP stream parameters describe the reliability of a certain SCTP stream.
 * If ordered is true then maxPacketLifeTime and maxRetransmits must be
 * false.
 * If ordered if false, only one of maxPacketLifeTime or maxRetransmits
 * can be true.
 */
export interface SctpStreamParameters
{
	/**
	 * SCTP stream id.
	 */
	streamId: number;
	/**
	 * Whether data messages must be received in order. if true the messages will
	 * be sent reliably. Default true.
	 */
	ordered?: boolean;

	/**
	 * When ordered is false indicates the time (in milliseconds) after which a
	 * SCTP packet will stop being retransmitted.
	 */
	maxPacketLifeTime?: number;

	/**
	 * When ordered is false indicates the maximum number of times a packet will
	 * be retransmitted.
	 */
	maxRetransmits?: number;
}
