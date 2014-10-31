/*
 * Copyright (C) 2014 Orange
 * Licensed under MIT (https://github.com/Orange-OpenSource/Eagle/blob/master/LICENSE)
 */

/**
 * @module Eagle
 */
var fs = require('fs'),
    gm = require('gm'),
    _ = require('lodash'),
    resemble = require('resemble'),
    Command = require('leadfoot/Command'),
    pollUntil = require('leadfoot/helpers/pollUntil'),
    assert = require('chai').assert,
    fileSystem = require ('./util/fileSystem'),
    Deferred;

/**
 * Eagle Constructor
 * @constructor
 */
function Eagle() {
    Command.apply(this, arguments);
}

Eagle.prototype = Object.create(Command.prototype);
Eagle.prototype.constructor = Eagle;
Eagle.prototype.config = {
    timeout: 10000,
    url: null,
    screenshotServer: null,
    dimensions: {
        x:1024,
        y:768
    }
};

/**
 * Crops an image to specified element size and location
 * @private
 * @param {string} imagePath - path of the screenshot
 * @param {Object} elementSize - width and height used to crop the screenshot
 * @param {Object} elementLocation - x and y coordinates used to crop the screenshot
 * @returns {Q.promise}
 */
function cropScreenShot (/*String*/ imagePath, /*Object*/ elementSize, /*Object*/ elementLocation) {
    var dfd = new Deferred(),
        im = gm.subClass({ imageMagick: true });
    im(imagePath)
        .crop(elementSize.width,elementSize.height,elementLocation.x,elementLocation.y)
        .write(imagePath, function (err) {
            dfd.resolve(true);
            if(err) { throw err; }
        });
    return dfd.promise;
}

/**
 *  Compares 2 images and, if there is a difference,
 *  generates a third image with highlighted differences.
 * @private
 * @param {string} firstImgPath -  path to the first image
 * @param {string} secondImgPath - path to the second image
 * @param {string} resultImgPath - path to the result image
 * @param {string} [imageServerUrl] - url of the server where images are available (if set, a direct link is provided in reports)
 * @returns {Q.promise}
 */
function compareScreenShots (/*string*/ firstImgPath, /*string*/ secondImgPath, /*string*/ resultImgPath,/*string?*/imageServerUrl){
    var dfd = new Deferred();

    if(fileSystem.doesFileExists(resultImgPath)){
        fs.unlink(resultImgPath, function(err){
            if(err) { console.log(err); }
        });
    }
    if(firstImgPath !== secondImgPath) {
        resemble.resemble(firstImgPath).compareTo(secondImgPath).onComplete(function(data){
            if(data.misMatchPercentage > 0) {
                var base64Data = data.getImageDataUrl().replace(/^data:image\/png;base64,/,"");
                fs.writeFile(resultImgPath, base64Data, 'base64', function(err){
                    if(err) { console.log(err); }
                });
            }
            dfd.resolve((data.misMatchPercentage == 0));
        });
    } else {
        dfd.resolve(true);
    }
    return dfd.then(function(areSame){
        var msg = 'Images should be the same.\n';
        if(imageServerUrl !== null){
            msg += 'See : ' + 'http://' + imageServerUrl + resultImgPath + ' \n';
        }
        assert.equal(areSame, true, msg);
    });
}
/**
 * Initializes configuration.
 * @param {Object} configuration - the Eagle configuration
 * @returns {Eagle.constructor}
 * @example Configuration example
 * Eagle.initConfig({
 *  timeout: 10000,
 *  url: 'http://mywebsite.com/',
 *  screenshotServer: 'http://localhost:1234/,
 *  dimensions: {
 *      x:1000,
 *      y:1000
 *  });
 */
Eagle.prototype.initConfig = function(configuration, dfd){
    this.config = _.merge(this.config, configuration);
    Deferred = dfd;
    return new this.constructor(this, function () {
        return this.parent;
    });
};
/**
 * Initializes remote browser.
 * @returns {Eagle.constructor}
 */
