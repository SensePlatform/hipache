FROM senseplatform/base:907c036e1e4789cc5b04f743e0af6a2358915219

RUN npm install node-etcd@2.1.1 -g
RUN mkdir /work
ADD package.json /work/
RUN cd /work && npm install
ADD . /work
ENV NODE_ENV production
CMD ["/usr/local/bin/node", "/work/bin/hipache", "-c", "/work/config/config.json"]
EXPOSE 80
