FROM node:18-bullseye-slim

WORKDIR /leap-mock

COPY . .

RUN yarn build

ENV LOG_LEVEL=debug

CMD ["build/shipMocker.js"]

EXPOSE 6970