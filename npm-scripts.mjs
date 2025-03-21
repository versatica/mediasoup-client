import * as process from 'node:process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { execSync } from 'node:child_process';

const PKG = JSON.parse(fs.readFileSync('./package.json').toString());
const MAYOR_VERSION = PKG.version.split('.')[0];

// Paths for ESLint to check. Converted to string for convenience.
const ESLINT_PATHS = [
	'eslint.config.mjs',
	'jest.config.mjs',
	'npm-scripts.mjs',
	'src',
].join(' ');

// Paths for ESLint to ignore. Converted to string argument for convenience.
const ESLINT_IGNORE_PATTERN_ARGS = []
	.map(entry => `--ignore-pattern ${entry}`)
	.join(' ');

// Paths for Prettier to check/write. Converted to string for convenience.
const PRETTIER_PATHS = [
	'README.md',
	'eslint.config.mjs',
	'jest.config.mjs',
	'npm-scripts.mjs',
	'package.json',
	'tsconfig.json',
	'src',
].join(' ');

const task = process.argv[2];
const args = process.argv.slice(3).join(' ');

run();

async function run() {
	logInfo(args ? `[args:"${args}"]` : '');

	switch (task) {
		// As per NPM documentation (https://docs.npmjs.com/cli/v9/using-npm/scripts)
		// `prepare` script:
		//
		// - Runs BEFORE the package is packed, i.e. during `npm publish` and
		//   `npm pack`.
		// - Runs on local `npm install` without any arguments.
		// - NOTE: If a package being installed through git contains a `prepare`
		//   script, its dependencies and devDependencies will be installed, and
		//   the `prepare` script will be run, before the package is packaged and
		//   installed.
		//
		// So here we compile TypeScript to JavaScript.
		case 'prepare': {
			buildTypescript();
			replaceVersion();

			break;
		}

		case 'typescript:build': {
			buildTypescript();
			replaceVersion();

			break;
		}

		case 'typescript:watch': {
			watchTypescript();

			break;
		}

		case 'lint': {
			lint();

			break;
		}

		case 'format': {
			format();

			break;
		}

		case 'test': {
			replaceVersion();
			test();

			break;
		}

		case 'coverage': {
			replaceVersion();
			executeCmd(`jest --coverage ${args}`);
			executeCmd('open-cli coverage/lcov-report/index.html');

			break;
		}

		case 'release:check': {
			checkRelease();

			break;
		}

		case 'release': {
			checkRelease();
			executeCmd(`git commit -am '${PKG.version}'`);
			executeCmd(`git tag -a ${PKG.version} -m '${PKG.version}'`);
			executeCmd(`git push origin v${MAYOR_VERSION}`);
			executeCmd(`git push origin '${PKG.version}'`);
			executeCmd('npm publish');

			break;
		}

		default: {
			logError('unknown task');

			exitWithError();
		}
	}
}

function replaceVersion() {
	logInfo('replaceVersion()');

	const files = fs.readdirSync('lib', {
		withFileTypes: true,
		recursive: true,
	});

	for (const file of files) {
		if (!file.isFile()) {
			continue;
		}

		// NOTE: dirent.path is only available in Node >= 20.
		const filePath = path.join(file.path ?? 'lib', file.name);
		const text = fs.readFileSync(filePath, { encoding: 'utf8' });
		const result = text.replace(/__MEDIASOUP_CLIENT_VERSION__/g, PKG.version);

		fs.writeFileSync(filePath, result, { encoding: 'utf8' });
	}
}

function deleteLib() {
	if (!fs.existsSync('lib')) {
		return;
	}

	logInfo('deleteLib()');

	fs.rmSync('lib', { recursive: true, force: true });
}

function buildTypescript() {
	logInfo('buildTypescript()');

	deleteLib();

	// Generate .js CommonJS code and .d.ts TypeScript declaration files in lib/.
	executeCmd('tsc');
}

function watchTypescript() {
	logInfo('watchTypescript()');

	deleteLib();

	executeCmd('tsc --watch');
}

function lint() {
	logInfo('lint()');

	// Ensure there are no rules that are unnecessary or conflict with Prettier
	// rules.
	executeCmd('eslint-config-prettier eslint.config.mjs');

	executeCmd(
		`eslint -c eslint.config.mjs --max-warnings 0 ${ESLINT_IGNORE_PATTERN_ARGS} ${ESLINT_PATHS}`
	);

	executeCmd(`prettier --check ${PRETTIER_PATHS}`);
}

function format() {
	logInfo('format()');

	executeCmd(`prettier --write ${PRETTIER_PATHS}`);
}

function test() {
	logInfo('test()');

	executeCmd(`jest --silent false --detectOpenHandles ${args}`);
}

function installDeps() {
	logInfo('installDeps()');

	// Install/update deps.
	executeCmd('npm ci --ignore-scripts');
	// Update package-lock.json.
	executeCmd('npm install --package-lock-only --ignore-scripts');
}

function checkRelease() {
	logInfo('checkRelease()');

	installDeps();
	buildTypescript();
	replaceVersion();
	lint();
	test();
}

function executeCmd(command) {
	logInfo(`executeCmd(): ${command}`);

	try {
		execSync(command, { stdio: ['ignore', process.stdout, process.stderr] });
	} catch (error) {
		logError(`executeCmd() failed, exiting: ${error}`);

		exitWithError();
	}
}

function logInfo(message) {
	// eslint-disable-next-line no-console
	console.log(`npm-scripts \x1b[36m[INFO] [${task}]\x1b[0m`, message);
}

// eslint-disable-next-line no-unused-vars
function logWarn(message) {
	// eslint-disable-next-line no-console
	console.warn(`npm-scripts \x1b[33m[WARN] [${task}]\x1b[0m`, message);
}

function logError(message) {
	// eslint-disable-next-line no-console
	console.error(`npm-scripts \x1b[31m[ERROR] [${task}]\x1b[0m`, message);
}

function exitWithError() {
	process.exit(1);
}
