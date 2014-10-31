/*jshint node: true */
/*!
 * Expressjs | Connect - directory
 * Copyright(c) 2011 Sencha Inc.
 * Copyright(c) 2011 TJ Holowaychuk
 * Copyright(c) 2014 Douglas Christopher Wilson
 * MIT Licensed
 */
/**
 * Module dependencies.
 */

var http = require('http'),
    fs = require('fs'),
    parse = require('url').parse,
    path = require('path'),
    Q = require('q'),
    normalize = path.normalize,
    sep = path.sep,
    extname = path.extname,
    icons,
    join = path.join,
    Batch = require('batch'),
    Negotiator = require('negotiator');

// cache:
//      Icon cache.
var cache = {};

// defaultTemplate:
//      Default template.
var defaultTemplate = join(__dirname, 'public', 'directory.html');

// defaultStylesheet:
//      Stylesheet.
var defaultStylesheet = join(__dirname, 'public', 'style.css');

// mediaTypes:
//      Media types and the map for content negotiation.
var mediaTypes = [
    'text/html',
    'text/plain',
    'application/json'
];

var mediaType = {
    'text/html': 'html',
    'text/plain': 'plain',
    'application/json': 'json'
};

function createError(/*int*/ code,/*String?*/ msg) {
    // summary:
    //      Generate an `Error` from the given status `code` and optional `msg`.
    // code:
    //      Error code
    // msg:
    //      Error message
    //returns:
    //      Error Object
    // tags:
    //      private
    var err = new Error(msg || http.STATUS_CODES[code]);
    err.status = code;
    return err;
}

function fileSort(a, b) {
    // summary:
    //      Sort function for with directories first.
    return Number(b.stat && b.stat.isDirectory()) - Number(a.stat && a.stat.isDirectory()) ||
        String(a.name).toLocaleLowerCase().localeCompare(String(b.name).toLocaleLowerCase());
}

function htmlPath(dir) {
    // summary:
    //      Map html `dir`, returning a linked path.
    var curr = [];
    return dir.split('/').map(function(part){
        curr.push(encodeURIComponent(part));
        return part ? '<a href="' + curr.join('/') + '">' + part + '</a>' : '';
    }).join(' / ');
}

function load(/*String*/ icon) {
    // summary:
    //      Load and cache the given `icon`.
    // tags:
    //      private
    if (cache[icon]) {
        return cache[icon];
    }
    /*jshint -W093 */
    return cache[icon] = fs.readFileSync(__dirname + '/public/icons/' + icon, 'base64');
}

function isDirectory(file) {
    // summary:
    //      Tests if the file is a directory
    return '..' === file.name || (file.stat && file.stat.isDirectory());
}

function iconStyle (files, useIcons) {
    // summary:
    //      Load icon images, return css string.
    if (!useIcons) {
        return '';
    }
    var className,
        ext,
        file,
        i,
        icon,
        isDir,
        list = [],
        rules = {},
        selector,
        selectors = {},
        style = '';

    for (i = 0; i < files.length; i++) {
        file = files[i];

        isDir = isDirectory(file);
        icon = isDir ? icons.folder : icons[extname(file.name)] || icons.default;

        ext = extname(file.name);
        className = 'icon-' + (isDir ? 'directory' : (icons[ext] ? ext.substring(1) : 'default'));
        selector = '#files .' + className + ' .name';

        if (!rules[icon]) {
            rules[icon] = 'background-image: url(data:image/png;base64,' + load(icon) + ');';
            selectors[icon] = [];
            list.push(icon);
        }

        if (!~selectors[icon].indexOf(selector)) {
            selectors[icon].push(selector);
        }
    }

    for (i = 0; i < list.length; i++) {
        icon = list[i];
        style += selectors[icon].join(',\n') + ' {\n  ' + rules[icon] + '\n}\n';
    }

    return style;
}

function normalizeSlashes(/*String*/ path) {
    // summary:
    //      Normalizes the path separator from system separator to URL separator, aka `/`.
    // tags:
    //      private
    return path.split(sep).join('/');
}

