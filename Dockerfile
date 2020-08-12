FROM node:latest
LABEL Version="4.0" Maintainer="herronjo@joshiepoo.gq" Description="A simple Node.JS webserver, written from scratch with scripting support." Vendor="Joshua Herron"
EXPOSE 80/tcp 81/tcp
VOLUME ["/var/www"]
COPY . /var/www
RUN groupadd secureweb
RUN useradd --gid secureweb --shell /usr/sbin/nologin -M -d /var/www secureweb
RUN chown -R secureweb:secureweb /var/www
RUN chmod -R 660 /var/www
WORKDIR /var/www
HEALTHCHECK --interval=5m --timeout=3s \
	CMD curl -f http://localhost/ || exit 1
ENTRYPOINT ["/usr/bin/env","node","/var/www/server.js","--config","/var/www/main.conf","-ns"]
CMD /usr/bin/env node /var/www/server.js --config /var/www/main.conf -ns