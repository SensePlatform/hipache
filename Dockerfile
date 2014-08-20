FROM senseplatform/base
RUN npm install node-etcd@2.1.1 -g
RUN mkdir /work
ADD package.json /work/
RUN cd /work && npm install
ADD . /work
ENV NODE_ENV production
ENV HIPACHE_DRIVER etcd://127.0.0.1:4001
CMD socat TCP-LISTEN:4001,reuseaddr,fork UNIX-CLIENT:/run/etcd/etcd.sock & node /work/bin/hipache -c /work/config/config.json
EXPOSE 80