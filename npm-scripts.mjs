import * as process from 'node:process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { execSync } from 'node:child_process';
import pkg from './package.json' with { type: 'json' };

// Main Git branch is 'v' concatenated with the major SEMVER number of the
// "version" field in package.json.
const MAIN_BRANCH = `v${pkg.version.split('.')[0]}`;

// Paths for ESLint to check.
const ESLINT_PATHS = [
	'eslint.config.mjs',
	'jest.config.mjs',
	'npm-scripts.mjs',
	'src',
];

// Paths for ESLint to ignore.
const ESLINT_IGNORE_PATHS = [];

// Paths for Prettier to check/write.
// NOTE: Prettier ignores paths in .gitignore.
const PRETTIER_PATHS = [
	'README.md',
	'eslint.config.mjs',
	'jest.config.mjs',
	'npm-scripts.mjs',
	'package.json',
	'tsconfig.json',
	'src',
];

const task = process.argv[2];
const taskArgs = process.argv.slice(3).join(' ');

void run();

async function run() {
	logInfo(taskArgs ? `[args:"${taskArgs}"]` : '');

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
			buildTypescript({ force: false });

			break;
		}

		case 'prepublishOnly': {
			prepublishOnly();

			break;
		}

		case 'typescript:build': {
			buildTypescript({ force: true, args: taskArgs });

			break;
		}

		case 'typescript:watch': {
			watchTypescript({ args: taskArgs });

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
			test();

			break;
		}

		case 'coverage': {
			coverage({ args: taskArgs });

			break;
		}

		case 'publish:dry-run': {
			publishDryRun();

			break;
		}

		case 'release:check': {
			checkRelease();

			break;
		}

		case 'release': {
			await release({ args: taskArgs });

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
		const filePath = path.join(file.parentPath ?? 'lib', file.name);
		const text = fs.readFileSync(filePath, { encoding: 'utf8' });
		const result = text.replace(/__MEDIASOUP_CLIENT_VERSION__/g, pkg.version);

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

function buildTypescript({ force, args = '' }) {
	// Skip JavaScript code generation if the output already exists, unless forced.
	if (!force && fs.existsSync('lib')) {
		return;
	}

	logInfo('buildTypescript()');

	deleteLib();

	// Generate .js CommonJS code and .d.ts TypeScript declaration files in lib/.
	executeCmd(`tsc ${args}`);
}

function watchTypescript({ args = '' } = {}) {
	logInfo('watchTypescript()');

	deleteLib();

	executeCmd(`tsc --watch ${args}`);
}

function lint() {
	logInfo('lint()');

	// Ensure there are no rules that are unnecessary or conflict with Prettier
	// rules.
	executeCmd('eslint-config-prettier eslint.config.mjs');

	const eslintIgnorePatternArgs = ESLINT_IGNORE_PATHS.map(
		entry => `--ignore-pattern ${entry}`
	).join(' ');
	const eslintFiles = ESLINT_PATHS.join(' ');

	executeCmd(
		`eslint -c eslint.config.mjs --max-warnings 0 ${eslintIgnorePatternArgs} ${eslintFiles}`
	);

	const prettierFiles = PRETTIER_PATHS.join(' ');

	executeCmd(`prettier --check ${prettierFiles}`);

	executeCmd('knip --config knip.config.mjs --treat-config-hints-as-errors');
}

function format() {
	logInfo('format()');

	const prettierFiles = PRETTIER_PATHS.join(' ');

	executeCmd(`prettier --write ${prettierFiles}`);
}

function test({ args = '' } = {}) {
	logInfo('test()');

	executeCmd(`jest --silent false --detectOpenHandles ${args}`);
}

function coverage({ args = '' } = {}) {
	logInfo('coverage()');

	executeCmd(`jest --coverage ${args}`);
	executeCmd('open-cli coverage/lcov-report/index.html');
}

function installDeps() {
	logInfo('installDeps()');

	// Install/update deps.
	executeCmd('npm ci --ignore-scripts');

	// Update package-lock.json.
	executeCmd('npm install --package-lock-only --ignore-scripts');

	// Check vulnerabilities in deps.
	executeCmd('npm audit --omit dev');
}

/**
 * `prepublishOnly` is run by NPM only on `npm publish` (not on `npm pack`,
 * `npm install` or `npm ci`). We use it to forbid publishing mediasoup-client
 * from a local machine. The package must only be published by the
 * `mediasoup-client-npm-publish` workflow, which runs inside GitHub Actions
 * (where GITHUB_ACTIONS environment variable is set to 'true') and uses OIDC
 * trusted publishing.
 */
function prepublishOnly() {
	logInfo('prepublishOnly()');

	if (process.env.GITHUB_ACTIONS !== 'true') {
		logError(
			"prepublishOnly() | refusing to 'npm publish' outside of GitHub Actions: mediasoup-client is published only by the mediasoup-client-npm-publish workflow (triggered by pushing a release tag via 'npm run release')"
		);

		exitWithError();
	}
}

function publishDryRun() {
	logInfo('publishDryRun()');

	// NOTE: We use `npm pack --dry-run` rather than `npm publish --dry-run`
	// because the latter contacts the registry and fails with "You cannot
	// publish over the previously published versions" whenever the version in
	// package.json is already published (which is the usual state between
	// releases), making it useless in CI.
	//
	// `npm pack --dry-run` still runs the `prepare` script (TypeScript build)
	// and assembles the tarball exactly as a real publish would, reporting its
	// contents without writing any file or contacting the registry. Useful to
	// validate the `files` list in package.json and that the package builds
	// before tagging a release.
	executeCmd('npm pack --dry-run --loglevel warn');
}

function checkRelease() {
	logInfo('checkRelease()');

	installDeps();
	buildTypescript({ force: true });
	lint();
	test();
	// Validate packaging (the `files` list in package.json) before the
	// irreversible release steps (git push, GitHub release, npm publish).
	publishDryRun();
}

async function release({ args = '' } = {}) {
	logInfo('release()');

	const version = args.trim();

	if (!/^\d+\.\d+\.\d+$/.test(version)) {
		logError(
			`release() | a SEMVER 'x.y.z' argument is required, but got '${version}'`
		);

		exitWithError();
	}

	// Must be on the main branch.
	const branch = execSync('git rev-parse --abbrev-ref HEAD', {
		encoding: 'utf-8',
	}).trim();

	if (branch !== MAIN_BRANCH) {
		logError(
			`release() | must be on '${MAIN_BRANCH}' branch, but it is on '${branch}' branch`
		);

		exitWithError();
	}

	// Clean working tree required before bumping the version.
	checkGitClean();

	// Lint, test, build, publish dry-run.
	checkRelease();

	// Bump the version in package.json + package-lock.json.
	executeCmd(`npm version ${version} --no-git-tag-version`);

	// Also replace the version in the transpiled JS.
	replaceVersion();

	// Commit the bump, tag it, and push both. The pushed tag triggers
	// `mediasoup-client-npm-publish` workflow, which checks, creates the GitHub
	// release and publishes to NPM.
	//
	// The commit message carries a "[no-ci]" marker so the regular branch CI
	// workflow skips this commit.
	//
	// NOTE: "[no-ci]" (with a hyphen) is a custom marker, NOT GitHub's native
	// "[skip ci]"/"[no ci]" (which would also skip `mediasoup-client-npm-publish`
	// workflow, since the tag push shares this same commit).
	executeCmd(`git commit -am 'release ${version} [no-ci]'`);
	executeCmd(`git tag -a ${version} -m '${version}'`);
	executeCmd(`git push origin ${MAIN_BRANCH}`);
	executeCmd(`git push origin '${version}'`);
}

function checkGitClean() {
	logInfo('checkGitClean()');

	const status = execSync('git status --porcelain', {
		encoding: 'utf-8',
		stdio: ['ignore', 'pipe', 'ignore'],
	});

	if (status.trim()) {
		logError(
			'checkGitClean() | Git working tree is not clean, commit or stash your changes first'
		);

		exitWithError();
	}
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

// eslint-disable-next-line no-unused-vars
function executeInteractiveCmd(command) {
	logInfo(`executeInteractiveCmd(): ${command}`);

	try {
		execSync(command, { stdio: 'inherit', env: process.env });
	} catch (error) {
		logError(`executeInteractiveCmd() failed, exiting: ${error}`);

		exitWithError();
	}
}

function logInfo(...args) {
	// eslint-disable-next-line no-console
	console.log(`npm-scripts.mjs \x1b[36m[INFO] [${task}]\x1b[0m`, ...args);
}

// eslint-disable-next-line no-unused-vars
function logWarn(...args) {
	// eslint-disable-next-line no-console
	console.warn(`npm-scripts.mjs \x1b[33m[WARN] [${task}]\x1b\0m`, ...args);
}

function logError(...args) {
	// eslint-disable-next-line no-console
	console.error(`npm-scripts.mjs \x1b[31m[ERROR] [${task}]\x1b[0m`, ...args);
}

function exitWithError() {
	process.exit(1);
}
