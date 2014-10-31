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