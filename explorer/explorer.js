/*
 * Copyright (C) 2014 Orange
 * Licensed under MIT (https://github.com/Orange-OpenSource/Eagle/blob/master/LICENSE)
 */

/*-----------------------------------------------------------------------------
 * $Id: expressServer.js 5471 2014-05-22 15:40:56Z qtmm2465 $
 * © Orange
 *------------------------------------------------------------------------------
 * Express server used to display screenshot images
 *------------------------------------------------------------------------------
 * $LastChangedBy: qtmm2465 $
 * $LastChangedRevision: 5471 $
 * $LastChangedDate: 2014-05-22 17:40:56 +0200 (Thu, 22 May 2014) $
 *------------------------------------------------------------------------------
 *
 *----------------------------------------------------------------------------*/

/*jshint node: true */

var express = require('express'),
    directory = require('./serve-index'),
    fs = require('fs'),
    Svn = require('svn-spawn'),
    Q = require('q'),
	config = require('./config'),
    workingPath = config.workingPath,
    repoPath = config.repoPath,
    app = express(),
	localFile,
	localDirectory,
	repoFile,
	repoDirectory,
	client;

client = new Svn({
	cwd:  workingPath,
	username: config.svn.username,
	password: config.svn.encryptedPassword ? decrypt(config.svn.encryptedPassword) : config.svn.password
});

app.use('/', directory(__dirname + '/' + config.workingPath ,{'view': 'details','icons':true}));
app.use(express.static(__dirname));
app.use('/toastr', express.static(__dirname + '/serve-index/public/toastr'));
app.use('/public', express.static(__dirname + '/serve-index/public/'));
app.use('/', express.static(__dirname + '/' + config.workingPath));

//app.get('/', function(req, res){
//    res.redirect('/Screenshots');
//});

Q.denodeify(fs.exists)(workingPath).then(function(exists) {
	if (!exists) {
		return Q.denodeify(fs.mkdir)(workingPath);
	}
}).then(function() {
	Q.nbind(client.cmd, client)(['checkout',repoPath, '.']);
});

app.get('/svn/check', function(request, response) {
    // summary:
    //      Checks if a file is already present in svn
    if(request.query.directory && request.query.file){

        repoDirectory = repoPath + '/' + request.query.directory;

        Q.nbind(client.cmd, client)(['list',repoDirectory]).then(function(data){
            if(data.indexOf(request.query.file) > -1){
                response.send(200, "OK");
            }
        }).fail(function(err){
            response.send(200, err + '<br/><br/>File not found : ' + repoDirectory +'/'+ request.query.file );
        });
    }
    else {
        response.send(400,"Wrong parameters. You should specify both directory and file.<br/> File checking aborted.");
    }
});

app.get('/svn/checkall', function(request, response) {
    // summary:
    //      Checks if multiple files are present in svn
    // returns: Table of all files already present in svn
    var list, result = {};

    if(request.query.directory){

        repoDirectory = repoPath + '/' + request.query.directory;
        Q.nbind(client.cmd, client)(['list',repoDirectory]).then(function(data){
            list = data.split('\n');
            for (var file in list) {
                if (list.hasOwnProperty(file)) {
                    if (list[file] !== ""){
                        result[file] = list[file].split('/')[0];
                    }
                }
            }
            response.send(200, JSON.stringify(result));
        }).fail(function(err){
            response.send(200,"Error: check if the directory exists in svn. </br>" + err);
        });
    }
    else {
        response.send(400,"Wrong parameters. You should specify both directory and file.<br/> File checking aborted.");
    }
});

app.get('/svn/add', function(request, response) {
    // summary:
    //      Adds a single file in svn
    if(request.query.directory && request.query.file){

        var relativePath = '/' + request.query.directory + '/' + request.query.file;
        localDirectory = workingPath + '/' + request.query.directory;
        localFile = workingPath + relativePath;
        repoFile = repoPath + relativePath;

        Q.nbind(client.add, client)([localDirectory,'--depth=empty', '--force']).then(function(){
            return Q.nbind(client.add, client)(localFile);
        }).then(function(){
            return Q.nbind(client.commit, client)(['Visual tests: add screenshot reference',workingPath]);
        }).then(function(){
            response.send(200, 'File(s) or folder added to SVN');
        }).fail(function(err){
            response.send(200, "Error: file not added <br/>" + err);
        });
    } else {
        response.send(400,"Wrong parameters. You should specify both directory and file.<br/> File addition aborted.");
    }
});

function addFiles(localDir, files){

    var addArgs = ['add','--parents'];
    for(var file in files){
        if(files.hasOwnProperty(file) && files[file].indexOf('-REF') >= 0){
            addArgs.push(localDir + '/' + files[file]);
        }
    }
    return Q.nbind(client.cmd, client)(addArgs);
}

app.get('/svn/addall', function(request, response) {
    // summary:
    //      Adds all "REF" files of a directory in svn
    if(request.query.directory ){

        var parentDir = "Screenshots/";
        localDirectory = parentDir + request.query.directory;

        Q.nbind(client.cmd, client)(['checkout',repoPath])
            .then(function(){
                return Q.nbind(fs.readdir, fs) (localDirectory);
            }).then(function(files){
                return addFiles(localDirectory,files);
            }).fail(function(err){
                response.send(200,"Fail to add images to svn</br>" + err);
            }).then(function() {
                response.send(200, 'File(s) or folder added to SVN');
            }).fin(function(){
                return Q.nbind(client.commit, client)(['Visual tests: add screenshot reference', workingPath]);
            });
    } else {
        response.send(400,"Wrong parameters. You should specify both directory and file.<br/> File addition aborted.");
    }
});

app.get('/svn/delete', function(request, response) {
    // summary:
    //      Delete a file locally and in svn
    if (request.query.directory && request.query.file){
        localFile = workingPath + '/' + request.query.directory + '/' + request.query.file;
        Q.nbind(client.del, client)(localFile).then(function() {
            return Q.nbind(client.commit, client)(['Visual tests: delete screenshot reference', workingPath]);
        }).then(function(){
            response.send(200, 'File(s) or folder deleted on SVN');
        }).fail(function(err){
            response.send(200, "Error: file not deleted <br/>" + err);
        });
    } else {
        response.send(400,"Wrong parameters. You should specify both directory and file.<br/> File deletion aborted.");
    }
});

app.get('/svn/deleteall', function(request, response) {
    // summary:
    //      Delete a directory locally and in svn
    if (request.query.directory){
        localDirectory = workingPath + '/' + request.query.directory;
        Q.nbind(client.del, client)(['--force',localDirectory]).then(function() {
            return Q.nbind(client.commit, client)(['Visual tests: delete screenshot reference', workingPath]);
        }).then(function(){
            response.send(200, 'File(s) and parent folder deleted on SVN');
        }).fail(function(err){
            response.send(200, "Error: file(s) and parent folder not deleted <br/>" + err);
        });
    } else {
        response.send(400,"Wrong parameters. You should specify both directory and file.<br/> File deletion aborted.");
    }
});

function decrypt(/*String*/text){
	// summary:
	//		Decrypt svn password

	var crypto = require('crypto'),
		algorithm = 'aes-256-ctr',
		password = 'snfjsdbvisbqvibfsihb4qs6d4q6',
		decipher = crypto.createDecipher(algorithm,password),
		dec = decipher.update(text,'hex','utf8');

	dec += decipher.final('utf8');

	return dec;
}

app.listen(config.port || 3040);