var chalk = require('chalk');
var spawn = require('child_process').spawn;
var exec = require('child_process').exec;
var async = require('async');
var fs = require('fs');
var path = require('path');
var devnull = require('dev-null');
var stream = require('stream');
var util = require('util');
var pidFile = process.env.HOME + '/.runs/service.pid';

/**
 * A simple Stream
 */
function DataStream(opts) {
    if (!(this instanceof DataStream)) {
        return new DataStream();
    }
    opts = opts || {};
    stream.Transform.call(this, opts);
}
util.inherits(DataStream, stream.PassThrough);
DataStream.prototype._transform = function(chunk, encoding, cb) {
    this.push(chunk);
    cb();
};

module.exports = function (grunt) {

    /**
     * Stop the process
     */
    function stopSync(callback) {

        var exists = fs.existsSync(pidFile);

        if (exists) {
            var data = fs.readFileSync(pidFile, {encoding: 'utf8'});

            // Attempt to kill the process
            grunt.log.write(chalk.cyan('Stopping'), 'Process: ' + data + '\n');
            try {
                process.kill(parseInt(data, 10));
            } catch (e) {
                grunt.log.write('Process no longer exists.\n');
            }

            // Clean up the file
            fs.unlinkSync(pidFile);

        }

        // Remove the listener on exit
        process.removeListener('exit', stopSync);

        // Execute the callback if passed in
        if (callback && typeof callback === 'function') {
            return callback();
        }

    }

    // Register the grunt task
    grunt.registerMultiTask('runs', '', function () {

        // Catch any events that trigger the stop
        process.on('runs:'  + this.target + ':stop', function (cb, remove) {

            // if passed "remove" argument, remove the exit listener
            if (remove) {
                process.removeListener('exit', stopSync);
            }

            // Stop

            // if we have a callback function, call it
            if (cb && typeof cb === 'function') {
                return stopSync(cb);
            } else {
                return stopSync();
            }

        });

        // Build the pid file name with the target name.  This should be local
        // to the project since other projects may have tasks with the same
        // target names.
        pidFile =  path.join(process.cwd(), '.runs', this.target + '.pid');

        // Trigger the async
        var done = this.async();

        // Build the options
        var options = this.options();
        var cmd = '/bin/sh';
        var args = ['-c', this.data.cmd];
        var startRegex = this.data.startRegex || '.*';
        var errorRegex = this.data.errorRegex || 'Error';
        var env = this.data.env || {
            cwd: process.cwd(),
        };
        var verbose = options.verbose || true;

        // Build the timeout data for when the process should start
        var timeout = this.data.timeout || 5000;
        var startTime = new Date();
        var endTime = new Date(startTime.valueOf() + timeout);


        // Call these async events in series
        async.series([

            // If we're calling the stop argument, clean up and bail out
            function (cb) {
                if (this.args.indexOf('stop') >= 0) {

                    stopSync(function () {
                        return cb('stopped');
                    });

                } else {

                    return cb(null);

                }
            }.bind(this),

            // Run the cleanup function in case there is a local server still
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

            // Make sure the dir for the pidfile exists
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

            // Start the server
            function (cb) {

                // Setup a time out checkout
                function checkTimeout () {
                    // see if we've timed out
                    if ((new Date().valueOf()) > endTime) {
                        return cb(new Error('Waited for ' + timeout + 'ms and the process has not started.'));
                    }
                }
                var timeoutCheck = setInterval(checkTimeout, 100);

                // Spawn a child process
                var child = spawn(
                    cmd,
                    args,
                    env
                );

                // create 2 new stream buffers that we'll listen on
                var outstr = new DataStream({encoding: 'utf8'});
                var errstr = new DataStream({encoding: 'utf8'});

                // Route the child streams to the correct stream
                switch (options.stdout) {
                    case 'stderr':
                        child.stdout.pipe(errstr);
                        break;
                    default:
                        child.stdout.pipe(outstr);
                        break;
                }

                switch (options.stderr) {
                    case 'stdout':
                        child.stderr.pipe(outstr);
                        break;
                    default:
                        child.stderr.pipe(errstr);
                        break;
                }

                // Verbose option should send the streams to the console
                if (verbose) {
                    outstr.pipe(process.stdout);
                    errstr.pipe(process.stderr);
                }


                if (!options.background) {

                    grunt.log.write(chalk.green('Running in foreground: ' + args[1] + '\n'));

                    // when the process finishes, call the async done
                    child.on('exit', function () {
                        stopSync(done);
                    });

                } else {

                    grunt.log.write(chalk.green('Backgrounding: ' + args[1] + '\n'));

                    // child.stdout.on('data', function (data) {
                    outstr.on('data', function (data) {

                        // If we match the start message regex, we know the server is running,
                        // so write the PID
                        var regex = new RegExp(startRegex);
                        var matchMsg = data.match(regex);

                        if (matchMsg) {
                            grunt.log.write(chalk.green('Process successfully started: ' + child.pid + '\n'));
                            // Write the pidfile
                            fs.writeFile(pidFile, child.pid, {encoding: 'utf8'}, function (err) {
                                if (err) {
                                    return cb(err);
                                }

                                // Clear the timeout check
                                clearInterval(timeoutCheck);

                                // Done
                                cb(null);

                            });
                        }

                        // Catch any errors according to the error regex
                        var regexErr = new RegExp(errorRegex);
                        var matchError = data.match(regexErr);
                        if (matchError) {
                            return cb(new Error(data));
                        }

                    });

                }

                // Catch any data on the error stream
                errstr.on('data', function (data) {

                    // Wait a bit for the error to write it's output, then bail
                    setTimeout(function () {
                        return cb(new Error('Error launching process: ' + data));
                    }, 500);

                });

                // Catch any errors on the child process
                child.on('error', function (err) {
                    return cb(err);
                });


            }

        ], function (err, result) {

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

            // Let grunt know we're done if this is a background processes
            if (options.background) {
                done();
            }

        });

    });

};
