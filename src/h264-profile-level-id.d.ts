declare module 'h264-profile-level-id'
{
	export const ProfileConstrainedBaseline: number;
	export const ProfileBaseline: number;
	export const ProfileMain: number;
	export const ProfileConstrainedHigh: number;
	export const ProfileHigh: number;

	// All values are equal to ten times the level number, except level 1b which is
	// special.

	/* eslint-disable camelcase, @typescript-eslint/camelcase */
	export const Level1_b: number;
	export const Level1: number;
	export const Level1_1: number;
	export const Level1_2: number;
	export const Level1_3: number;
	export const Level2: number;
	export const Level2_1: number;
	export const Level2_2: number;
	export const Level3: number;
	export const Level3_1: number;
	export const Level3_2: number;
	export const Level4: number;
	export const Level4_1: number;
	export const Level4_2: number;
	export const Level5: number;
	export const Level5_1: number;
	export const Level5_2: number;
	/* eslint-enable camelcase, @typescript-eslint/camelcase */

	// eslint-disable-next-line @typescript-eslint/no-empty-interface
	export interface ProfileLevelId {}

	/**
	 * Parse profile level id that is represented as a string of 3 hex bytes.
	 * Nothing will be returned if the string is not a recognized H264 profile
	 * level id.
	 */
	export function parseProfileLevelId(str: string): ProfileLevelId

	/**
	 * Returns canonical string representation as three hex bytes of the profile
	 * level id, or returns nothing for invalid profile level ids.
	 */
	// eslint-disable-next-line camelcase, @typescript-eslint/camelcase
	export function profileLevelIdToString(profile_level_id: ProfileLevelId): string

	/**
	 * Parse profile level id that is represented as a string of 3 hex bytes
	 * contained in an SDP key-value map. A default profile level id will be
	 * returned if the profile-level-id key is missing. Nothing will be returned if
	 * the key is present but the string is invalid.
	 */
	export function parseSdpProfileLevelId(params: object): ProfileLevelId

	/**
	 * Returns true if the parameters have the same H264 profile, i.e. the same
	 * H264 profile (Baseline, High, etc).
	 *
	 */
	export function isSameProfile(params1: object, params2: object): boolean

	/**
	 * Generate codec parameters that will be used as answer in an SDP negotiation
	 * based on local supported parameters and remote offered parameters. Both
	 * local_supported_params and remote_offered_params represent sendrecv media
	 * descriptions, i.e they are a mix of both encode and decode capabilities. In
	 * theory, when the profile in local_supported_params represent a strict superset
	 * of the profile in remote_offered_params, we could limit the profile in the
	 * answer to the profile in remote_offered_params.
	 *
	 * However, to simplify the code, each supported H264 profile should be listed
	 * explicitly in the list of local supported codecs, even if they are redundant.
	 * Then each local codec in the list should be tested one at a time against the
	 * remote codec, and only when the profiles are equal should this function be
	 * called. Therefore, this function does not need to handle profile intersection,
	 * and the profile of local_supported_params and remote_offered_params must be
	 * equal before calling this function. The parameters that are used when
	 * negotiating are the level part of profile-level-id and level-asymmetry-allowed.
	 *
	 */
	export function generateProfileLevelIdForAnswer(
		// eslint-disable-next-line camelcase, @typescript-eslint/camelcase
		local_supported_params: object,
		// eslint-disable-next-line camelcase, @typescript-eslint/camelcase
		remote_offered_params: object
	): string
}
