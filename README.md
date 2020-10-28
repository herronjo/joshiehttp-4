# JoshieHTTP
A webserver designed and programmed by a bored 16 year old that has nothing better to do.

# Table of contents 
[Running](#running)

[Adding sites](#creating-new-domains-in-mainconf)

[Proxying](#proxying-a-site-or-internal-site)

[Scripting](#scripting)

[SSL](#ssl)

# Running
Edit the `'default'` configuration location to point to another folder that already exists, or place your content in the same directory as the webserver.

Create `index.html` in that folder and put whatever you want in it.

Run `node server.js`

# Creating new domains in main.conf
The configuration file is a JSON file that contains the settings for every website you have running. If it's not found in there, the `'default'` configuration is used.

To add a new site, create a new JSON entry for it in `main.conf` (note, entries do not cover subdomains, so example.com and www.example.com are two separate entries. This may change in the future.)

Ex:

```JSON
{
  "default": {"type": "local", "location": "/var/www/html"},
  "www.example.com": {"type": "local", "location": "/var/www/html2"}
}
```

# Proxying a site or internal site
JoshieHTTP supports the proxying of external or internal sites, websockets, and ports.

Follow the above instructions to add a new site, but instead of the "type" being "local", change "local" to "proxy"

Then, instead of a folder for the location, put the URL of the place you would like to proxy to. _make sure that you put a http:// or a https:// in front of the URL_. If you would like to proxy a port, simply append a : and then the port in side of the quotes.

Ex:

```JSON
{
  "default": {"type": "proxy", "location": "http://www.example.com"},
  "api.example.com": {"type": "proxy", "location": "http://localhost:8080"}
}
```

# Scripting
PHP, Ruby, Python, etc. are not supported in JoshieHTTP. Mainly because I didn't feel like adding them. Too much. So, to make up for that, I made the `.sjs` extension for scripting. It's just a .js file, but renamed. It runs in node.js, and all URL parameters and cookies (cookies in a single variable called "COOKIES") are passed on as environment variables to the script. You can go on from there, reading the variables. It's all run server-side, and to send data back you just send it back in a `console.log();`. There's actually a lot you can do with this. Happy scripting!

# SSL
SSL is enabled in JoshieHTTP by default, with the key being read from `./ssl/key.pem` and the certificate from `./ssl/cert.pem`. Sites can use SNI to have different certificates from each other. To run JoshieHTTP without SSL, use the command line flag `-ns` or `--no-https`.

# Command line flags
