import { Chrome111 } from './handlers/Chrome111';
import { Chrome74 } from './handlers/Chrome74';
import { Chrome70 } from './handlers/Chrome70';
import { Chrome67 } from './handlers/Chrome67';
import { Chrome55 } from './handlers/Chrome55';
import { Firefox60 } from './handlers/Firefox60';
import { Safari12 } from './handlers/Safari12';
import { Safari11 } from './handlers/Safari11';
import { Edge11 } from './handlers/Edge11';
import { ReactNativeUnifiedPlan } from './handlers/ReactNativeUnifiedPlan';
import { ReactNative } from './handlers/ReactNative';

export type BuiltinHandlerName =
	| 'Chrome111'
	| 'Chrome74'
	| 'Chrome70'
	| 'Chrome67'
	| 'Chrome55'
	| 'Firefox60'
	| 'Safari12'
	| 'Safari11'
	| 'Edge11'
	| 'ReactNativeUnifiedPlan'
	| 'ReactNative';

export const builtinHandlerFactory = (handlerName: BuiltinHandlerName) => 
{
	switch (handlerName)
	{
		case 'Chrome111':
			return Chrome111.createFactory();
		case 'Chrome74':
			return Chrome74.createFactory();
		case 'Chrome70':
			return Chrome70.createFactory();
		case 'Chrome67':
			return Chrome67.createFactory();
		case 'Chrome55':
			return Chrome55.createFactory();
		case 'Firefox60':
			return Firefox60.createFactory();
		case 'Safari12':
			return Safari12.createFactory();
		case 'Safari11':
			return Safari11.createFactory();
		case 'Edge11':
			return Edge11.createFactory();
		case 'ReactNativeUnifiedPlan':
			return ReactNativeUnifiedPlan.createFactory();
		case 'ReactNative':
			return ReactNative.createFactory();
		default:
			throw new TypeError(`unknown handlerName "${handlerName}"`);
	}
};
export const browserHandlerFactory = (handlerName: Exclude<BuiltinHandlerName, 'ReactNative' | 'ReactNativeUnifiedPlan'>) => 
{
	switch (handlerName)
	{
		case 'Chrome111':
			return Chrome111.createFactory();
		case 'Chrome74':
			return Chrome74.createFactory();
		case 'Chrome70':
			return Chrome70.createFactory();
		case 'Chrome67':
			return Chrome67.createFactory();
		case 'Chrome55':
			return Chrome55.createFactory();
		case 'Firefox60':
			return Firefox60.createFactory();
		case 'Safari12':
			return Safari12.createFactory();
		case 'Safari11':
			return Safari11.createFactory();
		case 'Edge11':
			return Edge11.createFactory();
		default:
			throw new TypeError(`unknown handlerName "${handlerName}"`);
	}
};

export const reactNativeHandlerFactory = (handlerName: 'ReactNative' | 'ReactNativeUnifiedPlan') => 
{
	switch (handlerName)
	{
		case 'ReactNativeUnifiedPlan':
			return ReactNativeUnifiedPlan.createFactory();
		case 'ReactNative':
			return ReactNative.createFactory();
		default:
			throw new TypeError(`unknown handlerName "${handlerName}"`);
	}
};