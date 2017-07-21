module.exports =
{
	env :
	{
		'browser'  : true,
		'es6'      : true,
		'commonjs' : true
	},
	plugins :
	[
		'import'
	],
	extends :
	[
		'eslint:recommended'
	],
	settings : {},
	parserOptions :
	{
		ecmaVersion  : 6,
		sourceType   : 'module',
		ecmaFeatures :
		{
			impliedStrict : true
		}
	},
	rules :
	{
		'no-console'                         : 0,
		'no-undef'                           : 2,
		'no-unused-vars'                     : [ 1, { vars: 'all', args: 'after-used' }],
		'no-empty'                           : 0,
		'quotes'                             : [ 2, 'single', { avoidEscape: true } ],
		'semi'                               : [ 2, 'always' ],
		'no-multi-spaces'                    : 0,
		'no-whitespace-before-property'      : 2,
		'space-before-blocks'                : 2,
		'space-before-function-paren'        : [ 2, 'never' ],
		'space-in-parens'                    : [ 2, 'never' ],
		'spaced-comment'                     : [ 2, 'always' ],
		'comma-spacing'                      : [ 2, { before: false, after: true } ],
		'import/extensions'                  : 2
	}
};
