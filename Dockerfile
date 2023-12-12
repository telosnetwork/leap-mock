FROM node:18-bullseye-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y git

WORKDIR /root/target

COPY node_modules ./node_modules
COPY build ./build
COPY package.json .

ENV LOG_LEVEL=debug

CMD ["npm", "run", "start"]

EXPOSE 6970