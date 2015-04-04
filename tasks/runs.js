var chalk = require('chalk');
var spawn = require('child_process').spawn;
var async = require('async');
var fs = require('fs');
var path = require('path');
var pidFile = process.env.HOME + '/.runs/service.pid';

module.exports = function (grunt) {

    function stopSync(cb) {

        var exists = fs.existsSync(pidFile);

        if (exists) {
            var data = fs.readFileSync(pidFile, {encoding: 'utf8'});

            // attempt to kill the process
            grunt.log.write(chalk.cyan('Stopping'), 'Process: ' + data + '\n');
            try {
                process.kill(parseInt(data, 10));
            } catch (e) {
                grunt.log.write('Process no longer exists.\n');
            }

            // clean up the file
            fs.unlinkSync(pidFile);

            // Execute the callback if passed in
            if (cb && typeof cb === 'function') {
                cb();
            }
        }

        // remove the listener on exit
        process.removeListener('exit', stopSync);

    }

    // register the grunt task
    grunt.registerMultiTask('runs', '', function () {

        // catch any events that trigger the stop
        process.on('stop:' + this.target, function (cb, remove) {

            // if passed "remove" argument, remove the exit listener
            if (remove) {
                process.removeListener('exit', stopSync);
            }

            // Stop
            stopSync();

            // if we have a callback function, call it
            if (cb && typeof cb === 'function') {
                cb(null);
            }

        });

        // build the pid file name with the target name
        pidFile =  path.join(__dirname, '..', '.runs', this.target + '.pid');

        // trigger the async
        var done = this.async();

        // get the options
        var options = this.options();
        var cmd = this.data.cmd;
        var args = this.data.args || [];
        var startMsgRegex = this.data.startMsgRegex || '.*';

        // call these async events in series
        async.series([

            // if we're calling the stop argument, clean up and bail out
            function (cb) {
                if (this.args.indexOf('stop') >= 0) {
                    stopSync();
                    cb('stopped');
                } else {
                    cb(null);
                }
            }.bind(this),

            // run the cleanup function in case there is a local server still
            // running
            function (cb) {
                fs.exists(pidFile, function (exists) {
                    if (exists) {
                        stopSync();
                        return cb(null);
                    } else {
                        return cb(null);
                    }
                });
            },

            // make sure the dir for the pidfile exists
            function (cb) {
                var dirname = path.dirname(pidFile);
                fs.exists(dirname, function (exists) {
                    if (!exists) {
                        fs.mkdir(dirname, '0777', function (err) {
                            if (err) {
                                return cb(err);
                            }
                            grunt.log.write(chalk.green(
                                'Created "' + dirname + '"\n'
                            ));
                            return cb(null);
                        });
                    } else {
                        return cb(null);
                    }
                });
            },

            // start the server
            function (cb) {


                // spawn a child process
                var child = spawn(
                    cmd,
                    args,
                    {
                        cwd: process.cwd(),
                    }
                );

                // for a verbose output of what the server is doing, pipe the
                // stdout of this spawned process to the main process
                if (!options.background) {
                    child.stdout.pipe(process.stdout);
                }
                child.stderr.pipe(process.stderr);

                child.stdout.setEncoding('utf8');
                child.stdout.on('data', function (data) {

                    var regex = new RegExp(startMsgRegex);
                    var matchMsg = data.match(regex);

                    // If we match the regex, we know the server is running,
                    // so write the PID
                    if (matchMsg) {
                        // write the pidfile
                        fs.writeFile(pidFile, child.pid, {encoding: 'utf8'}, function (err) {
                            if (err) {
                                return cb(err);
                            }

                            // done
                            return cb(null);

                        });
                    }

                    var matchError = data.match(/Error/i);
                    if (matchError) {
                        return cb(new Error(data));
                    }

                });

                child.stderr.on('data', function () {
                    // wait a bit for the error to write it's output, then bail
                    setTimeout(function () {
                        return cb(new Error('Error launching process'));
                    }, 500);
                });

                child.on('error', function (err) {
                    return cb(err);
                });


            }

        ], function (err) {

            // Catch errors
            if (err) {
                // If the "error" is a stop, exit gracefully
                if (err === 'stopped') {
                    grunt.log.write(chalk.green('Exit.\n'));
                    return done();
                } else {
                    throw err;
                }
            }

            if (options.background) {
                grunt.log.write(chalk.green('Backgrounding: ' + cmd + '\n'));
                done();
            } else {
                // register the on exit event to stop the process if we aren't
                // detaching to run in the background
                process.on('exit', stopSync);
            }

        });

    });

};
