#!/usr/bin/env node
const version = "4.0";
const net = require('net');
const tls = require('tls');
const fs = require('fs');
const zlib = require('zlib');
const proc = require('child_process');
const cluster = require('cluster');
const numCPUs = require('os').cpus().length;
var conf = {"default":{"type":"local","location":".","upgradeInsecure":true,"gzip":true,"headers":{"Access-Control-Allow-Origin":"*"},"ssl":{"key":"ssl/key.pem","cert":"ssl/cert.pem"}}};
var mimes = {"": "application/octet-stream"};
var isKilled = false;

process.on('uncaughtException', function(err) {
	if (fs.existsSync("./logs") == false) {
		try {
			fs.mkdirSync("./logs");
		} catch(err) {}
	}
	if (fs.existsSync("./logs/errors") == false) {
		try {
			fs.mkdirSync("./logs/errors");
		} catch(err) {}
	}
	try {
		var date = new Date().getTime();
		fs.writeFileSync("./logs/errors/err-"+date+".log",err);
	} catch(err) {}
	console.log(err);
	log("Process died");
	process.exit(-1);
});

function log(msg) {
	if (fs.existsSync("./logs") == false) {
		try {
			fs.mkdirSync("./logs");
		} catch(err) {}
	}
	var date = new Date();
	if (cluster.isMaster) {
		try{fs.appendFileSync("./logs/"+date.getFullYear()+"-"+(date.getMonth()+1)+"-"+date.getDate()+".log","[Master]["+date.toLocaleString('en-US',{hour:'numeric',minute:'numeric',second:'numeric'})+"] "+msg+"\r\n");}catch(err){}
	} else {
		try{fs.appendFileSync("./logs/"+date.getFullYear()+"-"+(date.getMonth()+1)+"-"+date.getDate()+".log","[Fork]["+date.toLocaleString('en-US',{hour:'numeric',minute:'numeric',second:'numeric'})+"] "+msg+"\r\n");}catch(err){}
	}
}

function readconf() {
	if (JSON.parse(process.env.argv).indexOf("--config") > -1) {
		if (fs.existsSync(JSON.parse(process.env.argv)[parseInt(JSON.parse(process.env.argv).indexOf("--config"))+1])) {
			conf = JSON.parse(fs.readFileSync(JSON.parse(process.env.argv)[parseInt(JSON.parse(process.env.argv).indexOf("--config"))+1]));
		}
	} else if (JSON.parse(process.env.argv).indexOf("-c") > -1) {
		if (fs.existsSync(JSON.parse(process.env.argv)[parseInt(JSON.parse(process.env.argv).indexOf("--config"))+1])) {
			conf = JSON.parse(fs.readFileSync(JSON.parse(process.env.argv)[parseInt(JSON.parse(process.env.argv).indexOf("--config"))+1]));
		}
	} else {
		if (fs.existsSync("main.conf")) {
			conf = JSON.parse(fs.readFileSync("main.conf"));
		}
	}
	log("Reloaded conf");
}

