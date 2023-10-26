import process from 'process';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { execSync } from 'child_process';

const PKG = JSON.parse(fs.readFileSync('./package.json').toString());
const IS_WINDOWS = os.platform() === 'win32';
const MAYOR_VERSION = PKG.version.split('.')[0];

const task = process.argv.slice(2).join(' ');

run();

async function run()
{
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
			executeCmd('tsc --watch');

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
			executeCmd(`git commit -am '${PKG.version}'`);
			executeCmd(`git tag -a ${PKG.version} -m '${PKG.version}'`);
			executeCmd(`git push origin v${MAYOR_VERSION}`);
			executeCmd(`git push origin '${PKG.version}'`);
			executeCmd('npm publish');

			break;
		}

		default:
		{
			logError('unknown task');

			exitWithError();
		}
	}
}

function replaceVersion()
{
	logInfo('replaceVersion()');

	const files = fs.readdirSync('lib',
		{
			withFileTypes : true,
			recursive     : true
		});

	for (const file of files)
	{
		if (!file.isFile())
		{
			continue;
		}

		// NOTE: dirent.path is only available in Node >= 20.
		const filePath = path.join(file.path ?? 'lib', file.name);
		const text = fs.readFileSync(filePath, { encoding: 'utf8' });
		const result = text.replace(/__MEDIASOUP_CLIENT_VERSION__/g, PKG.version);

		fs.writeFileSync(filePath, result, { encoding: 'utf8' });
	}
}

function deleteLib()
{
	if (!fs.existsSync('lib'))
	{
		return;
	}

	logInfo('deleteLib()');

	if (!IS_WINDOWS)
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

	logInfo('buildTypescript()');

	deleteLib();
	executeCmd('tsc');
}

function lint()
{
	logInfo('lint()');

	executeCmd('eslint -c .eslintrc.js --max-warnings 0 src .eslintrc.js npm-scripts.mjs');
}

function test()
{
	logInfo('test()');

	executeCmd('jest');
}

function installDeps()
{
	logInfo('installDeps()');

	// Install/update deps.
	executeCmd('npm ci --ignore-scripts');
	// Update package-lock.json.
	executeCmd('npm install --package-lock-only --ignore-scripts');
}

function checkRelease()
{
	logInfo('checkRelease()');

	installDeps();
	buildTypescript(/* force */ true);
	replaceVersion();
	lint();
	test();
}

function executeCmd(command, exitOnError = true)
{
	logInfo(`executeCmd(): ${command}`);

	try
	{
		execSync(command, { stdio: [ 'ignore', process.stdout, process.stderr ] });
	}
	catch (error)
	{
		if (exitOnError)
		{
			logError(`executeCmd() failed, exiting: ${error}`);

			exitWithError();
		}
		else
		{
			logInfo(`executeCmd() failed, ignoring: ${error}`);
		}
	}
}

function logInfo(message)
{
	// eslint-disable-next-line no-console
	console.log(`npm-scripts \x1b[36m[INFO] [${task}]\x1b\[0m`, message);
}

// eslint-disable-next-line no-unused-vars
function logWarn(message)
{
	// eslint-disable-next-line no-console
	console.warn(`npm-scripts \x1b[33m[WARN] [${task}]\x1b\[0m`, message);
}

function logError(message)
{
	// eslint-disable-next-line no-console
	console.error(`npm-scripts \x1b[31m[ERROR] [${task}]\x1b\[0m`, message);
}

function exitWithError()
{
	process.exit(1);
}
