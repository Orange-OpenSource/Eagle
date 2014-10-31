var express = require('express');
var app = express();

app.use(express.static(__dirname + '/_site'));

app.listen(process.env.OPENSHIFT_NODEJS_PORT || 3000, process.env.OPENSHIFT_NODEJS_IP || undefined);