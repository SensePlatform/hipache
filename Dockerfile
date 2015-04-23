# NOTE: I was getting errors from the explicit node.js install steps, this is easier
FROM senseplatform/base

RUN npm install node-etcd@2.1.1 -g
RUN mkdir /work
ADD package.json /work/
RUN cd /work && npm install
ADD . /work
ENV NODE_ENV production
CMD ["/usr/bin/node", "/work/bin/hipache", "-c", "/work/config/config.json"]
EXPOSE 80