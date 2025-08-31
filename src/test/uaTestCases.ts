import type { BuiltinHandlerName } from '../Device';

type UATestCase = {
	desc: string;
	ua: string;
	expect?: BuiltinHandlerName;
};

export const uaTestCases: UATestCase[] = [
	{
		desc: 'Microsoft Edge 100',
		ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.1108.55 Safari/537.36 Edg/100.0.1108.55',
		expect: 'Chrome74',
	},
	{
		desc: 'Mac (Intel) Chrome 112',
		ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 12_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36',
		expect: 'Chrome111',
	},
	{
		desc: 'iPhone iOS 16',
		ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1',
		expect: 'Safari12',
	},
	{
		desc: 'Generic Android Chrome 112',
		ua: 'Mozilla/5.0 (Linux; Android 13; M2012K11AG) AppleWebKit/537.36 (KHTML, like Gecko) Soul/4.0 Chrome/112.0.5615.135 Mobile Safari/537.36',
		expect: 'Chrome111',
	},
	{
		desc: 'Motorola Edge Chrome 104',
		ua: 'Mozilla/5.0 (Linux; Android 10; motorola edge) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/104.0.0.0 Mobile Safari/537.36',
		expect: 'Chrome74',
	},
	{
		desc: 'In-app WebView (Android)',
		ua: 'Mozilla/5.0 (Linux; Android 11; G91 Pro Build/RP1A.200720.011; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/114.0.5735.130 Mobile Safari/537.36',
		expect: 'Chrome111',
	},
	{
		desc: 'Brave',
		ua: 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.4044.113 Safari/5370.36 Brave/9085',
		expect: 'Chrome111',
	},
	{
		desc: 'In-app WebView (Android) (Facebook)',
		ua: 'Mozilla/5.0 (Linux; Android 12; SM-S908U1 Build/SP1A.210812.016; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/100.0.4896.88 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/377.0.0.22.107;]',
		expect: 'Chrome74',
	},
	{
		desc: 'Firefox (iOS)',
		ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/142.0.1 Mobile/15E148 Safari/605.1.15',
		expect: 'Safari12',
	},
	{
		desc: 'In-app WKWebView (iOS) (TikTok)',
		ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 musical_ly_21.1.0 JsSdk/2.0 NetType/4G Channel/App Store ByteLocale/ru Region/RU ByteFullLocale/ru-RU isDarkMode/1 WKWebView/1 BytedanceWebview/d8a21c6',
		expect: 'Safari12',
	},
	{
		desc: 'In-app WkWebView (iOS) (WeChat)',
		ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.37(0x1800252f) NetType/WIFI Language/zh_CN',
		expect: 'Safari12',
	},
	{
		desc: 'Custom Webview in iPad',
		ua: 'Mozilla/5.0 (iPad; CPU iPadOS 16_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.4 Mobile/15E148 Safari/604.1 MyApp/1.0',
		expect: 'Safari12',
	},
	{
		desc: 'Chrome Mobile (iOS)',
		ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/114.0.5735.124 Mobile/15E148 Safari/604.1',
		expect: 'Safari12',
	},
	{
		desc: 'Fake Foo Invalid Browser - Unsupported',
		ua: 'Fake/5.0 (Foo; Bar Lalala OS_19.5) Foo/22.2',
		expect: undefined,
	},
	{
		// Zoom App Marketplace browser.
		desc: 'Zoom App Marketplace browser - Unsupported',
		ua: 'Mozilla/5.0 ZoomWebKit/537.36 (KHTML, like Gecko) ZoomApps/1.0',
		expect: undefined,
	},
	{
		desc: 'Electron in Windows',
		ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Electron/37.4.0 Chrome/138.0.7204.243 Safari/537.36',
		expect: 'Chrome111',
	},
];
