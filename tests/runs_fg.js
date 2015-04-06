var fs = require('fs');
var glob = require('glob');

exports.fg = function (test) {

    test.expect(1);
    // test.expect(2);

    var exists = fs.existsSync('./BLAH.txt');
    test.ok(exists, 'File should exist.');

    var data = fs.readFileSync('./BLAH.txt', { encoding: 'utf8' });
    console.log('data', data);

    //
    // test.ok(pids.length > 1, "There should be 1 pid file");
    // test.ok(pids[0] === 'test.pid', "There should be a pid file 'test.pid'");
    test.done();
};