function removeHidden(/*Array*/ files) {
    // summary:
    //      Filter "hidden" `files`, aka files beginning with a `.`.
    // tags:
    //      private
    return files.filter(function(file){
        return '.' !== file[0];
    });
}

function stat(dir, files, cb) {
    // summary:
    //      Stat all files and return array of stat in same order.
    var batch = new Batch();

    batch.concurrency(10);

    files.forEach(function(file){
        batch.push(function(done){
            fs.stat(join(dir, file), done);
        });
    });

    batch.end(cb);
}

function createFileLink(dir, file, suffix) {
    // summary:
    //      Creates a span depending on existence of file
    var deferred = Q.defer(),
        suff = '-' + suffix.toUpperCase();
    file = file.replace('-REF', suff);

    stat(dir, [file], function(err){
        if(!err) {
            deferred.resolve('<span class="link"  onclick="window.location.href=window.location.pathname+\'/'+file+'\';return false;">'+suffix+'</span>');
        } else {
            deferred.resolve('<span class="link disabled"  onclick="window.location.href=window.location.pathname+\'/'+file+'\';return false;">'+suffix+'</span>');
        }
    });
    return deferred.promise;
}

function getFileDate(/*Object*/ file) {
    // summary:
    //      gets date of the specified file
    return file.name === '..' ? '' : file.stat.mtime.toDateString() + ' ' + file.stat.mtime.toLocaleTimeString();
}
function createLi(dir, file, useIcons) {
    // summary:
    //      create a htlm li containing iformations about file
    var classes = [],
        date,
        def = Q.defer(),
        ext,
        id,
        isDir = '..' === file.name || (file.stat && file.stat.isDirectory()),
        linkBase = "",
        fileDir,
        size,
        path = dir.split('/').map(function (c) { return encodeURIComponent(c); });

    if (useIcons) {
        ext = extname(file.name);
        ext = isDir ? '.directory' : (icons[ext] ? ext : '.default');
        classes.push('icon');
        classes.push('icon-' + ext.substring(1));
    }

    path.push(encodeURIComponent(file.name));

    date = getFileDate(file);
    size = isDir ? '' : file.stat.size;
    id = file.name === '..' ? '_DIR_' : file.name;

    Q.when((function() {
        if( file.name.indexOf('-REF') > -1)  {
            linkBase = file.name.split('-REF')[0];
            fileDir = normalizeSlashes(normalize(path.join('/'))).split(file.name)[0].substring(1);

            return Q.all([
                    createFileLink(fileDir,file.name,'diff'),
                    createFileLink(fileDir,file.name,'last')]
                ).then(function(tab) {
                    return tab.join('');
                });
        } else {
            return '<span class="link"></span><span class="link"></span>';
        }
    })(), function(links) {
        if(size === "" ||  file.name.indexOf('-REF') > -1){
            def.resolve('<li><a href="' +
                normalizeSlashes(normalize(path.join('/'))) +
                '" class="' +
                classes.join(' ') + '"' +
                ' title="' + file.name + '">' +
                '<span class="name">'+file.name+'</span>' +
                links +
                '<span class="size">'+size+'</span>' +
                '<span class="date">'+date+'</span>' +
                '<span id="add'+id+'" class="btn" onClick="addToSvn(window.location.pathname,\''+file.name+'\');return false;">Add to SVN</span>' +
                '<span id="del'+id+'" class="redbtn disabled" onClick="delFromSvn(window.location.pathname,\''+file.name+'\');return false;">Delete on SVN</span>' +
                '</a></li>');
        } else {
            def.resolve(null);
        }
    });

    return def.promise;
}

function html(files, dir, useIcons, view) {
    // summary:
    //      Map html `files`, returning an html unordered list.

    var tpl = '<ul id="files" class="view-'+view+'">' +
            (view === 'details' ? (
                '<li class="header">' +
                    '<span class="name">Name</span>' +
                    '<span class="links">Links</span>' +
                    '<span class="size">Size</span>' +
                    '<span class="date">Modified</span>' +
                    '<span class="action">Actions</span>' +
                    '</li>') : ''),
        defs = [];

    files.forEach(function(file) {
        defs.push(createLi(dir, file, useIcons));
    });

    return Q.all(defs).then(function(liTab) {
        return tpl + liTab.join('\n') + '</ul>';
    });

//    files.map(function(file) {//TODO ?
}

