export interface SimulcastStream {
    scid: string;
    paused: boolean;
}

/**
 * Helper function to convert a simulcast stream list back to `list1` or
 * `list2` format
 * @param streams Array output from sdpTransform.parseSimulcastStreamList
 */
export function writeSimulcastStreamList(streams: SimulcastStream[][]) 
{
	return streams.map((formats) =>
		formats.map(
			(f) => `${f.paused ? '~' : ''}${f.scid}`
		).join(',')
	).join(';');
}
