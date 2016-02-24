var fs = require('fs')
var path = require('path')

function statTarget (target) {
    return new Promise(function (resolve, reject) {
        fs.stat(target, function (err, stat) {
            if (err) return reject(err)
            resolve(stat)
        })
    })
}

function mkdir (newPath) {
    return new Promise(function (resolve, reject) {
        fs.mkdir(newPath, function (err) {
            if (err) return reject(err)
            resolve()
        })
    })
}

function symlinkTarget (target, dest) {
    return new Promise(function (resolve, reject) {
        fs.symlink(target, dest, null, function (err, results) {
            if (err) return reject(err)
            resolve(results)
        })
    })
}

function checkForBin (targetModulePath, destModulePath) {
    var targetModulePkgPath = path.resolve(targetModulePath, './package.json')
    return new Promise(function (resolve, reject) {
        statTarget(targetModulePkgPath)
            .then(function (stat) {
                if (!stat.isFile()) {
                    return reject(new Error('could not find modules package.json'))
                }
                return Promise.resolve(require(targetModulePkgPath))
            })
            .then(function (pkg) {
                if (typeof pkg.bin === 'object') {
                    var promises = Object.keys(pkg.bin).map(function (binName) {
                        return setupBin(
                            destModulePath,
                            binName,
                            path.resolve(targetModulePath, pkg.bin[binName])
                        )
                    })
                    Promise.all(promises)
                        .then(function () {
                            resolve()
                        })
                        .catch(function () {
                            reject()
                        })
                    return
                }
                resolve()
            })
            .catch(function (err) {
                reject(err)
            })
    })

}

function setupBin (targetModulesPath, binName, binFile) {
    // node_module/.bin/{bin.key} -> node_module/{module.name}/{bin.value}
    return new Promise(function (resolve, reject) {
        var binPath = path.resolve(targetModulesPath, './.bin')
        statTarget(binPath)
            .then(function (stat) {
                return Promise.resolve()
            }, function() {
                return mkdir(binPath)
            })
            .then(function () {
                return symlinkTarget(binFile, path.resolve(binPath, './' + binName))
            }, function () {
                return symlinkTarget(binFile, path.resolve(binPath, './' + binName))
            })
            .then(function () {
                resolve()
            }, function () {
                reject()
            })
    })

}

function writeFile (filePath, content) {
    return new Promise(function (resolve, reject) {
        fs.writeFile(filePath, content, function (err) {
            if (err) return reject(err)
            resolve()
        })
    })
}

function start (moduleName, targetPath, callback) {
    var stealableVersion;
    var targetPkgPath = path.resolve(process.cwd(), targetPath, './package.json')
    var targetModulePath = path.resolve(process.cwd(), targetPath, './node_modules/', moduleName)
    var destPkgPath = path.resolve(process.cwd(), './package.json')
    var destModulePath = path.resolve(process.cwd(), './node_modules/')

    statTarget(targetPkgPath)
        .then(function (stat) {
            if (!stat.isFile()) {
                return Promise.reject(new Error('could not read targets package.json'))
            }
            return Promise.resolve(require(targetPkgPath))
        })
        .then(function (pkg) {
            var isInDeps = !!(pkg.dependencies || {})[moduleName]
            var isInDevDeps = !!(pkg.devDependencies || {})[moduleName]

            if (isInDeps) {
                stealableVersion = pkg.dependencies[moduleName]
            }
            if (isInDevDeps) {
                stealableVersion = pkg.devDependencies[moduleName]
            }
            if (!stealableVersion) {
                return Promise.reject(new Error('could not find a version of ' + moduleName + ' to steal'))
            }
            return statTarget(targetModulePath)
        })
        .then(function (stat) {
            if (!stat.isDirectory()) {
                return Promise.reject(new Error('could not copy directory because target module is not a directory'))
            }
            // testing to see if cwd has node_modules
            return statTarget(destModulePath)
        })
        .then (function (stat) {
            if (!stat.isDirectory()) {
                return Promise.reject(new Error('could not copy directory because cwd node_modules is not a directory'))
            }
            return statTarget(destPkgPath)
        })
        .then (function (stat) {
            if (!stat.isFile()) {
                return Promise.reject(new Error('current destination does not have a package.json'))
            }
            return symlinkTarget(targetModulePath, path.resolve(destModulePath, './' ,moduleName))
        })
        .then (function () {
            return checkForBin(targetModulePath, destModulePath)
        })
        .then(function () {
            var pkg = require(destPkgPath)
            if (typeof pkg.dependencies === 'undefined') {
                pkg.dependencies = {}
            }
            pkg.dependencies[moduleName] = stealableVersion
            return writeFile(destPkgPath, JSON.stringify(pkg, null, '  '))
        })
        .then(function () {
            callback(null, {
                name: moduleName,
                version: stealableVersion
            })
        })
        .catch(function (err) {
            callback(err)
        })
}

module.exports = {
    start: start
}
