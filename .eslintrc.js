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
		'camelcase'                     : 2,
		'comma-dangle'                  : 2,
		'comma-spacing'                 : 2,
		'comma-style'                   : 2,
		'computed-property-spacing'     : 2,
		'indent'                        : [ 2, 'tab', { 'SwitchCase': 1 } ],
		'max-len'                       : [ 2, 94, { 'tabWidth': 2 } ],
		'no-console'                    : 0,
		'no-duplicate-case'             : 2,
		'no-empty'                      : 0,
		'no-extra-semi'                 : 2,
		'no-irregular-whitespace'       : 2,
		'no-multi-spaces'               : 2,
		'no-undef'                      : 2,
		'no-unexpected-multiline'       : 2,
		'no-unreachable'                : 2,
		'no-unused-vars'                : [ 1, { vars: 'all', args: 'after-used' }],
		'no-use-before-define'          : [ 2, { functions: false } ],
		'no-whitespace-before-property' : 2,
		'quotes'                        : [ 2, 'single', { avoidEscape: true } ],
		'semi'                          : [ 2, 'always' ],
		'space-before-blocks'           : 2,
		'space-before-function-paren'   : [ 2, 'never' ],
		'space-in-parens'               : [ 2, 'never' ],
		'spaced-comment'                : [ 2, 'always' ],
		'comma-spacing'                 : [ 2, { before: false, after: true } ],
		'import/extensions'             : 2
	}
};
