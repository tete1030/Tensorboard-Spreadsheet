// ==UserScript==
// @name         Tensorboard Spreadsheet Helper
// @namespace    http://texot.one/
// @version      0.4
// @require      https://code.jquery.com/jquery-latest.js
// @require      https://code.jquery.com/ui/1.12.1/jquery-ui.min.js
// @require      https://apis.google.com/js/api.js
// @author       Texot
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        unsafeWindow
// ==/UserScript==

(function() {
    'use strict';

    const STORAGE_SIDEBAR_MAX_WIDTH = "texot.tfrunhelper.sbmaxwid";
    const STORAGE_SIDEBAR_MIN_WIDTH = "texot.tfrunhelper.sbminwid";
    const STORAGE_SIDEBAR_WIDTH = "texot.tfrunhelper.sbwid";
    const STORAGE_OPTIONS_VIS = "texot.tfrunhelper.options_vis";
    const DISCOVERY_DOCS = ["https://sheets.googleapis.com/$discovery/rest?version=v4"];
    const SCOPES = "https://www.googleapis.com/auth/spreadsheets.readonly";

    const REFRESH_RATE = 30;

    const COL_INDEX = 0;

    const MAX_START_TRY = 3;
    var start_try_times = 0;

    var client_id = GM_getValue("CLIENT_ID", null);
    var spreadsheet_id = GM_getValue("SPREADSHEET_ID", null);
    var avail_sheets = GM_getValue("SHEETS", []).filter((val) => (val != null && val.trim() != ""));

    Object.fromEntries = arr =>
        Object.assign({}, ...Array.from(arr, ([k, v]) => ({[k]: v}) ));

    function getColumnLetter(column) {
        const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        var n = parseInt(column+1);
        var s = "", c = null;
        while (n > 0) {
            c = ((n - 1) % 26);
            s = LETTERS[c] + s;
            n = parseInt((n - c) / 26);
        }
        return s;
    }

    function protoToCssColor(rgb_color) {
        if (rgb_color == null) return null;
        var redFrac = rgb_color.red;
        var greenFrac = rgb_color.green;
        var blueFrac = rgb_color.blue;
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

    function initClient(updateCallback) {
        return window.gapi.load('client:auth2', function () {
            window.gapi.client.init({
                apiKey: "",
                clientId: client_id,
                discoveryDocs: DISCOVERY_DOCS,
                scope: SCOPES
            }).then(function () {
                // Listen for sign-in state changes.
                window.gapi.auth2.getAuthInstance().isSignedIn.listen(updateCallback);

                // Handle the initial sign-in state.
                updateCallback(window.gapi.auth2.getAuthInstance().isSignedIn.get());
            }, function(response) {
                if (response != null)
                    console.error("Error init gapi: " + response);
                else
                    console.error("Error init gapi: null response");
            });
        });
    }

    function loadFieldNames(sheet_name) {
        return window.gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: spreadsheet_id,
            range: `${sheet_name}!1:1`
        })
        .then(function(response) {
            return response.result.values[0];
        });
    }

    function loadData(sheet_name) {
        var now = new Date();
        console.log("[" + now.getHours() + ":" + now.getMinutes() + ":" + now.getSeconds() + "." + now.getMilliseconds() + "] " +
                    "Loading spreadsheet data");
        return new Promise(function (resolve, reject) {
            var dataRows = null;
            var formatRows = null;
            window.gapi.client.sheets.spreadsheets.values.get({
                spreadsheetId: spreadsheet_id,
                range: sheet_name
            })
            .then(function(response) {
                // loading data
                var range_data = response.result;
                var exp_runs = {};
                for (var i = 1; i < range_data.values.length; i++) {
                    var row = range_data.values[i];
                    var exp_index = row[COL_INDEX] == null ? null : row[COL_INDEX].trim();
                    if (exp_index != null && exp_index.length > 0) {
                        exp_runs[exp_index] = {sheet: sheet_name, data: row};
                    }
                }
                dataRows = exp_runs;

                // go loading format
                return window.gapi.client.sheets.spreadsheets.get({
                    spreadsheetId: spreadsheet_id,
                    ranges: `${sheet_name}`,
                    includeGridData: true
                });
            })
            .catch(function(response) {
                if (response != null)
                    console.error("Error loading data: " + response);
                else
                    console.error("Error loading data: null response");
                dataRows = null;
                return Promise.reject(null);
            })
            .then(function(response) {
                // loading format
                var data = response.result.sheets[0].data;
                if (data.length > 0) {
                    var formats = {};
                    var range_data = data[0].rowData;
                    for (var i = 1; i < range_data.length; i++) {
                        var index_cell = range_data[i].values[0];
                        if (typeof index_cell.formattedValue == "undefined") continue;
                        var index_cell_name = index_cell.formattedValue.trim();
                        if (typeof dataRows[index_cell_name] == "undefined") continue;
                        formats[index_cell_name] = [];
                        for (var j = 0; j < range_data[i].values.length; j++) {
                            var cell = range_data[i].values[j];
                            var forcolor = null, backcolor = null;
                            if (typeof cell.effectiveFormat != "undefined") {
                                forcolor = protoToCssColor(cell.effectiveFormat.textFormat.foregroundColor);
                                backcolor = protoToCssColor(cell.effectiveFormat.backgroundColor);
                            }
                            if (forcolor == "#000000" && backcolor == "#ffffff") {
                                forcolor = null;
                                backcolor = null;
                            }
                            formats[index_cell_name].push([forcolor, backcolor]);
                        }
                    }
                    formatRows = formats;
                } else {
                    console.error("No data found.");
                    formatRows = null;
                }
            })
            .catch(function(response) {
                if (response != null)
                    console.error("Error loading format: " + response);
                else
                    console.error("Error loading format: null response");
                formatRows = null;
            })
            .then(function () {
                resolve({d: dataRows, f: formatRows});
            });
        });
    }

    function loadAllFieldNames() {
        var promises = [];
        var fieldNames = {};
        for (var isheet = 0; isheet < avail_sheets.length; isheet++) {
            var sheet_name = avail_sheets[isheet];
            promises.push(loadFieldNames(sheet_name));
        }
        return Promise.all(promises).then((values) => {return Object.fromEntries(values.map((value, index) => [avail_sheets[index], value]));});
    }

    function loadAllData() {
        var promises = [];
        var dataRows = {}, formatRows = {};
        for (var isheet = 0; isheet < avail_sheets.length; isheet++) {
            var sheet_name = avail_sheets[isheet];
            promises.push(loadData(sheet_name).then((val) => {
                if (val.d != null) Object.assign(dataRows, val.d);
                if (val.f != null) Object.assign(formatRows, val.f);
            }));
        }
        return Promise.all(promises).then(() => {return {dataRows: dataRows, formatRows: formatRows};});
    }

    function startTBSpreadsheetHelper(){
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
    display: table;
    animation-duration: 1s;
}

.exp-tip>div {
    display: table-row;
}

.exp-tip span.exp-title {
    width: auto;
    text-align: right;
    padding-right: 10px;
    display: table-cell;
    overflow: hidden;
    text-overflow: ellipsis;
    color: #bbbbbb;
    vertical-align: top;
    white-space: nowrap;
}

.exp-tip span.exp-content {
    width: 100%;
    display: table-cell;
    overflow: hidden;
    white-space: pre-wrap;
    padding-bottom: 3px;
}

.exp-tip > div:last-child > span.exp-content {
    padding-bottom: 0;
}
`);
        var $exp_tip = $('<div class="exp-tip"></div>').hide();
        $("body").append($exp_tip);
        unsafeWindow.gapi = window.gapi;
        var dataRows = null;
        var formatRows = null;
        var fieldNames = null;
        var timeoutId = null;
        var elements = null;

        function clearUpdateSchedule() {
            if (timeoutId !== null) {
                window.clearTimeout(timeoutId);
                timeoutId = null;
            }
        }

        function setUpdateSchedule(immediate) {
            function update() {
                clearUpdateSchedule();
                loadAllData().then((value) => {
                    dataRows = value.dataRows;
                    formatRows = value.formatRows;
                    updateElements();
                    setUpdateSchedule(false);});
            }
            if (immediate) update();
            else timeoutId = window.setTimeout(update, REFRESH_RATE * 1000);
        }

        function startLoading() {
            clearUpdateSchedule();
            loadAllFieldNames().then((fnames) => {
                fieldNames = fnames;
                setUpdateSchedule(true);
            });
        }

        function updateSigninStatus(isSignedIn) {
            if (isSignedIn) {
                elements.$login_button.css("display", "none");
                elements.$logout_button.css("display", "block");
                elements.$sheet_set_button.css("display", "block");
                startLoading();
                elements.$multi_checkbox.on("dom-change", updateElements);
            } else {
                elements.$login_button.css("display", "block");
                elements.$logout_button.css("display", "none");
                elements.$sheet_set_button.css("display", "none");
                clearUpdateSchedule();
                elements.$multi_checkbox.off("dom-change", updateElements);
            }
        }

        function showTip(run) {
            var exp_run = $(run).find(".item-label-container span").eq(0).text();
            $exp_tip.children().remove();
            var row = dataRows[exp_run];
            var format = formatRows[exp_run];
            if (typeof row == "undefined") return;
            var fields = fieldNames[row.sheet];
            if (typeof fields == "undefined") return;
            for (var fn = 0; fn < fields.length; fn++) {
                var $row_ele = $(`<div><span class="exp-title">${fields[fn]}:</span><span class="exp-content">${typeof row.data[fn] == "undefined" ? "" : row.data[fn]}</span></div>`).appendTo($exp_tip);
                if (typeof format == "undefined") continue;
                var forcolor = format[fn][0];
                var backcolor = format[fn][1];
                if (forcolor != null) {
                    $row_ele.children(".exp-content").css("color", forcolor);
                }
                if (backcolor != null) {
                    $row_ele.children(".exp-content").css("background-color", backcolor);
                }
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
                    $exp_tip.css("left", (elements.$sidebar.width() + 10) + "px");
                } else {
                    $exp_tip.animate({
                        left: (elements.$sidebar.width() + 10) + "px"
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

        function updateElements() {
            var $runs = elements.$multi_checkbox.find("#outer-container div." + (!elements.is_new_version?"run-row":"name-row"));
            var $runs_title = $runs.find(".item-label-container span");
            var exp_runs = [];
            if (dataRows !== null) {
                exp_runs = Object.getOwnPropertyNames(dataRows);
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
                var exp_run = e.innerText;
                var forcolor = "", backcolor = "";
                if (dataRows !== null && !dataRows.hasOwnProperty(exp_run)) {
                    forcolor = "#af0404";
                } else if (formatRows !== null && typeof formatRows[exp_run] != "undefined") {
                    var colors = formatRows[exp_run][COL_INDEX];
                    if (colors[0] != null) forcolor = colors[0];
                    if (colors[1] != null) backcolor = colors[1];
                }
                $(e).css("color", forcolor);
                $(e).css("background-color", backcolor);
            });
        }

        function setupSiderbarController($dashboard) {
            let $sections_container = $dashboard.find("#sidebar").eq(0);
            $sections_container.css("position", "relative");

            // Make siderbar resizable
            $('<link rel="stylesheet" type="text/css" href="http://code.jquery.com/ui/1.9.2/themes/base/jquery-ui.css"/>').appendTo(document.head);
            $sections_container
                .css("max-width", tf_storage.getString(STORAGE_SIDEBAR_MAX_WIDTH) || "")
                .css("min-width", tf_storage.getString(STORAGE_SIDEBAR_MIN_WIDTH) || "")
                .css("width", tf_storage.getString(STORAGE_SIDEBAR_WIDTH) || "")
                .resizable({
                handles: "w,e",
                resize: function (event, ui) {
                    if (ui.size.width >= 20) {
                        ui.element.css("max-width", "unset");
                        ui.element.css("min-width", "unset");
                        if (is_new_version) {
                            ui.element.css("flex-basis", ui.size.width + "px");
                        }
                    }
                },
                stop: function (event, ui) {
                    if (ui.size.width >= 20) {
                        tf_storage.setString(STORAGE_SIDEBAR_MAX_WIDTH, "unset");
                        tf_storage.setString(STORAGE_SIDEBAR_MIN_WIDTH, "unset");
                        tf_storage.setString(STORAGE_SIDEBAR_WIDTH, ui.size.width);
                    } else {
                        ui.element.css("max-width", "");
                        ui.element.css("min-width", "");
                        ui.element.css("width", "");
                        if (is_new_version) {
                            ui.element.css("flex-basis", "");
                        }
                        tf_storage.setString(STORAGE_SIDEBAR_MAX_WIDTH, "");
                        tf_storage.setString(STORAGE_SIDEBAR_MIN_WIDTH, "");
                        tf_storage.setString(STORAGE_SIDEBAR_WIDTH, "");
                    }
                }
            });

            // Add button to control options visiblity
            const STRING_SHOW_OPTIONS = "Show Options";
            const STRING_HIDE_OPTIONS = "Hide Options";
            function setOptionsVis(btn, vis) {
                if (vis) {
                    $dashboard.find("#sidebar .sidebar-section").slice(0, 3).show();
                    btn.innerText = STRING_HIDE_OPTIONS;
                    tf_storage.setBoolean(STORAGE_OPTIONS_VIS, true);
                } else {
                    $dashboard.find("#sidebar .sidebar-section").slice(0, 3).hide();
                    btn.innerText = STRING_SHOW_OPTIONS;
                    tf_storage.setBoolean(STORAGE_OPTIONS_VIS, false);
                }
            }

            let $btn_vis = $("<button style='display: block; float: right; position: absolute; bottom: 10px; right: 10px;'></button>").appendTo($sections_container)
                .on("click", function(e) {
                if (this.innerText == STRING_HIDE_OPTIONS) {
                    setOptionsVis(this, false);
                } else {
                    setOptionsVis(this, true);
                }
            });
            var vis = tf_storage.getBoolean(STORAGE_OPTIONS_VIS);
            if (typeof vis == "undefined") vis = true;
            setOptionsVis($btn_vis[0], vis);
        }

        function setupPlugin(plugin_name) {
            var $scalars_dashboard = $(".dashboard-container[data-dashboard='" + plugin_name + "']").eq(0).children().eq(0);
            if ($scalars_dashboard.length == 0) return null;
            var is_new_version = false;
            if ($("tf-multi-checkbox #runs-regex").length > 0) {
                console.log("Old version detected");
                is_new_version = false;
            } else if ($("tf-multi-checkbox #names-regex").length > 0) {
                console.log("New version detected");
                is_new_version = true;
            } else {
                console.error("Unknown version");
            }

            if (typeof unsafeWindow.tf_storage == "undefined" && typeof unsafeWindow.W != "undefined" && typeof unsafeWindow.W.addStorageListener != "undefined") {
                console.log("Tensorboard 1.12.0");
                unsafeWindow.tf_storage = unsafeWindow.W;
            }

            var $sidebar = $scalars_dashboard.find("#sidebar").eq(0);
            var $runs_selector = $sidebar.find("tf-runs-selector").eq(0);
            var $multi_checkbox = $runs_selector.find("#multiCheckbox").eq(0);
            var $runs_title = $runs_selector.find("#top-text h3");
            $runs_title.css("display", "inline");

            var $login_button, $logout_button, $setup_button, $sheet_set_button;
            if ($scalars_dashboard.find("#login_button").length == 0) {
                setupSiderbarController($scalars_dashboard);
                $login_button = $("<button id='login_button' style='display: none; float: right;'>Login</button>").insertAfter($runs_title);
                $login_button.on("click", function() {
                    window.gapi.auth2.getAuthInstance().signIn();
                });
                $logout_button = $("<button id='logout_button' style='display: none; float: right;'>Logout</button>").insertAfter($login_button);
                $logout_button.on("click", function() {
                    window.gapi.auth2.getAuthInstance().signOut();
                });
                $setup_button = $("<button id='setup_button' style='display: none; float: right;'>Setup</button>").insertAfter($logout_button);
                $setup_button.on("click", function() {
                    client_id = window.prompt("CLIENT_ID");
                    spreadsheet_id = window.prompt("SPREADSHEET_ID");
                    if (client_id && spreadsheet_id) {
                        GM_setValue("CLIENT_ID", client_id);
                        GM_setValue("SPREADSHEET_ID", spreadsheet_id);
                        $setup_button.hide();
                        initClient(updateSigninStatus);
                    }
                });
                $sheet_set_button = $("<button id='sheet_set_button' style='display: none; float: right;'>Sheets</button>").insertAfter($setup_button);
                $sheet_set_button.on("click", function() {
                    var prompt_result = window.prompt("SHEETS", avail_sheets.join(", "));
                    if (prompt_result === null) return;
                    var new_avail_sheets = [];
                    if (prompt_result.trim() != "")
                        new_avail_sheets = prompt_result.trim().split(",").map((sheet_name) => sheet_name.trim());
                    if (JSON.stringify(new_avail_sheets) != JSON.stringify(avail_sheets) || new_avail_sheets == []) {
                        GM_setValue("SHEETS", new_avail_sheets);
                        avail_sheets = new_avail_sheets;
                        startLoading();
                    }
                })
            } else {
                $login_button = $scalars_dashboard.find("#login_button").eq(0);
                $logout_button = $scalars_dashboard.find("#logout_button").eq(0);
                $setup_button = $scalars_dashboard.find("#setup_button").eq(0);
                $sheet_set_button = $scalars_dashboard.find("#sheet_set_button").eq(0);
            }

            if (client_id && spreadsheet_id) {
                $setup_button.hide();
            } else {
                $setup_button.show();
            }
            return {
                plugin_name: plugin_name,
                $dashboard: $scalars_dashboard,
                is_new_version: is_new_version,
                $sidebar: $sidebar,
                $runs_selector: $runs_selector,
                $multi_checkbox: $multi_checkbox,
                $runs_title: $runs_title,
                $login_button: $login_button,
                $logout_button: $logout_button,
                $setup_button: $setup_button,
                $sheet_set_button: $sheet_set_button
            }
        }

        start_try_times += 1;
        var tabs_ele = $("paper-tabs")[0];
        if (typeof tabs_ele != "undefined")
            elements = setupPlugin(tabs_ele.selected)

        $(tabs_ele).on("click", function(event) {
            window.setTimeout(function() {
                if (elements.plugin_name != tabs_ele.selected) {
                    elements = setupPlugin(tabs_ele.selected);
                    updateElements();
                }
            }, 500);
        })

        if (elements == null) {
            if (start_try_times >= MAX_START_TRY) {
                console.error("scalars dashboard not found. stopping retry.");
            } else {
                setTimeout(startTBSpreadsheetHelper, 1000);
                console.warn("scalars dashboard not found. retrying in 1 second...");
            }
            return;
        }

        if (client_id && spreadsheet_id) {
            initClient(updateSigninStatus);
        }

    }

    document.addEventListener('WebComponentsReady', startTBSpreadsheetHelper);

})();