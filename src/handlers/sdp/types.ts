// NOTE: This is needed until @types/sdp-transform is fixed.
// PR: https://github.com/DefinitelyTyped/DefinitelyTyped/pull/64119
export type SimulcastStream = SimulcastFormat[];

// NOTE: Same as above.
export type SimulcastFormat =
{
	scid: number | string;
	paused: boolean;
};
