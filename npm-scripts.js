/* eslint-disable no-console */

const process = require('process');
const os = require('os');
const fs = require('fs');
const { execSync } = require('child_process');
const { version } = require('./package.json');

const isWindows = os.platform() === 'win32';
const task = process.argv.slice(2).join(' ');

// mediasoup mayor version.
const MAYOR_VERSION = version.split('.')[0];

console.log(`npm-scripts.js [INFO] running task "${task}"`);

switch (task)
{
	// As per NPM documentation (https://docs.npmjs.com/cli/v9/using-npm/scripts)
	// `prepare` script:
	//
	// - Runs BEFORE the package is packed, i.e. during `npm publish` and `npm pack`.
	// - Runs on local `npm install` without any arguments.
	// - NOTE: If a package being installed through git contains a `prepare` script,
	//   its dependencies and devDependencies will be installed, and the `prepare`
	//   script will be run, before the package is packaged and installed.
	//
	// So here we compile TypeScript to JavaScript.
	case 'prepare':
	{
		buildTypescript(/* force */ false);

		break;
	}

	case 'typescript:build':
	{
		installDeps();
		buildTypescript(/* force */ true);
		replaceVersion();

		break;
	}

	case 'typescript:watch':
	{
		deleteLib();

		const { TscWatchClient } = require('tsc-watch/client');
		const watch = new TscWatchClient();

		watch.on('success', replaceVersion);
		watch.start('--pretty');

		break;
	}

	case 'lint':
	{
		lint();

		break;
	}

	case 'test':
	{
		buildTypescript(/* force */ false);
		replaceVersion();
		test();

		break;
	}

	case 'coverage':
	{
		buildTypescript(/* force */ false);
		replaceVersion();
		executeCmd('jest --coverage');
		executeCmd('open-cli coverage/lcov-report/index.html');

		break;
	}

	case 'install-deps':
	{
		installDeps();

		break;
	}

	case 'release:check':
	{
		checkRelease();

		break;
	}

	case 'release':
	{
		checkRelease();
		executeCmd(`git commit -am '${version}'`);
		executeCmd(`git tag -a ${version} -m '${version}'`);
		executeCmd(`git push origin v${MAYOR_VERSION}`);
		executeCmd(`git push origin '${version}'`);
		executeCmd('npm publish');

		break;
	}

	default:
	{
		throw new TypeError(`unknown task "${task}"`);
	}
}

function replaceVersion()
{
	console.log('npm-scripts.js [INFO] replaceVersion()');

	const files = [ 'lib/index.js', 'lib/index.d.ts' ];

	for (const file of files)
	{
		const text = fs.readFileSync(file, { encoding: 'utf8' });
		const result = text.replace(/__MEDIASOUP_CLIENT_VERSION__/g, version);

		fs.writeFileSync(file, result, { encoding: 'utf8' });
	}
}

function deleteLib()
{
	if (!fs.existsSync('lib'))
	{
		return;
	}

	console.log('npm-scripts.js [INFO] deleteLib()');

	if (!isWindows)
	{
		executeCmd('rm -rf lib');
	}
	else
	{
		// NOTE: This command fails in Windows if the dir doesn't exist.
		executeCmd('rmdir /s /q "lib"', /* exitOnError */ false);
	}
}

function buildTypescript(force = false)
{
	if (!force && fs.existsSync('lib'))
	{
		return;
	}

	console.log('npm-scripts.js [INFO] buildTypescript()');

	deleteLib();

	executeCmd('tsc');
}

function lint()
{
	console.log('npm-scripts.js [INFO] lint()');

	executeCmd('eslint -c .eslintrc.js --max-warnings 0 src .eslintrc.js npm-scripts.js');
}

function test()
{
	console.log('npm-scripts.js [INFO] test()');

	executeCmd('jest');
}

function installDeps()
{
	console.log('npm-scripts.js [INFO] installDeps()');

	// Install/update deps.
	executeCmd('npm ci --ignore-scripts');
	// Update package-lock.json.
	executeCmd('npm install --package-lock-only --ignore-scripts');
}

function checkRelease()
{
	console.log('npm-scripts.js [INFO] checkRelease()');

	installDeps();
	buildTypescript(/* force */ true);
	replaceVersion();
	lint();
	test();
}

function executeCmd(command, exitOnError = true)
{
	console.log(`npm-scripts.js [INFO] executeCmd(): ${command}`);

	try
	{
		execSync(command, { stdio: [ 'ignore', process.stdout, process.stderr ] });
	}
	catch (error)
	{
		if (exitOnError)
		{
			console.error(`npm-scripts.js [ERROR] executeCmd() failed, exiting: ${error}`);

			process.exit(1);
		}
		else
		{
			console.log(`npm-scripts.js [INFO] executeCmd() failed, ignoring: ${error}`);
		}
	}
}