Eagle.prototype.setup = function(){
    if(!this.config.url){
        throw new Error('Url is mandatory.');
    }
    return new this.constructor(this, function () {
        return this.parent
            .setFindTimeout(this.parent.config.timeout)
            .setPageLoadTimeout(this.parent.config.timeout)
            .setExecuteAsyncTimeout(this.parent.config.timeout)
            .setWindowSize(this.parent.config.dimensions.x, this.parent.config.dimensions.y)
            .get(this.parent.config.url);
    });
};
/**
 * Takes and saves a screenshot fitted to the DOM element dimensions,
 * then asserts the 2 images (actual image and ref image).
 * If the REF image doesn't exists, REF image is created and assertion is true.
 * Else, images are compared and in case of differences, a third image is generated.
 * @summary Captures a screenshot of specified element and compares it to a reference image of the element.
 * @param {string} selector - CSS selector of specified element
 * @param {string} imageLocation - path of the screenshot directory
 * @param {string} imageName - name of the screenshot
 * @returns {Eagle.constructor}
 */
Eagle.prototype.captureElementByCssSelector = function(/*String*/ selector, /*String*/ imageLocation, /*String*/ imageName) {
    return new this.constructor(this, function () {
        var elementLocation = {},
            elementSize = {},
            testImage = imageLocation + '/' + imageName + '-LAST.png',
            refImage =  imageLocation + '/' + imageName + '-REF.png',
            diffImage =  imageLocation + '/' + imageName + '-DIFF.png',
            imagePath = (fileSystem.doesFileExists(refImage)) ? testImage : refImage;
        fileSystem.mkdirIfNotExists(imageLocation);

        return this.parent
            .findByCssSelector(selector)
            .getPosition()
            .then(function(location){
                elementLocation = location;
                return this.parent;
            })
            .end()
            .findByCssSelector(selector)
            .getSize()
            .then(function(size){
                elementSize = size;
                return this.parent;
            })
            .end()
            .takeScreenshot()
            .then(function(screenshot){
                fs.writeFile(imagePath, screenshot, 'base64', function(err){
                    if(err) { throw err; }
                });
                return this.parent;
            })
            .then(function(){
                return this.parent
                    .execute('return window.scrollX;')
                    .then(function(scrollX){
                        elementLocation.x -= scrollX;
                    })
                    .execute('return window.scrollY;')
                    .then(function(scrollY){
                        elementLocation.y -= scrollY;
                    });
            })
            .then(function() {
                return cropScreenShot(imagePath,elementSize,elementLocation);
            })
            .then(function() {
                return compareScreenShots(imagePath,refImage,diffImage, this.parent.config.screenshotServer);
            });
    });
};
/**
 * Takes and saves a screenshot of the current 'visible' page.
 * Unvisible elements won't be captured (like end of a scrollable page).
 * @param {string} imageLocation - path of the screenshot directory
 * @param {string} imageName - name of the screenshot
 * @returns {Eagle.constructor}
 */
Eagle.prototype.captureFullScreenShot = function(/*String*/ imageLocation, /*String*/ imageName) {
    return new this.constructor(this, function () {
        return this.parent
            .takeScreenshot()
            .then(function(screenshot){
                fs.writeFile(imageLocation+'/'+imageName+'.png', screenshot, 'base64', function(err){
                    if(err) { throw err; }
                });
            });
    });
};
/**
 * Blurs the DOM active element.
 * The command is sent to the remote browser using the execute command.
 * @returns {Eagle.constructor}
 */
Eagle.prototype.blurActiveElement = function () {
    return new this.constructor(this, function () {
        return this.parent
            .then(pollUntil("document.activeElement.blur(); return document.activeElement === document.querySelector('body') ? true : null;",[], this.parent.config.timeout))
            ;
    });
};
/**
 *  Adds a spellcheck attribute to the HTML body tag and sets it to false.
 *  The spellcheck will be disabled only for the current page.
 * @summary Disables spellcheck in the current page.
 * @returns {Eagle.constructor}
 */
Eagle.prototype.disableSpellCheck = function () {
    return new this.constructor(this, function () {
        var disableCommand = 'document.querySelector("body").setAttribute("spellcheck","false");';
        return this.parent.execute(disableCommand);
    });
};
/**
 * Sets a cookie in current web page
 * @param {string} name - name of the cookie
 * @param {string} value - value of the cookie
 * @returns {Eagle.constructor}
 */
Eagle.prototype.setCookie = function (/*string*/name, /*string*/ value){
    return new this.constructor(this, function () {
        var setCookieCmd = 'document.cookie = "' + name + '=' + value + '";';
        return this.parent.execute(setCookieCmd);
    });
};

module.exports = Eagle;

