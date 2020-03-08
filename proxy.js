process.on('uncaughtException', function(err) {
	console.log(err);
});

var fs = require('fs');
var net = require('net');
var tls = require('tls');

var conf = {};

var readconf = function(config) {
	conf = JSON.parse(fs.readFileSync(config));
};

var cachedata = {};

var server = net.createServer(function(c) {
	readconf("main.conf");
	var queue = [];
	var opened = false;
	var websockets = false;
	var client = undefined;
	var interval = undefined;
	c.on('data', function(data) {
		if (opened) {
			if (client != undefined) {
				client.write(data);
			} else {
				queue.push(data);
			}
		} else {
			opened = true;
			var host = data.toString().toLowerCase().slice(data.toString().toLowerCase().indexOf("host: ")+6, data.toString().length).split("\n")[0].trim();
			if (host == undefined || host.trim() == "") {host = "default";}
			if (host != "sticloud.gq" && host != "www.sticloud.gq" && host.includes(".sticloud.gq")) {
				var hosts = JSON.parse(fs.readFileSync('hosts.json'));
				if (hosts[host.split(".")[0]] == undefined) {
					try {
						c.end("HTTP/1.1 404 Not Found\n\n<h1>Host not configured or not found</h1>");
					} catch(err) {}
				} else {
					client = net.connect(hosts[host.split(".")[0]], "127.0.0.1");
					client.on('data', function(cdata) {
						try {
							c.write(cdata);
						} catch(err) {try{c.end();}catch(err){}}
					});
					client.on('end', function() {
						try {
							c.end();
							clearInterval(interval);
						} catch(err) {}
					});
					client.write(data);
					interval = setInterval(function() {
						for (var i in queue) {
							try {
								client.write(queue[0]);
								queue.splice(0,1);
							} catch(err) {}
						}
					}, 100);
				}
			} else {
				if (conf[host] == undefined) {host = "default";}
				if (conf[host].type == "proxy") {
					client = net.connect(conf[host].location.split(":")[2], conf[host].location.split("://")[1].split(":")[0]);
				} else {
					client = net.connect(81, "127.0.0.1");
				}
				client.on('data', function(cdata) {
					try {
						c.write(cdata);
					} catch(err) {try{c.end();}catch(err){}}
				});
				client.on('end', function() {
					try {
						c.end();
						clearInterval(interval);
					} catch(err) {}
				});
				client.write(data);
				interval = setInterval(function() {
					for (var i in queue) {
						try {
							client.write(queue[0]);
							queue.splice(0,1);
						} catch(err) {}
					}
				}, 100);
			}
		}
	});
	c.on('end', function() {
		if (opened) {
			opened = false;
		}
		if (client != undefined) {
			client.end();
			client = undefined;
		}
		try {
			clearInterval(interval);
		} catch(err) {}
	});
});

var options = {
	key: fs.readFileSync('ssl/key.pem'),
	cert: fs.readFileSync('ssl/cert.pem')
}

var sserver = tls.createServer(options,function(c) {
	readconf("main.conf");
	var queue = [];
	var opened = false;
	var websockets = false;
	var client = undefined;
	var interval = undefined;
	c.on('data', function(data) {
		if (opened) {
			if (client != undefined) {
				client.write(data);
			} else {
				queue.push(data);
			}
		} else {
			opened = true;
			var host = data.toString().toLowerCase().slice(data.toString().toLowerCase().indexOf("host: ")+6, data.toString().length).split("\n")[0].trim();			if (host == undefined || host.trim() == "") {host = "default";}
			if (host != "sticloud.gq" && host != "www.sticloud.gq" && host.includes(".sticloud.gq")) {
				var hosts = JSON.parse(fs.readFileSync('hosts.json'));
				if (hosts[host.split(".")[0]] == undefined) {
					try {
						c.end("HTTP/1.1 404 Not Found\n\n<h1>Host not configured or not found</h1>");
					} catch(err) {}
				} else {
					client = net.connect(hosts[host.split(".")[0]], "127.0.0.1");
					client.on('data', function(cdata) {
						try {
							c.write(cdata);
						} catch(err) {try{c.end();}catch(err){}}
					});
					client.on('end', function() {
						try {
							c.end();
							clearInterval(interval);
						} catch(err) {}
					});
					client.write(data);
					interval = setInterval(function() {
						for (var i in queue) {
							try {
								client.write(queue[0]);
								queue.splice(0,1);
							} catch(err) {}
						}
					}, 100);
				}
			} else {
				if (conf[host] == undefined) {host = "default";}
				if (conf[host].type == "proxy") {
					client = net.connect(conf[host].location.split(":")[2], conf[host].location.split("://")[1].split(":")[0]);
				} else {
					client = net.connect(81, "127.0.0.1");
				}
				client.on('data', function(cdata) {
					try {
						c.write(cdata);
					} catch(err) {try{c.end();}catch(err){}}
				});
				client.on('end', function() {
					try {
						c.end();
						clearInterval(interval);
					} catch(err) {}
				});
				client.write(data);
				interval = setInterval(function() {
					for (var i in queue) {
						try {
							client.write(queue[0]);
							queue.splice(0,1);
						} catch(err) {}
					}
				}, 100);
			}
		}
	});
	c.on('end', function() {
		if (opened) {
			opened = false;
		}
		if (client != undefined) {
			client.end();
			client = undefined;
		}
		try {
			clearInterval(interval);
		} catch(err) {}
	});
});

readconf("main.conf");
server.listen(80);
sserver.listen(443);
console.log("JoshieProx 2 started...");
