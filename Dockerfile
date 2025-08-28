FROM node:20

WORKDIR /app

RUN git clone https://github.com/kurameshinatsuki/Supremus-IA . 

RUN npm install --production

CMD ["npm", "start"]