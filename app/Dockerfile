FROM node:18-alpine

WORKDIR /usr/src/app/app

COPY app/package*.json ./

RUN npm install --production

COPY app/. .
COPY bootstrap-frontend ../bootstrap-frontend

EXPOSE 3000

CMD ["node", "server.js"]