/**
 * Serve directory listings with the given `root` path.
 *
 * See Readme.md for documentation of options.
 *
 * @param {String} path
 * @param {Object} options
 * @return {Function} middleware
 * @api public
 */

exports = module.exports = function directory(rootAcces, options){
    options = options || {};

    // root required
    if (!rootAcces) {
        throw new Error('directory() root path required');
    }
    var hidden = options.hidden,
        icons = options.icons,
        view = options.view || 'tiles',
        filter = options.filter,
        root = normalize(rootAcces + sep),
        template = options.template || defaultTemplate,
        stylesheet = options.stylesheet || defaultStylesheet;

    return function directory(req, res, next) {
        if ('GET' !== req.method && 'HEAD' !== req.method) {return next()}

        var url = parse(req.url),
            dir = decodeURIComponent(url.pathname),
            path = normalize(join(root, dir)),
            originalUrl = parse(req.originalUrl),
            originalDir = decodeURIComponent(originalUrl.pathname),
            showUp = path !== root;

        // null byte(s), bad request
        if (~path.indexOf('\0')) {return next(createError(400));}

        // malicious path, forbidden
        if (0 !== path.indexOf(root)) {return next(createError(403));}

        // check if we have a directory
        fs.stat(path, function(err, stat){
            if (err) {
                return 'ENOENT' === err.code ? next() : next(err);
            }

            if (!stat.isDirectory()) {return next();}

            // fetch files
            fs.readdir(path, function(err, files){
                if (err) {
                    return next(err);
                }
                if (!hidden) {
                    files = removeHidden(files);
                }
                if (filter) {
                    files = files.filter(filter);
                }
                files.sort();

                // content-negotiation
                var type = new Negotiator(req).preferredMediaType(mediaTypes);

                // not acceptable
                if (!type) {
                    return next(createError(406));
                }
                exports[mediaType[type]](req, res, files, next, originalDir, showUp, icons, path, view, template, stylesheet);
            });
        });
    };
};

/**
 * Respond with text/html.
 */

exports.html = function(req, res, files, next, dir, showUp, icons, path, view, template, stylesheet){
    fs.readFile(template, 'utf8', function(err, str){
        if (err) {
            return next(err);
        }
        return fs.readFile(stylesheet, 'utf8', function(err, style){
            if (err) {
                return next(err);
            }
            return stat(path, files, function(err, stats){
                if (err) {
                    return next(err);
                }
                files = files.map(function(file, i){ return { name: file, stat: stats[i] }; });
                files.sort(fileSort);
                if (showUp) {
                    files.unshift({ name: '..' });
                }
                return html(files, dir, icons, view).then(function(tpl){
                    str = str
                        .replace('{style}', style.concat(iconStyle(files, icons)))
                        .replace('{directory}', dir)
                        .replace('{linked-path}', htmlPath(dir))
                        .replace('{files}', tpl);
                    res.setHeader('Content-Type', 'text/html');
                    res.setHeader('Content-Length', str.length);
                    res.end(str);
                });
            });
        });
    });
};

/**
 * Respond with application/json.
 */

exports.json = function(req, res, files){
    files = JSON.stringify(files);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Length', files.length);
    res.end(files);
};

/**
 * Respond with text/plain.
 */

exports.plain = function(req, res, files){
    files = files.join('\n') + '\n';
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Length', files.length);
    res.end(files);
};


/**
 * Icon map.
 */

