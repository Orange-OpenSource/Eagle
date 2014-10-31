/*
 * Copyright (C) 2014 Orange
 * Licensed under MIT (https://github.com/Orange-OpenSource/Eagle/blob/master/LICENSE)
 */

module.exports = function(grunt) {
	require('load-grunt-tasks')(grunt);

	grunt.initConfig({
		nodemon: {
			explorer: {
				script: 'explorer.js',
				options: {
					cwd: './explorer'
				}
			}
		}
	});

	grunt.registerTask('explorer', [
		'nodemon:explorer'
	]);
}