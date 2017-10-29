'use strict'; // eslint-disable-line strict

const fs = require('fs');
const gulp = require('gulp');
const gutil = require('gulp-util');
const plumber = require('gulp-plumber');
const rename = require('gulp-rename');
const header = require('gulp-header');
const browserify = require('browserify');
const uglify = require('gulp-uglify');
const source = require('vinyl-source-stream');
const buffer = require('vinyl-buffer');
const eslint = require('gulp-eslint');

const PKG = require('./package.json');
const BANNER = fs.readFileSync('banner.txt').toString();

function logError(error)
{
	gutil.log(gutil.colors.red(String(error)));
}

gulp.task('lint', () =>
{
	const src = [ 'gulpfile.js', '.eslintrc.js', 'lib/**/*.js' ];

	return gulp.src(src)
		.pipe(plumber())
		.pipe(eslint())
		.pipe(eslint.format());
});

gulp.task('bundle', () =>
{
	return browserify(
		{
			entries      : PKG.main,
			extensions   : [ '.js' ],
			// Required for sourcemaps (must be false otherwise).
			debug        : false,
			// Required for watchify (not used here).
			cache        : null,
			// Required for watchify (not used here).
			packageCache : null,
			// Required to be true only for watchify (not used here).
			fullPaths    : false,
			standalone   : 'mediasoupClient'
		})
		.bundle()
		.on('error', logError)
		.pipe(source(`${PKG.name}.js`))
		.pipe(buffer())
		.pipe(rename(`${PKG.name}.js`))
		.pipe(uglify())
		.pipe(header(BANNER, { pkg: PKG }))
		.pipe(gulp.dest('dist/'));
});

gulp.task('default', gulp.series('lint', 'bundle'));