icons = {
    '.js': 'page_white_code_red.png',
    '.json': 'page_white_code.png',
    '.c': 'page_white_c.png',
    '.h': 'page_white_h.png',
    '.cc': 'page_white_cplusplus.png',
    '.php': 'page_white_php.png',
    '.rb': 'page_white_ruby.png',
    '.erb': 'page_white_ruby.png',
    '.cpp': 'page_white_cplusplus.png',
    '.as': 'page_white_actionscript.png',
    '.cfm': 'page_white_coldfusion.png',
    '.cs': 'page_white_csharp.png',
    '.java': 'page_white_cup.png',
    '.jsp': 'page_white_cup.png',
    '.dll': 'page_white_gear.png',
    '.ini': 'page_white_gear.png',
    '.asp': 'page_white_code.png',
    '.aspx': 'page_white_code.png',
    '.clj': 'page_white_code.png',
    '.css': 'page_white_code.png',
    '.sass': 'page_white_code.png',
    '.scss': 'page_white_code.png',
    '.less': 'page_white_code.png',
    '.htm': 'page_white_code.png',
    '.html': 'page_white_code.png',
    '.xhtml': 'page_white_code.png',
    '.lua': 'page_white_code.png',
    '.m': 'page_white_code.png',
    '.pl': 'page_white_code.png',
    '.py': 'page_white_code.png',
    '.vb': 'page_white_code.png',
    '.vbs': 'page_white_code.png',
    '.xml': 'page_white_code.png',
    '.yaws': 'page_white_code.png',
    '.map': 'map.png',

    '.app': 'application_xp.png',
    '.exe': 'application_xp.png',
    '.bat': 'application_xp_terminal.png',
    '.cgi': 'application_xp_terminal.png',
    '.sh': 'application_xp_terminal.png',

    '.avi': 'film.png',
    '.flv': 'film.png',
    '.mv4': 'film.png',
    '.mov': 'film.png',
    '.mp4': 'film.png',
    '.mpeg': 'film.png',
    '.mpg': 'film.png',
    '.ogv': 'film.png',
    '.rm': 'film.png',
    '.webm': 'film.png',
    '.wmv': 'film.png',
    '.fnt': 'font.png',
    '.otf': 'font.png',
    '.ttf': 'font.png',
    '.woff': 'font.png',
    '.bmp': 'image.png',
    '.gif': 'image.png',
    '.ico': 'image.png',
    '.jpeg': 'image.png',
    '.jpg': 'image.png',
    '.png': 'image.png',
    '.psd': 'page_white_picture.png',
    '.xcf': 'page_white_picture.png',
    '.pdf': 'page_white_acrobat.png',
    '.swf': 'page_white_flash.png',
    '.ai': 'page_white_vector.png',
    '.eps': 'page_white_vector.png',
    '.ps': 'page_white_vector.png',
    '.svg': 'page_white_vector.png',

    '.ods': 'page_white_excel.png',
    '.xls': 'page_white_excel.png',
    '.xlsx': 'page_white_excel.png',
    '.odp': 'page_white_powerpoint.png',
    '.ppt': 'page_white_powerpoint.png',
    '.pptx': 'page_white_powerpoint.png',
    '.md': 'page_white_text.png',
    '.srt': 'page_white_text.png',
    '.txt': 'page_white_text.png',
    '.doc': 'page_white_word.png',
    '.docx': 'page_white_word.png',
    '.odt': 'page_white_word.png',
    '.rtf': 'page_white_word.png',

    '.dmg': 'drive.png',
    '.iso': 'cd.png',
    '.7z': 'box.png',
    '.apk': 'box.png',
    '.bz2': 'box.png',
    '.cab': 'box.png',
    '.deb': 'box.png',
    '.gz': 'box.png',
    '.jar': 'box.png',
    '.lz': 'box.png',
    '.lzma': 'box.png',
    '.msi': 'box.png',
    '.pkg': 'box.png',
    '.rar': 'box.png',
    '.rpm': 'box.png',
    '.tar': 'box.png',
    '.tbz2': 'box.png',
    '.tgz': 'box.png',
    '.tlz': 'box.png',
    '.xz': 'box.png',
    '.zip': 'box.png',

    '.accdb': 'page_white_database.png',
    '.db': 'page_white_database.png',
    '.dbf': 'page_white_database.png',
    '.mdb': 'page_white_database.png',
    '.pdb': 'page_white_database.png',
    '.sql': 'page_white_database.png',

    '.gam': 'controller.png',
    '.rom': 'controller.png',
    '.sav': 'controller.png',

    'folder': 'folder.png',
    'default': 'page_white.png'
};