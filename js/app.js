/**
 * Created by Lukas on 15.01.2016.
 */
var app = angular.module('loggify', ['ngMaterial']);

app.config(
    function($mdThemingProvider) {
        $mdThemingProvider.theme('default')
            .primaryPalette('deep-purple')
            .accentPalette('cyan')
            .dark();
    }
);

app.controller('AppController', function($http, $location, $window, $mdToast, $log, $anchorScroll) {
    var vm = this, fileText, latestLaunch, indicators;
    vm.uploader = true;
    var issues = {};
    vm.file = {
        index: [],
        content: []
    };

    vm.scroll = function (line) {
        $location.hash(line);
        $anchorScroll();
    };

    checkForExternalLog();

    $http.get('./resources/indicators.json').then(function (res) {
        $log.debug(res);
        indicators = res.data;
    });

    $window.Dropzone.options.upload = {
        accept: function (file, done) {
            $log.debug(file);
            if(file.name.indexOf('.log')!= -1){
                var reader = new FileReader;
                reader.readAsText(file);
                reader.onload = function () {
                    readFile(reader.result);
                }
            } else {
                $mdToast.showSimple("File isn't a logfile");
                done("File isn't a logfile");
            }
        }
    };

    function checkForExternalLog(){
        var url = $location.absUrl();
        if(url.indexOf('?log=')!=-1){
            $log.info('External log detected');
            var log = url.substr(url.indexOf('?log=')+5);
            $http.get('http://bochen415.info/loggify.php?url='+log).then(function (res) {
                readFile(res.data);
            });
        }
    }

    function readSystemInfo(){
        var system = {};
        system.launcherInfo = {};
        system.launcherInfo.name = "Launcher Build";
        system.launcherInfo.content = fileText.substr(fileText.indexOf('[')+3, fileText.indexOf(']')-3);
        _.split(fileText, /\n/).forEach(function (line) {
            if(line.indexOf('OS:')!= -1){
                system.osInfo = {};
                system.osInfo.name = "Operating System";
                system.osInfo.content = line.substr(line.indexOf('OS:')+4);
            }
            if(line.indexOf('Xmx')!= -1){
                system.ramInfo = {};
                system.ramInfo.name = 'Alllocated RAM';
                system.ramInfo.content = line.substr(line.indexOf('Xmx')+3,4);
            }
            if(line.indexOf('jre')!= -1){
                system.javaInfo = {};
                system.javaInfo.name = "JRE";
                var jrePath = line.substr(line.indexOf('jre'));
                if(jrePath.indexOf('\\')!=-1){
                    system.javaInfo.content = jrePath.substr(0, jrePath.indexOf('\\'));
                } else {
                    system.javaInfo.content = jrePath;
                }

            }
            if(line.indexOf('modpacks')!= -1){
                system.packInfo = {};
                system.packInfo.name = "Detected modpack";
                var packPath = line.substr(line.indexOf('modpacks')+9);
                if(packPath.indexOf("\\") != -1)
                    system.packInfo.content = packPath.substr(0, packPath.indexOf("\\"));
                else
                    system.packInfo.content = packPath.substr(0, packPath.indexOf("/"));

            }
            if(line.indexOf('--username')!= -1){
                var croppedLine = line.substr(line.indexOf('--username')+11);
                system.userInfo = {};
                system.userInfo.name = 'Found username';
                system.userInfo.content = croppedLine.substr(0, croppedLine.indexOf('--')-1);
            }
            if(line.indexOf('--uuid')!= -1){
                var croppedLine = line.substr(line.indexOf('--uuid')+11);
                system.uuidInfo = {};
                system.uuidInfo.name = 'Found UUID';
                system.uuidInfo.content = croppedLine.substr(0, croppedLine.indexOf('--'));
            }
        });
        if(system.userInfo){
            $http.get('http://axis.iaero.me/accstatus?username='+system.userInfo.content+'&format=json').then(function (res) {
                system.userInfo.status = res.data.data;
            })
        }
        vm.systemInfo = system;
    }

    function prepareLog() {
        var noLauncher = fileText.replace(new RegExp("\\[B#"+vm.systemInfo.launcherInfo.content+"] ","g"), "");
        $log.debug(new RegExp("\[B#"+vm.systemInfo.launcherInfo.content+"]","g"));
        $log.warn("[B#"+vm.systemInfo.launcherInfo.content+"] ");
        var launches = _.split(noLauncher, 'Forge Mod Loader version');
        vm.systemInfo.lauchInfo = {
            name: "Mincraft Launches",
            content: launches.length
        };
        latestLaunch = launches[launches.length-1];
        var lines = _.split(launches[launches.length-1], /\n/);
        if(launches.length>1)
            lines.shift();
        var prettyLines = [];
        var count = 1;
        lines.forEach(function(line){
            var prettyLine = {};
            prettyLine.content = line.substr(10);
            prettyLine.num = count;
            if(prettyLine.content != ""){
                prettyLines.push(prettyLine);
                count++;
            }
        });
        vm.prettyLines = prettyLines;
        findIssues();
    }

    function findIssues(){
        vm.prettyLines.forEach(function (line) {
            indicators.forEach(function (indicator) {
                if(line.content.indexOf(indicator.requirements[0])!=-1){
                    if(indicator.requirements[0][1]){
                        var correct = true;
                        indicator.requirements[0].forEach(function (req) {
                            if(latestLaunch.indexOf(req)==-1)
                            correct = false;
                        });
                        if(correct){
                            issues[indicator.reason] ={
                                reason: indicator.reason,
                                fix: indicator.reply,
                                line: line.num
                            };
                            line.mark = true;
                        }
                    } else {
                        issues[indicator.reason] ={
                            reason: indicator.reason,
                            fix: indicator.reply,
                            line: line.num
                        };
                        line.mark=true;
                    }
                }
            })
        });
        vm.issues = issues;
        $log.debug(issues);
    }


    function readFile (text) {
        vm.uploader = false;
        fileText = angular.copy(text);
        readSystemInfo();
        prepareLog();
        $log.debug(vm.systemInfo);
        var file = angular.copy(text);
        var lines;
        lines = _.split(file, /\n/);
        var launcherline = lines[lines.length-2];
        vm.launcherBuild = launcherline.substr(launcherline.indexOf('[')+2, launcherline.indexOf(']')-2);
        var sortedLines = {
            0: []
        };
        var launch = 0;
        var crashFlag = false;
        var causeFlag = false;
        var javaFlag = false;
        lines.forEach(function (line) {
            var saveLine = {
                text: line
            };
            if(line.indexOf('Forge Mod Loader version')!= -1 && line.indexOf('loading')!= -1){
                launch++;
                sortedLines[launch] = [];
            }
            sortedLines[launch].push(saveLine);
        });
        var lineNum = 1;
        sortedLines[launch].forEach(function (lineObject) {
            lineObject.text = lineNum+" "+lineObject.text;
            var line = lineObject.text;
            if(javaFlag){
                lineObject.mark = 1;
                javaFlag = false;
                vm.javaError[1] = line;
            }
            if(line.indexOf('OS:')!= -1){
                vm.os = line.substr(line.indexOf('OS:')+4);
            }
            if(line.indexOf('Xmx')!= -1){
                vm.ram = line.substr(line.indexOf('Xmx')+3,5);
                vm.ramC = line.substr(line.indexOf('Xmx')+3,4);
            }
            if(line.indexOf('modpacks')!= -1){
                var packPath = line.substr(line.indexOf('modpacks')+9);
                vm.pack = packPath.substr(0, packPath.indexOf('\\'));
            }
            if(line.indexOf('jre')!= -1){
                var jrePath = line.substr(line.indexOf('jre'));
                vm.jre = jrePath.substr(0, jrePath.indexOf('\\'));
            }
            if(line.indexOf('---- Minecraft Crash Report ----')!= -1){
                crashFlag = true;
            }
            if(line.indexOf('Error occurred')!= -1){
                lineObject.mark = 1;
                javaFlag = true;
                vm.javaError = [];
                vm.javaError[0] = line;
            }
            if(line.indexOf('[java.lang.Throwable$WrappedPrintStream:println:-1]: java.lang.NoSuchMethodError: com.google.common.io.CharSource.readLines(Lcom/google/common/io/LineProcessor;)Ljava/lang/Object;')!= -1){
                vm.crack = true;
                lineObject.mark = 2;
            }
            if(line.indexOf('Caused by:')!= -1){
                causeFlag = true;
                lineObject.mark = 1;
                vm.cause = line;
            }
            if(line.indexOf('Program Files (x86)')!= -1){
                vm.falseJava = true;
            }
            if(line.indexOf('...')!= -1){
                causeFlag = false;
            }
            if(line.indexOf('at')!= -1 && causeFlag){
                lineObject.mark = 1;
            }
            if(line.indexOf('Starting download of')!= -1 || line.indexOf('Expected MD5:')!= -1){
                lineObject.mark = 3;
            }
            if(line.indexOf('[WARNING]')!= -1){
                lineObject.mark = 4;
            }
            if(line.indexOf('org.lwjgl.LWJGLException: Pixel format not accelerated')!= -1 ){
                vm.notAcc = true;
            }
            if(line.indexOf('[STDOUT]')!= -1 && crashFlag){
                lineObject.mark = 1;
            }
            lineNum++;
        });
        vm.pack = vm.systemInfo.packInfo.content;
        vm.launches = launch;
        vm.latest = sortedLines[launch];
        vm.loaded = true;
        var url = 'http://api.technicpack.net/modpack/'+vm.pack+'?build=99';
        $http.get('http://bochen415.info/loggify.php?url='+url).then(function (res) {
            vm.packInfo = res.data;
            if(vm.packInfo.solder){
                $http.get('http://bochen415.info/loggify.php?url='+vm.packInfo.solder+'modpack/'+vm.packInfo.name).then(function (res) {
                    vm.packInfo.solderD = res.data;
                });
            }
        })
    }
});