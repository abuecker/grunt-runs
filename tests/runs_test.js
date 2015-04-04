var fs = require('fs');

exports.runs = function (test) {
    test.expect(2);
    var pids = fs.readdirSync('.runs');
    test.ok(pids.length === 1, "There should be 1 pid file");
    test.ok(pids[0] === 'test.pid', "There should be a pid file 'test.pid'");
    test.done();
};

exports.runss = function (test) {
    test.expect(1);
    test.ok(true, "blah");
    test.done();
};
