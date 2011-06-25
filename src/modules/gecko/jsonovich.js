/**
 * @license MPL 1.1/GPL 2.0/LGPL 2.1, see license.txt
 * @author William Elwood <we9@kent.ac.uk>
 * @copyright 2011 JSONovich Team. All Rights Reserved.
 * @description This file contains helper functions specific to Gecko environments.
 *
 * Changelog:
 * [2011-05] - Added require, startup, uninstall and shutdown functions.
 *
 * NOTES:
 * - Assumes 'Services.scriptloader' has already been set up by the relevant
 *   bootstrap script (importing or emulating Services.jsm)
 * - Assumes the ADDON_LNAME constant is defined by the relevant bootstrap script
 * - Assumes the getResourceURI function is defined by the relevant bootstrap script
 */

'use strict';

/**
 * Because this is a simple loader, path is always resolved to:
 *   'modules/' + path + '.js'
 * relative to this addon's installation root.
 * There is also no support for circular dependencies - don't use them...
 *
 * @param path <string>  Path to desired module.
 * @return <object>      The loaded module.
 */
function require(path) {
    let registry = require.registry;
    if(registry == null) { // Initialise the module registry on the first usage
        registry = require.registry = {};
    }

    if(!registry[path]) {
        let scope = {
            require: require
        }; // Load the module into a local scope
        Services.scriptloader.loadSubScript(getResourceURI('modules/' + path + '.js').spec, scope);

        let module;
        if(scope.exports) { // Support CommonJS style
            module = scope.exports;
        } else if(scope.EXPORTED_SYMBOLS && scope.EXPORTED_SYMBOLS.length) { // Support existing .jsm style
            module = {};
            for(let i = 0; i < scope.EXPORTED_SYMBOLS.length; i++) {
                module[scope.EXPORTED_SYMBOLS[i]] = scope[scope.EXPORTED_SYMBOLS[i]];
            }
        } else { // Support plain old JS
            module = scope;
        }

        registry[path] = module; // Save the loaded module for repeated require()s
    }

    return registry[path];
}

function startup() {
    let prefs = require(PLATFORM + '/prefs').branch;

    TS['SetDefaultPrefs'] = [Date.now()];
    require('defaultPrefs').setDefaults(prefs('extensions.' + ADDON_LNAME, true).set);
    TS['SetDefaultPrefs'].push(Date.now());

    let listenPref = prefs('extensions.' + ADDON_LNAME).listen,
    prefUtils = require(PLATFORM + '/prefUtils');

    TS['RegisterConversions'] = [Date.now()];
    prefUtils.registerConversions(listenPref);
    TS['RegisterConversions'].push(Date.now());

    TS['RegisterExtMap'] = [Date.now()];
    prefUtils.registerExtMap(listenPref);
    TS['RegisterExtMap'].push(Date.now());

    // maybe we can add a lower q-value in the future, track https://issues.apache.org/jira/browse/COUCHDB-234
    TS['RegisterAcceptHeader'] = [Date.now()];
    prefUtils.registerAcceptHeader(listenPref, 'acceptHeader.json', 'application/json');
    TS['RegisterAcceptHeader'].push(Date.now());

    TS['InitResource'] = [Date.now()];
    (function setResourceAlias(alias, target) { // set up resource:// URLs
        let proto = Services.io.getProtocolHandler('resource').QueryInterface(Ci.nsIResProtocolHandler);
        proto.setSubstitution(alias, target);
        require('unload').unload(function() {
            proto.setSubstitution(alias, null);
        });
    })(ADDON_LNAME, getResourceURI('resources/')); // trailing slash required inside XPI
    TS['InitResource'].push(Date.now());

    TS['PrepareAsyncLoad'] = [Date.now()];
    let timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
    timer.init({ // async load
        observe: function() {
            listenPref('debug', function(branch, pref) {
                let debug = branch.get(pref, 'boolean');
                let log = require(PLATFORM + '/log');
                log.setDebug(debug);
                if(debug) {
                    let desc = {
                        'Bootstrap': 'time taken to execute bootstrap script',
                        'Startup': 'time between us receiving startup event and leaving event listener during browser startup',
                        'Install': 'time between us receiving startup event and leaving event listener during user-initiated install',
                        'Restart': 'time between us receiving startup event and leaving event listener after user-initiated enable',
                        'StartRequest': 'time spent in the most recent call to the stream converter\'s onStartRequest function',
                        'DataAvailable': 'time spent in the most recent call to the stream converter\'s onDataAvailable function',
                        'ParseJSON': 'time spent parsing the received JSON string into an object',
                        'FormatJSON': 'time spent tokenising the parsed object and generating a string of HTML',
                        'StopRequest': 'time spent in the most recent call to the stream converter\'s onStopRequest function',
                        'SetDefaultPrefs': 'time spent initialising default preferences',
                        'RegisterConversions': 'time taken to register stream converters',
                        'RegisterExtMap': 'time taken to register file extension to type mappings',
                        'RegisterAcceptHeader': 'time taken to set up Accept header',
                        'InitResource': 'time taken to register resource:// URLs',
                        'PrepareAsyncLoad': 'time spent initialising nsiTimer to defer loading non-essentials'
                    };
                    for(let measure in TS) {
                        if(TS[measure].length>1) {
                            log.info(measure + ' Performance: ' + (TS[measure][1]-TS[measure][0]) + 'ms' + (measure in desc ? ' (' + desc[measure] + ')' : ''));
                        }
                    }
                }
            });
            timer = null; // "Users of instances of nsITimer should keep a reference to the timer until it is no longer needed in order to assure the timer is fired."
        }
    }, 500, timer.TYPE_ONE_SHOT);
    TS['PrepareAsyncLoad'].push(Date.now());
}

function uninstall() {
    let prefs = require(PLATFORM + '/prefs').branch;
    prefs('extensions.' + ADDON_LNAME, true).uninstall();
    prefs('extensions.' + ADDON_LNAME + '@' + ADDON_DOMAIN, true).uninstall();
}

function shutdown() {
    require('unload').unload();
}
