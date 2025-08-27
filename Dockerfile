FROM node:18

WORKDIR /app

RUN git clone https://github.com/kurameshinatsuki/Supremus-IA . 

RUN npm install --production

CMD ["npm", "start"]