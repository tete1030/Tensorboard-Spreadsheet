// ==UserScript==
// @name         Tensorboard Spreadsheet Helper
// @namespace    http://texot.one/
// @version      0.1
// @require      https://code.jquery.com/jquery-latest.js
// @require      https://apis.google.com/js/api.js
// @author       Texot
// @match        http://localhost:8889/*
// @grant        GM_addStyle
// @grant        unsafeWindow
// ==/UserScript==

(function() {
    'use strict';

    const API_KEY = ""; // simply leave this empty
    const CLIENT_ID = "YOUR_CLIENT_ID.apps.googleusercontent.com"; // fill your client id
    const DISCOVERY_DOCS = ["https://sheets.googleapis.com/$discovery/rest?version=v4"];
    const SCOPES = "https://www.googleapis.com/auth/spreadsheets.readonly";
    const SPREADSHEET_ID = "YOUR_SPREADSHEET_ID"; // fill you spreadsheet id
    const REFRESH_RATE = 30;
    const SHEET = "Log"; // sheet name
    // CUSTOMIZE HERE IF YOU WANT TO CHANGE SHEET FORM
    const COL_NAME_L = "A";
    const COL_NAME = 0;
    const COL_TIME = 1;
    const COL_EPOCH = 2;
    const COL_STORE = 3;
    const COL_DESC = 4;
    const MAX_START_TRY = 3;
    var start_try_times = 0;

    function StartTBSpreadsheetHelper(){
        start_try_times += 1;
        var $scalars_dashboard = $("tf-scalar-dashboard#dashboard").eq(0);
        if ($scalars_dashboard.length == 0) {
            if (start_try_times >= MAX_START_TRY) {
                console.error("scalars dashboard not found. stopping retry.");
            } else {
                setTimeout(StartTBSpreadsheetHelper, 1000);
                console.warn("scalars dashboard not found. retrying in 1 second...");
            }
            return;
        }
        var is_new_version = false;
        if ($("tf-multi-checkbox #runs-regex").length > 0) {
            console.warn("Old version detected");
            is_new_version = false;
        } else if ($("tf-multi-checkbox #names-regex").length > 0) {
            console.warn("New version detected");
            is_new_version = true;
        } else {
            console.warn("Unknown version");
        }
        var $sidebar = $scalars_dashboard.find("#sidebar").eq(0);
        var $runs_selector = $sidebar.find("tf-runs-selector").eq(0);
        var $multi_checkbox = $runs_selector.find("#multiCheckbox").eq(0);
        var $runs_title = $runs_selector.find("#top-text h3");
        $runs_title.css("display", "inline");
        var $login_button = $("<button style='display: none; float: right;'>Login</button>").insertAfter($runs_title);
        $login_button.on("click", function() {
            window.gapi.auth2.getAuthInstance().signIn();
        });
        var $logout_button = $("<button style='display: none; float: right;'>Logout</button>").insertAfter($login_button);
        $logout_button.on("click", function() {
            window.gapi.auth2.getAuthInstance().signOut();
        });
        // CUSTOMIZE HERE IF YOU WANT TO CHANGE SHEET FORM
        var $exp_tip = $(
            `<div class="exp-tip">
<div id="exp_name"><span class="exp-title">Name:</span><span class="exp-content">jsdfklsjfs</span></div>
<div id="exp_time"><span class="exp-title">Time:</span><span class="exp-content">salkjdklglasfj</span></div>
<div id="exp_epoch"><span class="exp-title">Epoch:</span><span class="exp-content">saljkfaksgsk</span></div>
<div id="exp_store"><span class="exp-title">Store:</span><span class="exp-content">saljkfaksgsk</span></div>
<div id="exp_desc"><span class="exp-title">Description:</span><span class="exp-content">skjdfsaklgkadhgskfj sjf salkf sklfj aslkfjsalkfjskld fsdlkjfaklsfj sl fkjsfkl sjf</span></div>
</div>`);
        GM_addStyle(`
.exp-tip {
    width: 500px;
    height: auto;
    float: left;
    position: absolute;
    left: 10px;
    top: 10px;
    background-color: #000000dd;
    border-radius: 5px;
    padding: 5px;
    color: white;
    font-size: 15px;
    display: none;
    animation-duration: 1s;
}

.exp-tip span {

}

.exp-tip>div {
    margin-bottom: 3px;
}

.exp-tip>div:last-child {
    margin-bottom: 0;
}

.exp-tip span.exp-title {
    width: 90px;
    text-align: right;
    padding-right: 10px;
    display: inline-block;
    overflow: hidden;
    text-overflow: ellipsis;
    color: #bbbbbb;
    vertical-align: top;
}

.exp-tip span.exp-content {
    width: 400px;
    display: inline-block;
    overflow: hidden;
}

.exp-tip #exp_desc span.exp-content {
    white-space: pre-wrap;
}
`);
        $("body").append($exp_tip);
        unsafeWindow.gapi = window.gapi;
        window.dataRows = null;
        window.formatRows = null;
        window.timeoutId = null;

        window.gapi.load('client:auth2', initClient);

        function initClient() {
            window.gapi.client.init({
                apiKey: API_KEY,
                clientId: CLIENT_ID,
                discoveryDocs: DISCOVERY_DOCS,
                scope: SCOPES
            }).then(function () {
                // Listen for sign-in state changes.
                window.gapi.auth2.getAuthInstance().isSignedIn.listen(updateSigninStatus);

                // Handle the initial sign-in state.
                updateSigninStatus(window.gapi.auth2.getAuthInstance().isSignedIn.get());
            }, function(response) {
                console.error("Error init gapi: " + response.result.error.message);
            });
        }

        function protoToCssColor(rgb_color) {
            var redFrac = rgb_color.red || 0.0;
            var greenFrac = rgb_color.green || 0.0;
            var blueFrac = rgb_color.blue || 0.0;
            var red = Math.floor(redFrac * 255);
            var green = Math.floor(greenFrac * 255);
            var blue = Math.floor(blueFrac * 255);
            return rgbToCssColor(red, green, blue);
        };

        function rgbToCssColor(red, green, blue) {
            var rgbNumber = new Number((red << 16) | (green << 8) | blue);
            var hexString = rgbNumber.toString(16);
            var missingZeros = 6 - hexString.length;
            var resultBuilder = ['#'];
            for (var i = 0; i < missingZeros; i++) {
                resultBuilder.push('0');
            }
            resultBuilder.push(hexString);
            return resultBuilder.join('');
        };

        function RefreshData() {
            if (window.timeoutId !== null) {
                window.clearTimeout(window.timeoutId);
                window.timeoutId = null;
            }
            var now = new Date();
            console.log("[" + now.getHours() + ":" + now.getMinutes() + ":" + now.getSeconds() + "." + now.getMilliseconds() + "] " +
                        "Loading spreadsheet data");
            window.gapi.client.sheets.spreadsheets.values.batchGet({
                spreadsheetId: SPREADSHEET_ID,
                majorDimension: "ROWS",
                ranges: SHEET
            }).then(function(response) {
                // loading data
                var ranges = response.result.valueRanges;
                var exp_runs = {};
                if (ranges.length > 0 && ranges[0].values.length > 0) {
                    var range = ranges[0];
                    for (var i = 1; i < range.values.length; i++) {
                        var row = range.values[i];
                        var exp_name = row[COL_NAME].trim();
                        if (exp_name.length > 0) {
                            exp_runs[exp_name] = row;
                        }
                    }
                    window.dataRows = exp_runs;
                } else {
                    console.error("No data found.");
                    window.dataRows = null;
                }
                // go loading format
                return window.gapi.client.sheets.spreadsheets.get({
                    spreadsheetId: SPREADSHEET_ID,
                    ranges: SHEET + "!" + COL_NAME_L + ":" + COL_NAME_L,
                    includeGridData: true
                });
            }, function(response) {
                console.error("Error loading data: " + response.result.error.message);
                window.dataRows = null;
                RefreshInfo();
                window.timeoutId = window.setTimeout(RefreshData, REFRESH_RATE * 1000);
            }).then(function(response) {
                // loading format
                var data = response.result.sheets[0].data;
                if (data.length > 0) {
                    var formats = {};
                    var range = data[0].rowData;
                    for (var i = 1; i < range.length; i++) {
                        var cell = range[i].values[0];
                        if (typeof cell.formattedValue == "undefined") continue;
                        var cell_name = cell.formattedValue.trim();
                        if (typeof window.dataRows[cell_name] != "undefined") {
                            var forcolor = protoToCssColor(cell.effectiveFormat.textFormat.foregroundColor);
                            if (forcolor != "#000000")
                            {
                                formats[cell_name] = forcolor;
                            }
                        }
                    }
                    window.formatRows = formats;
                } else {
                    console.error("No data found.");
                    window.formatRows = null;
                }
                RefreshInfo();
                window.timeoutId = window.setTimeout(RefreshData, REFRESH_RATE * 1000);
            }, function(response) {
                console.error("Error loading format: " + response.result.error.message);
                window.formatRows = null;
                RefreshInfo();
                window.timeoutId = window.setTimeout(RefreshData, REFRESH_RATE * 1000);
            });
        }

        function updateSigninStatus(isSignedIn) {
            if (isSignedIn) {
                $login_button.css("display", "none");
                $logout_button.css("display", "block");
                RefreshData();
                $multi_checkbox.on("dom-change", RefreshInfo);
            } else {
                $login_button.css("display", "block");
                $logout_button.css("display", "none");
                if (window.timeoutId !== null) {
                    window.clearTimeout(window.timeoutId);
                    window.timeoutId = null;
                }
                $multi_checkbox.off("dom-change", RefreshInfo);
            }
        }

        function showTip(run) {
            var exp_name = $(run).find(".item-label-container span").eq(0).text();
            console.log(exp_name);
            var exp_name_comps = exp_name.split("/");
            if (exp_name_comps.length < 2) return;
            var exp_run = exp_name_comps[1];
            var row = window.dataRows[exp_run];
            if (typeof row == "undefined") return;
            // CUSTOMIZE HERE IF YOU WANT TO CHANGE SHEET FORM
            $exp_tip.children("#exp_name").children(".exp-content").text(exp_run);
            $exp_tip.children("#exp_time").children(".exp-content").text(row[COL_TIME]);
            $exp_tip.children("#exp_epoch").children(".exp-content").text(row[COL_EPOCH]);
            $exp_tip.children("#exp_store").children(".exp-content").text(row[COL_STORE]);
            $exp_tip.children("#exp_desc").children(".exp-content").text(row[COL_DESC]);
            if (typeof window.formatRows[exp_run] != "undefined") {
                $exp_tip.children("#exp_name").children(".exp-content").css("color", window.formatRows[exp_run]);
            } else {
                $exp_tip.children("#exp_name").children(".exp-content").css("color", "");
            }
            $exp_tip.show();
        }

        function hideTip(run) {
            $exp_tip.hide();
        }

        var tip_loc = "edge";

        function moveTip(clientX, clientY) {
            if (clientY < $(window).height() / 2) {
                if (tip_loc == "side") return;
                tip_loc = "side";

                if ($exp_tip.css("display") === "none") {
                    $exp_tip.css("left", ($sidebar.width() + 10) + "px");
                } else {
                    $exp_tip.animate({
                        left: ($sidebar.width() + 10) + "px"
                    }, 200);
                }
            } else {
                if (tip_loc == "edge") return;
                tip_loc = "edge";

                if ($exp_tip.css("display") === "none") {
                    $exp_tip.css("left", "10px");
                } else {
                    $exp_tip.animate({
                        left: "10px"
                    }, 200);
                }
            }
        }

        function RefreshInfo() {
            var $runs = $multi_checkbox.find("#outer-container div." + (!is_new_version?"run-row":"name-row"));
            var $runs_title = $runs.find(".item-label-container span");
            var exp_runs = [];
            if (window.dataRows !== null) {
                exp_runs = Object.getOwnPropertyNames(window.dataRows);
            }
            $runs.off(".showtip");
            $runs.on("mouseenter.showtip", function(e) {
                showTip(e.currentTarget);
            });
            $runs.on("mouseleave.showtip", function(e) {
                hideTip(e.currentTarget);
            });
            $runs.on("mouseover.showtip", function(e) {
                moveTip(e.clientX, e.clientY);
            });
            $runs_title.each(function (i, e) {
                var exp_name_comps = e.innerText.split("/");
                var exp_run = exp_name_comps[1];
                if (window.dataRows !== null && (exp_name_comps.length < 2 || exp_runs.indexOf(exp_run) == -1)) {
                    $(e).css("color", "#af0404");
                } else {
                    if (window.formatRows !== null &&  typeof window.formatRows[exp_run] != "undefined") {
                        $(e).css("color", window.formatRows[exp_run]);
                    } else {
                        $(e).css("color", "");
                    }
                }
            });
        }
    }

    document.addEventListener('WebComponentsReady', StartTBSpreadsheetHelper);

})();