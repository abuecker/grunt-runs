/*
 * grunt-runs
 *
 * Licensed under the MIT license.
 */

module.exports = function(grunt) {
  'use strict';

  // Project configuration.
  grunt.initConfig({

    jshint: {
      all: [
        'Gruntfile.js',
        'tasks/*.js',
        '<%= nodeunit.test %>',
        '<%= nodeunit.post %>',
      ],
      options: {
        jshintrc: '.jshintrc'
      }
    },

    // cleanup the temp .runs directory
    clean: {
        test: ['.runs'],
    },

    // Configuration to be run (and then tested).
    runs: {
        test: {
            options: {
                background: true
            },
            startMsgRegex: 'Started',
            cmd: './tests/bin/sleep'
        },
    },

    // Unit tests.
    nodeunit: {
        test: ['tests/runs_test.js'],
        post: ['tests/runs_post_test.js']
    }

  });

  // Actually load this plugin's task(s).
  grunt.loadTasks('tasks');

  // These plugins provide necessary tasks.
  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-contrib-clean');
  grunt.loadNpmTasks('grunt-contrib-nodeunit');

  // Whenever the "test" task is run, first clean the "tmp" dir, then run this
  // plugin's task(s), then test the result.
  grunt.registerTask('test', [
      'jshint',
      'clean',
      'runs:test',
      'nodeunit:test',
      'runs:test:stop',
      'nodeunit:post',
      'clean',
  ]);

  // By default, lint and run all tests.
  grunt.registerTask('default', ['test']);

};
