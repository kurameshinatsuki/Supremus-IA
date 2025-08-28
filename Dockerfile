FROM node:20

WORKDIR /app

RUN npm install --production

CMD ["npm", "start"]