const process = require('process');
const fs = require('fs');
const { execSync } = require('child_process');
const { version } = require('./package.json');

const task = process.argv.slice(2).join(' ');

// eslint-disable-next-line no-console
console.log(`npm-scripts.js [INFO] running task "${task}"`);

switch (task)
{
	case 'typescript:build':
	{
		execute('rm -rf lib');
		execute('tsc');
		taskReplaceVersion();

		break;
	}

	case 'typescript:watch':
	{
		const TscWatchClient = require('tsc-watch/client');

		execute('rm -rf lib');

		const watch = new TscWatchClient();

		watch.on('success', taskReplaceVersion);
		watch.start('--pretty');

		break;
	}

	case 'lint':
	{
		execute('MEDIASOUP_NODE_LANGUAGE=typescript eslint -c .eslintrc.js --ext=ts src/');
		execute('MEDIASOUP_NODE_LANGUAGE=javascript eslint -c .eslintrc.js --ext=js --ignore-pattern \'!.eslintrc.js\' .eslintrc.js npm-scripts.js test/');

		break;
	}

	case 'test':
	{
		taskReplaceVersion();
		execute('jest');

		break;
	}

	case 'coverage':
	{
		taskReplaceVersion();
		execute('jest --coverage');
		execute('open-cli coverage/lcov-report/index.html');

		break;
	}

	case 'release':
	{
		execute('npm run typescript:build');
		execute('npm run lint');
		execute('npm run test');
		execute(`git commit -am '${version}'`);
		execute(`git tag -a ${version} -m '${version}'`);
		execute('git push origin v3 && git push origin --tags');
		execute('npm publish');

		break;
	}

	default:
	{
		throw new TypeError(`unknown task "${task}"`);
	}
}

function taskReplaceVersion()
{
	const files = [ 'lib/index.js', 'lib/index.d.ts' ];

	for (const file of files)
	{
		const text = fs.readFileSync(file, { encoding: 'utf8' });
		const result = text.replace(/__MEDIASOUP_CLIENT_VERSION__/g, version);

		fs.writeFileSync(file, result, { encoding: 'utf8' });
	}
}

function execute(command)
{
	// eslint-disable-next-line no-console
	console.log(`npm-scripts.js [INFO] executing command: ${command}`);

	try
	{
		execSync(command,	{ stdio: [ 'ignore', process.stdout, process.stderr ] });
	}
	catch (error)
	{
		process.exit(1);
	}
}
