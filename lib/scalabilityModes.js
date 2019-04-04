exports.parse = function(scalabilityMode)
{
	if (!scalabilityMode || typeof scalabilityMode !== 'string')
		return { spatialLayers: 1, temporalLayers: 1 };

	switch (scalabilityMode)
	{
		case 'L1T2':
			return { spatialLayers: 1, temporalLayers: 2 };
		case 'L1T3':
			return { spatialLayers: 1, temporalLayers: 3 };
		case 'L2T1':
			return { spatialLayers: 2, temporalLayers: 1 };
		case 'L2T2':
			return { spatialLayers: 2, temporalLayers: 2 };
		case 'L2T3':
			return { spatialLayers: 2, temporalLayers: 3 };
		case 'L3T1':
			return { spatialLayers: 3, temporalLayers: 1 };
		case 'L3T2':
			return { spatialLayers: 3, temporalLayers: 2 };
		case 'L3T3':
			return { spatialLayers: 3, temporalLayers: 3 };
		case 'L2T1h':
			return { spatialLayers: 2, temporalLayers: 1 };
		case 'L2T2h':
			return { spatialLayers: 2, temporalLayers: 2 };
		case 'L2T3h':
			return { spatialLayers: 2, temporalLayers: 3 };
		case 'L3T2_KEY':
			return { spatialLayers: 3, temporalLayers: 2 };
		case 'L3T3_KEY':
			return { spatialLayers: 3, temporalLayers: 3 };
		case 'L4T5_KEY':
			return { spatialLayers: 4, temporalLayers: 5 };
		case 'L4T7_KEY':
			return { spatialLayers: 4, temporalLayers: 7 };
		case 'L3T2_KEY_SHIFT':
			return { spatialLayers: 3, temporalLayers: 2 };
		case 'L3T3_KEY_SHIFT':
			return { spatialLayers: 3, temporalLayers: 3 };
		case 'L4T5_KEY_SHIFT':
			return { spatialLayers: 4, temporalLayers: 5 };
		case 'L4T7_KEY_SHIFT':
			return { spatialLayers: 4, temporalLayers: 7 };
		default:
			return { spatialLayers: 1, temporalLayers: 1 };
	}
};