function serverListener(c, https) {
	var ended = false;
	function write(data) {
		if (!ended) {
			c.write(data);
		}
	}
	function end(data) {
		if (!ended) {
			if (data != undefined) {
				c.end();
			} else {
				c.end(data);
			}
		}
	}
	if (process.platform != "win32") {
		try {
			process.setgid("secureweb");
			process.setegid("secureweb");
			process.setuid("secureweb");
			process.seteuid("secureweb");
		} catch(err) {
			log("ERROR: Unable to de-escalate permissions, please add the \"secureweb\" user to your system.");
		}
	}
	var tmpbuf = "";
	var req = {
		host: "default",
		path: "/",
		params: {},
		method: "GET",
		headers: {},
		cookies: {},
		data: ""
	}
	c.on('end', function() {
		ended = true;
		if (client != undefined) {
			client.end();
		}
	});
	c.on('close', function() {
		ended = true;
		if (client != undefined) {
			client.end();
		}
	});
	c.on('error', function(err) {
		ended = true;
		if (client != undefined) {
			client.end();
        }
	});
	var client = undefined;
	c.on('data', function(data) {
		tmpbuf += data.toString();
		if (client != undefined) {
			client.write(data);
        } else if (tmpbuf.replace(/\r/g, "").includes("\n\n")) {
			var headersts = {"Accept-Ranges":"bytes"};
			var tmp = tmpbuf.split("\n");
			req.method = tmp[0].split(" ")[0];
			req.path = decodeURIComponent(tmp[0].split(" ")[1].split("?")[0]);
			if (req.path == "") {req.path = "/";}
			var pathtmp = tmp[0].split(" ")[1].split("?");
			if (pathtmp[1] != undefined) {
				var pathtmp2 = pathtmp[1].split("&");
				for (var i in pathtmp2) {
					req.params[decodeURIComponent(pathtmp2[i].split("=")[0])] = decodeURIComponent(pathtmp2[i].split("=")[1]);
				}
			}
			var headersend = tmp.length-1;
			for (var i = 1; i < tmp.length; i++) {
				if (tmp[i].trim() == "" || tmp[i].trim() == "\r") {
					headersend = i+1;
					i = tmp.length+1;
					break;
				} else {
					try {
						req.headers[tmp[i].split(": ")[0].toLowerCase()] = tmp[i].split(": ")[1].trim();
					} catch(err) {
						req.headers[tmp[i].split(": ")[0].toLowerCase()] = undefined;
					}
				}
			}
			if (req.headers.host != undefined) {
				if (req.headers.host.trim() != "") {
					req.host = req.headers.host.split(":")[0].trim();
				}
			}
			if (req.headers.cookie != undefined) {
				if (req.headers.cookie != "") {
					var cookietmp = req.headers.cookie.split("; ");
					for (var i = 0; i < cookietmp.length; i++) {
						req.cookies[cookietmp[i].split("=")[0]] = cookietmp[i].split("=")[1];
					}
				}
			}
			req.data = tmp.slice(headersend,tmp.length).join("\n");
			log(c.remoteAddress+" "+req.method+" "+req.headers.host+tmp[0].split(" ")[1]);
			if (conf[req.host] == undefined) {req.host = "default";}
			if (conf.default.headers != undefined) {
				headersts = {...headersts, ...conf.default.headers};
			}
			if (req.host != 'default' && conf[req.host].headers != undefined) {
				headersts = {...headersts, ...conf[req.host].headers};
            }
			if (conf[req.host].upgradeInsecure && req.headers['upgrade-insecure-requests'] == "1" && !https && (JSON.parse(process.env.argv).indexOf("--no-https") == -1 && JSON.parse(process.env.argv).indexOf("-ns") == -1 || (JSON.parse(process.env.argv).indexOf("-ins") > -1 || JSON.parse(process.env.argv).indexOf("--ignore-no-https") > -1))) {
				c.end("HTTP/1.1 301 Moved Permanently\r\nContent-Type: text/html\r\nDate: "+new Date().toUTCString()+"\r\nServer: JoshieHTTP/"+version+"_"+process.platform+"\r\nLocation: https://"+req.headers.host+tmp[0].split(" ")[1]+"\r\nVary: Upgrade-Insecure-Requests\r\n\r\nUpgrading to HTTPS...");
			} else {
				if (conf[req.host].type == "local") {
					try {if (req.path.endsWith("/") == false) {if (fs.statSync(conf[req.host].location+req.path).isDirectory()) {req.path = req.path+"/";headersts.refresh = "0;url="+req.path;}}} catch(err) {}
					if (req.path.endsWith("/")) {if(fs.existsSync(conf[req.host].location+req.path+'index.sjs')) {req.path = req.path+"index.sjs";} else {req.path = req.path+"index.html";}}
					fs.stat(conf[req.host].location+req.path, function(err, stat) {
						if (err != undefined) {
							switch(err.code) {
								case "default":
									fs.stat(conf[req.host].location+"/500.html", function(err2, stat2) {
										if (err2 != undefined) {
											c.end("HTTP/1.1 500 Server Error\r\nContent-Type: text/html\r\nDate: "+new Date().toUTCString()+"\r\nServer: JoshieHTTP/"+version+"_"+process.platform+"\r\n\r\n<!DOCTYPE html><html><head><title>HTTP Error 500</title></head><body><h1>HTTP Error 500</h1>Error accessing file "+req.path.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")+"<br/><br/><i>Technical information:</i><br/>No additional information.<hr>JoshieHTTP/"+version+"_"+process.platform+"</body></html>");
										} else {
											c.end("HTTP/1.1 500 Server Error\r\nContent-Type: text/html\r\nDate: "+new Date().toUTCString()+"\r\nServer: JoshieHTTP/"+version+"_"+process.platform+"\r\n\r\n"+fs.readFileSync(conf[req.host].location+"/500.html",'utf8').replace(/{HOST}/g,req.host).replace(/{PATH}/g,req.path.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")).replace(/{VERSION}/g,version).replace(/{PLATFORM}/g,process.platform));
										}
									});
									break;
								case "EACCES":
									fs.stat(conf[req.host].location+"/403.html", function(err2, stat2) {
										if (err2 != undefined) {
											c.end("HTTP/1.1 403 Access Error\r\nContent-Type: text/html\r\nDate: "+new Date().toUTCString()+"\r\nServer: JoshieHTTP/"+version+"_"+process.platform+"\r\n\r\n<!DOCTYPE html><html><head><title>HTTP Error 403</title></head><body><h1>HTTP Error 403</h1>Can not read file "+req.path.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")+"<br/><br/><i>Technical information:</i><br/>Make sure your file is readable by the webserver user.<hr>JoshieHTTP/"+version+"_"+process.platform+"</body></html>");
										} else {
											c.end("HTTP/1.1 403 Access Error\r\nContent-Type: text/html\r\nDate: "+new Date().toUTCString()+"\r\nServer: JoshieHTTP/"+version+"_"+process.platform+"\r\n\r\n"+fs.readFileSync(conf[req.host].location+"/403.html",'utf8').replace(/{HOST}/g,req.host).replace(/{PATH}/g,req.path.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")).replace(/{VERSION}/g,version).replace(/{PLATFORM}/g,process.platform));
										}
									});
									break;
								case "ENOENT":
									fs.stat(conf[req.host].location+"/404.html", function(err2, stat2) {
										if (err2 != undefined) {
											c.end("HTTP/1.1 404 Not Found\r\nContent-Type: text/html\r\nDate: "+new Date().toUTCString()+"\r\nServer: JoshieHTTP/"+version+"_"+process.platform+"\r\n\r\n<!DOCTYPE html><html><head><title>HTTP Error 404</title></head><body><h1>HTTP Error 404</h1>File "+req.path.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")+" not found<br/><br/><i>Technical information:</i><br/>No additional information.<hr>JoshieHTTP/"+version+"_"+process.platform+"</body></html>");
										} else {
											c.end("HTTP/1.1 404 Not Found\r\nContent-Type: text/html\r\nDate: "+new Date().toUTCString()+"\r\nServer: JoshieHTTP/"+version+"_"+process.platform+"\r\n\r\n"+fs.readFileSync(conf[req.host].location+"/404.html",'utf8').replace(/{HOST}/g,req.host).replace(/{PATH}/g,req.path.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")).replace(/{VERSION}/g,version).replace(/{PLATFORM}/g,process.platform));
										}
									});
									break;
							}
						} else {
							if (req.path.endsWith(".sjs")) {
								var execopts = {
									maxBuffer: 100000000,
									stdio: ['pipe','pipe','pipe','ipc'],
									env: {
										'PATH': process.env['PATH']
									}
								}
								if (conf[req.host].legacy) {
									var datatmp = req.data.split("&");
									for (var data in datatmp) {
										try{
											req.params[decodeURIComponent(datatmp[data].split("=")[0])] = decodeURIComponent(datatmp[data].split("=")[1]);
										} catch(err) {
											req.params[datatmp[data].split("=")[0]] = datatmp[data].split("=")[1];
										}
									}
								}
								for (var param in req.params) {
									execopts['env'][param] = req.params[param];
								}
								execopts.env.HOST = req.host;
								execopts.env.METHOD = req.method;
								execopts.env.PATH = process.env.PATH;
								execopts.env.PWD = conf[req.host].location;
								execopts.env.CWD = conf[req.host].location;
								execopts.cwd = conf[req.host].location;
								req.headers.reqip = c.remoteAddress;
								execopts.env.HEADERS = JSON.stringify(req.headers);
								execopts.env.COOKIES = JSON.stringify(req.cookies);
								execopts.env.REQIP = c.remoteAddress;
								execopts.env.DATA = req.data;
								var worker = proc.fork(conf[req.host].location+req.path, [], execopts);
								var datats = Buffer.alloc(0);
								var status = 200;
								var statusmsg = "OK";
								worker.stdout.on('data', function(stdout) {
									if (stdout.toString().includes("HEAD:") && conf[req.host].legacy) {
										var headtmp = msg.toString().split("HEAD:");
										headtmp.shift();
										headtmp = headtmp.join("HEAD:").split(":");
										var head = headtmp[0];
										headtmp.shift();
										headtmp = headtmp.join(":");
										headersts[head] = headtmp.trim();
									} else {
										datats = Buffer.concat([datats, stdout]);
									}
								});
								worker.on('message', function(msg) {
									if (msg.toString().startsWith("HEAD:")) {
										var headtmp = msg.toString().split("HEAD:");
										headtmp.shift();
										headtmp = headtmp.join("HEAD:").split(":");
										var head = headtmp[0];
										headtmp.shift();
										headtmp = headtmp.join(":");
										headersts[head] = headtmp.trim();
									} else if (msg.toString().startsWith("STATUS:")) {
										var statustmp = msg.toString().split("STATUS:");
										statustmp.shift();
										statustmp = statustmp.join("STATUS:").split(":");
										status = parseInt(statustmp[0]);
										statustmp.shift();
										statusmsg = statustmp.join(":");
									}
								});
								worker.on('error', function(err) {
									console.log(err);
								});
								worker.on('close', function(code) {
									headersts['Server'] = "JoshieHTTP/"+version+"_"+process.platform;
									headersts['Content-Length'] = datats.length;
									c.write("HTTP/1.1 "+status.toString()+" "+statusmsg+"\r\n");
									for (var header in headersts) {
										c.write(header+": "+headersts[header]+"\r\n");
									}
									c.write("\r\n");
									c.write(datats);
									c.end();
								});
							} else {
								var rangesmode = false;
								if (req.headers.range != undefined) {
									/*if () {
										c.write("HTTP/1.1 206 Partial Content");
										rangesmode = true;
									}*/
									c.write("HTTP/1.1 200 OK\r\n"); //temporary
								} else {
									c.write("HTTP/1.1 200 OK\r\n");
								}
								headersts['Server'] = "JoshieHTTP/"+version+"_"+process.platform;
								if (conf[req.host].gzip != undefined && conf[req.host].gzip && req.headers['accept-encoding'] != undefined) {
									if (req.headers['accept-encoding'].includes("gzip")) {
										headersts['Content-Encoding'] = "gzip";
										headersts['Transfer-Encoding'] = "gzip";
									} else {
										headersts['Content-Length'] = stat.size;
									}
								} else {
									headersts['Content-Length'] = stat.size;
								}
								if (mimes[req.path.split(".")[req.path.split(".").length-1]] == undefined) {
									headersts['Content-Type'] = mimes[""];
								} else {
									headersts['Content-Type'] = mimes[req.path.split(".")[req.path.split(".").length-1]];
								}
								headersts.Date = new Date().toUTCString();
								headersts.Connection = "keep-alive";
								for (var header in headersts) {
									c.write(header+": "+headersts[header]+"\r\n");
								}
								c.write("\r\n");
								var stream = fs.createReadStream(conf[req.host].location + req.path);
								if (conf[req.host].gzip != undefined && conf[req.host].gzip && req.headers['accept-encoding'] != undefined) {
									if (req.headers['accept-encoding'].includes("gzip")) {
										stream.pipe(zlib.createGzip()).pipe(c);
									} else {
										stream.pipe(c);
									}
								} else {
									stream.pipe(c);
								}
								stream.on('end', function() {
									if (conf[req.host].gzip != undefined && conf[req.host].gzip && req.headers['accept-encoding'] != undefined && req.headers['accept-encoding'].includes("gzip")) {
										finished = true;
									} else {
										c.end();
									}
								});
							}
						}
					});
				} else if (conf[req.host].type == "proxy") {
					var location = conf[req.host].location.replace(/http:\/\//g, "").replace(/https:\/\//g, "").replace(/ws:\/\//g, "").replace(/wss:\/\//g, "");
					if (conf[req.host].protocol == undefined || conf[req.host].protocol == "http" || conf[req.host].protocol == "ws") {
						if (location.split(":").length == 1) {location = location+":80";}
						if (location.split(":").length == 2 && location.split(":")[1].trim() == "") {location = location.trim()+"80";}
						try{client = net.connect(location.split(":")[1],location.split(":")[0]);}catch(err){}
					} else if (conf[req.host].protocol == "https" || conf[req.host].protocol == "wss") {
						if (location.split(":").length == 1) {location = location+":443";}
						if (location.split(":").length == 2 && location.split(":")[1].trim() == "") {location = location.trim()+"443";}
						try{client = tls.connect(location.split(":")[1],location.split(":")[0]);}catch(err){}
					} else {
						c.end("HTTP/1.1 500 Invalid Configuration\r\ncontent-type: text/html\r\ndate: "+new Date().toUTCString()+"\r\nserver: JoshieHTTP/"+version+"_"+process.platform+"\r\n\r\n<!DOCTYPE html><html><head><title>HTTP Error 500</title></head><body><h1>HTTP Error 500</h1>The server operator has misconfigured this site.<br/><br/><i>Technical information:</i><br/>Site \""+req.host+"\" has an invalid \"protocol\" value.<hr>JoshieHTTP/"+version+"_"+process.platform+"</body></html>");
					}
					if (client != undefined) {
						client.on('data', function (data) {
							c.write(data);
						});
						client.on('close', function () {
							c.end();
						});
						client.on('end', function () {
							c.end();
						});
						client.write(Buffer.from(tmpbuf.replace(/\r\n\r\n/, "\r\nX-Forwarded-For: " + c.remoteAddress + "\r\n\r\n"),'utf8'));
					}
				} else {
					c.end("HTTP/1.1 500 Invalid Configuration\r\nContent-Type: text/html\r\nDate: "+new Date().toUTCString()+"\r\nServer: JoshieHTTP/"+version+"_"+process.platform+"\r\n\r\n<!DOCTYPE html><html><head><title>HTTP Error 500</title></head><body><h1>HTTP Error 500</h1>The server operator has misconfigured this site.<br/><br/><i>Technical information:</i><br/>Site \""+req.host+"\" has an invalid \"type\" value.<hr>JoshieHTTP/"+version+"_"+process.platform+"</body></html>");
				}
			}
		}
	});
}

function snicallback(servername, cb) {
	var server = "default";
	var key = "";
	var cert = "";
	if (conf[servername] != undefined) {
		if (conf[servername].ssl != undefined) {
			if (conf[servername].ssl.key != undefined && conf[servername].ssl.cert != undefined) {
				server = servername;
			}
		}
	}
	if (conf[server].ssl != undefined) {
		if (conf[server].ssl.key != undefined && conf[server].ssl.cert != undefined) {
			key = conf[server].ssl.key;
			cert = conf[server].ssl.cert;
		} else {
			key = "ssl/key.pem";
			cert = "ssl/cert.pem";
		}
	} else {
		key = "ssl/key.pem";
		cert = "ssl/cert.pem";
	}
	cb(null, tls.createSecureContext({cert:fs.readFileSync(cert),key:fs.readFileSync(key)}));
}

var server = undefined;
var sserver = undefined;
if (cluster.isMaster == false) {
	if (JSON.parse(process.env.argv).indexOf("--no-http") == -1 && JSON.parse(process.env.argv).indexOf("-nh") == -1) {
		server = net.createServer(function(c) {
			serverListener(c,false);
		});
	}
	if (JSON.parse(process.env.argv).indexOf("--no-https") == -1 && JSON.parse(process.env.argv).indexOf("-ns") == -1) {
		sserver = tls.createServer({SNICallback: snicallback}, function(c) {
			serverListener(c,true);
		});
	}
}

var workers = [];

function fork(env) {
	var worker = cluster.fork(env);
	worker.on('close', function(code) {
		log("Worker died with code "+code);
		workers.splice(workers.indexOf(worker), 1);
		if (!isKilled) {
			fork(env);
		}
	});
	workers.push(worker);
}

if (cluster.isMaster) {
	log("Started");
	var env = process.env;
	env.argv = JSON.stringify(process.argv);
	for (var i = 0; i < numCPUs; i++) {
		fork(env);
	}
	var ccserver = net.createServer(function(c) {
		var buf = "";
		c.on('data', function(data) {
			buf += data.toString();
			if (buf.includes("\n")) {
				var cmd = buf.trim();
				switch (cmd) {
					default:
						c.end("unknown command\n");
						break;
					case "stop":
						c.end("stopping\n");
						isKilled = true;
						for (var worker in workers) {
							workers[worker].send("kill");
						}
						process.exit(0);
						break;
					case "reload":
						c.end("reloading\n");
						for (var worker in workers) {
							workers[worker].send("reload");
						}
						break;
				}
			}
		});
		c.on('end', function() {
			
		});
	});
	ccserver.listen(81);
} else {
	process.on('message', function(msg) {
		if (msg == "reload") {
			readconf();
		} else if (msg == "kill") {
			process.exit(0);
		}
	});
	log("Worker started");
	readconf();
	try{mimes = JSON.parse(fs.readFileSync("./mimes.json"));}catch(err){}
	if (JSON.parse(process.env.argv).indexOf("--no-http") == -1 && JSON.parse(process.env.argv).indexOf("-nh") == -1) {
		if (JSON.parse(process.env.argv).indexOf("--listen") > -1) {
			server.listen(JSON.parse(process.env.argv)[(parseInt(JSON.parse(process.env.argv).indexOf("--listen"))+1)]);
		} else if (JSON.parse(process.env.argv).indexOf("-l") > -1) {
			server.listen(JSON.parse(process.env.argv)[(parseInt(JSON.parse(process.env.argv).indexOf("-l"))+1)]);
		} else {
			server.listen(80);
		}
	}
	if (JSON.parse(process.env.argv).indexOf("--no-https") == -1 && JSON.parse(process.env.argv).indexOf("-ns") == -1) {
		if (JSON.parse(process.env.argv).indexOf("--https") > -1) {
			sserver.listen(JSON.parse(process.env.argv)[(parseInt(JSON.parse(process.env.argv).indexOf("--https"))+1)]);
		} else if (JSON.parse(process.env.argv).indexOf("-s") > -1) {
			sserver.listen(JSON.parse(process.env.argv)[(parseInt(JSON.parse(process.env.argv).indexOf("-s"))+1)]);
		} else {
			sserver.listen(443);
		}
	}
}
