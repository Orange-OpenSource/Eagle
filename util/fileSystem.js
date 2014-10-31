var fs = require('node-fs'); /* node-fs allows recursive mkdir */
module.exports = {
    mkdirIfNotExists : function(/*String*/ dirPath) {
        //	summary:
        //		Creates a new directory if it doesn't exist
        //  description:
        //      Creates a directory and its parents recursively if it doesn't exist
        //	dirPath
        //		path of the directory to test
        fs.mkdir(dirPath,'0777',true, function(err){
            if(err && err.code !== "EEXIST") {
                throw new Error(err);
            }
        });
    },
    doesFileExists : function(/*String*/ filePath) {
        //	summary:
        //		Tests if the given path correspond to a file
        //	filePath
        //		path of the file to test
        // returns: Boolean
        /*TODO: convert in async method */
        if(fs.existsSync(filePath)) {
            return fs.statSync(filePath).isFile();
        } else {
            return false;
        }
    }
};
