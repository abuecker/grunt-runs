var fs = require('fs');

exports.post = function (test) {
    test.expect(1);
    var pids = fs.readdirSync('.runs');
    test.ok(!pids.length, "There should not be any pid files");
    test.done();
};
