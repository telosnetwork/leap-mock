FROM node:18-bullseye-slim

WORKDIR /leap-mock

COPY . .

RUN npm run build

ENV LOG_LEVEL=debug

CMD ["npm", "run", "start"]

EXPOSE 6970