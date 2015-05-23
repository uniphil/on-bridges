'use strict'

module.exports = function(grunt) {
  grunt.initConfig({

    browserify: {
      options: {
        transform: [ 'reactify' ],
      },
      app: {
        src: 'src/app.js',
        dest: 'app.js',
      },
    },

    watch: {
      gruntfile: {
        files: 'Gruntfile.js',
      },
      html: {
        files: 'index.html',
      },
      css: {
        files: 'app.css',
      },
      src: {
        files: 'src/**/*.{js,jsx}',
        tasks: [ 'browserify' ],
      },
      options: {
        spawn: false,
        livereload: true,
      },
    },

    connect: {
      options: {
        port: 9000,
      },
      livereload: true,
    },

  });

  grunt.loadNpmTasks('grunt-browserify');
  grunt.loadNpmTasks('grunt-contrib-watch');
  grunt.loadNpmTasks('grunt-contrib-connect');

  grunt.registerTask('serve', ['browserify', 'connect', 'watch']);
};
