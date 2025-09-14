# Common build stage
FROM node:24.8 AS init-build-stage

ARG RUNNING_USER=1000

RUN if [ "$RUNNING_USER" != 1000 ] ; \
    then groupadd --gid $RUNNING_USER bot \
    && useradd --uid $RUNNING_USER --gid $RUNNING_USER --shell /bin/bash --create-home bot ; \
    else echo "Running as node" ; \
fi

# Bcrypt dependencies & user dirty fix
RUN apt-get update && apt-get install -y build-essential

# Some other dep uses this lib (it's a libc alternative? why it's needed for node?)
RUN apt-get install -y musl musl-dev
RUN ln -s /usr/lib/arm64-linux-musl/libc.so /lib/libc.musl-arm64.so.1

# Install Node-gyp build tools
RUN npm install -g node-gyp

# Install nest cli
RUN npm install -g @nestjs/cli

FROM init-build-stage AS dependencies-build-stage

ARG RUNNING_USER=1000
ARG SERVICE=api

RUN mkdir -p /app
WORKDIR /app
RUN chown -R $RUNNING_USER:$RUNNING_USER /app

COPY --chown=$RUNNING_USER package*.json ./
COPY --chown=$RUNNING_USER tsconfig*.json nest-cli.json webpack.config.js ./
COPY --chown=$RUNNING_USER /src ./src
COPY --chown=$RUNNING_USER ./cd/node/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER $RUNNING_USER

RUN npm ci
RUN npm run build $SERVICE

# Production build stage
FROM dependencies-build-stage AS production-build-stage

ENV NODE_ENV production

CMD ["npm", "run", "start:prod"]

# Dvelopment build stage
FROM dependencies-build-stage AS development-build-stage

ENV NODE_ENV development

ENTRYPOINT ["/entrypoint.sh"]
CMD ["npm", "run", "start:debug"]